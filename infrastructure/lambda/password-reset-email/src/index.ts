/**
 * Password Reset Email Lambda Entry Point
 *
 * Exports handlers for:
 * - sendHandler: Process SQS messages and send password reset emails
 * - cleanupHandler: Clean up expired tokens (EventBridge scheduled)
 *
 * Environment Variables:
 * - DATABASE_URL: PostgreSQL connection string
 * - MAILGUN_DOMAIN: Mailgun sending domain
 * - MAILGUN_API_KEY_PARAM: SSM parameter name for API key
 * - APP_URL: Application base URL for reset links
 * - SENDER_EMAIL: Email sender address
 */

import {
  SQSEvent,
  SQSBatchResponse,
  SQSBatchItemFailure,
  ScheduledEvent,
} from "aws-lambda";
import { withClient } from "./db";
import { getEmailProvider } from "./providers";
import { PasswordResetEmailMessage, PasswordResetEmailPayload } from "./types";

const APP_URL = process.env.APP_URL || "http://localhost:3000";

/**
 * SQS Handler - Send password reset emails
 *
 * Processes messages from PasswordResetEmailQueue and sends emails via Mailgun.
 * Returns batch item failures for SQS retry logic.
 */
export async function sendHandler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchItemFailure[] = [];
  const provider = await getEmailProvider();

  console.log(
    `Processing ${event.Records.length} password reset email(s) via ${provider.name}`,
  );

  for (const record of event.Records) {
    const startTime = Date.now();

    try {
      const message: PasswordResetEmailMessage = JSON.parse(record.body);
      console.log(
        `Processing password reset for user ${message.userId} (${message.email})`,
      );

      // Build reset URL
      const resetUrl = `${APP_URL}/reset-password?token=${message.token}`;

      // Build payload
      const payload: PasswordResetEmailPayload = {
        to: message.email,
        name: message.name,
        resetUrl,
        expiresAt: new Date(message.expiresAt),
      };

      // Send email
      const result = await provider.sendPasswordResetEmail(payload);

      if (result.success) {
        console.log(
          `✓ Password reset email sent to ${message.email} (${Date.now() - startTime}ms)`,
        );
      } else {
        console.error(
          `✗ Failed to send password reset email to ${message.email}: ${result.error}`,
        );
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    } catch (error: any) {
      console.error(`Error processing message: ${error.message}`);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  console.log(
    `Batch complete: ${event.Records.length - batchItemFailures.length} succeeded, ${batchItemFailures.length} failed`,
  );

  return { batchItemFailures };
}

/**
 * Scheduled Handler - Clean up expired password reset tokens
 *
 * Runs on a schedule (e.g., hourly) to delete expired tokens.
 */
export async function cleanupHandler(event: ScheduledEvent): Promise<void> {
  console.log("Starting password reset token cleanup...");

  try {
    const result = await withClient(async (pool) => {
      const query = `
        DELETE FROM password_reset_tokens
        WHERE expires_at < NOW() OR used_at IS NOT NULL
        RETURNING id
      `;

      const res = await pool.query(query);
      return res.rowCount || 0;
    });

    console.log(`Cleanup complete: ${result} expired/used tokens deleted`);
  } catch (error: any) {
    console.error(`Cleanup error: ${error.message}`);
    throw error;
  }
}
