/**
 * Calendar AI Tools Service
 *
 * Defines OpenAI function calling tools for calendar operations.
 * These tools allow the AI to interact with the calendar system
 * during conversation.
 */

import { Injectable, Logger } from '@nestjs/common';

// Define our own tool type to avoid OpenAI version mismatches
export interface CalendarFunctionTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface CalendarTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Calendar AI Tool Names
 */
export const CALENDAR_TOOL_NAMES = {
  CHECK_AVAILABILITY: 'calendar_check_availability',
  SUGGEST_TIMES: 'calendar_suggest_times',
  CREATE_EVENT: 'calendar_create_event',
  RESCHEDULE_EVENT: 'calendar_reschedule_event',
  CANCEL_EVENT: 'calendar_cancel_event',
  GET_UPCOMING_EVENTS: 'calendar_get_upcoming_events',
  FIND_EVENT: 'calendar_find_event',
  CREATE_BOOKING_LINK: 'calendar_create_booking_link',
  GET_BOOKING_LINK: 'calendar_get_booking_link',
} as const;

export type CalendarToolName =
  (typeof CALENDAR_TOOL_NAMES)[keyof typeof CALENDAR_TOOL_NAMES];

@Injectable()
export class CalendarAiToolsService {
  private readonly logger = new Logger(CalendarAiToolsService.name);

  /**
   * Get all calendar tools for OpenAI function calling
   */
  getTools(): CalendarFunctionTool[] {
    return [
      this.checkAvailabilityTool(),
      this.suggestTimesTool(),
      this.createEventTool(),
      this.rescheduleEventTool(),
      this.cancelEventTool(),
      this.getUpcomingEventsTool(),
      this.findEventTool(),
      this.createBookingLinkTool(),
      this.getBookingLinkTool(),
    ];
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: CalendarToolName): CalendarFunctionTool | undefined {
    const tools = this.getTools();
    return tools.find((t) => t.function.name === name);
  }

  /**
   * Check if a tool name is a calendar tool
   */
  isCalendarTool(name: string): name is CalendarToolName {
    return Object.values(CALENDAR_TOOL_NAMES).includes(
      name as CalendarToolName,
    );
  }

  // ==================== Tool Definitions ====================

  private checkAvailabilityTool(): CalendarFunctionTool {
    return {
      type: 'function',
      function: {
        name: CALENDAR_TOOL_NAMES.CHECK_AVAILABILITY,
        description:
          'Check availability for a specific date/time range to see if the user has any conflicts or is free.',
        parameters: {
          type: 'object',
          properties: {
            startDate: {
              type: 'string',
              description:
                'Start date/time in ISO 8601 format (e.g., "2024-03-15T09:00:00Z")',
            },
            endDate: {
              type: 'string',
              description:
                'End date/time in ISO 8601 format (e.g., "2024-03-15T17:00:00Z")',
            },
            timeRange: {
              type: 'string',
              description:
                'Natural language time range if specific dates not provided (e.g., "tomorrow", "next week", "March 15th")',
            },
          },
          required: [],
        },
      },
    };
  }

  private suggestTimesTool(): CalendarFunctionTool {
    return {
      type: 'function',
      function: {
        name: CALENDAR_TOOL_NAMES.SUGGEST_TIMES,
        description:
          "Suggest available time slots for scheduling a meeting or appointment based on the user's availability.",
        parameters: {
          type: 'object',
          properties: {
            startDate: {
              type: 'string',
              description: 'Start of the search range in ISO 8601 format',
            },
            endDate: {
              type: 'string',
              description: 'End of the search range in ISO 8601 format',
            },
            durationMinutes: {
              type: 'number',
              description: 'Desired meeting duration in minutes (default: 30)',
            },
            preferredTimeOfDay: {
              type: 'string',
              enum: ['morning', 'afternoon', 'evening', 'any'],
              description: 'Preferred time of day for the meeting',
            },
            numberOfSuggestions: {
              type: 'number',
              description:
                'Number of time slots to suggest (default: 3, max: 10)',
            },
          },
          required: [],
        },
      },
    };
  }

