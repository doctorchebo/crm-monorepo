/**
 * Calendar Sync Worker Processor
 *
 * BullMQ processor that handles calendar synchronization jobs.
 * Each job:
 * 1. Fetches events from external calendar (Google/Outlook/Apple)
 * 2. Compares with local events
 * 3. Creates/updates/deletes local events as needed
 * 4. (For two-way sync) pushes local changes to external calendar
 * 5. Updates sync token for incremental sync
 * 6. Logs sync results
 */

import {
  calendarEvents,
  calendarSyncConnections,
  calendarSyncLogs,
} from '@database/calendar.schema';
import { db } from '@database/db.connection';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import {
  CALENDAR_SYNC_QUEUE_NAME,
  CalendarSyncJobData,
  CalendarSyncJobResult,
} from './calendar-queue.types';

// External calendar event interface (normalized from different providers)
interface ExternalCalendarEvent {
  externalId: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  location?: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  attendees?: string[];
  lastModified: Date;
}

@Processor(CALENDAR_SYNC_QUEUE_NAME, {
  concurrency: 3, // Process 3 syncs simultaneously
})
@Injectable()
export class CalendarSyncWorkerProcessor extends WorkerHost {
  private readonly logger = new Logger(CalendarSyncWorkerProcessor.name);

  /**
   * Process a calendar sync job
   */
  async process(job: Job<CalendarSyncJobData>): Promise<CalendarSyncJobResult> {
    const { connectionId, userId, provider, calendarId, fullSync, syncToken } =
      job.data;

    this.logger.log(
      `[Sync Worker] Processing sync job ${job.id} for connection ${connectionId} ` +
        `(provider: ${provider}, fullSync: ${fullSync})`,
    );

    const result: CalendarSyncJobResult = {
      status: 'success',
      eventsImported: 0,
      eventsExported: 0,
      eventsUpdated: 0,
      eventsDeleted: 0,
      eventErrors: [],
    };

    try {
      // Update connection status
      await this.updateConnectionStatus(connectionId, 'syncing');
      await job.updateProgress(10);

      // Fetch external events
      const { events: externalEvents, newSyncToken } =
        await this.fetchExternalEvents(job.data, syncToken);
      await job.updateProgress(40);

      // Process incoming events (external -> local)
      if (
        job.data.syncDirection === 'bidirectional' ||
        job.data.syncDirection === 'external_to_local'
      ) {
        const importResult = await this.importEvents(
          externalEvents,
          calendarId,
          userId,
          connectionId,
        );
        result.eventsImported = importResult.imported;
        result.eventsUpdated += importResult.updated;
        result.eventsDeleted += importResult.deleted;
        if (importResult.errors.length > 0) {
          result.eventErrors?.push(...importResult.errors);
        }
      }
      await job.updateProgress(70);

      // Process outgoing events (local -> external)
      if (
        job.data.syncDirection === 'bidirectional' ||
        job.data.syncDirection === 'local_to_external'
      ) {
        const exportResult = await this.exportEvents(job.data);
        result.eventsExported = exportResult.exported;
        result.eventsUpdated += exportResult.updated;
        if (exportResult.errors.length > 0) {
          result.eventErrors?.push(...exportResult.errors);
        }
      }
      await job.updateProgress(90);

      // Update sync token
      result.syncToken = newSyncToken;

      // Update connection with sync results
      await this.updateConnectionAfterSync(connectionId, result);
      await job.updateProgress(100);

      // Log successful sync
      await this.logSync(connectionId, 'success', result);

      if (result.eventErrors && result.eventErrors.length > 0) {
        result.status = 'partial';
      }

      this.logger.log(
        `[Sync Worker] Completed sync for ${connectionId}: ` +
          `imported=${result.eventsImported}, exported=${result.eventsExported}, ` +
          `updated=${result.eventsUpdated}, deleted=${result.eventsDeleted}`,
      );

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `[Sync Worker] Sync failed for ${connectionId}: ${errorMessage}`,
      );

      result.status = 'failed';
      result.error = errorMessage;

      // Update connection status
      await this.updateConnectionStatus(connectionId, 'error');

      // Log failed sync
      await this.logSync(connectionId, 'error', result, errorMessage);

      throw error;
    }
  }

  /**
   * Fetch events from external calendar
   */
  private async fetchExternalEvents(
    data: CalendarSyncJobData,
    syncToken?: string,
  ): Promise<{ events: ExternalCalendarEvent[]; newSyncToken?: string }> {
    this.logger.debug(
      `[Sync Worker] Fetching events from ${data.provider} for ${data.connectionId}`,
    );

    // Different implementation per provider
    switch (data.provider) {
      case 'google':
        return this.fetchGoogleEvents(data, syncToken);
      case 'outlook':
        return this.fetchOutlookEvents(data, syncToken);
      case 'apple':
        return this.fetchAppleEvents(data, syncToken);
      default:
        throw new Error(`Unsupported provider: ${data.provider}`);
    }
  }

  /**
   * Fetch events from Google Calendar
   */
  private async fetchGoogleEvents(
    data: CalendarSyncJobData,
    syncToken?: string,
  ): Promise<{ events: ExternalCalendarEvent[]; newSyncToken?: string }> {
    // TODO: Implement Google Calendar API integration
    // 1. Get access token from connection
    // 2. Call Google Calendar API with sync token
    // 3. Transform response to ExternalCalendarEvent[]
    // 4. Return new sync token

    this.logger.debug('[Sync Worker] Google Calendar fetch (placeholder)');

    // Placeholder implementation
    return {
      events: [],
      newSyncToken: `google_sync_${Date.now()}`,
    };
  }

  /**
   * Fetch events from Outlook Calendar
   */
  private async fetchOutlookEvents(
    data: CalendarSyncJobData,
    syncToken?: string,
  ): Promise<{ events: ExternalCalendarEvent[]; newSyncToken?: string }> {
    // TODO: Implement Microsoft Graph API integration
    // 1. Get access token from connection
    // 2. Call Graph API with delta token
    // 3. Transform response to ExternalCalendarEvent[]
    // 4. Return new delta token

    this.logger.debug('[Sync Worker] Outlook Calendar fetch (placeholder)');

    return {
      events: [],
      newSyncToken: `outlook_delta_${Date.now()}`,
    };
  }

  /**
   * Fetch events from Apple Calendar
   */
  private async fetchAppleEvents(
    data: CalendarSyncJobData,
    syncToken?: string,
  ): Promise<{ events: ExternalCalendarEvent[]; newSyncToken?: string }> {
    // TODO: Implement Apple CalDAV integration
    // 1. Get credentials from connection
    // 2. Connect via CalDAV
    // 3. Fetch events since last sync
    // 4. Transform to ExternalCalendarEvent[]

    this.logger.debug('[Sync Worker] Apple Calendar fetch (placeholder)');

    return {
      events: [],
      newSyncToken: `apple_sync_${Date.now()}`,
    };
  }

  /**
   * Import events from external calendar to local
   */
  private async importEvents(
    externalEvents: ExternalCalendarEvent[],
    calendarId: string,
    userId: number,
    connectionId: string,
  ): Promise<{
    imported: number;
    updated: number;
    deleted: number;
    errors: Array<{ eventId: string; error: string }>;
  }> {
    let imported = 0;
    let updated = 0;
    let deleted = 0;
    const errors: Array<{ eventId: string; error: string }> = [];

    for (const extEvent of externalEvents) {
      try {
        // Check if event already exists (by external ID)
        const [existing] = await db
          .select()
          .from(calendarEvents)
          .where(
            and(
              eq(calendarEvents.calendarId, calendarId),
              eq(calendarEvents.externalEventId, extEvent.externalId),
            ),
          );

        if (extEvent.status === 'cancelled') {
          // Handle deletion
          if (existing) {
            await db
              .update(calendarEvents)
              .set({ deletedAt: new Date() })
              .where(eq(calendarEvents.id, existing.id));
            deleted++;
          }
        } else if (existing) {
          // Update existing event
          await db
            .update(calendarEvents)
            .set({
              title: extEvent.title,
              description: extEvent.description,
              startTime: extEvent.startTime,
              endTime: extEvent.endTime,
              isAllDay: extEvent.isAllDay,
              location: extEvent.location,
              status: extEvent.status,
              updatedAt: new Date(),
            })
            .where(eq(calendarEvents.id, existing.id));
          updated++;
        } else {
          // Create new event
          await db.insert(calendarEvents).values({
            calendarId,
            createdBy: userId,
            organizerId: userId,
            title: extEvent.title,
            description: extEvent.description,
            startTime: extEvent.startTime,
            endTime: extEvent.endTime,
            isAllDay: extEvent.isAllDay,
            location: extEvent.location,
            status: extEvent.status,
            externalEventId: extEvent.externalId,
            externalCalendarId: connectionId,
          });
          imported++;
        }
      } catch (error) {
        errors.push({
          eventId: extEvent.externalId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { imported, updated, deleted, errors };
  }

  /**
   * Export local events to external calendar
   */
  private async exportEvents(data: CalendarSyncJobData): Promise<{
    exported: number;
    updated: number;
    errors: Array<{ eventId: string; error: string }>;
  }> {
    // TODO: Implement export to external calendars
    // 1. Get local events that were modified since last sync
    // 2. For each event, push to external calendar
    // 3. Update local event with external ID

    this.logger.debug('[Sync Worker] Export events (placeholder)');

    return {
      exported: 0,
      updated: 0,
      errors: [],
    };
  }

  /**
   * Update connection status
   */
  private async updateConnectionStatus(
    connectionId: string,
    status: 'active' | 'syncing' | 'error',
  ): Promise<void> {
    await db
      .update(calendarSyncConnections)
      .set({ status, updatedAt: new Date() })
      .where(eq(calendarSyncConnections.id, connectionId));
  }

  /**
   * Update connection after successful sync
   */
  private async updateConnectionAfterSync(
    connectionId: string,
    result: CalendarSyncJobResult,
  ): Promise<void> {
    await db
      .update(calendarSyncConnections)
      .set({
        status: 'active',
        lastSyncAt: new Date(),
        syncToken: result.syncToken,
        updatedAt: new Date(),
      })
      .where(eq(calendarSyncConnections.id, connectionId));
  }

  /**
   * Log sync operation
   */
  private async logSync(
    connectionId: string,
    status: 'success' | 'error',
    result: CalendarSyncJobResult,
    errorMessage?: string,
  ): Promise<void> {
    await db.insert(calendarSyncLogs).values({
      connectionId,
      operation: 'incremental_sync',
      direction: 'import',
      status,
      eventsCreated: result.eventsImported,
      eventsUpdated: result.eventsUpdated,
      eventsDeleted: result.eventsDeleted,
      errorMessage,
      errorDetails: result.eventErrors?.length
        ? { errors: result.eventErrors }
        : undefined,
    });
  }

  /**
   * Worker event handlers
   */
  @OnWorkerEvent('completed')
  onCompleted(job: Job<CalendarSyncJobData>) {
    this.logger.log(`[Sync Worker] Job ${job.id} completed successfully`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<CalendarSyncJobData>, error: Error) {
    this.logger.error(
      `[Sync Worker] Job ${job.id} failed: ${error.message}`,
      error.stack,
    );
  }

  @OnWorkerEvent('active')
  onActive(job: Job<CalendarSyncJobData>) {
    this.logger.debug(`[Sync Worker] Job ${job.id} is now active`);
  }
}
