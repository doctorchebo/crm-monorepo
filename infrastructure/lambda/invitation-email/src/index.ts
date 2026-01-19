/**
 * Invitation Email Lambda Entry Point
 *
 * Exports handlers for:
 * - sendHandler: Process SQS messages and send invitation emails
 * - cleanupHandler: Expire old invitations (EventBridge scheduled)
 *
 * Environment Variables:
 * - SKIP_DB_VERIFICATION: Set to "true" to skip DB checks (for local testing)
 */

import {
  SQSEvent,
  SQSBatchResponse,
  SQSBatchItemFailure,
  ScheduledEvent,
} from "aws-lambda";
import { withClient } from "./db";
import { getEmailProvider } from "./providers";
import { InvitationEmailMessage, InvitationEmailPayload } from "./types";

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const SKIP_DB = process.env.SKIP_DB_VERIFICATION === "true";

/**
 * SQS Handler - Send invitation emails
 *
 * Processes messages from InvitationEmailQueue and sends emails via provider.
 * Returns batch item failures for SQS retry logic.
 */
export async function sendHandler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchItemFailure[] = [];
  const provider = await getEmailProvider();

  console.log(
    `Processing ${event.Records.length} invitation email(s) via ${provider.name}`,
  );

  if (SKIP_DB) {
    console.log(
      "⚠️ SKIP_DB_VERIFICATION is enabled - skipping database checks",
    );
  }

  for (const record of event.Records) {
    const startTime = Date.now();

    try {
      const message: InvitationEmailMessage = JSON.parse(record.body);
      console.log(
        `Processing invitation ${message.invitationId} for ${message.email}`,
      );

      // Only verify with DB if not skipping
      if (!SKIP_DB) {
        const invitation = await getInvitation(message.invitationId);

        if (!invitation) {
          console.warn(
            `Invitation ${message.invitationId} not found, skipping`,
          );
          continue;
        }

        if (invitation.status !== "pending") {
          console.log(
            `Invitation ${message.invitationId} is ${invitation.status}, skipping`,
          );
          continue;
        }

        if (invitation.emailSentAt) {
          console.log(
            `Email already sent for invitation ${message.invitationId}, skipping`,
          );
          continue;
        }
      }

      // Build invitation URL
      const invitationUrl = `${APP_URL}/invite/accept?token=${message.token}`;

      // Build payload
      const payload: InvitationEmailPayload = {
        to: message.email,
        teamName: message.teamName,
        inviterName: message.inviterName,
        invitationUrl,
        expiresAt: new Date(message.expiresAt),
        role: message.role,
      };

      // Send email
      const result = await provider.sendInvitationEmail(payload);

      if (result.success) {
        // Mark as sent in database (if not skipping)
        if (!SKIP_DB) {
          await markEmailSent(message.invitationId, result.messageId);
        }

        const duration = Date.now() - startTime;
        console.log(
          `✅ Email sent for invitation ${message.invitationId} in ${duration}ms`,
        );

        emitMetric("InvitationEmailSent", 1);
        emitMetric("InvitationEmailLatency", duration);
      } else {
        if (result.permanent) {
          console.error(
            `Permanent failure for invitation ${message.invitationId}: ${result.error}`,
          );
          if (!SKIP_DB) {
            await markDeliveryFailed(message.invitationId, result.error);
          }
          emitMetric("InvitationEmailPermanentFailure", 1);
        } else {
          console.error(
            `Transient failure for invitation ${message.invitationId}: ${result.error}`,
          );
          batchItemFailures.push({ itemIdentifier: record.messageId });
          emitMetric("InvitationEmailTransientFailure", 1);
        }
      }
    } catch (error) {
      console.error(`Error processing record ${record.messageId}:`, error);
      batchItemFailures.push({ itemIdentifier: record.messageId });
      emitMetric("InvitationEmailError", 1);
    }
  }

  return { batchItemFailures };
}

/**
 * EventBridge Handler - Clean up expired invitations
 *
 * Runs on schedule to mark expired invitations.
 */
export async function cleanupHandler(event: ScheduledEvent): Promise<void> {
  console.log("Running invitation cleanup job");
  const startTime = Date.now();

  try {
    const result = await expireOldInvitations();
    const duration = Date.now() - startTime;

    console.log(`Expired ${result.expiredCount} invitations in ${duration}ms`);
    emitMetric("InvitationsExpired", result.expiredCount);
  } catch (error) {
    console.error("Cleanup job failed:", error);
    emitMetric("InvitationCleanupError", 1);
    throw error;
  }
}

// ============================================================================
// Database Functions
// ============================================================================

async function getInvitation(invitationId: number) {
  return withClient(async (client) => {
    const result = await client.query(
      `SELECT id, team_id, email, role, status, token, expires_at, email_sent_at, created_at
             FROM invitations WHERE id = $1`,
      [invitationId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      teamId: row.team_id,
      email: row.email,
      role: row.role,
      status: row.status,
      token: row.token,
      expiresAt: row.expires_at,
      emailSentAt: row.email_sent_at,
      createdAt: row.created_at,
    };
  });
}

async function markEmailSent(invitationId: number, messageId?: string) {
  return withClient(async (client) => {
    await client.query(
      `UPDATE invitations 
             SET email_sent_at = NOW(),
                 delivery_status = 'SENT'
             WHERE id = $1`,
      [invitationId],
    );
  });
}

async function markDeliveryFailed(invitationId: number, error?: string) {
  return withClient(async (client) => {
    await client.query(
      `UPDATE invitations 
             SET delivery_status = 'FAILED'
             WHERE id = $1`,
      [invitationId],
    );
  });
}

async function expireOldInvitations(): Promise<{ expiredCount: number }> {
  return withClient(async (client) => {
    const result = await client.query(
      `UPDATE invitations 
             SET status = 'expired'
             WHERE status = 'pending' 
               AND expires_at < NOW()
             RETURNING id`,
    );

    return { expiredCount: result.rowCount || 0 };
  });
}

// ============================================================================
// CloudWatch Metrics (structured logging for CloudWatch Embedded Metrics)
// ============================================================================

function emitMetric(name: string, value: number) {
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: "InvitationEmail",
            Dimensions: [["Environment"]],
            Metrics: [{ Name: name, Unit: "Count" }],
          },
        ],
      },
      Environment: process.env.NODE_ENV || "development",
      [name]: value,
    }),
  );
}
