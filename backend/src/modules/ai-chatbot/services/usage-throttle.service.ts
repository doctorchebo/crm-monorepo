/**
 * Usage Throttle Service
 * Orchestrates usage limits, AI pausing, and user notifications
 *
 * Features:
 * - Check limits before AI operations
 * - Pause AI when limits exceeded
 * - Notify users via WebSocket/dashboard
 * - Resume AI when limits reset or increased
 */

import { db } from '@database/db.connection';
import {
  chatStageAssignments,
  handoffNotifications,
  usageLimits,
} from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, eq } from 'drizzle-orm';
import { HandoffService } from './handoff.service';
import { UsageStatus, UsageTrackingService } from './usage-tracking.service';

// ============================================================================
// Types
// ============================================================================

export interface ThrottleCheckResult {
  allowed: boolean;
  reason?: string;
  actionRequired?: 'pause' | 'notify' | 'block';
  exceededLimits?: Array<{
    type: string;
    period: string;
    current: number;
    limit: number;
    percentUsed: number;
  }>;
  warnings?: string[];
}

export interface ThrottleNotification {
  userId: number;
  type: 'limit_warning' | 'limit_exceeded' | 'ai_paused' | 'ai_resumed';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  metadata?: Record<string, unknown>;
}

@Injectable()
export class UsageThrottleService {
  private readonly logger = new Logger(UsageThrottleService.name);

