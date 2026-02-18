import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, isNull, lte, ne } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  calendarEvents,
  EventReminder,
  eventReminders,
} from '../../../database/calendar.schema';
import * as schema from '../../../database/schema';

@Injectable()
export class EventRemindersService {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Add a reminder to an event
   */
  async addReminder(
    eventId: string,
    reminderMethod: 'email' | 'push' | 'whatsapp' | 'in_app',
    minutesBefore: number,
  ): Promise<EventReminder> {
    const [created] = await this.db
      .insert(eventReminders)
      .values({
        eventId,
        reminderMethod,
        minutesBefore,
      })
      .returning();

    return created;
  }

  /**
   * Remove a reminder
   */
  async removeReminder(reminderId: string): Promise<void> {
    await this.db
      .delete(eventReminders)
      .where(eq(eventReminders.id, reminderId));
  }

  /**
   * Get all reminders for an event
   */
  async getEventReminders(eventId: string): Promise<EventReminder[]> {
    return this.db
      .select()
      .from(eventReminders)
      .where(eq(eventReminders.eventId, eventId));
  }

  /**
   * Set reminders for an event (replace existing)
   */
  async setReminders(
    eventId: string,
    reminders: {
      reminderMethod: 'email' | 'push' | 'whatsapp' | 'in_app';
      minutesBefore: number;
    }[],
  ): Promise<EventReminder[]> {
    // Remove existing reminders
    await this.db
      .delete(eventReminders)
      .where(eq(eventReminders.eventId, eventId));

    if (reminders.length === 0) return [];

    // Add new reminders
    const data = reminders.map((r) => ({
      eventId,
      reminderMethod: r.reminderMethod,
      minutesBefore: r.minutesBefore,
    }));

    return this.db.insert(eventReminders).values(data).returning();
  }

  /**
   * Get pending reminders that need to be sent
   * This would typically be called by a scheduled job
   */
  async getPendingReminders(): Promise<
    (EventReminder & { event: typeof calendarEvents.$inferSelect })[]
  > {
    const now = new Date();
    const maxLookAhead = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour ahead

    const results = await this.db
      .select({
        reminder: eventReminders,
        event: calendarEvents,
      })
      .from(eventReminders)
      .innerJoin(calendarEvents, eq(eventReminders.eventId, calendarEvents.id))
      .where(
        and(
          eq(eventReminders.isSent, false),
          isNull(calendarEvents.deletedAt),
          ne(calendarEvents.status, 'cancelled'),
          lte(calendarEvents.startTime, maxLookAhead),
          gte(calendarEvents.startTime, now),
        ),
      );

    // Filter to only include reminders that should be sent now
    return results
      .filter((r) => {
        const reminderTime = new Date(
          r.event.startTime.getTime() - r.reminder.minutesBefore * 60 * 1000,
        );
        return reminderTime <= now;
      })
      .map((r) => ({
        ...r.reminder,
        event: r.event,
      }));
  }

  /**
   * Mark reminder as sent
   */
  async markAsSent(reminderId: string): Promise<void> {
    await this.db
      .update(eventReminders)
      .set({
        isSent: true,
        sentAt: new Date(),
      })
      .where(eq(eventReminders.id, reminderId));
  }

  /**
   * Clear reminders for an event
   */
  async clearReminders(eventId: string): Promise<void> {
    await this.db
      .delete(eventReminders)
      .where(eq(eventReminders.eventId, eventId));
  }
}
