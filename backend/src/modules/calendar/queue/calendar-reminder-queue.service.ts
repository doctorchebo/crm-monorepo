/**
 * Calendar Reminder Queue Service
 *
 * Manages the BullMQ queue for event reminder notification jobs.
 * Provides methods to:
 * - Schedule reminder jobs for events
 * - Cancel pending reminders
 * - Get reminder queue statistics
 */

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import {
  CALENDAR_REMINDER_JOB_NAME,
  CALENDAR_REMINDER_QUEUE_NAME,
  CalendarReminderJobData,
  REMINDER_JOB_OPTIONS,
  ReminderMethod,
} from './calendar-queue.types';

@Injectable()
export class CalendarReminderQueueService {
  private readonly logger = new Logger(CalendarReminderQueueService.name);

  constructor(
    @InjectQueue(CALENDAR_REMINDER_QUEUE_NAME)
    private readonly reminderQueue: Queue<CalendarReminderJobData>,
  ) {}

  /**
   * Queue a reminder for an event
   *
   * @param data - Reminder job data
   * @param delay - Delay in milliseconds before processing
   * @returns Job ID
   */
  async queueReminder(
    data: CalendarReminderJobData,
    delay?: number,
  ): Promise<string> {
    const jobId = `reminder-${data.reminderId}-${Date.now()}`;

    this.logger.log(
      `[Reminder Queue] Queueing reminder ${data.reminderId} for event ${data.eventId} ` +
        `(method: ${data.reminderMethod}, delay: ${delay || 0}ms)`,
    );

    const job = await this.reminderQueue.add(CALENDAR_REMINDER_JOB_NAME, data, {
      ...REMINDER_JOB_OPTIONS,
      jobId,
      delay: delay || 0,
    });

    return job.id || jobId;
  }

  /**
   * Schedule reminders for an event based on reminder settings
   *
   * @param eventId - Event ID
   * @param eventTitle - Event title
   * @param eventStartTime - Event start time
   * @param eventLocation - Event location (optional)
   * @param meetingLink - Meeting link (optional)
   * @param reminders - Array of reminder settings
   * @param userId - User ID to notify
   * @returns Array of job IDs
   */
  async scheduleEventReminders(
    eventId: string,
    eventTitle: string,
    eventStartTime: Date,
    eventLocation: string | undefined,
    meetingLink: string | undefined,
    reminders: Array<{
      reminderId: string;
      reminderMethod: ReminderMethod;
      minutesBefore: number;
    }>,
    userId: number,
    attendeeEmails?: string[],
  ): Promise<string[]> {
    const jobIds: string[] = [];
    const now = Date.now();

    for (const reminder of reminders) {
      const reminderTime =
        new Date(eventStartTime).getTime() - reminder.minutesBefore * 60 * 1000;
      const delay = reminderTime - now;

      // Only queue if reminder time is in the future
      if (delay > 0) {
        const jobId = await this.queueReminder(
          {
            reminderId: reminder.reminderId,
            eventId,
            userId,
            reminderMethod: reminder.reminderMethod,
            eventTitle,
            eventStartTime,
            eventLocation,
            meetingLink,
            attendeeEmails,
          },
          delay,
        );
        jobIds.push(jobId);
      } else {
        this.logger.debug(
          `[Reminder Queue] Skipping past reminder ${reminder.reminderId} ` +
            `(was due ${Math.abs(delay / 1000 / 60).toFixed(0)} minutes ago)`,
        );
      }
    }

    this.logger.log(
      `[Reminder Queue] Scheduled ${jobIds.length}/${reminders.length} reminders for event ${eventId}`,
    );

    return jobIds;
  }

  /**
   * Cancel all reminders for an event
   *
   * @param eventId - Event ID
   */
  async cancelEventReminders(eventId: string): Promise<number> {
    const jobs = await this.reminderQueue.getJobs([
      'waiting',
      'delayed',
      'paused',
    ]);

    let cancelled = 0;
    for (const job of jobs) {
      if (job.data.eventId === eventId) {
        await job.remove();
        cancelled++;
      }
    }

    if (cancelled > 0) {
      this.logger.log(
        `[Reminder Queue] Cancelled ${cancelled} reminders for event ${eventId}`,
      );
    }

    return cancelled;
  }

  /**
   * Cancel a specific reminder
   *
   * @param reminderId - Reminder ID
   */
  async cancelReminder(reminderId: string): Promise<boolean> {
    const jobs = await this.reminderQueue.getJobs([
      'waiting',
      'delayed',
      'paused',
    ]);

    for (const job of jobs) {
      if (job.data.reminderId === reminderId) {
        await job.remove();
        this.logger.log(`[Reminder Queue] Cancelled reminder ${reminderId}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Get job by ID
   *
   * @param jobId - Job ID
   */
  async getJob(
    jobId: string,
  ): Promise<Job<CalendarReminderJobData> | undefined> {
    return this.reminderQueue.getJob(jobId);
  }

  /**
   * Get all pending reminders for a user
   *
   * @param userId - User ID
   */
  async getUserPendingReminders(
    userId: number,
  ): Promise<Job<CalendarReminderJobData>[]> {
    const jobs = await this.reminderQueue.getJobs([
      'waiting',
      'delayed',
      'paused',
    ]);

    return jobs.filter((job) => job.data.userId === userId);
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
      this.reminderQueue.getWaitingCount(),
      this.reminderQueue.getActiveCount(),
      this.reminderQueue.getCompletedCount(),
      this.reminderQueue.getFailedCount(),
      this.reminderQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Reschedule reminders for a rescheduled event
   *
   * @param eventId - Event ID
   * @param newStartTime - New event start time
   */
  async rescheduleEventReminders(
    eventId: string,
    newStartTime: Date,
  ): Promise<number> {
    // Get current pending reminders for this event
    const jobs = await this.reminderQueue.getJobs(['waiting', 'delayed']);
    const eventJobs = jobs.filter((job) => job.data.eventId === eventId);

    if (eventJobs.length === 0) return 0;

    // Cancel existing and reschedule
    let rescheduled = 0;
    const now = Date.now();

    for (const job of eventJobs) {
      const data = job.data;
      // Calculate original minutesBefore from the scheduled time
      const originalDelay = (job.opts.delay || 0) + job.timestamp - now;
      const originalEventTime =
        new Date(data.eventStartTime).getTime() - originalDelay;
      const minutesBefore = (originalEventTime - originalDelay) / 60 / 1000;

      // Remove old job
      await job.remove();

      // Calculate new delay
      const newReminderTime =
        newStartTime.getTime() - minutesBefore * 60 * 1000;
      const newDelay = newReminderTime - now;

      if (newDelay > 0) {
        await this.queueReminder(
          {
            ...data,
            eventStartTime: newStartTime,
          },
          newDelay,
        );
        rescheduled++;
      }
    }

    this.logger.log(
      `[Reminder Queue] Rescheduled ${rescheduled}/${eventJobs.length} reminders for event ${eventId}`,
    );

    return rescheduled;
  }

  /**
   * Drain the queue (remove all jobs)
   * Use with caution - mainly for testing
   */
  async drain(): Promise<void> {
    await this.reminderQueue.drain();
    this.logger.warn('[Reminder Queue] Queue drained');
  }
}
