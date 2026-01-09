/**
 * Webhook Notification
 *
 * Sends callback notifications to the backend when processing completes.
 * Supports both compression and thumbnail job results.
 */

import { logger } from "./logger";
import {
  CompressionResult,
  JobCallback,
  MediaJobResult,
  ThumbnailResult,
} from "./types";

/**
 * Check if result is a compression result
 */
function isCompressionResult(
  result: MediaJobResult
): result is CompressionResult {
  return result.jobType === "compression" || result.jobType === undefined;
}

/**
 * Check if result is a thumbnail result
 */
function isThumbnailResult(result: MediaJobResult): result is ThumbnailResult {
  return result.jobType === "thumbnail";
}

/**
 * Send a webhook notification
 *
 * @param callback - Callback configuration
 * @param result - Job result (compression or thumbnail)
 */
export async function sendWebhookNotification(
  callback: JobCallback,
  result: MediaJobResult
): Promise<void> {
  if (callback.type !== "webhook") {
    logger.warn("Unsupported callback type", result.jobId, {
      type: callback.type,
    });
    return;
  }

  // Build payload based on job type
  let payload: Record<string, unknown>;

  if (isThumbnailResult(result)) {
    // Thumbnail result payload
    payload = {
      jobId: result.jobId,
      jobType: "thumbnail",
      success: result.success,
      error: result.error,
      thumbnailKey: result.thumbnailKey,
      width: result.width,
      height: result.height,
      blurhash: result.blurhash,
      duration: result.duration,
      processingTimeMs: result.processingTimeMs,
      outputLocation: result.outputLocation,
      context: result.context,
      entityIds: result.entityIds,
      completedAt: new Date().toISOString(),
    };
  } else {
    // Compression result payload
    payload = {
      jobId: result.jobId,
      jobType: "compression",
      success: result.success,
      error: result.error,
      completedAt: new Date().toISOString(),
    };

    if (result.success && result.outputLocation) {
      payload.result = {
        originalSizeBytes: result.originalSizeBytes,
        compressedSizeBytes: result.compressedSizeBytes,
        compressionRatio: result.compressionRatio,
        processingTimeMs: result.processingTimeMs,
        outputBucket: result.outputLocation.bucket,
        outputKey: result.outputLocation.key,
      };
    }
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
