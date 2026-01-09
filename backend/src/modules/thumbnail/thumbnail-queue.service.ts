/**
 * Thumbnail Queue Service
 *
 * Manages thumbnail generation jobs via AWS Lambda.
 *
 * Architecture:
 * - ALL thumbnails generated via AWS Lambda (no local fallback)
 * - PDFs supported via Chromium + pdf.js Lambda layer
 * - Safety mechanisms prevent infinite loops and runaway costs
 *
 * Flow:
 * 1. Queue job to Lambda via SQS
 * 2. Lambda generates thumbnail, uploads to S3, calls callback
 * 3. Callback updates DB and emits WebSocket event
 *
 * Safety:
 * - Max 3 retry attempts per job
 * - Job expiry after 1 hour
 * - File size limits enforced
 * - Permanent errors (corrupt files, unsupported formats) not retried
 */

import { Injectable, Logger } from '@nestjs/common';
import { LambdaThumbnailService } from '@shared/services/lambda-thumbnail.service';
import { ThumbnailJobData, supportsThumbnail } from './thumbnail.types';

/**
 * Result of queuing a thumbnail job
 */
export interface QueueResult {
  jobId: string | null;
  success: boolean;
  error?: string;
}

@Injectable()
export class ThumbnailQueueService {
  private readonly logger = new Logger(ThumbnailQueueService.name);

  constructor(
    private readonly lambdaThumbnailService: LambdaThumbnailService,
  ) {}

  /**
   * Add a thumbnail generation job to Lambda queue
   * No local fallback - if Lambda fails, thumbnail is not generated
   */
  async queueThumbnailGeneration(
    jobData: ThumbnailJobData,
  ): Promise<QueueResult> {
    // Skip queueing for non-thumbnail media types
    if (!supportsThumbnail(jobData.mediaType, jobData.mimeType)) {
      this.logger.debug(
        `Skipping thumbnail queue for ${jobData.mediaType}: ${jobData.attachmentId}`,
      );
      return { jobId: null, success: true };
    }

    // Check if Lambda is enabled
    if (!this.lambdaThumbnailService.isLambdaThumbnailEnabled()) {
      this.logger.error(
        `Lambda not configured - thumbnail will NOT be generated for ${jobData.attachmentId}`,
      );
      return {
        jobId: null,
        success: false,
        error: 'Lambda thumbnail service not configured',
      };
    }

    try {
      const jobId = await this.lambdaThumbnailService.queueMessageThumbnail({
        messageId: jobData.messageId,
        attachmentId: jobData.attachmentId,
        s3Key: jobData.s3Key,
        mimeType: jobData.mimeType,
        thumbnailS3Key: jobData.thumbnailS3Key,
        chatId: jobData.chatId,
      });

      if (!jobId) {
        this.logger.warn(
          `Unsupported type ${jobData.mimeType} for ${jobData.attachmentId} - no thumbnail will be generated`,
        );
        return {
          jobId: null,
          success: false,
          error: `Unsupported MIME type for thumbnail: ${jobData.mimeType}`,
        };
      }

      this.logger.log(
        `Queued Lambda thumbnail job ${jobId} for ${jobData.mediaType}: ${jobData.attachmentId}`,
      );

      return { jobId, success: true };
    } catch (error) {
      this.logger.error(
        `Failed to queue Lambda thumbnail job: ${error.message}`,
        error.stack,
      );
      // NO FALLBACK - thumbnail will not be generated
      return {
        jobId: null,
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Bulk queue multiple thumbnail generation jobs to Lambda
   */
  async queueBulkThumbnailGeneration(
    jobsData: ThumbnailJobData[],
  ): Promise<{ queued: number; failed: number }> {
    // Filter to only media types that support thumbnails
    const validJobs = jobsData.filter((job) =>
      supportsThumbnail(job.mediaType, job.mimeType),
    );

    if (validJobs.length === 0) {
      this.logger.debug('No valid jobs to queue for thumbnail generation');
      return { queued: 0, failed: 0 };
    }

    let queued = 0;
    let failed = 0;

    for (const job of validJobs) {
      const result = await this.queueThumbnailGeneration(job);
      if (result.success && result.jobId) {
        queued++;
      } else {
        failed++;
      }
    }

    this.logger.log(
      `Bulk queued thumbnails: ${queued} successful, ${failed} failed`,
    );

    return { queued, failed };
  }

  /**
   * HIGH PRIORITY: Queue thumbnail jobs for sync operation
   * Same as regular queue (Lambda handles priority internally)
   */
  async queueSyncThumbnails(
    jobsData: ThumbnailJobData[],
  ): Promise<{ queued: number; failed: number }> {
    const result = await this.queueBulkThumbnailGeneration(jobsData);

    this.logger.log(
      `🚀 HIGH PRIORITY: Queued ${result.queued} sync thumbnails to Lambda`,
    );

    return result;
  }
}
