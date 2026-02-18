import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  calendarAiActions,
  calendarAiSettings,
  calendarEvents,
  type CalendarAiAction,
  type CalendarAiSetting,
  type NewCalendarAiAction,
  type NewCalendarAiSetting,
} from '../../../database/calendar.schema';
import * as schema from '../../../database/schema';
import {
  AiCancelEventDto,
  AiFindAvailabilityDto,
  AiRescheduleEventDto,
  AiScheduleEventDto,
  UpdateCalendarAiSettingsDto,
} from '../dto';
import { AvailabilityService, TimeSlot } from './availability.service';
import { CalendarCrudService } from './calendar-crud.service';
import { EventsService } from './events.service';

export interface AiActionResult {
  success: boolean;
  action: CalendarAiAction;
  data?: Record<string, unknown>;
  message?: string;
}

@Injectable()
export class CalendarAiService {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private db: NodePgDatabase<typeof schema>,
    private calendarCrudService: CalendarCrudService,
    private eventsService: EventsService,
    private availabilityService: AvailabilityService,
  ) {}

  // ==================== Settings Management ====================

  /**
   * Get AI settings for a user
   */
  async getSettings(userId: number): Promise<CalendarAiSetting | null> {
    const [settings] = await this.db
      .select()
      .from(calendarAiSettings)
      .where(eq(calendarAiSettings.userId, userId));

    return settings || null;
  }

  /**
   * Get or create AI settings for a user
   */
  async getOrCreateSettings(userId: number): Promise<CalendarAiSetting> {
    const existing = await this.getSettings(userId);

    if (existing) {
      return existing;
    }

    // Create default settings
    const settingsData: NewCalendarAiSetting = {
      userId,
      aiEnabled: true,
      canCheckAvailability: true,
      canCreateEvents: true,
      canUpdateEvents: true,
      canCancelEvents: false, // Conservative default
      canSuggestTimes: true,
      canSendReminders: true,
      autonomyLevel: 'suggest',
      allowedCalendarIds: [],
      maxEventsPerDay: 5,
      minNoticeMintues: 60,
      blockedTimeRanges: [],
    };

    const [created] = await this.db
      .insert(calendarAiSettings)
      .values(settingsData)
      .returning();

    return created;
  }

  /**
   * Update AI settings for a user
   */
  async updateSettings(
    userId: number,
    dto: UpdateCalendarAiSettingsDto,
  ): Promise<CalendarAiSetting> {
    const existing = await this.getOrCreateSettings(userId);

    const [updated] = await this.db
      .update(calendarAiSettings)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(calendarAiSettings.userId, userId))
      .returning();

    return updated;
  }

  // ==================== AI Actions ====================

  /**
   * Check user availability for a time range
   */
  async checkAvailability(
    userId: number,
    teamId: number,
    dto: AiFindAvailabilityDto,
    chatId?: string,
  ): Promise<AiActionResult> {
    const startTime = Date.now();

    // Check if AI can perform this action
    const settings = await this.getOrCreateSettings(userId);
    if (!settings.canCheckAvailability) {
      return this.logAction({
        userId,
        chatId,
        actionType: 'check_availability',
        actionStatus: 'rejected',
        aiRequest: dto,
        rejectionReason: 'User has disabled AI availability checks',
        latencyMs: Date.now() - startTime,
      });
    }

    try {
      // Determine date range from either direct dates or parse timeRange
      let startDate: Date;
      let endDate: Date;

      if (dto.startDate && dto.endDate) {
        startDate = new Date(dto.startDate);
        endDate = new Date(dto.endDate);
      } else {
        // Default to next 7 days if no specific range provided
        startDate = new Date();
        endDate = new Date();
        endDate.setDate(endDate.getDate() + 7);
      }

      const durationMinutes = dto.durationMinutes || 30;

      // Get the user's default calendar
      const calendar =
        await this.calendarCrudService.getOrCreateDefaultCalendar(
          userId,
          teamId,
        );

      // Get existing events in the date range
      const existingEvents = await this.db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.calendarId, calendar.id),
            gte(calendarEvents.startTime, startDate),
            lte(calendarEvents.startTime, endDate),
            eq(calendarEvents.status, 'scheduled'),
          ),
        )
        .orderBy(calendarEvents.startTime);

      // TODO: Integrate with proper availability service
      // For now, return existing events as busy times

      return this.logAction({
        userId,
        chatId,
        actionType: 'check_availability',
        actionStatus: 'success',
        aiRequest: dto,
        aiResponse: {
          busyTimes: existingEvents.map((e) => ({
            start: e.startTime,
            end: e.endTime,
            title: e.title,
          })),
        },
        executedAction: { checked: true, eventsFound: existingEvents.length },
        latencyMs: Date.now() - startTime,
      });
    } catch (error) {
      return this.logAction({
        userId,
        chatId,
        actionType: 'check_availability',
        actionStatus: 'failed',
        aiRequest: dto,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - startTime,
      });
    }
  }

  /**
   * Suggest available time slots
   */
  async suggestTimes(
    userId: number,
    teamId: number,
    dto: AiFindAvailabilityDto,
    chatId?: string,
  ): Promise<AiActionResult> {
    const startTime = Date.now();

    const settings = await this.getOrCreateSettings(userId);
    if (!settings.canSuggestTimes) {
      return this.logAction({
        userId,
        chatId,
        actionType: 'suggest_times',
        actionStatus: 'rejected',
        aiRequest: dto,
        rejectionReason: 'User has disabled AI time suggestions',
        latencyMs: Date.now() - startTime,
      });
    }

    try {
      // Get availability for date range
      // This is a simplified implementation - in production would use full availability service
      const suggestedSlots: TimeSlot[] = [];

      // Determine date range from either direct dates or default to next 7 days
      let startDate: Date;
      let endDate: Date;

      if (dto.startDate && dto.endDate) {
        startDate = new Date(dto.startDate);
        endDate = new Date(dto.endDate);
      } else {
        startDate = new Date();
        endDate = new Date();
        endDate.setDate(endDate.getDate() + 7);
      }

      const durationMinutes = dto.durationMinutes || 30;

      // Generate slots for each day in range
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        // Default business hours: 9 AM - 5 PM
        const dayStart = new Date(currentDate);
        dayStart.setHours(9, 0, 0, 0);

        const dayEnd = new Date(currentDate);
        dayEnd.setHours(17, 0, 0, 0);

        // Generate 30-minute slots
        let slotStart = new Date(dayStart);
        while (
          slotStart.getTime() + durationMinutes * 60 * 1000 <=
          dayEnd.getTime()
        ) {
          const slotEnd = new Date(
            slotStart.getTime() + durationMinutes * 60 * 1000,
          );

          // Only include future slots
          if (slotStart > new Date()) {
            suggestedSlots.push({
              start: new Date(slotStart),
              end: new Date(slotEnd),
            });
          }

          slotStart = new Date(slotStart.getTime() + 30 * 60 * 1000); // Move to next slot
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Limit to first 10 suggestions
      const limitedSlots = suggestedSlots.slice(0, 10);

      return this.logAction({
        userId,
        chatId,
        actionType: 'suggest_times',
        actionStatus: 'success',
        aiRequest: dto,
        aiResponse: { suggestedSlots: limitedSlots },
        executedAction: { slotsGenerated: limitedSlots.length },
        latencyMs: Date.now() - startTime,
      });
    } catch (error) {
      return this.logAction({
        userId,
        chatId,
        actionType: 'suggest_times',
        actionStatus: 'failed',
        aiRequest: dto,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - startTime,
      });
    }
  }

  /**
   * Create an event via AI
   */
  async createEvent(
    userId: number,
    teamId: number,
    dto: AiScheduleEventDto,
    chatId?: string,
  ): Promise<AiActionResult> {
    const startTime = Date.now();

    const settings = await this.getOrCreateSettings(userId);
    if (!settings.canCreateEvents) {
      return this.logAction({
        userId,
        chatId,
        actionType: 'create_event',
        actionStatus: 'rejected',
        aiRequest: dto,
        rejectionReason: 'User has disabled AI event creation',
        latencyMs: Date.now() - startTime,
      });
    }

    // Check autonomy level
    if (settings.autonomyLevel === 'suggest') {
      // Just log the intent, don't execute
      return this.logAction({
        userId,
        chatId,
        actionType: 'create_event',
        actionStatus: 'pending_confirmation',
        aiRequest: dto,
        aiResponse: { suggestion: 'Event creation requires user confirmation' },
        requiredConfirmation: true,
        latencyMs: Date.now() - startTime,
      });
    }

    try {
      // Resolve start and end times
      let resolvedStartTime: Date;
      let resolvedEndTime: Date;

      if (dto.startTime && dto.endTime) {
        resolvedStartTime = new Date(dto.startTime);
        resolvedEndTime = new Date(dto.endTime);
      } else if (dto.startTime && dto.durationMinutes) {
        resolvedStartTime = new Date(dto.startTime);
        resolvedEndTime = new Date(
          resolvedStartTime.getTime() + dto.durationMinutes * 60 * 1000,
        );
      } else {
        // Default to 1 hour from now if no time specified
        resolvedStartTime = new Date(Date.now() + 60 * 60 * 1000);
        resolvedEndTime = new Date(
          resolvedStartTime.getTime() + (dto.durationMinutes || 60) * 60 * 1000,
        );
      }

      // Get or create default calendar
      const calendar =
        await this.calendarCrudService.getOrCreateDefaultCalendar(
          userId,
          teamId,
        );

      // Check max events per day
      const eventDate = new Date(resolvedStartTime);
      const dayStart = new Date(eventDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(eventDate);
      dayEnd.setHours(23, 59, 59, 999);

      const todayEvents = await this.db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.calendarId, calendar.id),
            gte(calendarEvents.startTime, dayStart),
            lte(calendarEvents.startTime, dayEnd),
            eq(calendarEvents.status, 'scheduled'),
          ),
        );

      if (
        settings.maxEventsPerDay &&
        todayEvents.length >= settings.maxEventsPerDay
      ) {
        return this.logAction({
          userId,
          chatId,
          actionType: 'create_event',
          actionStatus: 'rejected',
          aiRequest: dto,
          rejectionReason: `Max events per day (${settings.maxEventsPerDay}) reached`,
          latencyMs: Date.now() - startTime,
        });
      }

      // Check minimum notice
      const minNoticeTime = new Date(
        Date.now() + (settings.minNoticeMintues || 0) * 60 * 1000,
      );
      if (resolvedStartTime < minNoticeTime) {
        return this.logAction({
          userId,
          chatId,
          actionType: 'create_event',
          actionStatus: 'rejected',
          aiRequest: dto,
          rejectionReason: 'Event does not meet minimum notice requirement',
          latencyMs: Date.now() - startTime,
        });
      }

      // Create the event
      const createdEvent = await this.eventsService.create(
        calendar.id,
        userId,
        {
          title: dto.title,
          description: dto.description,
          startTime: resolvedStartTime.toISOString(),
          endTime: resolvedEndTime.toISOString(),
          location: dto.location,
          attendeeEmails: dto.attendees,
          eventType: dto.eventType,
        },
      );

      return this.logAction({
        userId,
        chatId,
        actionType: 'create_event',
        actionStatus: 'success',
        eventId: createdEvent.id,
        aiRequest: dto,
        aiResponse: { event: createdEvent },
        executedAction: { eventId: createdEvent.id, created: true },
        latencyMs: Date.now() - startTime,
      });
    } catch (error) {
      return this.logAction({
        userId,
        chatId,
        actionType: 'create_event',
        actionStatus: 'failed',
        aiRequest: dto,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - startTime,
      });
    }
  }

  /**
   * Reschedule an event via AI
   */
  async rescheduleEvent(
    userId: number,
    dto: AiRescheduleEventDto,
    chatId?: string,
  ): Promise<AiActionResult> {
    const startTime = Date.now();

    const settings = await this.getOrCreateSettings(userId);
    if (!settings.canUpdateEvents) {
      return this.logAction({
        userId,
        chatId,
        actionType: 'reschedule_event',
        actionStatus: 'rejected',
        aiRequest: dto,
        rejectionReason: 'User has disabled AI event updates',
        latencyMs: Date.now() - startTime,
      });
    }

    if (settings.autonomyLevel !== 'autonomous') {
      return this.logAction({
        userId,
        chatId,
        actionType: 'reschedule_event',
        actionStatus: 'pending_confirmation',
        aiRequest: dto,
        aiResponse: {
          suggestion: 'Event rescheduling requires user confirmation',
        },
        requiredConfirmation: true,
        latencyMs: Date.now() - startTime,
      });
    }

    try {
      const updatedEvent = await this.eventsService.update(
        dto.eventId,
        userId,
        {
          startTime: dto.newStartTime,
          endTime: dto.newEndTime,
        },
      );

      return this.logAction({
        userId,
        chatId,
        actionType: 'reschedule_event',
        actionStatus: 'success',
        eventId: dto.eventId,
        aiRequest: dto,
        aiResponse: { event: updatedEvent },
        executedAction: { eventId: dto.eventId, rescheduled: true },
        latencyMs: Date.now() - startTime,
      });
    } catch (error) {
      return this.logAction({
        userId,
        chatId,
        actionType: 'reschedule_event',
        actionStatus: 'failed',
        aiRequest: dto,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - startTime,
      });
    }
  }

  /**
   * Cancel an event via AI
   */
  async cancelEvent(
    userId: number,
    dto: AiCancelEventDto,
    chatId?: string,
  ): Promise<AiActionResult> {
    const startTime = Date.now();

    const settings = await this.getOrCreateSettings(userId);
    if (!settings.canCancelEvents) {
      return this.logAction({
        userId,
        chatId,
        actionType: 'cancel_event',
        actionStatus: 'rejected',
        aiRequest: dto,
        rejectionReason: 'User has disabled AI event cancellation',
        latencyMs: Date.now() - startTime,
      });
    }

    // Cancel always requires confirmation unless autonomous
    if (settings.autonomyLevel !== 'autonomous') {
      return this.logAction({
        userId,
        chatId,
        actionType: 'cancel_event',
        actionStatus: 'pending_confirmation',
        aiRequest: dto,
        aiResponse: {
          suggestion: 'Event cancellation requires user confirmation',
        },
        requiredConfirmation: true,
        latencyMs: Date.now() - startTime,
      });
    }

    try {
      await this.eventsService.delete(dto.eventId, userId, dto.reason);

      return this.logAction({
        userId,
        chatId,
        actionType: 'cancel_event',
        actionStatus: 'success',
        eventId: dto.eventId,
        aiRequest: dto,
        executedAction: {
          eventId: dto.eventId,
          cancelled: true,
          reason: dto.reason,
        },
        latencyMs: Date.now() - startTime,
      });
    } catch (error) {
      return this.logAction({
        userId,
        chatId,
        actionType: 'cancel_event',
        actionStatus: 'failed',
        aiRequest: dto,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - startTime,
      });
    }
  }

  // ==================== Action Management ====================

  /**
   * Log an AI action
   */
  private async logAction(
    data: Partial<NewCalendarAiAction> & {
      userId: number;
      actionType: string;
      actionStatus: string;
    },
  ): Promise<AiActionResult> {
    const actionData: NewCalendarAiAction = {
      userId: data.userId,
      chatId: data.chatId,
      actionType: data.actionType,
      actionStatus: data.actionStatus,
      eventId: data.eventId,
      bookingId: data.bookingId,
      aiRequest: data.aiRequest,
      aiResponse: data.aiResponse,
      executedAction: data.executedAction,
      requiredConfirmation: data.requiredConfirmation ?? false,
      confirmedAt: data.confirmedAt,
      confirmedBy: data.confirmedBy,
      rejectedAt: data.rejectedAt,
      rejectionReason: data.rejectionReason,
      errorMessage: data.errorMessage,
      latencyMs: data.latencyMs,
    };

    const [action] = await this.db
      .insert(calendarAiActions)
      .values(actionData)
      .returning();

    return {
      success: data.actionStatus === 'success',
      action,
      data: data.aiResponse as Record<string, unknown>,
      message: data.errorMessage || data.rejectionReason || undefined,
    };
  }

  /**
   * Confirm a pending AI action
   */
  async confirmAction(
    actionId: string,
    userId: number,
  ): Promise<CalendarAiAction> {
    const [action] = await this.db
      .select()
      .from(calendarAiActions)
      .where(eq(calendarAiActions.id, actionId));

    if (!action) {
      throw new NotFoundException('Action not found');
    }

    if (action.userId !== userId) {
      throw new ForbiddenException('You cannot confirm this action');
    }

    if (action.actionStatus !== 'pending_confirmation') {
      throw new ForbiddenException('Action is not pending confirmation');
    }

    // Execute the original action
    // This would need to re-execute based on actionType and aiRequest
    // For now, just mark as confirmed

    const [updated] = await this.db
      .update(calendarAiActions)
      .set({
        actionStatus: 'success',
        confirmedAt: new Date(),
        confirmedBy: userId,
      })
      .where(eq(calendarAiActions.id, actionId))
      .returning();

    return updated;
  }

  /**
   * Reject a pending AI action
   */
  async rejectAction(
    actionId: string,
    userId: number,
    reason?: string,
  ): Promise<CalendarAiAction> {
    const [action] = await this.db
      .select()
      .from(calendarAiActions)
      .where(eq(calendarAiActions.id, actionId));

    if (!action) {
      throw new NotFoundException('Action not found');
    }

    if (action.userId !== userId) {
      throw new ForbiddenException('You cannot reject this action');
    }

    const [updated] = await this.db
      .update(calendarAiActions)
      .set({
        actionStatus: 'rejected',
        rejectedAt: new Date(),
        rejectionReason: reason,
      })
      .where(eq(calendarAiActions.id, actionId))
      .returning();

    return updated;
  }

  /**
   * Get AI action history for a user
   */
  async getActionHistory(
    userId: number,
    limit = 50,
    chatId?: string,
  ): Promise<CalendarAiAction[]> {
    const conditions = [eq(calendarAiActions.userId, userId)];

    if (chatId) {
      conditions.push(eq(calendarAiActions.chatId, chatId));
    }

    return this.db
      .select()
      .from(calendarAiActions)
      .where(and(...conditions))
      .orderBy(desc(calendarAiActions.createdAt))
      .limit(limit);
  }

  /**
   * Get pending confirmations for a user
   */
  async getPendingConfirmations(userId: number): Promise<CalendarAiAction[]> {
    return this.db
      .select()
      .from(calendarAiActions)
      .where(
        and(
          eq(calendarAiActions.userId, userId),
          eq(calendarAiActions.actionStatus, 'pending_confirmation'),
        ),
      )
      .orderBy(desc(calendarAiActions.createdAt));
  }
}
