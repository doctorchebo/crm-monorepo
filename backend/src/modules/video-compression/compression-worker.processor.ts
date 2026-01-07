/**
 * Compression Worker Processor
 *
 * BullMQ processor that handles video compression jobs.
 * Each job:
 * 1. Downloads the original video from S3
 * 2. Compresses it using VideoCompressionService
 * 3. Uploads the compressed version to S3
 * 4. Updates the media record with compression details
 * 5. Emits WebSocket event for real-time UI update
 * 6. Triggers object re-indexing so media is available for AI retrieval
 */

import { db } from '@database/db.connection';
import { kbObjectMedia, kbObjects } from '@database/knowledge-base.schema';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { S3Service } from '@shared/services/s3.service';
import { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { IndexingService } from '../knowledge-base/services/indexing.service';
import { whatsAppGatewayInstance } from '../whatsapp/whatsapp.gateway';
import { VideoCompressionService } from './video-compression.service';
import {
  COMPRESSION_EVENTS,
  CompressionJobData,
  CompressionResult,
  CompressionStatus,
  CompressionStatusEvent,
  VIDEO_COMPRESSION_QUEUE_NAME,
} from './video-compression.types';

@Processor(VIDEO_COMPRESSION_QUEUE_NAME, {
  concurrency: 2, // Process 2 videos simultaneously (adjust based on server resources)
})
@Injectable()
export class CompressionWorkerProcessor extends WorkerHost {
  private readonly logger = new Logger(CompressionWorkerProcessor.name);

  constructor(
    private readonly s3Service: S3Service,
    private readonly compressionService: VideoCompressionService,
    @Inject(forwardRef(() => IndexingService))
    private readonly indexingService: IndexingService,
  ) {
    super();
  }

  /**
   * Process a video compression job
   */
  async process(job: Job<CompressionJobData>): Promise<CompressionResult> {
    const {
      mediaId,
      s3Key,
      s3Bucket,
      originalFileSize,
      fileName,
      preset,
      objectId,
    } = job.data;

    this.logger.log(
      `[Compression Worker] Processing job ${job.id} for ${fileName} ` +
        `(${(originalFileSize / 1024 / 1024).toFixed(2)}MB, preset: ${preset})`,
    );

    try {
      // Update status to processing
      await this.updateCompressionStatus(mediaId, 'processing');
      this.emitStatusUpdate(mediaId, 'processing', 0);

      // Download original from S3
      const originalBuffer = await this.downloadFromS3(s3Key);

      if (!originalBuffer) {
        throw new Error(`Failed to download original from S3: ${s3Key}`);
      }

      this.logger.debug(
        `[Compression Worker] Downloaded original: ${originalBuffer.length} bytes`,
      );

      // Update progress
      await job.updateProgress(10);
      this.emitStatusUpdate(mediaId, 'processing', 10);

      // Create a throttled progress callback for the compression
      // This prevents flooding the WebSocket with too many updates
      // We emit at most once per 5% change
      let lastEmittedProgress = 10;
      const throttledProgressCallback = (percent: number, stage?: string) => {
        // Map FFmpeg progress (0-100) to our range (10-80)
        // Download took 0-10, compression takes 10-80, upload takes 80-95
        const mappedProgress = Math.round(10 + percent * 0.7);

        // Only emit if progress increased by at least 5%
        if (mappedProgress >= lastEmittedProgress + 5) {
          lastEmittedProgress = mappedProgress;
          this.emitStatusUpdate(mediaId, 'processing', mappedProgress);
          this.logger.debug(
            `[Compression Worker] Progress: ${mappedProgress}% (FFmpeg: ${percent.toFixed(1)}%, stage: ${stage || 'unknown'})`,
          );
        }
      };

      // Compress the video with progress callback
      const result = await this.compressionService.compressVideo(
        originalBuffer,
        job.data.mimeType,
        preset,
        job.data.targetFileSize,
        throttledProgressCallback,
      );

      if (!result.success || !result.buffer) {
        throw new Error(result.error || 'Compression failed');
      }

      // Update progress after compression complete
      await job.updateProgress(80);
      this.emitStatusUpdate(mediaId, 'processing', 80);

      // Generate compressed file S3 key (same path, different filename)
      const compressedS3Key = this.generateCompressedKey(s3Key);

      // Upload compressed video to S3
      await this.s3Service.uploadFile(
        compressedS3Key,
        result.buffer,
        'video/mp4',
      );

      this.logger.log(
        `[Compression Worker] Uploaded compressed video: ${compressedS3Key} ` +
          `(${(result.compressedFileSize! / 1024 / 1024).toFixed(2)}MB, ` +
          `ratio: ${result.compressionRatio?.toFixed(2)}x)`,
      );

      // Update progress
      await job.updateProgress(95);
      this.emitStatusUpdate(mediaId, 'processing', 95);

      // Update media record with compression info
      await this.updateMediaWithCompression(
        mediaId,
        compressedS3Key,
        result.compressedFileSize!,
        originalFileSize,
        result.metadata,
      );

      // Emit completion event
      this.emitStatusUpdate(
        mediaId,
        'completed',
        100,
        compressedS3Key,
        result.compressedFileSize,
      );

      // Trigger object re-indexing so the compressed video is available for AI retrieval
      // This is important because media captions/content are included in the index
      await this.triggerReindexing(objectId);

      this.logger.log(
        `[Compression Worker] Job ${job.id} completed successfully for ${fileName}`,
      );

      return {
        success: true,
        compressedS3Key,
        compressedFileSize: result.compressedFileSize,
        compressionRatio: result.compressionRatio,
        processingTimeMs: result.processingTimeMs,
        metadata: result.metadata,
      };
    } catch (error) {
      this.logger.error(
        `[Compression Worker] Job ${job.id} failed: ${error.message}`,
        error.stack,
      );

      // Update status to failed
      await this.updateCompressionStatus(mediaId, 'failed', error.message);
      this.emitStatusUpdate(
        mediaId,
        'failed',
        undefined,
        undefined,
        undefined,
        error.message,
      );

      throw error; // Re-throw for BullMQ retry handling
    }
  }

  /**
   * Download file from S3
   */
  private async downloadFromS3(s3Key: string): Promise<Buffer | null> {
    try {
      return await this.s3Service.downloadFile(s3Key);
    } catch (error) {
      this.logger.error(`S3 download failed for ${s3Key}: ${error.message}`);
      return null;
    }
  }

  /**
   * Generate S3 key for compressed video
   * Original: kb/userId/objectId/mediaId/original.mp4
   * Compressed: kb/userId/objectId/mediaId/compressed.mp4
   */
  private generateCompressedKey(originalKey: string): string {
    const parts = originalKey.split('/');
    const fileName = parts.pop() || '';
    const dir = parts.join('/');

    // Replace original filename with compressed.mp4
    const baseName = fileName.replace(/\.[^.]+$/, '');
    return `${dir}/${baseName}_compressed.mp4`;
  }

  /**
   * Update media record with compression information
   */
  private async updateMediaWithCompression(
    mediaId: string,
    compressedS3Key: string,
    compressedFileSize: number,
    originalFileSize: number,
    metadata?: CompressionResult['metadata'],
  ): Promise<void> {
    try {
      // Update the media record with compression info using dedicated columns
      await db
        .update(kbObjectMedia)
        .set({
          // Compression columns
          compressionStatus: 'completed' as CompressionStatus,
          compressedS3Key,
          compressedFileSize,
          originalFileSize,
          compressionError: null, // Clear any previous error
          // Update the main s3Key to point to compressed version for sending
          // Original is preserved in originalFileSize
          s3Key: compressedS3Key,
          fileSize: compressedFileSize,
          mimeType: 'video/mp4', // Compressed video is always MP4
          ...(metadata && {
            width: metadata.width,
            height: metadata.height,
            duration: metadata.duration
              ? Math.round(metadata.duration)
              : undefined,
          }),
          updatedAt: new Date(),
        })
        .where(eq(kbObjectMedia.id, mediaId));

      this.logger.debug(
        `[Compression Worker] Updated media record ${mediaId} with compression info`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update media record ${mediaId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Update compression status in database
   */
  private async updateCompressionStatus(
    mediaId: string,
    status: CompressionStatus,
    errorMessage?: string,
  ): Promise<void> {
    try {
      const updateData: Record<string, unknown> = {
        compressionStatus: status,
        updatedAt: new Date(),
      };

      if (errorMessage) {
        updateData.compressionError = errorMessage;
      }

      await db
        .update(kbObjectMedia)
        .set(updateData)
        .where(eq(kbObjectMedia.id, mediaId));

      this.logger.debug(
        `[Compression Worker] Updated compression status to ${status} for ${mediaId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update compression status: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Emit WebSocket event for real-time UI updates
   */
  private emitStatusUpdate(
    mediaId: string,
    status: CompressionStatus,
    progress?: number,
    compressedS3Key?: string,
    compressedFileSize?: number,
    error?: string,
  ): void {
    if (!whatsAppGatewayInstance) {
      return;
    }

    try {
      const event: CompressionStatusEvent = {
        mediaId,
        status,
        progress,
        compressedS3Key,
        compressedFileSize,
        error,
      };

      const eventName =
        status === 'completed'
          ? COMPRESSION_EVENTS.COMPLETED
          : status === 'failed'
            ? COMPRESSION_EVENTS.FAILED
            : COMPRESSION_EVENTS.STATUS_UPDATE;

      whatsAppGatewayInstance.emitToAllClients(eventName, event);

      this.logger.debug(
        `[Compression Worker] Emitted ${eventName} for ${mediaId}`,
      );
    } catch (error) {
      this.logger.warn(`Failed to emit compression status: ${error.message}`);
    }
  }

  /**
   * Trigger re-indexing for the object containing the compressed video.
   * This ensures the video is available for AI retrieval after compression.
   * Uses fire-and-forget to not block the compression workflow.
   */
  private async triggerReindexing(objectId: string): Promise<void> {
    try {
      // Check if object exists and is in indexed state
      const object = await db.query.kbObjects.findFirst({
        where: eq(kbObjects.id, objectId),
      });

      if (!object) {
        this.logger.warn(
          `[Compression Worker] Object ${objectId} not found for re-indexing`,
        );
        return;
      }

      // Only re-index if the object was previously indexed
      // If it's still pending/indexing, it will pick up the new media anyway
      if (object.status !== 'indexed') {
        this.logger.debug(
          `[Compression Worker] Object ${objectId} status is ${object.status}, skipping re-index`,
        );
        return;
      }

      this.logger.log(
        `[Compression Worker] Triggering re-indexing for object ${objectId}`,
      );

      // Fire and forget - don't block the compression completion
      this.indexingService.indexObject(objectId).catch((error) => {
        this.logger.error(
          `[Compression Worker] Re-indexing failed for object ${objectId}: ${error.message}`,
        );
      });
    } catch (error) {
      this.logger.warn(
        `[Compression Worker] Failed to trigger re-indexing for ${objectId}: ${error.message}`,
      );
    }
  }

  /**
   * Job completed event handler
   */
  @OnWorkerEvent('completed')
  onCompleted(job: Job<CompressionJobData>) {
    this.logger.log(
      `[Compression Worker] Job ${job.id} completed for media ${job.data.mediaId}`,
    );
  }

  /**
   * Job failed event handler
   */
  @OnWorkerEvent('failed')
  onFailed(job: Job<CompressionJobData>, error: Error) {
    this.logger.error(
      `[Compression Worker] Job ${job.id} failed for media ${job.data.mediaId}: ${error.message}`,
    );
  }

  /**
   * Job progress event handler
   */
  @OnWorkerEvent('progress')
  onProgress(job: Job<CompressionJobData>, progress: number | object) {
    const progressValue = typeof progress === 'number' ? progress : 0;
    this.logger.debug(
      `[Compression Worker] Job ${job.id} progress: ${progressValue}%`,
    );
  }
}
