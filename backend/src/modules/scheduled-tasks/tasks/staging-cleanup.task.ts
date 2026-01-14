/**
 * Staging Cleanup Task
 *
 * Scheduled task that cleans up expired staged media files from S3.
 *
 * Purpose:
 * - Removes staged files that were never committed (user abandoned without sending)
 * - Prevents orphaned files from accumulating in S3
 * - Runs every 24 hours to match the staging TTL
 *
 * How it works:
 * - Queries database for staged files where expiresAt < now()
 * - Deletes matching files from S3 (both original and thumbnail)
 * - Removes database records
 *
 * Schedule:
 * - Default: Every day at 3:00 AM UTC (low-traffic period)
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { MediaStagingService } from '../../whatsapp/services/media-staging.service';

/**
 * Default cron expression: Every day at 3:00 AM UTC
 * Chosen to run during typically low-traffic hours
 */
const DEFAULT_CLEANUP_CRON = '0 3 * * *';

@Injectable()
export class StagingCleanupTask implements OnModuleInit {
  private readonly logger = new Logger(StagingCleanupTask.name);
  private isRunning = false;

  constructor(
    private readonly mediaStagingService: MediaStagingService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  /**
   * Initialize the task on module startup
   * Logs the configured schedule for visibility
   */
  onModuleInit() {
    this.logger.log(
      `[StagingCleanup] Scheduled task initialized - runs daily at 3:00 AM UTC`,
    );
  }

  /**
   * Main cleanup task - runs daily at 3:00 AM UTC
   *
   * Uses a lock (isRunning) to prevent concurrent executions
   * in case a previous run takes longer than expected.
   */
  @Cron(DEFAULT_CLEANUP_CRON, {
    name: 'staging-cleanup',
    timeZone: 'UTC',
  })
  async handleStagingCleanup(): Promise<void> {
    // Prevent concurrent runs
    if (this.isRunning) {
      this.logger.warn(
        '[StagingCleanup] Previous cleanup still running, skipping this execution',
      );
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    this.logger.log(
      '[StagingCleanup] Starting expired staged files cleanup...',
    );

    try {
      // Clean up expired staging records (files never sent within 24 hours)
      const expiredCount =
        await this.mediaStagingService.cleanupExpiredStagedFiles();

      // Clean up stuck promoted records (thumbnail callback never arrived)
      // These are records where main file was promoted but thumbnail is still pending
      // after more than 60 minutes - the callback likely failed
      const stuckCount =
        await this.mediaStagingService.cleanupStuckPromotedRecords(60);

      const duration = Date.now() - startTime;
      const totalCleaned = expiredCount + stuckCount;

      if (totalCleaned > 0) {
        this.logger.log(
          `[StagingCleanup] Cleaned up ${totalCleaned} files in ${duration}ms ` +
            `(expired: ${expiredCount}, stuck promoted: ${stuckCount})`,
        );
      } else {
        this.logger.log(
          `[StagingCleanup] No files to cleanup (took ${duration}ms)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[StagingCleanup] Failed to cleanup expired staged files: ${error.message}`,
        error.stack,
      );
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Manual trigger for cleanup (useful for testing or immediate cleanup)
   * Can be called via an admin endpoint if needed
   *
   * @returns Number of cleaned files
   */
  async triggerManualCleanup(): Promise<number> {
    this.logger.log('[StagingCleanup] Manual cleanup triggered');

    if (this.isRunning) {
      this.logger.warn('[StagingCleanup] Cleanup already running');
      return 0;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      const expiredCount =
        await this.mediaStagingService.cleanupExpiredStagedFiles();
      const stuckCount =
        await this.mediaStagingService.cleanupStuckPromotedRecords(60);
      const totalCleaned = expiredCount + stuckCount;
      const duration = Date.now() - startTime;

      this.logger.log(
        `[StagingCleanup] Manual cleanup completed: ${totalCleaned} files in ${duration}ms ` +
          `(expired: ${expiredCount}, stuck: ${stuckCount})`,
      );

      return totalCleaned;
    } catch (error) {
      this.logger.error(
        `[StagingCleanup] Manual cleanup failed: ${error.message}`,
        error.stack,
      );
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get the next scheduled run time
   */
  getNextRunTime(): Date | null {
    try {
      const job = this.schedulerRegistry.getCronJob('staging-cleanup');
      return job.nextDate().toJSDate();
    } catch {
      return null;
    }
  }
}
