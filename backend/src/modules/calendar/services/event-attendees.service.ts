import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  EventAttendee,
  eventAttendees,
  NewEventAttendee,
} from '../../../database/calendar.schema';
import * as schema from '../../../database/schema';

@Injectable()
export class EventAttendeesService {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Add an attendee to an event
   */
  async addAttendee(
    eventId: string,
    attendee: Omit<NewEventAttendee, 'eventId'>,
  ): Promise<EventAttendee> {
    const [created] = await this.db
      .insert(eventAttendees)
      .values({
        eventId,
        ...attendee,
      })
      .returning();

    return created;
  }

  /**
   * Remove an attendee from an event
   */
  async removeAttendee(eventId: string, attendeeId: string): Promise<void> {
    await this.db
      .delete(eventAttendees)
      .where(
        and(
          eq(eventAttendees.id, attendeeId),
          eq(eventAttendees.eventId, eventId),
        ),
      );
  }

  /**
   * Get all attendees for an event
   */
  async getEventAttendees(eventId: string): Promise<EventAttendee[]> {
    return this.db
      .select()
      .from(eventAttendees)
      .where(eq(eventAttendees.eventId, eventId));
  }

  /**
   * Update attendee response
   */
  async updateResponse(
    eventId: string,
    userId: number,
    response: 'accepted' | 'declined' | 'tentative',
    message?: string,
  ): Promise<EventAttendee> {
    const [attendee] = await this.db
      .select()
      .from(eventAttendees)
      .where(
        and(
          eq(eventAttendees.eventId, eventId),
          eq(eventAttendees.userId, userId),
        ),
      );

    if (!attendee) {
      throw new NotFoundException('Attendee not found');
    }

    const [updated] = await this.db
      .update(eventAttendees)
      .set({
        responseStatus: response,
        responseNote: message,
        respondedAt: new Date(),
      })
      .where(eq(eventAttendees.id, attendee.id))
      .returning();

    return updated;
  }

  /**
   * Get attendee by user ID
   */
  async getAttendeeByUser(
    eventId: string,
    userId: number,
  ): Promise<EventAttendee | null> {
    const [attendee] = await this.db
      .select()
      .from(eventAttendees)
      .where(
        and(
          eq(eventAttendees.eventId, eventId),
          eq(eventAttendees.userId, userId),
        ),
      );

    return attendee || null;
  }

  /**
   * Get attendee by contact ID
   */
  async getAttendeeByContact(
    eventId: string,
    contactId: string,
  ): Promise<EventAttendee | null> {
    const [attendee] = await this.db
      .select()
      .from(eventAttendees)
      .where(
        and(
          eq(eventAttendees.eventId, eventId),
          eq(eventAttendees.contactId, contactId),
        ),
      );

    return attendee || null;
  }

  /**
   * Bulk add attendees
   */
  async addAttendees(
    eventId: string,
    attendees: Omit<NewEventAttendee, 'eventId'>[],
  ): Promise<EventAttendee[]> {
    if (attendees.length === 0) return [];

    const data = attendees.map((a) => ({
      eventId,
      ...a,
    }));

    return this.db.insert(eventAttendees).values(data).returning();
  }

  /**
   * Clear all attendees from an event
   */
  async clearAttendees(eventId: string): Promise<void> {
    await this.db
      .delete(eventAttendees)
      .where(eq(eventAttendees.eventId, eventId));
  }
}
