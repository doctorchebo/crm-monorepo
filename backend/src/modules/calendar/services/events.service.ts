import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  availabilityOverrides,
  availabilityRules,
  type CalendarEvent,
  calendarEvents,
  eventAttendees,
  eventReminders,
  type NewCalendarEvent,
  type NewEventAttendee,
  type NewEventReminder,
} from '../../../database/calendar.schema';
import * as schema from '../../../database/schema';
import { CreateEventDto, EventQueryDto, UpdateEventDto } from '../dto';
import { CalendarShareService } from './calendar-share.service';

@Injectable()
export class EventsService {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private db: NodePgDatabase<typeof schema>,
    private calendarShareService: CalendarShareService,
  ) {}

  /**
   * Convert HH:MM time string to minutes from midnight
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Check if an event falls within the user's availability window
   * Returns true if available, false if outside availability hours
   */
  private async checkUserAvailability(
    userId: number,
    startTime: Date,
    endTime: Date,
  ): Promise<{ isAvailable: boolean; reason?: string }> {
    const dayOfWeek = startTime.getUTCDay();
    const dateStart = new Date(startTime);
    dateStart.setUTCHours(0, 0, 0, 0);
    const dateEnd = new Date(startTime);
    dateEnd.setUTCHours(23, 59, 59, 999);

    // Check for date-specific overrides first
    const [override] = await this.db
      .select()
      .from(availabilityOverrides)
      .where(
        and(
          eq(availabilityOverrides.userId, userId),
          gte(availabilityOverrides.date, dateStart),
          lte(availabilityOverrides.date, dateEnd),
          isNull(availabilityOverrides.bookingLinkId),
        ),
      );

    if (override && override.overrideType === 'unavailable') {
      return {
        isAvailable: false,
        reason: override.reason || 'This date is marked as unavailable',
      };
    }

    // Get availability rules for the user (general rules, not booking-link specific)
    const rules = await this.db
      .select()
      .from(availabilityRules)
      .where(
        and(
          eq(availabilityRules.userId, userId),
          isNull(availabilityRules.bookingLinkId),
        ),
      );

    // If no rules exist, user hasn't configured availability - allow by default
    if (rules.length === 0) {
      return { isAvailable: true };
    }

    // Find rules for the day of week
    const applicableRules = rules.filter((rule) => {
      const days = rule.daysOfWeek as number[];
      return days.includes(dayOfWeek) && rule.isActive;
    });

    // If no active rules for this day, check if there are any rules for this day at all
    if (applicableRules.length === 0) {
      const dayRules = rules.filter((rule) => {
        const days = rule.daysOfWeek as number[];
        return days.includes(dayOfWeek);
      });

      if (dayRules.length > 0) {
        // There are rules for this day but none are active - day is unavailable
        return {
          isAvailable: false,
          reason: 'This day is marked as unavailable in your schedule',
        };
      }
      // No rules defined for this day at all - allow by default
      return { isAvailable: true };
    }

    // Check if the event falls within any available time window (using UTC)
    const eventStartMinutes =
      startTime.getUTCHours() * 60 + startTime.getUTCMinutes();
    const eventEndMinutes =
      endTime.getUTCHours() * 60 + endTime.getUTCMinutes();

    const isWithinWindow = applicableRules.some((rule) => {
      return (
        eventStartMinutes >= rule.startMinutes &&
        eventEndMinutes <= rule.endMinutes
      );
    });

    if (!isWithinWindow) {
      return {
        isAvailable: false,
        reason: 'Event time falls outside your available hours',
      };
    }

    return { isAvailable: true };
  }

  /**
   * Create a new event
   */
  async create(
    calendarId: string,
    userId: number,
    dto: CreateEventDto | Omit<CreateEventDto, 'calendarId'>,
  ): Promise<CalendarEvent> {
    const targetCalendarId = 'calendarId' in dto ? dto.calendarId : calendarId;

    // Check if user can edit events in this calendar
    const canEdit = await this.calendarShareService.canEditEvents(
      targetCalendarId,
      userId,
    );
    if (!canEdit) {
      throw new ForbiddenException(
        'You do not have permission to create events in this calendar',
      );
    }

    // Validate times
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    if (endTime <= startTime) {
      throw new BadRequestException('End time must be after start time');
    }

    // Check availability unless explicitly skipped (and not an all-day event)
    const skipAvailabilityCheck =
      'skipAvailabilityCheck' in dto ? dto.skipAvailabilityCheck : false;
    if (!skipAvailabilityCheck && !dto.isAllDay) {
      const availabilityResult = await this.checkUserAvailability(
        userId,
        startTime,
        endTime,
      );
      if (!availabilityResult.isAvailable) {
        throw new BadRequestException(
          availabilityResult.reason ||
            'Event time falls outside your available hours',
        );
      }
    }

    const eventData: NewCalendarEvent = {
      calendarId: targetCalendarId,
      title: dto.title,
      description: dto.description,
      eventType: dto.eventType || 'meeting',
      startTime,
      endTime,
      isAllDay: dto.isAllDay || false,
      timezone: dto.timezone || 'UTC',
      location: dto.location,
      locationUrl: dto.locationUrl,
      isOnline: dto.isOnline ?? false,
      videoConferenceUrl: dto.videoConferenceUrl,
      videoConferenceProvider: dto.videoConferenceProvider,
      status: dto.status || 'confirmed',
      visibility: dto.visibility || 'calendar_default',
      showAsBusy: dto.showAsBusy ?? true,
      organizerId: userId,
      createdBy: userId,
      relatedContactId: dto.relatedContactId,
      relatedChatId: dto.relatedChatId,
      recurrenceRule: dto.recurrence
        ? this.buildRecurrenceRule(dto.recurrence)
        : null,
    };

    const [event] = await this.db
      .insert(calendarEvents)
      .values(eventData)
      .returning();

    // Create attendees if provided
    if (dto.attendees && dto.attendees.length > 0) {
      const attendeeData: NewEventAttendee[] = dto.attendees.map((a) => ({
        eventId: event.id,
        attendeeType: a.attendeeType,
        userId: a.userId,
        contactId: a.contactId,
        externalEmail: a.externalEmail,
        externalName: a.externalName,
        isOrganizer: a.isOrganizer || false,
        isOptional: a.isOptional || false,
        responseStatus: 'pending',
      }));

      await this.db.insert(eventAttendees).values(attendeeData);
    }

    // Create attendees from email list if provided
    if (dto.attendeeEmails && dto.attendeeEmails.length > 0) {
      const attendeeData: NewEventAttendee[] = dto.attendeeEmails.map(
        (email) => ({
          eventId: event.id,
          attendeeType: 'external',
          externalEmail: email,
          isOrganizer: false,
          isOptional: false,
          responseStatus: 'pending',
        }),
      );

      await this.db.insert(eventAttendees).values(attendeeData);
    }

    // Create reminders if provided
    if (dto.reminders && dto.reminders.length > 0) {
      const reminderData: NewEventReminder[] = dto.reminders.map((r) => ({
        eventId: event.id,
        method: r.method,
        minutesBefore: r.minutesBefore,
      }));

      await this.db.insert(eventReminders).values(reminderData);
    }

    return event;
  }

  /**
   * Build RRULE string from recurrence DTO
   */
  private buildRecurrenceRule(recurrence: {
    frequency: string;
    interval?: number;
    byDay?: number[];
    byMonthDay?: number;
    byMonth?: number;
    until?: string;
    count?: number;
  }): string {
    const parts: string[] = [];

    parts.push(`FREQ=${recurrence.frequency.toUpperCase()}`);

    if (recurrence.interval && recurrence.interval > 1) {
      parts.push(`INTERVAL=${recurrence.interval}`);
    }

    if (recurrence.byDay && recurrence.byDay.length > 0) {
      const dayMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
      const days = recurrence.byDay.map((d) => dayMap[d]).join(',');
      parts.push(`BYDAY=${days}`);
    }

    if (recurrence.byMonthDay) {
      parts.push(`BYMONTHDAY=${recurrence.byMonthDay}`);
    }

    if (recurrence.byMonth) {
      parts.push(`BYMONTH=${recurrence.byMonth}`);
    }

    if (recurrence.until) {
      const untilDate = new Date(recurrence.until);
      parts.push(
        `UNTIL=${untilDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      );
    } else if (recurrence.count) {
      parts.push(`COUNT=${recurrence.count}`);
    }

    return parts.join(';');
  }

  /**
   * Get events with query filters
   */
  async findAll(
    userId: number,
    teamId: number,
    query: EventQueryDto = {},
  ): Promise<CalendarEvent[]> {
    const conditions: ReturnType<typeof eq>[] = [];

    // Filter by calendar
    if (query.calendarId) {
      // Verify user has access
      const canView = await this.calendarShareService.canViewEvents(
        query.calendarId,
        userId,
      );
      if (!canView) {
        throw new ForbiddenException(
          'You do not have permission to view events in this calendar',
        );
      }
      conditions.push(eq(calendarEvents.calendarId, query.calendarId));
    } else {
      // Get events from all accessible calendars
      const accessibleCalendarIds =
        await this.calendarShareService.getAccessibleCalendarIds(
          userId,
          teamId,
        );
      if (accessibleCalendarIds.length === 0) {
        return [];
      }
      // For simplicity, we'll filter in memory or use a subquery
      // In production, you'd optimize this
    }

    // Date range filters
    if (query.startDate) {
      conditions.push(gte(calendarEvents.startTime, new Date(query.startDate)));
    }
    if (query.endDate) {
      conditions.push(lte(calendarEvents.startTime, new Date(query.endDate)));
    }

    // Status filters
    if (!query.includeCancelled) {
      conditions.push(
        or(
          eq(calendarEvents.status, 'confirmed'),
          eq(calendarEvents.status, 'tentative'),
        ) as ReturnType<typeof eq>,
      );
    }

    // Soft delete filter
    if (!query.includeDeleted) {
      conditions.push(isNull(calendarEvents.deletedAt));
    }

    // CRM filters
    if (query.relatedContactId) {
      conditions.push(
        eq(calendarEvents.relatedContactId, query.relatedContactId),
      );
    }
    if (query.relatedChatId) {
      conditions.push(eq(calendarEvents.relatedChatId, query.relatedChatId));
    }

    // Event type filter
    if (query.eventType) {
      conditions.push(eq(calendarEvents.eventType, query.eventType));
    }

    let queryBuilder = this.db
      .select()
      .from(calendarEvents)
      .where(and(...conditions))
      .orderBy(calendarEvents.startTime);

    // Pagination
    if (query.skip) {
      queryBuilder = queryBuilder.offset(query.skip) as typeof queryBuilder;
    }
    if (query.take) {
      queryBuilder = queryBuilder.limit(query.take) as typeof queryBuilder;
    }

    return queryBuilder;
  }

  /**
   * Get a single event by ID
   */
  async findById(eventId: string): Promise<CalendarEvent | null> {
    const [event] = await this.db
      .select()
      .from(calendarEvents)
      .where(
        and(eq(calendarEvents.id, eventId), isNull(calendarEvents.deletedAt)),
      );

    return event || null;
  }

  /**
   * Get event with access check
   */
  async findByIdWithAccess(
    eventId: string,
    userId: number,
  ): Promise<CalendarEvent> {
    const event = await this.findById(eventId);

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const canView = await this.calendarShareService.canViewEvents(
      event.calendarId,
      userId,
    );
    if (!canView) {
      throw new ForbiddenException(
        'You do not have permission to view this event',
      );
    }

    return event;
  }

  /**
   * Update an event
   */
  async update(
    eventId: string,
    userId: number,
    dto: UpdateEventDto,
  ): Promise<CalendarEvent> {
    const event = await this.findById(eventId);

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const canEdit = await this.calendarShareService.canEditEvents(
      event.calendarId,
      userId,
    );
    if (!canEdit) {
      throw new ForbiddenException(
        'You do not have permission to edit this event',
      );
    }

    // Validate times if provided
    if (dto.startTime || dto.endTime) {
      const startTime = dto.startTime
        ? new Date(dto.startTime)
        : event.startTime;
      const endTime = dto.endTime ? new Date(dto.endTime) : event.endTime;

      if (endTime <= startTime) {
        throw new BadRequestException('End time must be after start time');
      }
    }

    const updateData: Partial<CalendarEvent> = {
      updatedAt: new Date(),
    };

    // Map DTO fields to entity fields
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.startTime !== undefined)
      updateData.startTime = new Date(dto.startTime);
    if (dto.endTime !== undefined) updateData.endTime = new Date(dto.endTime);
    if (dto.isAllDay !== undefined) updateData.isAllDay = dto.isAllDay;
    if (dto.timezone !== undefined) updateData.timezone = dto.timezone;
    if (dto.location !== undefined) updateData.location = dto.location;
    if (dto.locationUrl !== undefined) updateData.locationUrl = dto.locationUrl;
    if (dto.isOnline !== undefined) updateData.isOnline = dto.isOnline;
    if (dto.videoConferenceUrl !== undefined)
      updateData.videoConferenceUrl = dto.videoConferenceUrl;
    if (dto.videoConferenceProvider !== undefined)
      updateData.videoConferenceProvider = dto.videoConferenceProvider;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.visibility !== undefined) updateData.visibility = dto.visibility;
    if (dto.showAsBusy !== undefined) updateData.showAsBusy = dto.showAsBusy;
    if (dto.relatedContactId !== undefined)
      updateData.relatedContactId = dto.relatedContactId;
    if (dto.relatedChatId !== undefined)
      updateData.relatedChatId = dto.relatedChatId;

    if (dto.recurrence !== undefined) {
      updateData.recurrenceRule = dto.recurrence
        ? this.buildRecurrenceRule(dto.recurrence)
        : null;
    }

    const [updated] = await this.db
      .update(calendarEvents)
      .set(updateData)
      .where(eq(calendarEvents.id, eventId))
      .returning();

    // Update attendees if provided
    if (dto.attendees !== undefined) {
      // Remove existing attendees
      await this.db
        .delete(eventAttendees)
        .where(eq(eventAttendees.eventId, eventId));

      // Add new attendees
      if (dto.attendees.length > 0) {
        const attendeeData: NewEventAttendee[] = dto.attendees.map((a) => ({
          eventId,
          attendeeType: a.attendeeType,
          userId: a.userId,
          contactId: a.contactId,
          externalEmail: a.externalEmail,
          externalName: a.externalName,
          isOrganizer: a.isOrganizer || false,
          isOptional: a.isOptional || false,
          responseStatus: 'pending',
        }));

        await this.db.insert(eventAttendees).values(attendeeData);
      }
    }

    // Update reminders if provided
    if (dto.reminders !== undefined) {
      // Remove existing reminders
      await this.db
        .delete(eventReminders)
        .where(eq(eventReminders.eventId, eventId));

      // Add new reminders
      if (dto.reminders.length > 0) {
        const reminderData: NewEventReminder[] = dto.reminders.map((r) => ({
          eventId,
          method: r.method,
          minutesBefore: r.minutesBefore,
        }));

        await this.db.insert(eventReminders).values(reminderData);
      }
    }

    return updated;
  }

  /**
   * Soft delete an event
   */
  async delete(
    eventId: string,
    userId: number,
    reason?: string,
  ): Promise<void> {
    const event = await this.findById(eventId);

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const canEdit = await this.calendarShareService.canEditEvents(
      event.calendarId,
      userId,
    );
    if (!canEdit) {
      throw new ForbiddenException(
        'You do not have permission to delete this event',
      );
    }

    await this.db
      .update(calendarEvents)
      .set({
        status: 'cancelled',
        deletedAt: new Date(),
        deletedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(calendarEvents.id, eventId));
  }

  /**
   * Cancel an event (mark as cancelled without soft deletion)
   */
  async cancel(
    eventId: string,
    userId: number,
    reason?: string,
  ): Promise<CalendarEvent> {
    const event = await this.findById(eventId);

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const canEdit = await this.calendarShareService.canEditEvents(
      event.calendarId,
      userId,
    );
    if (!canEdit) {
      throw new ForbiddenException(
        'You do not have permission to cancel this event',
      );
    }

    const [updated] = await this.db
      .update(calendarEvents)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(calendarEvents.id, eventId))
      .returning();

    return updated;
  }

  /**
   * Get upcoming events for a user
   */
  async getUpcoming(
    userId: number,
    teamId: number,
    limit = 10,
  ): Promise<CalendarEvent[]> {
    const now = new Date();

    const accessibleCalendarIds =
      await this.calendarShareService.getAccessibleCalendarIds(userId, teamId);

    if (accessibleCalendarIds.length === 0) {
      return [];
    }

    return this.db
      .select()
      .from(calendarEvents)
      .where(
        and(
          gte(calendarEvents.startTime, now),
          isNull(calendarEvents.deletedAt),
          eq(calendarEvents.status, 'confirmed'),
        ),
      )
      .orderBy(calendarEvents.startTime)
      .limit(limit);
  }

  /**
   * Get events for a specific date
   */
  async getByDate(
    userId: number,
    teamId: number,
    date: Date,
  ): Promise<CalendarEvent[]> {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    return this.findAll(userId, teamId, {
      startDate: dayStart.toISOString(),
      endDate: dayEnd.toISOString(),
    });
  }

  /**
   * Check for event conflicts
   */
  async hasConflicts(
    calendarId: string,
    startTime: Date,
    endTime: Date,
    excludeEventId?: string,
  ): Promise<boolean> {
    const conditions = [
      eq(calendarEvents.calendarId, calendarId),
      isNull(calendarEvents.deletedAt),
      eq(calendarEvents.status, 'confirmed'),
      // Overlapping time check: event starts before our end AND ends after our start
      lte(calendarEvents.startTime, endTime),
      gte(calendarEvents.endTime, startTime),
    ];

    if (excludeEventId) {
      // Don't consider the current event as a conflict
      conditions.push(
        or(eq(calendarEvents.id, excludeEventId)) as ReturnType<typeof eq>,
      );
    }

    const conflicts = await this.db
      .select()
      .from(calendarEvents)
      .where(and(...conditions))
      .limit(1);

    // If excludeEventId was provided, filter it out
    if (excludeEventId) {
      return conflicts.some((e) => e.id !== excludeEventId);
    }

    return conflicts.length > 0;
  }

  /**
   * Get events related to a contact
   */
  async getByContact(
    userId: number,
    teamId: number,
    contactId: string,
  ): Promise<CalendarEvent[]> {
    return this.findAll(userId, teamId, { relatedContactId: contactId });
  }

  /**
   * Get events related to a chat
   */
  async getByChat(
    userId: number,
    teamId: number,
    chatId: string,
  ): Promise<CalendarEvent[]> {
    return this.findAll(userId, teamId, { relatedChatId: chatId });
  }
}
