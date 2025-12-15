/**
 * Thumbnail Worker Processor
 * BullMQ processor that handles thumbnail generation jobs
 */

import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { S3Service } from '@shared/services/s3.service';
import { Job } from 'bullmq';
import { ThumbnailProcessorService } from './thumbnail-processor.service';
import { ThumbnailService } from './thumbnail.service';
import {
  THUMBNAIL_QUEUE_NAME,
  ThumbnailJobData,
  ThumbnailResult,
} from './thumbnail.types';

@Processor(THUMBNAIL_QUEUE_NAME, {
  concurrency: 3, // Process 3 jobs simultaneously
})
@Injectable()
export class ThumbnailWorkerProcessor extends WorkerHost {
  private readonly logger = new Logger(ThumbnailWorkerProcessor.name);

  constructor(
    private readonly s3Service: S3Service,
    private readonly thumbnailProcessor: ThumbnailProcessorService,
    private readonly thumbnailService: ThumbnailService,
  ) {
    super();
  }

  /**
   * Process a thumbnail generation job
   */
  async process(job: Job<ThumbnailJobData>): Promise<ThumbnailResult> {
    const { messageId, attachmentId, s3Key, mediaType, mimeType, chatId } =
      job.data;

    this.logger.log(
      `Processing thumbnail job ${job.id} for ${mediaType}: ${attachmentId}`,
    );

    // Only process image/video/pdf - other types should not reach here
    // but handle gracefully if they do
    const supportedTypes = ['image', 'video'];
    const isPdf = mediaType === 'document' && mimeType === 'application/pdf';

    if (!supportedTypes.includes(mediaType) && !isPdf) {
      this.logger.debug(`Skipping non-thumbnail media type: ${mediaType}`);
      return { success: true };
    }

    try {
      // Update status to processing
      await this.thumbnailService.updateThumbnailStatus(
        messageId,
        attachmentId,
        'processing',
      );

      // Download original from S3
      const originalBuffer = await this.downloadFromS3(s3Key);

      if (!originalBuffer) {
        throw new Error(`Failed to download original from S3: ${s3Key}`);
      }

      this.logger.debug(
        `Downloaded original: ${originalBuffer.length} bytes from ${s3Key}`,
      );

      // Generate thumbnail metadata (dimensions, blurhash)
      const result = await this.thumbnailProcessor.generateThumbnail(
        originalBuffer,
        mediaType,
        mimeType,
      );

      if (!result.success) {
        // If thumbnail generation failed gracefully (e.g., ffmpeg not available),
        // don't retry - just mark as failed
        const errorMessage = result.error || 'Thumbnail generation failed';
        this.logger.warn(
          `Thumbnail generation failed for ${attachmentId}: ${errorMessage}`,
        );
        await this.thumbnailService.updateThumbnailStatus(
          messageId,
          attachmentId,
          'failed',
          errorMessage,
        );
        return {
          success: false,
          error: errorMessage,
        };
      }

      // Generate thumbnail buffer
      const thumbnailBuffer = await this.thumbnailProcessor.getThumbnailBuffer(
        originalBuffer,
        isPdf ? 'document' : (mediaType as 'image' | 'video'),
        mimeType,
      );

      // Generate thumbnail S3 key
      const thumbnailKey = this.generateThumbnailKey(s3Key);

      // Upload thumbnail to S3
      await this.s3Service.uploadFile(
        thumbnailKey,
        thumbnailBuffer,
        'image/jpeg',
      );

      this.logger.debug(`Uploaded thumbnail to S3: ${thumbnailKey}`);

      // Update attachment metadata with thumbnail info
      await this.thumbnailService.updateThumbnailMetadata(
        messageId,
        attachmentId,
        {
          thumbnailKey,
          thumbnailStatus: 'ready',
          width: result.width || 0,
          height: result.height || 0,
          blurhash: result.blurhash || '',
        },
      );

      // Emit WebSocket event for real-time update
      await this.thumbnailService.emitThumbnailReady({
        messageId,
        attachmentId,
        thumbnailKey,
        width: result.width || 0,
        height: result.height || 0,
        blurhash: result.blurhash || '',
        duration: result.duration, // For PDFs: page count
      });

      this.logger.log(
        `Thumbnail job ${job.id} completed successfully for ${attachmentId}`,
      );

      return {
        success: true,
        thumbnailKey,
        width: result.width,
        height: result.height,
        blurhash: result.blurhash,
        duration: result.duration,
      };
    } catch (error) {
      this.logger.error(
        `Thumbnail job ${job.id} failed: ${error.message}`,
        error.stack,
      );

      // Update status to failed
      await this.thumbnailService.updateThumbnailStatus(
        messageId,
        attachmentId,
        'failed',
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
   * Generate thumbnail S3 key from original key
   * e.g., "123/456/msg-id/original.jpg" -> "123/456/msg-id/thumb.jpg"
   */
  private generateThumbnailKey(originalKey: string): string {
    const parts = originalKey.split('/');
    const fileName = parts.pop() || '';
    const dir = parts.join('/');

    // Replace original filename with thumb.jpg
    return `${dir}/thumb.jpg`;
  }

  /**
   * Job completed event handler
   */
  @OnWorkerEvent('completed')
  onCompleted(job: Job<ThumbnailJobData>) {
    this.logger.debug(`Job ${job.id} completed for ${job.data.attachmentId}`);
  }

  /**
   * Job failed event handler
   */
  @OnWorkerEvent('failed')
  onFailed(job: Job<ThumbnailJobData>, error: Error) {
    this.logger.warn(
      `Job ${job.id} failed for ${job.data.attachmentId}: ${error.message}`,
    );
  }

  /**
   * Job error event handler
   */
  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error(`Worker error: ${error.message}`, error.stack);
  }
}
