/**
 * Calendar Reminder Scheduled Task
 *
 * Scheduled task that processes pending event reminders.
 * Acts as a safety net for reminders that might have been missed
 * by the queue system.
 *
 * Purpose:
 * - Catches reminders that weren't queued (e.g., created while system was down)
 * - Re-queues failed reminders
 * - Ensures no reminder is missed
 *
 * Schedule:
 * - Default: Every minute
 */

import {
  calendarEvents,
  calendars,
  eventReminders,
} from '@database/calendar.schema';
import { db } from '@database/db.connection';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { and, eq, gte, isNull, lte, ne } from 'drizzle-orm';
import type { ReminderMethod } from '../queue/calendar-queue.types';
import { CalendarReminderQueueService } from '../queue/calendar-reminder-queue.service';

/**
 * Default cron expression: Every minute
 */
const DEFAULT_REMINDER_CRON = '* * * * *';

@Injectable()
export class CalendarReminderTask implements OnModuleInit {
  private readonly logger = new Logger(CalendarReminderTask.name);
  private isRunning = false;

  constructor(
    private readonly reminderQueueService: CalendarReminderQueueService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  /**
   * Initialize the task on module startup
   */
  onModuleInit() {
    this.logger.log(
      '[CalendarReminder] Scheduled task initialized - runs every minute',
    );
  }

  /**
   * Main reminder task - runs every minute
   * Checks for pending reminders that should be sent
   */
  @Cron(DEFAULT_REMINDER_CRON, {
    name: 'calendar-reminders',
    timeZone: 'UTC',
  })
  async handleReminderCheck(): Promise<void> {
    // Prevent concurrent runs
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      // Get pending reminders
      const pendingReminders = await this.getPendingReminders();

      if (pendingReminders.length === 0) {
        return;
      }

      this.logger.log(
        `[CalendarReminder] Found ${pendingReminders.length} pending reminders`,
      );

      // Queue each reminder
      for (const reminder of pendingReminders) {
        try {
          await this.reminderQueueService.queueReminder({
            reminderId: reminder.reminderId,
            eventId: reminder.eventId,
            userId: reminder.userId,
            reminderMethod: reminder.reminderMethod as ReminderMethod,
            eventTitle: reminder.eventTitle,
            eventStartTime: reminder.eventStartTime,
            eventLocation: reminder.eventLocation || undefined,
            meetingLink: reminder.meetingLink || undefined,
          });
        } catch (error) {
          this.logger.error(
            `[CalendarReminder] Failed to queue reminder ${reminder.reminderId}: ${error}`,
          );
        }
      }

      this.logger.log(
        `[CalendarReminder] Queued ${pendingReminders.length} reminders`,
      );
    } catch (error) {
      this.logger.error(
        `[CalendarReminder] Error in reminder check: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get reminders that are due to be sent
   *
   * Criteria:
   * - Reminder not yet sent
   * - Event not cancelled or deleted
   * - Reminder time has passed (event start - minutes before <= now)
   * - Event hasn't started yet (or just started within last 5 minutes)
   */
  private async getPendingReminders(): Promise<
    Array<{
      reminderId: string;
      eventId: string;
      userId: number;
      reminderMethod: string;
      eventTitle: string;
      eventStartTime: Date;
      eventLocation: string | null;
      meetingLink: string | null;
    }>
  > {
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    // Get unsent reminders for upcoming events
    const results = await db
      .select({
        reminderId: eventReminders.id,
        eventId: calendarEvents.id,
        userId: calendars.userId,
        reminderMethod: eventReminders.reminderMethod,
        minutesBefore: eventReminders.minutesBefore,
        eventTitle: calendarEvents.title,
        eventStartTime: calendarEvents.startTime,
        eventLocation: calendarEvents.location,
        meetingLink: calendarEvents.videoConferenceUrl,
      })
      .from(eventReminders)
      .innerJoin(calendarEvents, eq(eventReminders.eventId, calendarEvents.id))
      .innerJoin(calendars, eq(calendarEvents.calendarId, calendars.id))
      .where(
        and(
          eq(eventReminders.isSent, false),
          isNull(calendarEvents.deletedAt),
          ne(calendarEvents.status, 'cancelled'),
          // Event starts within the next hour and hasn't ended
          gte(calendarEvents.startTime, fiveMinutesAgo),
          lte(
            calendarEvents.startTime,
            new Date(now.getTime() + 60 * 60 * 1000),
          ),
        ),
      );

    // Filter to only reminders that should be sent now and have a valid user
    return results.filter((r): r is typeof r & { userId: number } => {
      if (r.userId === null) return false;
      const reminderTime = new Date(
        r.eventStartTime.getTime() - r.minutesBefore * 60 * 1000,
      );
      return reminderTime <= now;
    });
  }

  /**
   * Queue reminders for a newly created event
   * Called by events service when an event is created
   */
  async queueEventReminders(
    eventId: string,
    eventTitle: string,
    eventStartTime: Date,
    eventLocation: string | undefined,
    meetingLink: string | undefined,
    userId: number,
  ): Promise<void> {
    // Get reminders for this event
    const reminders = await db
      .select({
        reminderId: eventReminders.id,
        reminderMethod: eventReminders.reminderMethod,
        minutesBefore: eventReminders.minutesBefore,
      })
      .from(eventReminders)
      .where(eq(eventReminders.eventId, eventId));

    if (reminders.length === 0) return;

    await this.reminderQueueService.scheduleEventReminders(
      eventId,
      eventTitle,
      eventStartTime,
      eventLocation,
      meetingLink,
      reminders.map((r) => ({
        reminderId: r.reminderId,
        reminderMethod: r.reminderMethod as ReminderMethod,
        minutesBefore: r.minutesBefore,
      })),
      userId,
    );
  }
}
