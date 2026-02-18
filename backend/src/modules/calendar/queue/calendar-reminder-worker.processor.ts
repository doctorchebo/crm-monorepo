/**
 * Calendar Reminder Worker Processor
 *
 * BullMQ processor that handles event reminder notification jobs.
 * Each job:
 * 1. Validates the event still exists and isn't cancelled
 * 2. Sends notification via the configured method (email, push, WhatsApp, in-app)
 * 3. Marks the reminder as sent in the database
 * 4. Emits WebSocket event for real-time UI update
 */

import { calendarEvents, eventReminders } from '@database/calendar.schema';
import { db } from '@database/db.connection';
import { users } from '@database/schema';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { and, eq, isNull, ne } from 'drizzle-orm';
import {
  CALENDAR_REMINDER_QUEUE_NAME,
  CalendarReminderJobData,
  CalendarReminderJobResult,
} from './calendar-queue.types';

@Processor(CALENDAR_REMINDER_QUEUE_NAME, {
  concurrency: 5, // Process 5 reminders simultaneously
})
@Injectable()
export class CalendarReminderWorkerProcessor extends WorkerHost {
  private readonly logger = new Logger(CalendarReminderWorkerProcessor.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  /**
   * Process a reminder notification job
   */
  async process(
    job: Job<CalendarReminderJobData>,
  ): Promise<CalendarReminderJobResult> {
    const { reminderId, eventId, userId, reminderMethod, eventTitle } =
      job.data;

    this.logger.log(
      `[Reminder Worker] Processing reminder ${reminderId} for event "${eventTitle}" ` +
        `(method: ${reminderMethod})`,
    );

    try {
      // Validate event still exists and isn't cancelled
      const isValid = await this.validateEvent(eventId);
      if (!isValid) {
        this.logger.debug(
          `[Reminder Worker] Event ${eventId} no longer valid, skipping reminder`,
        );
        return {
          success: false,
          method: reminderMethod,
          error: 'Event cancelled or deleted',
        };
      }

      // Check if reminder was already sent
      const reminderRecord = await this.getReminder(reminderId);
      if (reminderRecord?.isSent) {
        this.logger.debug(
          `[Reminder Worker] Reminder ${reminderId} already sent, skipping`,
        );
        return {
          success: true,
          method: reminderMethod,
          sentAt: reminderRecord.sentAt || undefined,
        };
      }

      // Get user info for notification
      const user = await this.getUser(userId);
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // Send notification
      await this.sendNotification(job.data, user);

      // Mark reminder as sent
      await this.markReminderSent(reminderId);

      const result: CalendarReminderJobResult = {
        success: true,
        method: reminderMethod,
        sentAt: new Date(),
      };

      this.logger.log(
        `[Reminder Worker] Sent ${reminderMethod} reminder for event "${eventTitle}"`,
      );

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `[Reminder Worker] Failed to send reminder ${reminderId}: ${errorMessage}`,
      );

      return {
        success: false,
        method: reminderMethod,
        error: errorMessage,
      };
    }
  }

  /**
   * Validate that event still exists and isn't cancelled
   */
  private async validateEvent(eventId: string): Promise<boolean> {
    const [event] = await db
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.id, eventId),
          isNull(calendarEvents.deletedAt),
          ne(calendarEvents.status, 'cancelled'),
        ),
      );

    return !!event;
  }

  /**
   * Get reminder record from database
   */
  private async getReminder(
    reminderId: string,
  ): Promise<{ isSent: boolean | null; sentAt: Date | null } | null> {
    const [reminder] = await db
      .select({
        isSent: eventReminders.isSent,
        sentAt: eventReminders.sentAt,
      })
      .from(eventReminders)
      .where(eq(eventReminders.id, reminderId));

    return reminder || null;
  }

  /**
   * Get user info for notification
   */
  private async getUser(
    userId: number,
  ): Promise<{ email: string; name: string | null } | null> {
    const [user] = await db
      .select({
        email: users.email,
        name: users.name,
      })
      .from(users)
      .where(eq(users.id, userId));

    return user || null;
  }

  /**
   * Send notification via the configured method
   */
  private async sendNotification(
    data: CalendarReminderJobData,
    user: { email: string; name: string | null },
  ): Promise<void> {
    switch (data.reminderMethod) {
      case 'email':
        await this.sendEmailNotification(data, user);
        break;
      case 'push':
        await this.sendPushNotification(data, user);
        break;
      case 'whatsapp':
        await this.sendWhatsAppNotification(data, user);
        break;
      case 'in_app':
        await this.sendInAppNotification(data, user);
        break;
      default:
        throw new Error(`Unsupported reminder method: ${data.reminderMethod}`);
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(
    data: CalendarReminderJobData,
    user: { email: string; name: string | null },
  ): Promise<void> {
    // TODO: Integrate with email service (SendGrid, SES, etc.)
    // For now, just log
    this.logger.debug(
      `[Reminder Worker] Would send email to ${user.email} for event "${data.eventTitle}"`,
    );

    // Example email content:
    // Subject: Reminder: {eventTitle} starting soon
    // Body:
    // Hi {name},
    // Your event "{eventTitle}" is starting at {eventStartTime}.
    // Location: {eventLocation}
    // Meeting Link: {meetingLink}
  }

  /**
   * Send push notification
   */
  private async sendPushNotification(
    data: CalendarReminderJobData,
    user: { email: string; name: string | null },
  ): Promise<void> {
    // TODO: Integrate with push notification service (Firebase, OneSignal, etc.)
    this.logger.debug(
      `[Reminder Worker] Would send push notification for event "${data.eventTitle}"`,
    );
  }

  /**
   * Send WhatsApp notification
   */
  private async sendWhatsAppNotification(
    data: CalendarReminderJobData,
    user: { email: string; name: string | null },
  ): Promise<void> {
    // TODO: Integrate with WhatsApp Business API
    // Needs to look up phone number from contacts or user profile
    this.logger.debug(
      `[Reminder Worker] Would send WhatsApp message to user ${user.email} ` +
        `for event "${data.eventTitle}"`,
    );
  }

  /**
   * Send in-app notification
   */
  private async sendInAppNotification(
    data: CalendarReminderJobData,
    user: { email: string; name: string | null },
  ): Promise<void> {
    // TODO: Create notification record in database
    // and emit WebSocket event for real-time display

    this.logger.debug(
      `[Reminder Worker] Would create in-app notification for event "${data.eventTitle}"`,
    );

    // Example: emit via WebSocket gateway
    // this.wsGateway.emit(data.userId, REMINDER_EVENTS.REMINDER_SENT, {
    //   eventId: data.eventId,
    //   eventTitle: data.eventTitle,
    //   eventStartTime: data.eventStartTime,
    // });
  }

  /**
   * Mark reminder as sent in database
   */
  private async markReminderSent(reminderId: string): Promise<void> {
    await db
      .update(eventReminders)
      .set({
        isSent: true,
        sentAt: new Date(),
      })
      .where(eq(eventReminders.id, reminderId));
  }

  /**
   * Worker event handlers
   */
  @OnWorkerEvent('completed')
  onCompleted(job: Job<CalendarReminderJobData>) {
    this.logger.debug(`[Reminder Worker] Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<CalendarReminderJobData>, error: Error) {
    this.logger.error(
      `[Reminder Worker] Job ${job.id} failed: ${error.message}`,
    );
  }
}
