/**
 * Calendar Sync Queue Service
 *
 * Manages the BullMQ queue for calendar synchronization jobs.
 * Provides methods to:
 * - Schedule sync jobs for external calendars
 * - Check job status
 * - Cancel pending sync jobs
 * - Get queue statistics
 */

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import {
  CALENDAR_SYNC_JOB_NAME,
  CALENDAR_SYNC_QUEUE_NAME,
  CalendarSyncJobData,
  getSyncDelayMs,
  SYNC_JOB_OPTIONS,
  SyncFrequency,
} from './calendar-queue.types';

@Injectable()
export class CalendarSyncQueueService {
  private readonly logger = new Logger(CalendarSyncQueueService.name);

  constructor(
    @InjectQueue(CALENDAR_SYNC_QUEUE_NAME)
    private readonly syncQueue: Queue<CalendarSyncJobData>,
  ) {}

  /**
   * Queue a calendar sync job
   *
   * @param data - Sync job data
   * @param frequency - How often to repeat (for recurring syncs)
   * @returns Job ID
   */
  async queueSync(
    data: CalendarSyncJobData,
    frequency?: SyncFrequency,
  ): Promise<string> {
    const jobId = `sync-${data.connectionId}-${Date.now()}`;

    this.logger.log(
      `[Sync Queue] Queueing sync for connection ${data.connectionId} ` +
        `(provider: ${data.provider}, fullSync: ${data.fullSync})`,
    );

    const job = await this.syncQueue.add(CALENDAR_SYNC_JOB_NAME, data, {
      ...SYNC_JOB_OPTIONS,
      jobId,
    });

    // If recurring sync is requested, schedule next job
    if (frequency && frequency !== 'manual' && frequency !== 'realtime') {
      const delay = getSyncDelayMs(frequency);
      if (delay > 0) {
        await this.scheduleRecurringSync(data, frequency);
      }
    }

    return job.id || jobId;
  }

  /**
   * Schedule a recurring sync job
   *
   * @param data - Sync job data
   * @param frequency - Sync frequency
   */
  async scheduleRecurringSync(
    data: CalendarSyncJobData,
    frequency: SyncFrequency,
  ): Promise<void> {
    const delay = getSyncDelayMs(frequency);
    if (delay <= 0) return;

    const repeatJobId = `recurring-sync-${data.connectionId}`;

    // Remove existing repeat job if any
    await this.cancelRecurringSync(data.connectionId);

    // Add repeatable job
    await this.syncQueue.add(
      CALENDAR_SYNC_JOB_NAME,
      { ...data, fullSync: false }, // Recurring syncs are incremental
      {
        ...SYNC_JOB_OPTIONS,
        jobId: repeatJobId,
        repeat: {
          every: delay,
        },
      },
    );

    this.logger.log(
      `[Sync Queue] Scheduled recurring sync for ${data.connectionId} ` +
        `every ${delay / 1000 / 60} minutes`,
    );
  }

  /**
   * Cancel recurring sync for a connection
   *
   * @param connectionId - Connection ID
   */
  async cancelRecurringSync(connectionId: string): Promise<void> {
    const repeatJobId = `recurring-sync-${connectionId}`;

    try {
      // Remove from repeat jobs
      const repeatableJobs = await this.syncQueue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        if (job.id === repeatJobId || job.key.includes(connectionId)) {
          await this.syncQueue.removeRepeatableByKey(job.key);
          this.logger.log(
            `[Sync Queue] Cancelled recurring sync for ${connectionId}`,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `[Sync Queue] Error cancelling recurring sync: ${error}`,
      );
    }
  }

  /**
   * Get job by ID
   *
   * @param jobId - Job ID
   */
  async getJob(jobId: string): Promise<Job<CalendarSyncJobData> | undefined> {
    return this.syncQueue.getJob(jobId);
  }

  /**
   * Get all jobs for a connection
   *
   * @param connectionId - Connection ID
   */
  async getConnectionJobs(
    connectionId: string,
  ): Promise<Job<CalendarSyncJobData>[]> {
    const jobs = await this.syncQueue.getJobs([
      'waiting',
      'active',
      'delayed',
      'paused',
    ]);

    return jobs.filter((job) => job.data.connectionId === connectionId);
  }

  /**
   * Cancel a specific job
   *
   * @param jobId - Job ID to cancel
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.syncQueue.getJob(jobId);
    if (!job) return false;

    const state = await job.getState();
    if (state === 'active') {
      // Can't cancel active job, but we can mark it for cancellation
      this.logger.warn(
        `[Sync Queue] Cannot cancel active job ${jobId}, will complete`,
      );
      return false;
    }

    await job.remove();
    this.logger.log(`[Sync Queue] Cancelled job ${jobId}`);
    return true;
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.syncQueue.getWaitingCount(),
      this.syncQueue.getActiveCount(),
      this.syncQueue.getCompletedCount(),
      this.syncQueue.getFailedCount(),
      this.syncQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Queue sync for all active connections
   * Used by scheduled task for periodic sync
   *
   * @param connections - Array of connection data to sync
   */
  async queueBulkSync(
    connections: Array<{
      connectionId: string;
      userId: number;
      provider: 'google' | 'outlook' | 'apple';
      calendarId: string;
      syncDirection:
        | 'bidirectional'
        | 'external_to_local'
        | 'local_to_external';
      syncToken?: string;
    }>,
  ): Promise<string[]> {
    const jobIds: string[] = [];

    for (const conn of connections) {
      const jobId = await this.queueSync({
        connectionId: conn.connectionId,
        userId: conn.userId,
        provider: conn.provider,
        calendarId: conn.calendarId,
        syncDirection: conn.syncDirection,
        fullSync: false,
        syncToken: conn.syncToken,
      });
      jobIds.push(jobId);
    }

    this.logger.log(
      `[Sync Queue] Queued ${jobIds.length} sync jobs for bulk sync`,
    );

    return jobIds;
  }

  /**
   * Drain the queue (remove all jobs)
   * Use with caution - mainly for testing
   */
  async drain(): Promise<void> {
    await this.syncQueue.drain();
    this.logger.warn('[Sync Queue] Queue drained');
  }
}
