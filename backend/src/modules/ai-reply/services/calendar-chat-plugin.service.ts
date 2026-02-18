/**
 * Calendar Chat Plugin Service
 *
 * Integrates calendar functionality with the AI reply system.
 * This plugin enables the AI assistant to:
 * - Detect calendar-related intents in customer messages
 * - Execute calendar tool calls (check availability, create events, etc.)
 * - Include calendar context in AI prompts
 * - Handle booking link requests
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import OpenAI from 'openai';
import { db } from '../../../database/db.connection';
import { teamMembers } from '../../../database/schema';
import {
  CalendarAiIntegrationService,
  CalendarContext,
} from '../../calendar/ai/calendar-ai-integration.service';
import {
  CalendarAiToolsService,
  CalendarFunctionTool,
} from '../../calendar/ai/calendar-ai-tools.service';
import { CalendarIntentDetectorService } from '../../calendar/ai/calendar-intent-detector.service';
import {
  CalendarToolExecutorService,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../../calendar/ai/calendar-tool-executor.service';
import { CalendarService } from '../../calendar/services/calendar.service';
import { AIReplyContext, AIStylePreferences } from '../types';

export interface CalendarPluginConfig {
  /** Whether calendar plugin is enabled */
  enabled: boolean;
  /** Whether to automatically detect calendar intents */
  autoDetectIntents: boolean;
  /** Whether to include calendar context in AI prompts */
  includeContext: boolean;
  /** Whether to use OpenAI function calling for calendar tools */
  useFunctionCalling: boolean;
  /** Minimum confidence threshold for intent detection */
  minIntentConfidence: number;
}

export interface CalendarEnhancedContext {
  /** Base AI context */
  baseContext: AIReplyContext;
  /** Calendar-specific context */
  calendarContext?: CalendarContext;
  /** Whether calendar tools are available */
  calendarToolsAvailable: boolean;
  /** Pending calendar confirmation (if any) */
  pendingConfirmation?: {
    actionId: string;
    actionType: string;
    description: string;
  };
}

export interface ProcessWithCalendarResult {
  /** Whether calendar tools were used */
  calendarUsed: boolean;
  /** Tool execution results (if any) */
  toolResults?: ToolExecutionResult[];
  /** Additional context to add to AI prompt */
  additionalContext?: string;
  /** Suggested response text (if calendar handled the message) */
  suggestedResponse?: string;
  /** Whether to skip normal AI reply (calendar fully handled it) */
  skipAiReply?: boolean;
  /** Modified AI reply context */
  enhancedContext?: CalendarEnhancedContext;
}

/**
 * Simplified input for AI reply integration
 */
export interface CalendarPluginInput {
  /** The user's message */
  message: string;
  /** User ID */
  userId: number;
  /** Optional team ID (will be resolved if not provided) */
  teamId?: number;
  /** Chat ID for context */
  chatId?: string;
  /** Contact ID (if applicable) */
  contactId?: string;
}

