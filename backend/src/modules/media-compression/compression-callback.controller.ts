/**
 * Media Compression Callback Controller
 *
 * Handles webhook callbacks from the Lambda compression service.
 * When Lambda finishes compressing a file, it calls this endpoint
 * to notify the backend of the result.
 *
 * The callback updates the database with:
 * - Compression status (completed/failed)
 * - Compressed file S3 key
 * - Compressed file size
 * - Any error messages
 */

import { db } from '@database/db.connection';
import { kbObjectMedia } from '@database/knowledge-base.schema';
import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { eq } from 'drizzle-orm';

/**
 * Callback payload from Lambda
 */
interface CompressionCallbackPayload {
  success: boolean;
  jobId: string;
  error?: string;
  originalSizeBytes?: number;
  compressedSizeBytes?: number;
  compressionRatio?: number;
  processingTimeMs?: number;
  outputLocation?: {
    bucket: string;
    key: string;
  };
  originalDeleted?: boolean;
  // Metadata passed through from original job
  metadata?: {
    mediaId?: string;
    userId?: number;
    objectId?: string;
    originalFileName?: string;
  };
}

@Controller('api/v1/media/compression')
export class CompressionCallbackController {
  private readonly logger = new Logger(CompressionCallbackController.name);

  /**
   * Webhook endpoint called by Lambda when compression completes
   */
  @Post('callback')
  @HttpCode(200)
  async handleCompressionCallback(
    @Body() payload: CompressionCallbackPayload,
  ): Promise<{ received: boolean }> {
    this.logger.log(
      `[Compression Callback] Received callback for job ${payload.jobId}: ` +
        `${payload.success ? 'SUCCESS' : 'FAILED'}`,
    );

    const mediaId = payload.metadata?.mediaId;

    if (!mediaId) {
      this.logger.warn(
        `[Compression Callback] No mediaId in callback for job ${payload.jobId}`,
      );
      return { received: true };
    }

    try {
      if (payload.success && payload.outputLocation) {
        // Update media record with compression results
        await db
          .update(kbObjectMedia)
          .set({
            compressionStatus: 'completed',
            compressedS3Key: payload.outputLocation.key,
            compressedFileSize: payload.compressedSizeBytes,
            originalFileSize: payload.originalSizeBytes,
            compressionError: null,
            // If original was deleted, update s3Key to point to compressed file
            ...(payload.originalDeleted && {
              s3Key: payload.outputLocation.key,
              fileSize: payload.compressedSizeBytes,
            }),
            updatedAt: new Date(),
          })
          .where(eq(kbObjectMedia.id, mediaId));

        this.logger.log(
          `[Compression Callback] Updated media ${mediaId}: ` +
            `${payload.originalSizeBytes} -> ${payload.compressedSizeBytes} bytes ` +
            `(ratio: ${payload.compressionRatio?.toFixed(2)}x, time: ${payload.processingTimeMs}ms)`,
        );
      } else {
        // Mark as failed
        await db
          .update(kbObjectMedia)
          .set({
            compressionStatus: 'failed',
            compressionError: payload.error || 'Unknown error',
            updatedAt: new Date(),
          })
          .where(eq(kbObjectMedia.id, mediaId));

        this.logger.error(
          `[Compression Callback] Compression failed for media ${mediaId}: ${payload.error}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[Compression Callback] Failed to update media ${mediaId}: ${error.message}`,
        error.stack,
      );
      // Still return success to Lambda to prevent retries
      // The error is logged and can be investigated
    }

    return { received: true };
  }
}
