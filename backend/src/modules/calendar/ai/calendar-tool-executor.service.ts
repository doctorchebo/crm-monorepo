/**
 * Calendar Tool Executor Service
 *
 * Executes calendar operations when AI calls calendar tools.
 * This is the bridge between AI function calling and the calendar services.
 */

import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { and, eq, gte, ilike, lte, or } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  bookingLinks,
  calendarEvents,
} from '../../../database/calendar.schema';
import * as schema from '../../../database/schema';
import { CalendarService } from '../services/calendar.service';
import { CALENDAR_TOOL_NAMES } from './calendar-ai-tools.service';

export interface ToolExecutionContext {
  userId: number;
  teamId: number;
  chatId?: string;
  contactId?: string;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  message?: string;
  error?: string;
  requiresConfirmation?: boolean;
  confirmationPrompt?: string;
}

export interface CheckAvailabilityArgs {
  startDate?: string;
  endDate?: string;
  timeRange?: string;
}

export interface SuggestTimesArgs {
  startDate?: string;
  endDate?: string;
  durationMinutes?: number;
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening' | 'any';
  numberOfSuggestions?: number;
}

export interface CreateEventArgs {
  title: string;
  description?: string;
  startTime: string;
  endTime?: string;
  durationMinutes?: number;
  location?: string;
  attendees?: string[];
  eventType?: string;
  contactId?: string;
  sendInvites?: boolean;
}

export interface RescheduleEventArgs {
  eventId?: string;
  eventTitle?: string;
  newStartTime: string;
  newEndTime?: string;
  notifyAttendees?: boolean;
}

export interface CancelEventArgs {
  eventId?: string;
  eventTitle?: string;
  reason?: string;
  notifyAttendees?: boolean;
}

export interface GetUpcomingEventsArgs {
  startDate?: string;
  endDate?: string;
  limit?: number;
  contactId?: string;
}

export interface FindEventArgs {
  query?: string;
  startDate?: string;
  endDate?: string;
  contactId?: string;
}

export interface CreateBookingLinkArgs {
  name: string;
  durationMinutes: number;
  description?: string;
  maxBookingsPerDay?: number;
}

export interface GetBookingLinkArgs {
  linkId?: string;
  linkName?: string;
}

@Injectable()
export class CalendarToolExecutorService {
  private readonly logger = new Logger(CalendarToolExecutorService.name);

  constructor(
    @Inject('DATABASE_CONNECTION')
    private db: NodePgDatabase<typeof schema>,
    @Inject(forwardRef(() => CalendarService))
    private calendarService: CalendarService,
  ) {}