  constructor(
    private readonly usageTracking: UsageTrackingService,
    private readonly handoffService: HandoffService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Check if AI operation is allowed based on usage limits
   */
  async checkBeforeAiOperation(userId: number): Promise<ThrottleCheckResult> {
    const statuses = await this.usageTracking.getUsageStatus(userId);
    const warnings: string[] = [];
    const exceededLimits: ThrottleCheckResult['exceededLimits'] = [];
    let actionRequired: 'pause' | 'notify' | 'block' | undefined;

    // Check each limit
    for (const status of statuses) {
      if (status.isAtLimit) {
        exceededLimits.push({
          type: status.limitType,
          period: status.limitPeriod,
          current: status.currentUsage,
          limit: status.limit,
          percentUsed: status.percentUsed,
        });

        // Get the action for this limit
        const [limit] = await db
          .select()
          .from(usageLimits)
          .where(
            and(
              eq(usageLimits.userId, userId),
              eq(usageLimits.limitType, status.limitType),
              eq(usageLimits.limitPeriod, status.limitPeriod),
            ),
          )
          .limit(1);

        if (limit) {
          const limitAction = limit.actionOnLimit as
            | 'pause'
            | 'notify'
            | 'block';
          // Use most severe action
          if (
            limitAction === 'block' ||
            (limitAction === 'pause' && actionRequired !== 'block')
          ) {
            actionRequired = limitAction;
          } else if (!actionRequired) {
            actionRequired = limitAction;
          }
        }
      } else if (status.isNearLimit) {
        warnings.push(
          `${status.limitType} usage at ${status.percentUsed}% of ${status.limitPeriod} limit`,
        );
      }
    }

    if (exceededLimits.length > 0) {
      return {
        allowed: actionRequired !== 'block',
        reason: `Usage limit exceeded: ${exceededLimits.map((l) => `${l.type} (${l.period})`).join(', ')}`,
        actionRequired,
        exceededLimits,
        warnings,
      };
    }

    return {
      allowed: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Handle limit exceeded - pause AI and notify user
   */
  async handleLimitExceeded(
    userId: number,
    chatId: string,
    exceededLimits: ThrottleCheckResult['exceededLimits'],
  ): Promise<void> {
    // Pause AI for this chat
    await this.handoffService.pauseAI(chatId, userId);

    // Create notification
    const limitDescriptions = exceededLimits
      ?.map((l) => `${l.type}: ${l.current}/${l.limit} (${l.period})`)
      .join('\n');

    await db.insert(handoffNotifications).values({
      userId,
      chatId,
      notificationType: 'limit_exceeded',
      priority: 'high',
      title: 'AI Usage Limit Exceeded',
      message: `AI has been paused because you've exceeded your usage limits:\n${limitDescriptions}`,
      aiReason: 'Usage limit exceeded',
      suggestedAction:
        'Increase your usage limits or wait for the next billing period',
      status: 'pending',
      deliveredVia: 'websocket',
      deliveredAt: new Date(),
    });

    // Emit event for WebSocket delivery
    this.emitThrottleNotification({
      userId,
      type: 'limit_exceeded',
      title: 'AI Usage Limit Exceeded',
      message: `AI has been paused. ${limitDescriptions}`,
      severity: 'critical',
      metadata: { chatId, exceededLimits },
    });

    this.logger.warn(`AI paused for user ${userId} - usage limit exceeded`);
  }

  /**
   * Handle limit warning - notify user
   */
  async handleLimitWarning(userId: number, status: UsageStatus): Promise<void> {
    // Create warning notification
    await db.insert(handoffNotifications).values({
      userId,
      chatId: '',
      notificationType: 'limit_exceeded',
      priority: 'medium',
      title: 'Approaching Usage Limit',
      message: `You've used ${status.percentUsed}% of your ${status.limitPeriod} ${status.limitType} limit (${status.currentUsage}/${status.limit})`,
      status: 'pending',
      deliveredVia: 'websocket',
      deliveredAt: new Date(),
    });

    // Emit event
    this.emitThrottleNotification({
      userId,
      type: 'limit_warning',
      title: 'Approaching Usage Limit',
      message: `${status.percentUsed}% of ${status.limitPeriod} ${status.limitType} limit used`,
      severity: 'warning',
      metadata: { status },
    });
  }

  /**
   * Pause AI for a specific chat (manual)
   */
  async pauseAiForChat(
    chatId: string,
    userId: number,
    reason: string,
  ): Promise<void> {
    await this.handoffService.pauseAI(chatId, userId);

    // Create notification record
    await db.insert(handoffNotifications).values({
      userId,
      chatId,
      notificationType: 'ai_paused',
      priority: 'low',
      title: 'AI Paused',
      message: reason || 'AI has been manually paused for this chat',
      status: 'acknowledged',
      acknowledgedAt: new Date(),
      deliveredVia: 'websocket',
      deliveredAt: new Date(),
    });

    this.emitThrottleNotification({
      userId,
      type: 'ai_paused',
      title: 'AI Paused',
      message: reason || 'AI has been manually paused',
      severity: 'info',
      metadata: { chatId },
    });
  }

  /**
   * Resume AI for a specific chat
   */
  async resumeAiForChat(chatId: string, userId: number): Promise<void> {
    // First check if limits allow resuming
    const check = await this.checkBeforeAiOperation(userId);

    if (!check.allowed) {
      throw new Error(`Cannot resume AI: ${check.reason}`);
    }

    await this.handoffService.resumeAI(chatId, userId);

    this.emitThrottleNotification({
      userId,
      type: 'ai_resumed',
      title: 'AI Resumed',
      message: 'AI is now active for this chat',
      severity: 'info',
      metadata: { chatId },
    });
  }

  /**
   * Pause AI for all user's chats
   */
  async pauseAllAi(userId: number, reason: string): Promise<number> {
    // Get all active chat assignments for this user (gracefully handle missing table)
    let pausedCount = 0;

    try {
      const assignments = await db
        .select()
        .from(chatStageAssignments)
        .where(eq(chatStageAssignments.aiPaused, false));

      for (const assignment of assignments) {
        try {
          await this.handoffService.pauseAI(assignment.chatId, userId);
          pausedCount++;
        } catch (error) {
          this.logger.error(
            `Failed to pause AI for chat ${assignment.chatId}: ${error.message}`,
          );
        }
      }
    } catch (error) {
      this.logger.debug(`Could not query stage assignments: ${error}`);
    }

    if (pausedCount > 0) {
      this.emitThrottleNotification({
        userId,
        type: 'ai_paused',
        title: 'AI Paused for All Chats',
        message: reason || `AI has been paused for ${pausedCount} chats`,
        severity: 'warning',
        metadata: { pausedCount },
      });
    }

    return pausedCount;
  }

  /**
   * Get throttle status for dashboard display
   */
  async getDashboardStatus(userId: number): Promise<{
    isThrottled: boolean;
    aiPausedChats: number;
    usageStatuses: UsageStatus[];
    warnings: string[];
    recommendations: string[];
  }> {
    const usageStatuses = await this.usageTracking.getUsageStatus(userId);
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Check for limits
    const limitCheck = await this.usageTracking.isLimitExceeded(userId);
    const isThrottled = limitCheck.exceeded;

    // Count AI paused chats (gracefully handle missing table)
    let aiPausedChats = 0;
    try {
      const pausedAssignments = await db
        .select()
        .from(chatStageAssignments)
        .where(eq(chatStageAssignments.aiPaused, true));
      aiPausedChats = pausedAssignments.length;
    } catch (error) {
      this.logger.debug(`Could not query paused chats: ${error}`);
    }

    // Generate warnings and recommendations
    for (const status of usageStatuses) {
      if (status.isAtLimit) {
        warnings.push(
          `${status.limitType} limit exceeded (${status.limitPeriod})`,
        );
        recommendations.push(
          `Consider increasing your ${status.limitType} limit or upgrading your plan`,
        );
      } else if (status.isNearLimit) {
        warnings.push(
          `${status.limitType} usage at ${status.percentUsed}% of limit`,
        );
        recommendations.push(
          `You have ${status.remaining} ${status.limitType} remaining this ${status.limitPeriod}`,
        );
      }
    }

    if (aiPausedChats > 0) {
      warnings.push(`AI is paused for ${aiPausedChats} chat(s)`);
      recommendations.push('Review paused chats and resume AI when ready');
    }

    return {
      isThrottled,
      aiPausedChats,
      usageStatuses,
      warnings,
      recommendations,
    };
  }

  /**
   * Get pending handoff notifications
   */
  async getPendingNotifications(
    userId: number,
  ): Promise<Array<typeof handoffNotifications.$inferSelect>> {
    return db
      .select()
      .from(handoffNotifications)
      .where(
        and(
          eq(handoffNotifications.userId, userId),
          eq(handoffNotifications.status, 'pending'),
        ),
      );
  }

  /**
   * Acknowledge a notification
   */
  async acknowledgeNotification(
    notificationId: string,
    userId: number,
  ): Promise<boolean> {
    const result = await db
      .update(handoffNotifications)
      .set({
        status: 'acknowledged',
        acknowledgedAt: new Date(),
      })
      .where(
        and(
          eq(handoffNotifications.id, notificationId),
          eq(handoffNotifications.userId, userId),
        ),
      )
      .returning({ id: handoffNotifications.id });

    return result.length > 0;
  }

  /**
   * Resolve a notification
   */
  async resolveNotification(
    notificationId: string,
    userId: number,
    resolution: string,
  ): Promise<boolean> {
    const result = await db
      .update(handoffNotifications)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: userId,
        resolution,
      })
      .where(
        and(
          eq(handoffNotifications.id, notificationId),
          eq(handoffNotifications.userId, userId),
        ),
      )
      .returning({ id: handoffNotifications.id });

    return result.length > 0;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private emitThrottleNotification(notification: ThrottleNotification): void {
    this.eventEmitter.emit('throttle.notification', notification);
  }
}
