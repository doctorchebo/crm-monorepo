/**
 * Webhook Notification
 *
 * Sends callback notifications to the backend when compression completes.
 * Supports both success and failure notifications.
 */

import { logger } from "./logger";
import { CompressionResult, JobCallback } from "./types";

/**
 * Payload sent to the webhook
 */
interface WebhookPayload {
  /**
   * Job ID for correlation
   */
  jobId: string;

  /**
   * Whether compression succeeded
   */
  success: boolean;

  /**
   * Error message if failed
   */
  error?: string;

  /**
   * Compression result details
   */
  result?: {
    originalSizeBytes: number;
    compressedSizeBytes: number;
    compressionRatio: number;
    processingTimeMs: number;
    outputBucket: string;
    outputKey: string;
  };

  /**
   * Timestamp of completion
   */
  completedAt: string;
}

/**
 * Send a webhook notification
 *
 * @param callback - Callback configuration
 * @param result - Compression result
 */
export async function sendWebhookNotification(
  callback: JobCallback,
  result: CompressionResult
): Promise<void> {
  if (callback.type !== "webhook") {
    logger.warn("Unsupported callback type", result.jobId, {
      type: callback.type,
    });
    return;
  }

  const payload: WebhookPayload = {
    jobId: result.jobId,
    success: result.success,
    error: result.error,
    completedAt: new Date().toISOString(),
  };

  if (result.success && result.outputLocation) {
    payload.result = {
      originalSizeBytes: result.originalSizeBytes!,
      compressedSizeBytes: result.compressedSizeBytes!,
      compressionRatio: result.compressionRatio!,
      processingTimeMs: result.processingTimeMs!,
      outputBucket: result.outputLocation.bucket,
      outputKey: result.outputLocation.key,
    };
  }

  logger.info("Sending webhook notification", result.jobId, {
    url: callback.url,
    success: result.success,
  });

  try {
    const response = await fetch(callback.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.warn("Webhook returned non-OK status", result.jobId, {
        status: response.status,
        statusText: response.statusText,
      });
    } else {
      logger.info("Webhook notification sent successfully", result.jobId);
    }
  } catch (error) {
    // Log but don't throw - webhook failure shouldn't fail the job
    logger.error("Failed to send webhook notification", result.jobId, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
