/**
 * Calendar AI Integration Service
 *
 * Integrates calendar functionality with the AI reply system.
 * Handles tool calling, intent detection, and conversation context.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  CALENDAR_TOOL_NAMES,
  CalendarAiToolsService,
} from './calendar-ai-tools.service';
import {
  CalendarIntent,
  CalendarIntentDetectorService,
} from './calendar-intent-detector.service';
import {
  CalendarToolExecutorService,
  ToolExecutionContext,
  ToolExecutionResult,
} from './calendar-tool-executor.service';

export interface CalendarAiIntegrationConfig {
  /** Whether calendar AI is enabled */
  enabled: boolean;
  /** Whether to detect intents automatically */
  autoDetectIntents: boolean;
  /** Whether to use function calling for complex operations */
  useFunctionCalling: boolean;
  /** Minimum confidence for intent detection */
  minIntentConfidence: number;
}

export interface ProcessMessageResult {
  /** Whether calendar tools were invoked */
  calendarToolsUsed: boolean;
  /** The detected intent (if any) */
  intent?: CalendarIntent;
  /** Tool execution results */
  toolResults?: ToolExecutionResult[];
  /** Suggested response to include with AI reply */
  suggestedResponse?: string;
  /** Additional context for AI */
  contextForAi?: string;
  /** Whether a confirmation is pending */
  pendingConfirmation?: boolean;
}

export interface CalendarContext {
  /** Upcoming events summary */
  upcomingEvents?: Array<{
    title: string;
    startTime: string;
    endTime: string;
  }>;
  /** Current availability status */
  availability?: {
    isFree: boolean;
    nextFreeSlot?: Date;
    busyUntil?: Date;
  };
  /** Pending booking requests */
  pendingBookings?: number;
  /** Active booking links */
  bookingLinks?: Array<{
    name: string;
    url: string;
  }>;
}

