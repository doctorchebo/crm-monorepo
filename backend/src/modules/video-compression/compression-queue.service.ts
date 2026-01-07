/**
 * Compression Queue Service
 *
 * Manages the BullMQ queue for video compression jobs.
 * Provides methods to:
 * - Queue new compression jobs
 * - Check job status
 * - Cancel pending jobs
 * - Get queue statistics
 */

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import {
  CompressionJobData,
  CompressionPreset,
  getCompressionPreset,
  needsCompression,
  VIDEO_COMPRESSION_JOB_NAME,
  VIDEO_COMPRESSION_QUEUE_NAME,
  WHATSAPP_SEND_LIMITS,
} from './video-compression.types';

/**
 * Job options for compression queue
 */
const DEFAULT_JOB_OPTIONS = {
  attempts: 2, // Retry once on failure
  backoff: {
    type: 'exponential' as const,
    delay: 5000, // 5 seconds initial delay
  },
  removeOnComplete: {
    age: 3600, // Remove completed jobs after 1 hour
    count: 100, // Keep last 100 completed jobs
  },
  removeOnFail: {
    age: 86400, // Keep failed jobs for 24 hours for debugging
  },
  timeout: 600000, // 10 minute timeout per job
};

@Injectable()
export class CompressionQueueService {
  private readonly logger = new Logger(CompressionQueueService.name);

  constructor(
    @InjectQueue(VIDEO_COMPRESSION_QUEUE_NAME)
    private readonly compressionQueue: Queue<CompressionJobData>,
  ) {}

  /**
   * Queue a video for compression
   *
   * @param mediaId - The media record ID
   * @param s3Key - S3 key of the original video
   * @param s3Bucket - S3 bucket name
   * @param fileSize - Original file size in bytes
   * @param mimeType - Video MIME type
   * @param fileName - Original file name
   * @param userId - User ID for folder structure
   * @param objectId - Knowledge base object ID
   * @param preset - Optional compression preset (auto-selected if not provided)
   * @returns Job ID if queued, null if compression not needed
   */
  async queueCompression(params: {
    mediaId: string;
    s3Key: string;
    s3Bucket: string;
    fileSize: number;
    mimeType: string;
    fileName: string;
    userId: number;
    objectId: string;
    preset?: CompressionPreset;
  }): Promise<string | null> {
    // Check if compression is needed
    if (!needsCompression('video', params.fileSize)) {
      this.logger.debug(
        `[Compression Queue] Skipping - file ${params.fileName} (${(params.fileSize / 1024 / 1024).toFixed(2)}MB) ` +
          `is within WhatsApp limit`,
      );
      return null;
    }

    // Determine compression preset
    const preset =
      params.preset ||
      getCompressionPreset(params.fileSize, WHATSAPP_SEND_LIMITS.video);

    const jobData: CompressionJobData = {
      mediaId: params.mediaId,
      s3Key: params.s3Key,
      s3Bucket: params.s3Bucket,
      originalFileSize: params.fileSize,
      targetFileSize: WHATSAPP_SEND_LIMITS.video,
      mimeType: params.mimeType,
      fileName: params.fileName,
      userId: params.userId,
      objectId: params.objectId,
      preset,
    };

    try {
      // Calculate priority based on file size (smaller = faster to process = higher priority)
      const priority = this.calculatePriority(params.fileSize);

      const job = await this.compressionQueue.add(
        VIDEO_COMPRESSION_JOB_NAME,
        jobData,
        {
          ...DEFAULT_JOB_OPTIONS,
          priority,
          jobId: `compress-${params.mediaId}`, // Use mediaId for deduplication
        },
      );

      this.logger.log(
        `[Compression Queue] Queued job ${job.id} for ${params.fileName} ` +
          `(${(params.fileSize / 1024 / 1024).toFixed(2)}MB -> ${WHATSAPP_SEND_LIMITS.video / 1024 / 1024}MB target, ` +
          `preset: ${preset}, priority: ${priority})`,
      );

      return job.id || null;
    } catch (error) {
      this.logger.error(
        `[Compression Queue] Failed to queue job for ${params.mediaId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get the status of a compression job
   */
  async getJobStatus(jobId: string): Promise<{
    status:
      | 'waiting'
      | 'active'
      | 'completed'
      | 'failed'
      | 'delayed'
      | 'unknown';
    progress?: number;
    result?: any;
    failedReason?: string;
  }> {
    try {
      const job = await this.compressionQueue.getJob(jobId);

      if (!job) {
        return { status: 'unknown' };
      }

      const state = await job.getState();
      const progress = job.progress;

      return {
        status: state as any,
        progress: typeof progress === 'number' ? progress : undefined,
        result: job.returnvalue,
        failedReason: job.failedReason,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get job status for ${jobId}: ${error.message}`,
      );
      return { status: 'unknown' };
    }
  }

  /**
   * Get job by media ID
   */
  async getJobByMediaId(
    mediaId: string,
  ): Promise<Job<CompressionJobData> | null> {
    const jobId = `compress-${mediaId}`;
    const job = await this.compressionQueue.getJob(jobId);
    return job || null;
  }

  /**
   * Cancel a pending compression job
   */
  async cancelJob(mediaId: string): Promise<boolean> {
    const jobId = `compress-${mediaId}`;

    try {
      const job = await this.compressionQueue.getJob(jobId);

      if (!job) {
        this.logger.debug(
          `[Compression Queue] Job ${jobId} not found for cancellation`,
        );
        return false;
      }

      const state = await job.getState();

      // Can only remove waiting or delayed jobs
      if (state === 'waiting' || state === 'delayed') {
        await job.remove();
        this.logger.log(`[Compression Queue] Cancelled job ${jobId}`);
        return true;
      }

      this.logger.debug(
        `[Compression Queue] Cannot cancel job ${jobId} - state is ${state}`,
      );
      return false;
    } catch (error) {
      this.logger.error(`Failed to cancel job ${jobId}: ${error.message}`);
      return false;
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
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.compressionQueue.getWaitingCount(),
      this.compressionQueue.getActiveCount(),
      this.compressionQueue.getCompletedCount(),
      this.compressionQueue.getFailedCount(),
      this.compressionQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Pause the compression queue
   */
  async pauseQueue(): Promise<void> {
    await this.compressionQueue.pause();
    this.logger.log('[Compression Queue] Queue paused');
  }

  /**
   * Resume the compression queue
   */
  async resumeQueue(): Promise<void> {
    await this.compressionQueue.resume();
    this.logger.log('[Compression Queue] Queue resumed');
  }

  /**
   * Clean old jobs from the queue
   */
  async cleanOldJobs(gracePeriod: number = 3600000): Promise<void> {
    await this.compressionQueue.clean(gracePeriod, 1000, 'completed');
    await this.compressionQueue.clean(gracePeriod * 24, 1000, 'failed');
    this.logger.log('[Compression Queue] Old jobs cleaned');
  }

  /**
   * Calculate job priority based on file size
   * Smaller files get higher priority (lower number)
   */
  private calculatePriority(fileSize: number): number {
    const mbSize = fileSize / (1024 * 1024);

    // Priority ranges:
    // 0-20MB: Priority 1 (highest)
    // 20-30MB: Priority 5
    // 30-40MB: Priority 10
    // 40-50MB: Priority 15
    // 50MB+: Priority 20

    if (mbSize <= 20) return 1;
    if (mbSize <= 30) return 5;
    if (mbSize <= 40) return 10;
    if (mbSize <= 50) return 15;
    return 20;
  }
}
