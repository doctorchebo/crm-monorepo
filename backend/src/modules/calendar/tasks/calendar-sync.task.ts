/**
 * Calendar Sync Scheduled Task
 *
 * Scheduled task that triggers periodic calendar synchronization
 * for all active sync connections.
 *
 * Purpose:
 * - Ensures calendars stay in sync even if webhooks fail
 * - Handles connections that don't support webhooks
 * - Runs at configurable intervals based on connection settings
 *
 * Schedule:
 * - Default: Every 15 minutes
 * - Processes connections based on their individual sync frequency
 */

import { calendarSyncConnections } from '@database/calendar.schema';
import { db } from '@database/db.connection';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { and, eq, isNull, lte, or } from 'drizzle-orm';
import type { SyncDirection } from '../queue/calendar-queue.types';
import { CalendarSyncQueueService } from '../queue/calendar-sync-queue.service';

/**
 * Default cron expression: Every 15 minutes
 */
const DEFAULT_SYNC_CRON = '*/15 * * * *';

@Injectable()
export class CalendarSyncTask implements OnModuleInit {
  private readonly logger = new Logger(CalendarSyncTask.name);
  private isRunning = false;

  constructor(
    private readonly syncQueueService: CalendarSyncQueueService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  /**
   * Initialize the task on module startup
   */
  onModuleInit() {
    this.logger.log(
      '[CalendarSync] Scheduled task initialized - runs every 15 minutes',
    );
  }

  /**
   * Main sync task - runs every 15 minutes
   */
  @Cron(DEFAULT_SYNC_CRON, {
    name: 'calendar-sync',
    timeZone: 'UTC',
  })
  async handlePeriodicSync(): Promise<void> {
    // Prevent concurrent runs
    if (this.isRunning) {
      this.logger.warn(
        '[CalendarSync] Previous run still in progress, skipping',
      );
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      this.logger.log('[CalendarSync] Starting periodic sync check');

      // Get all active connections that need syncing
      const connections = await this.getConnectionsDueForSync();

      if (connections.length === 0) {
        this.logger.debug('[CalendarSync] No connections due for sync');
        return;
      }

      this.logger.log(
        `[CalendarSync] Found ${connections.length} connections due for sync`,
      );

      // Queue sync jobs
      const jobIds = await this.syncQueueService.queueBulkSync(
        connections.map((c) => ({
          connectionId: c.id,
          userId: c.userId,
          provider: c.provider as 'google' | 'outlook' | 'apple',
          calendarId: c.linkedCalendarId,
          syncDirection: c.syncDirection as SyncDirection,
          syncToken: c.syncToken || undefined,
        })),
      );

      const duration = Date.now() - startTime;
      this.logger.log(
        `[CalendarSync] Queued ${jobIds.length} sync jobs in ${duration}ms`,
      );
    } catch (error) {
      this.logger.error(
        `[CalendarSync] Error in periodic sync: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get connections that are due for synchronization
   *
   * Criteria:
   * - Connection is active
   * - Either never synced, or last sync was more than 15 minutes ago
   * - Sync frequency is not 'manual' or 'realtime'
   */
  private async getConnectionsDueForSync(): Promise<
    Array<{
      id: string;
      userId: number;
      provider: string;
      linkedCalendarId: string;
      syncDirection: string;
      syncToken: string | null;
    }>
  > {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    const results = await db
      .select({
        id: calendarSyncConnections.id,
        userId: calendarSyncConnections.userId,
        provider: calendarSyncConnections.provider,
        linkedCalendarId: calendarSyncConnections.linkedCalendarId,
        syncDirection: calendarSyncConnections.syncDirection,
        syncToken: calendarSyncConnections.syncToken,
      })
      .from(calendarSyncConnections)
      .where(
        and(
          eq(calendarSyncConnections.status, 'active'),
          or(
            isNull(calendarSyncConnections.lastSyncAt),
            lte(calendarSyncConnections.lastSyncAt, fifteenMinutesAgo),
          ),
        ),
      );

    // Filter out connections without linked calendar
    return results.filter(
      (c): c is typeof c & { linkedCalendarId: string } =>
        c.linkedCalendarId !== null,
    );
  }

  /**
   * Manually trigger sync for all connections
   * Can be called via admin endpoint
   */
  async triggerManualSyncAll(): Promise<number> {
    const connections = await db
      .select({
        id: calendarSyncConnections.id,
        userId: calendarSyncConnections.userId,
        provider: calendarSyncConnections.provider,
        linkedCalendarId: calendarSyncConnections.linkedCalendarId,
        syncDirection: calendarSyncConnections.syncDirection,
        syncToken: calendarSyncConnections.syncToken,
      })
      .from(calendarSyncConnections)
      .where(eq(calendarSyncConnections.status, 'active'));

    // Filter connections with valid linkedCalendarId
    const validConnections = connections.filter(
      (c): c is typeof c & { linkedCalendarId: string } =>
        c.linkedCalendarId !== null,
    );

    if (validConnections.length === 0) return 0;

    await this.syncQueueService.queueBulkSync(
      validConnections.map((c) => ({
        connectionId: c.id,
        userId: c.userId,
        provider: c.provider as 'google' | 'outlook' | 'apple',
        calendarId: c.linkedCalendarId,
        syncDirection: c.syncDirection as SyncDirection,
        syncToken: c.syncToken || undefined,
      })),
    );

    return validConnections.length;
  }
}