@Injectable()
export class CalendarAiIntegrationService {
  private readonly logger = new Logger(CalendarAiIntegrationService.name);
  private readonly config: CalendarAiIntegrationConfig;
  private readonly openai: OpenAI | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly toolsService: CalendarAiToolsService,
    private readonly intentDetector: CalendarIntentDetectorService,
    private readonly toolExecutor: CalendarToolExecutorService,
  ) {
    // Load configuration
    this.config = {
      enabled: this.configService.get<boolean>('CALENDAR_AI_ENABLED', true),
      autoDetectIntents: this.configService.get<boolean>(
        'CALENDAR_AI_AUTO_DETECT_INTENTS',
        true,
      ),
      useFunctionCalling: this.configService.get<boolean>(
        'CALENDAR_AI_USE_FUNCTION_CALLING',
        true,
      ),
      minIntentConfidence: this.configService.get<number>(
        'CALENDAR_AI_MIN_INTENT_CONFIDENCE',
        0.5,
      ),
    };

    // Initialize OpenAI for function calling
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  /**
   * Process an incoming message for calendar-related content
   */
  async processMessage(
    message: string,
    context: ToolExecutionContext,
  ): Promise<ProcessMessageResult> {
    if (!this.config.enabled) {
      return { calendarToolsUsed: false };
    }

    // Detect calendar intent
    const intent = this.intentDetector.detectIntent(message);

    if (
      intent.type === 'none' ||
      intent.confidence < this.config.minIntentConfidence
    ) {
      return { calendarToolsUsed: false, intent };
    }

    this.logger.log(
      `Detected calendar intent: ${intent.type} (confidence: ${intent.confidence})`,
    );

    // Handle the intent
    const result = await this.handleIntent(intent, context);

    return {
      calendarToolsUsed: true,
      intent,
      ...result,
    };
  }

  /**
   * Execute a specific calendar tool via function calling
   */
  async executeToolCall(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    if (!this.toolsService.isCalendarTool(toolName)) {
      return {
        success: false,
        error: `Unknown calendar tool: ${toolName}`,
      };
    }

    return this.toolExecutor.execute(toolName, args, context);
  }

  /**
   * Get calendar tools for OpenAI function calling
   */
  getToolDefinitions() {
    return this.toolsService.getTools();
  }

  /**
   * Build calendar context for AI prompts
   */
  async buildCalendarContext(
    context: ToolExecutionContext,
  ): Promise<CalendarContext> {
    const calendarContext: CalendarContext = {};

    try {
      // Get upcoming events (next 24 hours)
      const upcomingResult = await this.toolExecutor.execute(
        CALENDAR_TOOL_NAMES.GET_UPCOMING_EVENTS,
        {
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          limit: 5,
        },
        context,
      );

      if (upcomingResult.success && upcomingResult.data) {
        const data = upcomingResult.data as { events?: unknown[] };
        calendarContext.upcomingEvents = data.events as any;
      }

      // Check current availability
      const availabilityResult = await this.toolExecutor.execute(
        CALENDAR_TOOL_NAMES.CHECK_AVAILABILITY,
        {
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        },
        context,
      );

      if (availabilityResult.success && availabilityResult.data) {
        const data = availabilityResult.data as { isFree?: boolean };
        calendarContext.availability = {
          isFree: data.isFree ?? true,
        };
      }

      // Get booking links
      const bookingResult = await this.toolExecutor.execute(
        CALENDAR_TOOL_NAMES.GET_BOOKING_LINK,
        {},
        context,
      );

      if (bookingResult.success && bookingResult.data) {
        const data = bookingResult.data as { links?: unknown[] };
        calendarContext.bookingLinks = data.links as any;
      }
    } catch (error) {
      this.logger.warn(`Failed to build calendar context: ${error.message}`);
    }

    return calendarContext;
  }

  /**
   * Format calendar context for inclusion in AI system prompt
   */
  formatCalendarContextForPrompt(context: CalendarContext): string {
    const parts: string[] = [];

    if (context.upcomingEvents && context.upcomingEvents.length > 0) {
      parts.push('Upcoming events:');
      for (const event of context.upcomingEvents) {
        parts.push(
          `- ${event.title} at ${new Date(event.startTime).toLocaleString()}`,
        );
      }
    } else {
      parts.push('No upcoming events in the next 24 hours.');
    }

    if (context.availability) {
      parts.push(
        context.availability.isFree
          ? 'Currently available for meetings.'
          : 'Currently busy.',
      );
    }

    if (context.bookingLinks && context.bookingLinks.length > 0) {
      parts.push('Available booking links:');
      for (const link of context.bookingLinks) {
        parts.push(`- ${link.name}: ${link.url}`);
      }
    }

    return parts.join('\n');
  }

  // ==================== Private Methods ====================

  private async handleIntent(
    intent: CalendarIntent,
    context: ToolExecutionContext,
  ): Promise<Partial<ProcessMessageResult>> {
    let toolName: string;
    let toolArgs: Record<string, unknown> = {};

    // Map intent to tool
    switch (intent.type) {
      case 'schedule_meeting':
        toolName = CALENDAR_TOOL_NAMES.CREATE_EVENT;
        toolArgs = this.extractCreateEventArgs(intent);
        break;

      case 'check_availability':
        toolName = CALENDAR_TOOL_NAMES.CHECK_AVAILABILITY;
        toolArgs = this.extractAvailabilityArgs(intent);
        break;

      case 'reschedule':
        toolName = CALENDAR_TOOL_NAMES.RESCHEDULE_EVENT;
        toolArgs = this.extractRescheduleArgs(intent);
        break;

      case 'cancel':
        toolName = CALENDAR_TOOL_NAMES.CANCEL_EVENT;
        toolArgs = this.extractCancelArgs(intent);
        break;

      case 'get_schedule':
        toolName = CALENDAR_TOOL_NAMES.GET_UPCOMING_EVENTS;
        toolArgs = this.extractGetEventsArgs(intent);
        break;

      case 'suggest_times':
        toolName = CALENDAR_TOOL_NAMES.SUGGEST_TIMES;
        toolArgs = this.extractSuggestTimesArgs(intent);
        break;

      case 'share_booking_link':
        toolName = CALENDAR_TOOL_NAMES.GET_BOOKING_LINK;
        toolArgs = {};
        break;

      case 'confirm_booking':
        // This is a confirmation of a pending action
        return {
          pendingConfirmation: true,
          contextForAi:
            'The user seems to be confirming a previous suggestion. Check if there is a pending calendar action to confirm.',
        };

      default:
        return { suggestedResponse: undefined };
    }

    // Execute the tool
    const result = await this.toolExecutor.execute(toolName, toolArgs, context);

    if (result.requiresConfirmation) {
      return {
        toolResults: [result],
        suggestedResponse: result.confirmationPrompt,
        pendingConfirmation: true,
      };
    }

    return {
      toolResults: [result],
      suggestedResponse: result.message,
      contextForAi: result.success
        ? `Calendar operation successful: ${JSON.stringify(result.data)}`
        : `Calendar operation failed: ${result.error}`,
    };
  }

  private extractCreateEventArgs(
    intent: CalendarIntent,
  ): Record<string, unknown> {
    const args: Record<string, unknown> = {};

    if (intent.entities.title) {
      args.title = intent.entities.title;
    }

    if (intent.entities.dateTime?.parsed) {
      args.startTime = intent.entities.dateTime.parsed.toISOString();
    }

    if (intent.entities.duration?.minutes) {
      args.durationMinutes = intent.entities.duration.minutes;
    }

    if (intent.entities.location) {
      args.location = intent.entities.location;
    }

    if (intent.entities.eventType) {
      args.eventType = intent.entities.eventType;
    }

    if (intent.entities.people && intent.entities.people.length > 0) {
      args.attendees = intent.entities.people;
    }

    return args;
  }

  private extractAvailabilityArgs(
    intent: CalendarIntent,
  ): Record<string, unknown> {
    const args: Record<string, unknown> = {};

    if (intent.entities.dateTime?.parsed) {
      args.startDate = intent.entities.dateTime.parsed.toISOString();

      // If it's a range, set end date
      if (intent.entities.dateTime.endDate) {
        args.endDate = intent.entities.dateTime.endDate.toISOString();
      } else {
        // Default to same day
        const endDate = new Date(intent.entities.dateTime.parsed);
        endDate.setHours(23, 59, 59, 999);
        args.endDate = endDate.toISOString();
      }
    }

    return args;
  }

  private extractRescheduleArgs(
    intent: CalendarIntent,
  ): Record<string, unknown> {
    const args: Record<string, unknown> = {};

    if (intent.entities.title) {
      args.eventTitle = intent.entities.title;
    }

    if (intent.entities.dateTime?.parsed) {
      args.newStartTime = intent.entities.dateTime.parsed.toISOString();
    }

    return args;
  }

  private extractCancelArgs(intent: CalendarIntent): Record<string, unknown> {
    const args: Record<string, unknown> = {};

    if (intent.entities.title) {
      args.eventTitle = intent.entities.title;
    }

    return args;
  }

  private extractGetEventsArgs(
    intent: CalendarIntent,
  ): Record<string, unknown> {
    const args: Record<string, unknown> = {};

    if (intent.entities.dateTime?.parsed) {
      args.startDate = intent.entities.dateTime.parsed.toISOString();

      if (intent.entities.dateTime.endDate) {
        args.endDate = intent.entities.dateTime.endDate.toISOString();
      }
    }

    return args;
  }

  private extractSuggestTimesArgs(
    intent: CalendarIntent,
  ): Record<string, unknown> {
    const args: Record<string, unknown> = {};

    if (intent.entities.dateTime?.parsed) {
      args.startDate = intent.entities.dateTime.parsed.toISOString();
    }

    if (intent.entities.duration?.minutes) {
      args.durationMinutes = intent.entities.duration.minutes;
    }

    return args;
  }
}