@Injectable()
export class CalendarChatPluginService {
  private readonly logger = new Logger(CalendarChatPluginService.name);
  private readonly config: CalendarPluginConfig;
  private readonly openai: OpenAI | null = null;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly calendarService?: CalendarService,
    @Optional() private readonly toolsService?: CalendarAiToolsService,
    @Optional() private readonly intentDetector?: CalendarIntentDetectorService,
    @Optional() private readonly toolExecutor?: CalendarToolExecutorService,
    @Optional()
    private readonly integrationService?: CalendarAiIntegrationService,
  ) {
    this.config = {
      enabled: this.configService.get<boolean>(
        'CALENDAR_CHAT_PLUGIN_ENABLED',
        true,
      ),
      autoDetectIntents: this.configService.get<boolean>(
        'CALENDAR_AUTO_DETECT_INTENTS',
        true,
      ),
      includeContext: this.configService.get<boolean>(
        'CALENDAR_INCLUDE_CONTEXT',
        true,
      ),
      useFunctionCalling: this.configService.get<boolean>(
        'CALENDAR_USE_FUNCTION_CALLING',
        true,
      ),
      minIntentConfidence: this.configService.get<number>(
        'CALENDAR_MIN_INTENT_CONFIDENCE',
        0.5,
      ),
    };

    // Initialize OpenAI client for function calling
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  /**
   * Check if calendar plugin is available and enabled
   */
  isAvailable(): boolean {
    return (
      this.config.enabled &&
      !!this.calendarService &&
      !!this.toolsService &&
      !!this.toolExecutor
    );
  }

  /**
   * Get the user's primary team ID
   */
  private async getUserTeamId(userId: number): Promise<number | null> {
    try {
      const membership = await db.query.teamMembers.findFirst({
        where: eq(teamMembers.userId, userId),
        orderBy: (tm, { desc }) => [desc(tm.joinedAt)],
      });
      return membership?.teamId ?? null;
    } catch (error) {
      this.logger.warn(`Failed to get user team: ${error.message}`);
      return null;
    }
  }

  /**
   * Simplified method for AI reply integration
   *
   * Automatically resolves teamId and builds context
   */
  async processMessageForReply(
    input: CalendarPluginInput,
    aiContext?: AIReplyContext,
  ): Promise<ProcessWithCalendarResult> {
    if (!this.isAvailable()) {
      return { calendarUsed: false };
    }

    // Resolve teamId if not provided
    const teamId = input.teamId ?? (await this.getUserTeamId(input.userId));

    if (!teamId) {
      this.logger.debug(
        `No team found for user ${input.userId}, skipping calendar processing`,
      );
      return { calendarUsed: false };
    }

    const context: ToolExecutionContext = {
      userId: input.userId,
      teamId,
      chatId: input.chatId,
      contactId: input.contactId,
    };

    return this.processMessage(input.message, context, aiContext);
  }

  /**
   * Process a message through the calendar plugin before AI reply
   *
   * This is called before the main AI reply generation to:
   * 1. Detect calendar-related intents
   * 2. Execute any necessary calendar tools
   * 3. Add calendar context to the AI prompt
   */
  async processMessage(
    message: string,
    context: ToolExecutionContext,
    aiContext?: AIReplyContext,
  ): Promise<ProcessWithCalendarResult> {
    if (!this.isAvailable()) {
      return { calendarUsed: false };
    }

    // Use integration service if available
    if (this.integrationService) {
      const result = await this.integrationService.processMessage(
        message,
        context,
      );

      if (result.calendarToolsUsed) {
        return {
          calendarUsed: true,
          toolResults: result.toolResults,
          additionalContext: result.contextForAi,
          suggestedResponse: result.suggestedResponse,
          skipAiReply: result.pendingConfirmation
            ? false
            : !!result.suggestedResponse,
        };
      }
    }

    // Fallback: Use intent detector directly
    if (this.intentDetector && this.config.autoDetectIntents) {
      const intent = this.intentDetector.detectIntent(message);

      if (
        intent.type !== 'none' &&
        intent.confidence >= this.config.minIntentConfidence
      ) {
        this.logger.log(
          `Calendar intent detected: ${intent.type} (${intent.confidence})`,
        );

        // Process the intent
        const toolResult = await this.handleIntent(intent, context);

        if (toolResult) {
          return {
            calendarUsed: true,
            toolResults: [toolResult],
            additionalContext: this.buildContextFromToolResult(toolResult),
          };
        }
      }
    }

    // No calendar action needed, but add context if enabled
    if (this.config.includeContext && aiContext) {
      const calendarContext = await this.buildCalendarContext(context);

      return {
        calendarUsed: false,
        additionalContext: calendarContext
          ? this.formatCalendarContextForPrompt(calendarContext)
          : undefined,
        enhancedContext: {
          baseContext: aiContext,
          calendarContext,
          calendarToolsAvailable: true,
        },
      };
    }

    return { calendarUsed: false };
  }

  /**
   * Get calendar tools for OpenAI function calling
   */
  getCalendarTools(): CalendarFunctionTool[] {
    if (!this.toolsService) {
      return [];
    }
    return this.toolsService.getTools();
  }

  /**
   * Execute a calendar tool call from OpenAI
   */
  async executeToolCall(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    if (!this.toolExecutor) {
      return {
        success: false,
        error: 'Calendar tool executor not available',
      };
    }

    return this.toolExecutor.execute(toolName, args, context);
  }

  /**
   * Build calendar context for inclusion in AI prompt
   */
  async buildCalendarContext(
    context: ToolExecutionContext,
  ): Promise<CalendarContext | undefined> {
    if (!this.calendarService) {
      return undefined;
    }

    try {
      const calendarContext: CalendarContext = {};

      // Get upcoming events (next 48 hours)
      const now = new Date();
      const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      const events = await this.calendarService.getEvents(
        context.userId,
        context.teamId,
        {
          startDate: now.toISOString(),
          endDate: twoDaysFromNow.toISOString(),
          take: 5,
        },
      );

      if (events.length > 0) {
        calendarContext.upcomingEvents = events.map((e) => ({
          title: e.title,
          startTime: e.startTime.toISOString(),
          endTime: e.endTime.toISOString(),
        }));
      }

      // Get active booking links
      const bookingLinks = await this.calendarService.getBookingLinks(
        context.userId,
        context.teamId,
      );

      const activeLinks = bookingLinks.filter((l) => l.status === 'active');
      if (activeLinks.length > 0) {
        calendarContext.bookingLinks = activeLinks.slice(0, 3).map((l) => ({
          name: l.name,
          url: l.slug, // Will be full URL in production
        }));
      }

      return calendarContext;
    } catch (error) {
      this.logger.warn(`Failed to build calendar context: ${error.message}`);
      return undefined;
    }
  }

  /**
   * Handle a detected calendar intent
   */
  private async handleIntent(
    intent: {
      type: string;
      confidence: number;
      parameters?: Record<string, unknown>;
    },
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult | null> {
    if (!this.toolExecutor) {
      return null;
    }

    // Map intent types to tool names
    const intentToTool: Record<string, string> = {
      check_availability: 'calendar_check_availability',
      suggest_times: 'calendar_suggest_times',
      create_event: 'calendar_create_event',
      reschedule: 'calendar_reschedule_event',
      cancel_event: 'calendar_cancel_event',
      get_schedule: 'calendar_get_upcoming_events',
      find_event: 'calendar_find_event',
      booking_link: 'calendar_get_booking_link',
    };

    const toolName = intentToTool[intent.type];
    if (!toolName) {
      return null;
    }

    try {
      return await this.toolExecutor.execute(
        toolName,
        intent.parameters || {},
        context,
      );
    } catch (error) {
      this.logger.error(`Intent handling failed: ${error.message}`);
      return {
        success: false,
        error: `Failed to handle calendar intent: ${error.message}`,
      };
    }
  }

  /**
   * Build context string from tool execution result
   */
  private buildContextFromToolResult(result: ToolExecutionResult): string {
    if (!result.success) {
      return `[Calendar operation failed: ${result.error}]`;
    }

    if (result.requiresConfirmation) {
      return `[Calendar action pending confirmation: ${result.confirmationPrompt}]`;
    }

    if (result.data) {
      return `[Calendar data: ${JSON.stringify(result.data)}]`;
    }

    return result.message || '[Calendar operation completed]';
  }

  /**
   * Format calendar context for inclusion in AI prompt
   */
  private formatCalendarContextForPrompt(context: CalendarContext): string {
    const parts: string[] = ['## Calendar Context'];

    if (context.upcomingEvents && context.upcomingEvents.length > 0) {
      parts.push('\n### Upcoming Events:');
      for (const event of context.upcomingEvents) {
        const start = new Date(event.startTime).toLocaleString();
        const end = new Date(event.endTime).toLocaleString();
        parts.push(`- ${event.title}: ${start} to ${end}`);
      }
    }

    if (context.availability) {
      parts.push('\n### Current Availability:');
      if (context.availability.isFree) {
        parts.push('- Currently free');
      } else if (context.availability.busyUntil) {
        parts.push(
          `- Busy until: ${new Date(context.availability.busyUntil).toLocaleString()}`,
        );
      }
    }

    if (context.bookingLinks && context.bookingLinks.length > 0) {
      parts.push('\n### Available Booking Links:');
      for (const link of context.bookingLinks) {
        parts.push(`- ${link.name}: ${link.url}`);
      }
    }

    if (context.pendingBookings && context.pendingBookings > 0) {
      parts.push(`\n### Pending Bookings: ${context.pendingBookings}`);
    }

    return parts.join('\n');
  }

  /**
   * Generate a calendar-specific AI response using function calling
   */
  async generateCalendarAwareResponse(
    message: string,
    context: ToolExecutionContext,
    stylePreferences: AIStylePreferences,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<{
    response: string;
    toolsUsed: string[];
    toolResults: ToolExecutionResult[];
  }> {
    if (!this.openai || !this.toolsService) {
      throw new Error('OpenAI or calendar tools not available');
    }

    const tools = this.getCalendarTools();
    const toolsUsed: string[] = [];
    const toolResults: ToolExecutionResult[] = [];

    // Build system prompt with calendar capabilities
    const systemPrompt = this.buildCalendarSystemPrompt(stylePreferences);

    // Initial API call with tools
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: message },
    ];

    let response = await this.openai.chat.completions.create({
      model: this.configService.get<string>('AI_REPLY_MODEL', 'gpt-4o-mini'),
      messages,
      tools: tools as OpenAI.Chat.ChatCompletionTool[],
      tool_choice: 'auto',
      max_tokens: 500,
    });

    // Handle tool calls (loop up to 5 times for multi-step operations)
    let iterations = 0;
    const maxIterations = 5;

    while (
      response.choices[0]?.message?.tool_calls &&
      response.choices[0].message.tool_calls.length > 0 &&
      iterations < maxIterations
    ) {
      iterations++;
      const toolCalls = response.choices[0].message.tool_calls;

      // Add assistant message with tool calls
      messages.push(response.choices[0].message);

      // Execute each tool call
      for (const toolCall of toolCalls) {
        const funcCall = toolCall as unknown as {
          function: { name: string; arguments: string };
          id: string;
        };
        const toolName = funcCall.function.name;
        let args: Record<string, unknown>;

        try {
          args = JSON.parse(funcCall.function.arguments);
        } catch {
          args = {};
        }

        this.logger.log(`Executing calendar tool: ${toolName}`);
        toolsUsed.push(toolName);

        const result = await this.executeToolCall(toolName, args, context);
        toolResults.push(result);

        // Add tool result to messages
        messages.push({
          role: 'tool',
          tool_call_id: funcCall.id,
          content: JSON.stringify(result),
        });
      }

      // Continue conversation with tool results
      response = await this.openai.chat.completions.create({
        model: this.configService.get<string>('AI_REPLY_MODEL', 'gpt-4o-mini'),
        messages,
        tools: tools as OpenAI.Chat.ChatCompletionTool[],
        tool_choice: 'auto',
        max_tokens: 500,
      });
    }

    const finalResponse =
      response.choices[0]?.message?.content ||
      'I apologize, I was unable to process your calendar request.';

    return {
      response: finalResponse,
      toolsUsed,
      toolResults,
    };
  }

  /**
   * Build system prompt for calendar-aware AI
   */
  private buildCalendarSystemPrompt(
    stylePreferences: AIStylePreferences,
  ): string {
    return `You are a helpful WhatsApp assistant with calendar management capabilities.

## Your Calendar Capabilities
You can help users with:
- Checking availability for specific times
- Suggesting available meeting times
- Creating calendar events and appointments
- Rescheduling existing events
- Canceling events when requested
- Sharing booking links for appointment scheduling
- Finding events by title or date

## Style Guidelines
- Tone: ${stylePreferences.tone}
- Response length: ${stylePreferences.length}
- Use emojis: ${stylePreferences.useEmojis ? 'Yes, sparingly' : 'No'}
- Language: ${stylePreferences.language}
${stylePreferences.customInstructions ? `- Additional instructions: ${stylePreferences.customInstructions}` : ''}

## Important Rules
- Always confirm before creating, rescheduling, or canceling events
- When suggesting times, offer 2-3 options
- Include all relevant details (title, time, location) when discussing events
- Be concise and clear - this is WhatsApp messaging
- If you're unsure about a request, ask for clarification
- Never make up event information - only use data from the tools`;
  }
}
