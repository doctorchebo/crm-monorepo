/**
 * Thumbnail Queue Service
 * Manages the BullMQ queue for thumbnail generation jobs
 */

import { getThumbnailConfig } from '@config/thumbnail.config';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  THUMBNAIL_JOB_NAME,
  THUMBNAIL_QUEUE_NAME,
  ThumbnailJobData,
  supportsThumbnail,
} from './thumbnail.types';

@Injectable()
export class ThumbnailQueueService {
  private readonly logger = new Logger(ThumbnailQueueService.name);
  private readonly config = getThumbnailConfig();

  constructor(
    @InjectQueue(THUMBNAIL_QUEUE_NAME)
    private readonly thumbnailQueue: Queue<ThumbnailJobData>,
  ) {}

  /**
   * Add a thumbnail generation job to the queue
   * Called after media is uploaded to S3
   */
  async queueThumbnailGeneration(
    jobData: ThumbnailJobData,
  ): Promise<string | null> {
    // Skip queueing for non-thumbnail media types
    if (!supportsThumbnail(jobData.mediaType, jobData.mimeType)) {
      this.logger.debug(
        `Skipping thumbnail queue for ${jobData.mediaType}: ${jobData.attachmentId}`,
      );
      return null;
    }

    try {
      const job = await this.thumbnailQueue.add(THUMBNAIL_JOB_NAME, jobData, {
        attempts: this.config.job.attempts,
        backoff: {
          type: this.config.job.backoffType,
          delay: this.config.job.backoffDelay,
        },
        removeOnComplete: this.config.job.removeOnComplete,
        removeOnFail: this.config.job.removeOnFail,
        // Priority based on file size (smaller = higher priority)
        priority: jobData.mediaType === 'image' ? 1 : 5,
      });

      this.logger.log(
        `Queued thumbnail job ${job.id} for ${jobData.mediaType}: ${jobData.attachmentId}`,
      );

      return job.id || null;
    } catch (error) {
      this.logger.error(
        `Failed to queue thumbnail job: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Bulk queue multiple thumbnail generation jobs
   * Used when processing multiple attachments at once
   */
  async queueBulkThumbnailGeneration(
    jobsData: ThumbnailJobData[],
  ): Promise<void> {
    // Filter to only media types that support thumbnails
    const validJobs = jobsData.filter((job) =>
      supportsThumbnail(job.mediaType),
    );

    if (validJobs.length === 0) {
      this.logger.debug('No valid jobs to queue for thumbnail generation');
      return;
    }

    try {
      const jobs = validJobs.map((jobData) => ({
        name: THUMBNAIL_JOB_NAME,
        data: jobData,
        opts: {
          attempts: this.config.job.attempts,
          backoff: {
            type: this.config.job.backoffType as 'exponential' | 'fixed',
            delay: this.config.job.backoffDelay,
          },
          removeOnComplete: this.config.job.removeOnComplete,
          removeOnFail: this.config.job.removeOnFail,
          timeout: this.config.job.timeout,
          priority: jobData.mediaType === 'image' ? 1 : 5,
        },
      }));

      await this.thumbnailQueue.addBulk(jobs);

      this.logger.log(`Bulk queued ${validJobs.length} thumbnail jobs`);
    } catch (error) {
      this.logger.error(
        `Failed to bulk queue thumbnail jobs: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.thumbnailQueue.getWaitingCount(),
      this.thumbnailQueue.getActiveCount(),
      this.thumbnailQueue.getCompletedCount(),
      this.thumbnailQueue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }

  /**
   * Check if queue is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.thumbnailQueue.getJobCounts();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean old completed/failed jobs
   */
  async cleanOldJobs(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    await this.thumbnailQueue.clean(olderThanMs, 1000, 'completed');
    await this.thumbnailQueue.clean(olderThanMs, 1000, 'failed');
    this.logger.log('Cleaned old thumbnail jobs');
  }
}