  /**
   * Execute a calendar tool with the given arguments
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    this.logger.log(
      `Executing calendar tool: ${toolName} for user ${context.userId}`,
    );

    try {
      switch (toolName) {
        case CALENDAR_TOOL_NAMES.CHECK_AVAILABILITY:
          return this.checkAvailability(
            args as unknown as CheckAvailabilityArgs,
            context,
          );

        case CALENDAR_TOOL_NAMES.SUGGEST_TIMES:
          return this.suggestTimes(
            args as unknown as SuggestTimesArgs,
            context,
          );

        case CALENDAR_TOOL_NAMES.CREATE_EVENT:
          return this.createEvent(args as unknown as CreateEventArgs, context);

        case CALENDAR_TOOL_NAMES.RESCHEDULE_EVENT:
          return this.rescheduleEvent(
            args as unknown as RescheduleEventArgs,
            context,
          );

        case CALENDAR_TOOL_NAMES.CANCEL_EVENT:
          return this.cancelEvent(args as unknown as CancelEventArgs, context);

        case CALENDAR_TOOL_NAMES.GET_UPCOMING_EVENTS:
          return this.getUpcomingEvents(
            args as unknown as GetUpcomingEventsArgs,
            context,
          );

        case CALENDAR_TOOL_NAMES.FIND_EVENT:
          return this.findEvent(args as unknown as FindEventArgs, context);

        case CALENDAR_TOOL_NAMES.CREATE_BOOKING_LINK:
          return this.createBookingLink(
            args as unknown as CreateBookingLinkArgs,
            context,
          );

        case CALENDAR_TOOL_NAMES.GET_BOOKING_LINK:
          return this.getBookingLink(
            args as unknown as GetBookingLinkArgs,
            context,
          );

        default:
          return {
            success: false,
            error: `Unknown calendar tool: ${toolName}`,
          };
      }
    } catch (error) {
      this.logger.error(`Tool execution failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message || 'An unexpected error occurred',
      };
    }
  }

  // ==================== Tool Implementations ====================

  private async checkAvailability(
    args: CheckAvailabilityArgs,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    // Parse dates
    const startDate = args.startDate ? new Date(args.startDate) : new Date();
    const endDate = args.endDate
      ? new Date(args.endDate)
      : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Get default calendar
    const calendar = await this.calendarService.getOrCreateDefaultCalendar(
      context.userId,
      context.teamId,
    );

    // Get events in range
    const events = await this.db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        startTime: calendarEvents.startTime,
        endTime: calendarEvents.endTime,
        status: calendarEvents.status,
      })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.calendarId, calendar.id),
          eq(calendarEvents.status, 'scheduled'),
          gte(calendarEvents.startTime, startDate),
          lte(calendarEvents.startTime, endDate),
        ),
      )
      .orderBy(calendarEvents.startTime);

    const busySlots = events.map((e) => ({
      start: e.startTime,
      end: e.endTime,
      title: e.title,
    }));

    return {
      success: true,
      data: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        busySlots,
        totalEvents: events.length,
        isFree: events.length === 0,
      },
      message:
        events.length === 0
          ? `You're completely free from ${this.formatDate(startDate)} to ${this.formatDate(endDate)}.`
          : `You have ${events.length} event(s) scheduled during this time.`,
    };
  }

  private async suggestTimes(
    args: SuggestTimesArgs,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const startDate = args.startDate ? new Date(args.startDate) : new Date();
    const endDate = args.endDate
      ? new Date(args.endDate)
      : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const durationMinutes = args.durationMinutes || 30;
    const maxSuggestions = Math.min(args.numberOfSuggestions || 3, 10);
    const preferredTime = args.preferredTimeOfDay || 'any';

    // Get busy times
    const calendar = await this.calendarService.getOrCreateDefaultCalendar(
      context.userId,
      context.teamId,
    );

    const events = await this.db
      .select({
        startTime: calendarEvents.startTime,
        endTime: calendarEvents.endTime,
      })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.calendarId, calendar.id),
          eq(calendarEvents.status, 'scheduled'),
          gte(calendarEvents.startTime, startDate),
          lte(calendarEvents.endTime, endDate),
        ),
      )
      .orderBy(calendarEvents.startTime);

    // Generate available slots
    const suggestions: Array<{ start: Date; end: Date }> = [];
    const businessHours = this.getBusinessHoursForPreference(preferredTime);

    let currentDate = new Date(startDate);
    currentDate.setHours(businessHours.start, 0, 0, 0);

    // Skip to tomorrow if it's too late today
    if (currentDate < new Date()) {
      currentDate = new Date();
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(businessHours.start, 0, 0, 0);
    }

    while (suggestions.length < maxSuggestions && currentDate < endDate) {
      const dayOfWeek = currentDate.getDay();

      // Skip weekends
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        const slotEnd = new Date(
          currentDate.getTime() + durationMinutes * 60 * 1000,
        );

        // Check if slot is within business hours
        if (
          slotEnd.getHours() * 60 + slotEnd.getMinutes() <=
          businessHours.end * 60
        ) {
          // Check for conflicts
          const hasConflict = events.some(
            (e) =>
              (currentDate >= e.startTime && currentDate < e.endTime) ||
              (slotEnd > e.startTime && slotEnd <= e.endTime) ||
              (currentDate <= e.startTime && slotEnd >= e.endTime),
          );

          if (!hasConflict) {
            suggestions.push({
              start: new Date(currentDate),
              end: new Date(slotEnd),
            });
          }
        }
      }

      // Move to next slot (30-minute increments)
      currentDate.setMinutes(currentDate.getMinutes() + 30);

      // Move to next day if past business hours
      if (
        currentDate.getHours() * 60 + currentDate.getMinutes() >=
        businessHours.end * 60
      ) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(businessHours.start, 0, 0, 0);
      }
    }

    return {
      success: true,
      data: {
        suggestions: suggestions.map((s) => ({
          start: s.start.toISOString(),
          end: s.end.toISOString(),
          formatted: this.formatTimeSlot(s.start, s.end),
        })),
        durationMinutes,
        preferredTimeOfDay: preferredTime,
      },
      message:
        suggestions.length > 0
          ? `Here are ${suggestions.length} available time slots for a ${durationMinutes}-minute meeting:`
          : 'No available time slots found in the specified range.',
    };
  }

  private async createEvent(
    args: CreateEventArgs,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    // Calculate end time
    const startTime = new Date(args.startTime);
    const endTime = args.endTime
      ? new Date(args.endTime)
      : new Date(
          startTime.getTime() + (args.durationMinutes || 30) * 60 * 1000,
        );

    // Check AI settings for permission
    const aiSettings = await this.calendarService.getAiSettings(context.userId);

    if (!aiSettings?.canCreateEvents) {
      return {
        success: false,
        error: 'AI event creation is disabled for your account.',
      };
    }

    // If autonomy level is "suggest", require confirmation
    if (aiSettings.autonomyLevel === 'suggest') {
      return {
        success: true,
        requiresConfirmation: true,
        confirmationPrompt: `I'd like to create the following event:\n\n**${args.title}**\n📅 ${this.formatTimeSlot(startTime, endTime)}${args.location ? `\n📍 ${args.location}` : ''}${args.description ? `\n📝 ${args.description}` : ''}\n\nShould I go ahead and create this event?`,
        data: {
          pending: true,
          eventDetails: {
            title: args.title,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            location: args.location,
            description: args.description,
            attendees: args.attendees,
          },
        },
      };
    }

    try {
      // Get the default calendar first
      const calendar = await this.calendarService.getOrCreateDefaultCalendar(
        context.userId,
        context.teamId,
      );

      // Create the event
      const event = await this.calendarService.createEvent(
        context.userId,
        context.teamId,
        {
          calendarId: calendar.id,
          title: args.title,
          description: args.description,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          location: args.location,
          attendeeEmails: args.attendees,
          eventType: args.eventType as any,
          relatedContactId: args.contactId || context.contactId,
        },
      );

      return {
        success: true,
        data: {
          eventId: event.id,
          title: event.title,
          startTime: event.startTime,
          endTime: event.endTime,
        },
        message: `I've created "${args.title}" for ${this.formatTimeSlot(startTime, endTime)}.`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create event: ${error.message}`,
      };
    }
  }

  private async rescheduleEvent(
    args: RescheduleEventArgs,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    // Find the event
    let eventId = args.eventId;

    if (!eventId && args.eventTitle) {
      const event = await this.findEventByTitle(
        args.eventTitle,
        context.userId,
        context.teamId,
      );
      if (event) {
        eventId = event.id;
      }
    }

    if (!eventId) {
      return {
        success: false,
        error:
          'Could not find the event to reschedule. Please specify the event name or ID.',
      };
    }

    // Calculate new end time
    const newStartTime = new Date(args.newStartTime);
    let newEndTime = args.newEndTime ? new Date(args.newEndTime) : undefined;

    // If no end time provided, maintain the same duration
    if (!newEndTime) {
      const existingEvent = await this.db
        .select({
          startTime: calendarEvents.startTime,
          endTime: calendarEvents.endTime,
        })
        .from(calendarEvents)
        .where(eq(calendarEvents.id, eventId))
        .limit(1);

      if (existingEvent[0]) {
        const duration =
          existingEvent[0].endTime.getTime() -
          existingEvent[0].startTime.getTime();
        newEndTime = new Date(newStartTime.getTime() + duration);
      } else {
        newEndTime = new Date(newStartTime.getTime() + 60 * 60 * 1000); // Default 1 hour
      }
    }

    // Check AI settings
    const aiSettings = await this.calendarService.getAiSettings(context.userId);

    if (!aiSettings?.canUpdateEvents) {
      return {
        success: false,
        error: 'AI event updates are disabled for your account.',
      };
    }

    if (aiSettings.autonomyLevel !== 'autonomous') {
      return {
        success: true,
        requiresConfirmation: true,
        confirmationPrompt: `I'd like to reschedule the event to:\n\n📅 ${this.formatTimeSlot(newStartTime, newEndTime)}\n\nShould I make this change?`,
        data: {
          pending: true,
          eventId,
          newStartTime: newStartTime.toISOString(),
          newEndTime: newEndTime.toISOString(),
        },
      };
    }

    try {
      const updated = await this.calendarService.updateEvent(
        eventId,
        context.userId,
        {
          startTime: newStartTime.toISOString(),
          endTime: newEndTime.toISOString(),
        },
      );

      return {
        success: true,
        data: updated,
        message: `I've rescheduled the event to ${this.formatTimeSlot(newStartTime, newEndTime)}.`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to reschedule: ${error.message}`,
      };
    }
  }

  private async cancelEvent(
    args: CancelEventArgs,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    // Find the event
    let eventId = args.eventId;
    let eventTitle = args.eventTitle;

    if (!eventId && args.eventTitle) {
      const event = await this.findEventByTitle(
        args.eventTitle,
        context.userId,
        context.teamId,
      );
      if (event) {
        eventId = event.id;
        eventTitle = event.title;
      }
    }

    if (!eventId) {
      return {
        success: false,
        error:
          'Could not find the event to cancel. Please specify the event name or ID.',
      };
    }

    // Check AI settings
    const aiSettings = await this.calendarService.getAiSettings(context.userId);

    if (!aiSettings?.canCancelEvents) {
      return {
        success: false,
        error: 'AI event cancellation is disabled for your account.',
      };
    }

    // Always require confirmation for cancellation unless fully autonomous
    if (aiSettings.autonomyLevel !== 'autonomous') {
      return {
        success: true,
        requiresConfirmation: true,
        confirmationPrompt: `Are you sure you want to cancel "${eventTitle || 'this event'}"?${args.reason ? `\n\nReason: ${args.reason}` : ''}`,
        data: {
          pending: true,
          eventId,
          reason: args.reason,
        },
      };
    }

    try {
      await this.calendarService.deleteEvent(eventId, context.userId);

      return {
        success: true,
        data: { eventId, cancelled: true },
        message: eventTitle
          ? `I've cancelled "${eventTitle}".`
          : "I've cancelled the event.",
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to cancel event: ${error.message}`,
      };
    }
  }

  private async getUpcomingEvents(
    args: GetUpcomingEventsArgs,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const startDate = args.startDate ? new Date(args.startDate) : new Date();
    const endDate = args.endDate
      ? new Date(args.endDate)
      : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const limit = args.limit || 10;

    const calendar = await this.calendarService.getOrCreateDefaultCalendar(
      context.userId,
      context.teamId,
    );

    const conditions = [
      eq(calendarEvents.calendarId, calendar.id),
      eq(calendarEvents.status, 'scheduled'),
      gte(calendarEvents.startTime, startDate),
      lte(calendarEvents.startTime, endDate),
    ];

    if (args.contactId) {
      conditions.push(eq(calendarEvents.relatedContactId, args.contactId));
    }

    const events = await this.db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        description: calendarEvents.description,
        startTime: calendarEvents.startTime,
        endTime: calendarEvents.endTime,
        location: calendarEvents.location,
        eventType: calendarEvents.eventType,
      })
      .from(calendarEvents)
      .where(and(...conditions))
      .orderBy(calendarEvents.startTime)
      .limit(limit);

    if (events.length === 0) {
      return {
        success: true,
        data: { events: [], count: 0 },
        message: 'You have no upcoming events in this time range.',
      };
    }

    const eventList = events
      .map(
        (e) =>
          `• **${e.title}** - ${this.formatTimeSlot(e.startTime, e.endTime)}${e.location ? ` at ${e.location}` : ''}`,
      )
      .join('\n');

    return {
      success: true,
      data: {
        events: events.map((e) => ({
          ...e,
          startTime: e.startTime.toISOString(),
          endTime: e.endTime.toISOString(),
        })),
        count: events.length,
      },
      message: `Here are your upcoming events:\n\n${eventList}`,
    };
  }

  private async findEvent(
    args: FindEventArgs,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const calendar = await this.calendarService.getOrCreateDefaultCalendar(
      context.userId,
      context.teamId,
    );

    const conditions = [
      eq(calendarEvents.calendarId, calendar.id),
      eq(calendarEvents.status, 'scheduled'),
    ];

    if (args.query) {
      conditions.push(
        or(
          ilike(calendarEvents.title, `%${args.query}%`),
          ilike(calendarEvents.description, `%${args.query}%`),
        ) as any,
      );
    }

    if (args.startDate) {
      conditions.push(gte(calendarEvents.startTime, new Date(args.startDate)));
    }

    if (args.endDate) {
      conditions.push(lte(calendarEvents.startTime, new Date(args.endDate)));
    }

    if (args.contactId) {
      conditions.push(eq(calendarEvents.relatedContactId, args.contactId));
    }

    const events = await this.db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        description: calendarEvents.description,
        startTime: calendarEvents.startTime,
        endTime: calendarEvents.endTime,
        location: calendarEvents.location,
      })
      .from(calendarEvents)
      .where(and(...conditions))
      .orderBy(calendarEvents.startTime)
      .limit(10);

    if (events.length === 0) {
      return {
        success: true,
        data: { events: [], count: 0 },
        message: args.query
          ? `No events found matching "${args.query}".`
          : 'No events found.',
      };
    }

    return {
      success: true,
      data: {
        events: events.map((e) => ({
          ...e,
          startTime: e.startTime.toISOString(),
          endTime: e.endTime.toISOString(),
        })),
        count: events.length,
      },
      message:
        events.length === 1
          ? `Found the event: **${events[0].title}** on ${this.formatTimeSlot(events[0].startTime, events[0].endTime)}`
          : `Found ${events.length} matching events.`,
    };
  }

  private async createBookingLink(
    args: CreateBookingLinkArgs,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      const link = await this.calendarService.createBookingLink(
        context.userId,
        context.teamId,
        {
          name: args.name,
          slug: this.generateSlug(args.name),
          description: args.description,
          durationMinutes: args.durationMinutes,
          maxBookingsPerDay: args.maxBookingsPerDay,
          bookingType: 'fixed',
        },
      );

      // Generate the booking URL
      const bookingUrl = `/book/${link.slug}`;

      return {
        success: true,
        data: {
          linkId: link.id,
          name: link.name,
          slug: link.slug,
          durationMinutes: link.duration,
          url: bookingUrl,
        },
        message: `I've created a booking link "${args.name}" for ${args.durationMinutes}-minute appointments. Here's your link: ${bookingUrl}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create booking link: ${error.message}`,
      };
    }
  }

  private async getBookingLink(
    args: GetBookingLinkArgs,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    let link;

    if (args.linkId) {
      link = await this.db
        .select()
        .from(bookingLinks)
        .where(
          and(
            eq(bookingLinks.id, args.linkId),
            eq(bookingLinks.createdBy, context.userId),
          ),
        )
        .limit(1);
    } else if (args.linkName) {
      link = await this.db
        .select()
        .from(bookingLinks)
        .where(
          and(
            ilike(bookingLinks.name, `%${args.linkName}%`),
            eq(bookingLinks.createdBy, context.userId),
          ),
        )
        .limit(1);
    } else {
      // Get all active booking links
      link = await this.db
        .select()
        .from(bookingLinks)
        .where(
          and(
            eq(bookingLinks.createdBy, context.userId),
            eq(bookingLinks.status, 'active'),
          ),
        )
        .limit(5);
    }

    if (!link || link.length === 0) {
      return {
        success: true,
        data: { links: [] },
        message:
          "You don't have any booking links yet. Would you like me to create one?",
      };
    }

    if (link.length === 1) {
      const bookingUrl = `/book/${link[0].slug}`;
      return {
        success: true,
        data: {
          link: {
            id: link[0].id,
            name: link[0].name,
            slug: link[0].slug,
            url: bookingUrl,
            durationMinutes: link[0].duration,
          },
        },
        message: `Here's your booking link: ${bookingUrl}\n\n"${link[0].name}" - ${link[0].duration} minute appointments`,
      };
    }

    const linksList = link
      .map((l) => `• **${l.name}** (${l.duration} min) - /book/${l.slug}`)
      .join('\n');

    return {
      success: true,
      data: {
        links: link.map((l) => ({
          id: l.id,
          name: l.name,
          slug: l.slug,
          url: `/book/${l.slug}`,
          durationMinutes: l.duration,
        })),
      },
      message: `Here are your booking links:\n\n${linksList}`,
    };
  }

  // ==================== Helper Methods ====================

  private async findEventByTitle(
    title: string,
    userId: number,
    teamId: number,
  ): Promise<{ id: string; title: string } | null> {
    const calendar = await this.calendarService.getOrCreateDefaultCalendar(
      userId,
      teamId,
    );

    const events = await this.db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
      })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.calendarId, calendar.id),
          eq(calendarEvents.status, 'scheduled'),
          ilike(calendarEvents.title, `%${title}%`),
          gte(calendarEvents.startTime, new Date()), // Only future events
        ),
      )
      .orderBy(calendarEvents.startTime)
      .limit(1);

    return events[0] || null;
  }

  private getBusinessHoursForPreference(preference: string): {
    start: number;
    end: number;
  } {
    switch (preference) {
      case 'morning':
        return { start: 9, end: 12 };
      case 'afternoon':
        return { start: 12, end: 17 };
      case 'evening':
        return { start: 17, end: 20 };
      default:
        return { start: 9, end: 17 };
    }
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }

  private formatTimeSlot(start: Date, end: Date): string {
    const dateStr = start.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    const startTime = start.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
    const endTime = end.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${dateStr} from ${startTime} to ${endTime}`;
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }
}