  private createEventTool(): CalendarFunctionTool {
    return {
      type: 'function',
      function: {
        name: CALENDAR_TOOL_NAMES.CREATE_EVENT,
        description:
          'Create a new calendar event. Use this when the user wants to schedule a meeting, appointment, or reminder.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Event title/name',
            },
            description: {
              type: 'string',
              description: 'Event description or notes',
            },
            startTime: {
              type: 'string',
              description: 'Event start time in ISO 8601 format',
            },
            endTime: {
              type: 'string',
              description: 'Event end time in ISO 8601 format',
            },
            durationMinutes: {
              type: 'number',
              description:
                'Event duration in minutes (used if endTime not provided)',
            },
            location: {
              type: 'string',
              description:
                'Event location (physical address or virtual meeting link)',
            },
            attendees: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of attendee email addresses',
            },
            eventType: {
              type: 'string',
              enum: [
                'meeting',
                'call',
                'appointment',
                'reminder',
                'task',
                'other',
              ],
              description: 'Type of event',
            },
            contactId: {
              type: 'string',
              description: 'ID of the contact this event is related to',
            },
            sendInvites: {
              type: 'boolean',
              description: 'Whether to send calendar invites to attendees',
            },
          },
          required: ['title', 'startTime'],
        },
      },
    };
  }

  private rescheduleEventTool(): CalendarFunctionTool {
    return {
      type: 'function',
      function: {
        name: CALENDAR_TOOL_NAMES.RESCHEDULE_EVENT,
        description:
          'Reschedule an existing calendar event to a new date/time.',
        parameters: {
          type: 'object',
          properties: {
            eventId: {
              type: 'string',
              description: 'ID of the event to reschedule',
            },
            eventTitle: {
              type: 'string',
              description:
                'Title of the event to reschedule (used to find event if ID not provided)',
            },
            newStartTime: {
              type: 'string',
              description: 'New start time in ISO 8601 format',
            },
            newEndTime: {
              type: 'string',
              description: 'New end time in ISO 8601 format',
            },
            notifyAttendees: {
              type: 'boolean',
              description: 'Whether to notify attendees about the change',
            },
          },
          required: ['newStartTime'],
        },
      },
    };
  }

  private cancelEventTool(): CalendarFunctionTool {
    return {
      type: 'function',
      function: {
        name: CALENDAR_TOOL_NAMES.CANCEL_EVENT,
        description: 'Cancel an existing calendar event.',
        parameters: {
          type: 'object',
          properties: {
            eventId: {
              type: 'string',
              description: 'ID of the event to cancel',
            },
            eventTitle: {
              type: 'string',
              description:
                'Title of the event to cancel (used to find event if ID not provided)',
            },
            reason: {
              type: 'string',
              description: 'Reason for cancellation',
            },
            notifyAttendees: {
              type: 'boolean',
              description: 'Whether to notify attendees about the cancellation',
            },
          },
          required: [],
        },
      },
    };
  }

  private getUpcomingEventsTool(): CalendarFunctionTool {
    return {
      type: 'function',
      function: {
        name: CALENDAR_TOOL_NAMES.GET_UPCOMING_EVENTS,
        description:
          "Get the user's upcoming calendar events. Use this to answer questions about what's scheduled.",
        parameters: {
          type: 'object',
          properties: {
            startDate: {
              type: 'string',
              description:
                'Start of the search range in ISO 8601 format (defaults to now)',
            },
            endDate: {
              type: 'string',
              description:
                'End of the search range in ISO 8601 format (defaults to 7 days from now)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of events to return (default: 10)',
            },
            contactId: {
              type: 'string',
              description: 'Filter events by a specific contact',
            },
          },
          required: [],
        },
      },
    };
  }

  private findEventTool(): CalendarFunctionTool {
    return {
      type: 'function',
      function: {
        name: CALENDAR_TOOL_NAMES.FIND_EVENT,
        description:
          'Search for a specific event by title, date, or other criteria.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (matches event title or description)',
            },
            startDate: {
              type: 'string',
              description: 'Search within events starting after this date',
            },
            endDate: {
              type: 'string',
              description: 'Search within events starting before this date',
            },
            contactId: {
              type: 'string',
              description: 'Filter by contact',
            },
          },
          required: [],
        },
      },
    };
  }

  private createBookingLinkTool(): CalendarFunctionTool {
    return {
      type: 'function',
      function: {
        name: CALENDAR_TOOL_NAMES.CREATE_BOOKING_LINK,
        description:
          'Create a booking link that allows others to schedule time with the user.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the booking link (e.g., "30-minute call")',
            },
            durationMinutes: {
              type: 'number',
              description: 'Duration of bookings in minutes',
            },
            description: {
              type: 'string',
              description: 'Description shown on the booking page',
            },
            maxBookingsPerDay: {
              type: 'number',
              description: 'Maximum number of bookings allowed per day',
            },
          },
          required: ['name', 'durationMinutes'],
        },
      },
    };
  }

  private getBookingLinkTool(): CalendarFunctionTool {
    return {
      type: 'function',
      function: {
        name: CALENDAR_TOOL_NAMES.GET_BOOKING_LINK,
        description:
          'Get a booking link URL to share with someone so they can schedule time.',
        parameters: {
          type: 'object',
          properties: {
            linkId: {
              type: 'string',
              description: 'ID of the booking link',
            },
            linkName: {
              type: 'string',
              description:
                'Name of the booking link (used to find link if ID not provided)',
            },
          },
          required: [],
        },
      },
    };
  }
}
