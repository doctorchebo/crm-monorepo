/**
 * Rate Limiter Service
 * Enforces rate limits to prevent Meta policy violations and account bans
 *
 * Features:
 * - Per-chat message limits
 * - Per-time-interval limits (minute, hour, day)
 * - 24-hour customer session window tracking
 * - AI message specific limits
 * - Automatic blocking when limits exceeded
 */

import { db } from '@database/db.connection';
import {
  aiConfigurations,
  chatAiOverrides,
  rateLimitTracking,
} from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

// ============================================================================
// Types
// ============================================================================

export type WindowType = 'minute' | 'hour' | 'day' | '24h_session';

export interface RateLimitConfig {
  // Per-minute limits
  messagesPerMinute: number;
  aiMessagesPerMinute: number;
  // Per-hour limits
  messagesPerHour: number;
  aiMessagesPerHour: number;
  // Per-day limits
  messagesPerDay: number;
  aiMessagesPerDay: number;
  // Per-chat limits
  aiMessagesPerChatPerHour: number;
  // Session window
  sessionWindowHours: number; // Meta's 24-hour window
  // Warning thresholds (percentage of limit)
  warningThreshold: number; // e.g., 0.8 = 80%
}

export interface RateLimitCheckResult {
  allowed: boolean;
  reason?: string;
  remainingMessages: number;
  resetTime?: Date;
  warningLevel?: 'none' | 'approaching' | 'exceeded';
  limits: {
    type: WindowType;
    current: number;
    max: number;
    percentUsed: number;
  }[];
}

export interface RateLimitStatus {
  chatId?: string;
  senderId?: number;
  windowType: WindowType;
  messageCount: number;
  aiMessageCount: number;
  limit: number;
  percentUsed: number;
  isBlocked: boolean;
  windowStart: Date;
  windowEnd: Date;
  lastCustomerMessage?: Date;
  sessionExpired: boolean;
}

// Default rate limits (conservative to avoid bans)
export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  messagesPerMinute: 30,
  aiMessagesPerMinute: 10,
  messagesPerHour: 200,
  aiMessagesPerHour: 50,
  messagesPerDay: 1000,
  aiMessagesPerDay: 200,
  aiMessagesPerChatPerHour: 10,
  sessionWindowHours: 24,
  warningThreshold: 0.8,
};

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private config: RateLimitConfig = DEFAULT_RATE_LIMITS;

  /**
   * Update rate limit configuration
   */
  setConfig(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.log('Rate limit config updated');
  }

  /**
   * Check if a message can be sent (main entry point)
   */
  async checkRateLimit(
    userId: number,
    chatId: string,
    options?: {
      isAiMessage?: boolean;
      senderId?: number;
    },
  ): Promise<RateLimitCheckResult> {
    const { isAiMessage = false, senderId } = options || {};
    const now = new Date();
    const limits: RateLimitCheckResult['limits'] = [];

    // Check all applicable windows
    const windows: WindowType[] = ['minute', 'hour', 'day'];
    if (isAiMessage) {
      windows.push('24h_session');
    }

    let allowed = true;
    let reason: string | undefined;
    let warningLevel: 'none' | 'approaching' | 'exceeded' = 'none';
    let earliestReset: Date | undefined;
    let minRemaining = Infinity;

    // Fetch Rate Limit Overrides
    const limitConfig = await this.getRateLimitConfig(userId, chatId);

    for (const windowType of windows) {
      const status = await this.getWindowStatus(
        userId,
        chatId,
        windowType,
        senderId,
      );
      const limit = this.getLimitForWindow(
        windowType,
        isAiMessage,
        limitConfig,
      );
      const count = isAiMessage ? status.aiMessageCount : status.messageCount;
      const percentUsed = (count / limit) * 100;

      limits.push({
        type: windowType,
        current: count,
        max: limit,
        percentUsed,
      });

      // Check if blocked
      if (status.isBlocked) {
        allowed = false;
        reason = `Rate limit exceeded for ${windowType} window: ${status.blockReason || 'Limit exceeded'}`;
        warningLevel = 'exceeded';
      }

      // Check session window for AI messages
      if (
        windowType === '24h_session' &&
        isAiMessage &&
        status.sessionExpired
      ) {
        allowed = false;
        reason =
          '24-hour customer session window expired. Use approved template to re-engage.';
        warningLevel = 'exceeded';
      }

      // Check if at limit
      if (count >= limit) {
        // Log the specific limit hit
        this.logger.warn(
          `Rate limit hit for ${windowType}: ${count} >= ${limit} (Config: ${JSON.stringify(limitConfig)})`,
        );
        allowed = false;
        reason =
          reason || `${windowType} rate limit exceeded (${count}/${limit})`;
        warningLevel = 'exceeded';
      }

      // Check warning threshold
      if (
        percentUsed >= this.config.warningThreshold * 100 &&
        warningLevel === 'none'
      ) {
        warningLevel = 'approaching';
      }

      // Track remaining and reset time
      const remaining = Math.max(0, limit - count);
      if (remaining < minRemaining) {
        minRemaining = remaining;
        earliestReset = status.windowEnd;
      }
    }

    return {
      allowed,
      reason,
      remainingMessages: minRemaining === Infinity ? 0 : minRemaining,
      resetTime: earliestReset,
      warningLevel,
      limits,
    };
  }

  /**
   * Get effective rate limit configuration for a chat
   * Checks Chat Override -> User Config -> Defaults
   */
  private async getRateLimitConfig(
    userId: number,
    chatId: string,
  ): Promise<RateLimitConfig> {
    // Start with defaults
    let effectiveConfig = { ...this.config };

    try {
      // 1. Check Chat Override
      const chatOverride = await db.query.chatAiOverrides.findFirst({
        where: eq(chatAiOverrides.chatId, chatId),
      });

      if (chatOverride?.maxMessagesPerHour) {
        effectiveConfig.aiMessagesPerHour = chatOverride.maxMessagesPerHour;
        // Inherit per-day roughly (or keep default) if not specified
        // Assume simplistic override for now
      }

      // 2. Check User Configuration (if no chat override or partial)
      // (Assuming user config is secondary to chat override)
      if (!chatOverride?.maxMessagesPerHour) {
        const userConfig = await db.query.aiConfigurations.findFirst({
          where: eq(aiConfigurations.userId, userId),
        });
        if (userConfig?.maxMessagesPerHour) {
          effectiveConfig.aiMessagesPerHour = userConfig.maxMessagesPerHour;
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to fetch rate limit overrides: ${err.message}`);
    }

    return effectiveConfig;
  }

  /**
   * Record a message being sent (increment counters)
   */
  async recordMessage(
    userId: number,
    chatId: string,
    options?: {
      isAiMessage?: boolean;
      isTemplateMessage?: boolean;
      senderId?: number;
    },
  ): Promise<void> {
    const {
      isAiMessage = false,
      isTemplateMessage = false,
      senderId,
    } = options || {};
    const now = new Date();

    // Update all relevant windows
    const windows: WindowType[] = ['minute', 'hour', 'day'];
    if (isAiMessage) {
      windows.push('24h_session');
    }

    this.logger.debug(
      `[RateLimit] Recording message START: userId=${userId}, chatId=${chatId}, ai=${isAiMessage}, template=${isTemplateMessage}, sender=${senderId}`,
    );

    try {
      for (const windowType of windows) {
        await this.incrementWindowCounter(
          userId,
          chatId,
          windowType,
          { isAiMessage, isTemplateMessage },
          senderId,
        );
      }
      this.logger.debug(`[RateLimit] Recorded message SUCCESS`);
    } catch (err) {
      this.logger.error(
        `[RateLimit] Failed to record message: ${err.message}`,
        err,
      );
    }
  }

  /**
   * Record an inbound customer message (updates 24h session window)
   */
  async recordCustomerMessage(
    userId: number,
    chatId: string,
    senderId?: number,
  ): Promise<void> {
    const now = new Date();
    const windowType: WindowType = '24h_session';
    const { start, end } = this.getWindowBounds(windowType, now);

    // Upsert the session window with new customer message time
    await db
      .insert(rateLimitTracking)
      .values({
        userId,
        chatId,
        senderId,
        windowType,
        windowStart: start,
        windowEnd: end,
        messageCount: 1,
        lastCustomerMessageAt: now,
      })
      .onConflictDoUpdate({
        target: [
          rateLimitTracking.userId,
          rateLimitTracking.chatId,
          rateLimitTracking.senderId,
          rateLimitTracking.windowType,
          rateLimitTracking.windowStart,
        ],
        set: {
          lastCustomerMessageAt: now,
          messageCount: sql`${rateLimitTracking.messageCount} + 1`,
          updatedAt: now,
        },
      });

    this.logger.debug(
      `Customer message recorded for chat ${chatId}, session window reset`,
    );
  }

  /**
   * Check if 24h session window is still valid
   */
  async isSessionWindowValid(
    userId: number,
    chatId: string,
    senderId?: number,
  ): Promise<{
    valid: boolean;
    lastCustomerMessage?: Date;
    hoursRemaining?: number;
    requiresTemplate: boolean;
  }> {
    const now = new Date();

    // Get the most recent session tracking
    const [session] = await db
      .select()
      .from(rateLimitTracking)
      .where(
        and(
          eq(rateLimitTracking.userId, userId),
          eq(rateLimitTracking.chatId, chatId),
          eq(rateLimitTracking.windowType, '24h_session'),
        ),
      )
      .orderBy(desc(rateLimitTracking.windowStart))
      .limit(1);

    if (!session?.lastCustomerMessageAt) {
      return {
        valid: false,
        requiresTemplate: true,
      };
    }

    const hoursSinceCustomer =
      (now.getTime() - session.lastCustomerMessageAt.getTime()) /
      (1000 * 60 * 60);
    const valid = hoursSinceCustomer < this.config.sessionWindowHours;

    return {
      valid,
      lastCustomerMessage: session.lastCustomerMessageAt,
      hoursRemaining: valid
        ? this.config.sessionWindowHours - hoursSinceCustomer
        : 0,
      requiresTemplate: !valid,
    };
  }

  /**
   * Get current rate limit status for a chat
   */
  async getRateLimitStatus(
    userId: number,
    chatId: string,
    senderId?: number,
  ): Promise<RateLimitStatus[]> {
    const statuses: RateLimitStatus[] = [];
    const windows: WindowType[] = ['minute', 'hour', 'day', '24h_session'];

    for (const windowType of windows) {
      const status = await this.getWindowStatus(
        userId,
        chatId,
        windowType,
        senderId,
      );
      // Pass overrides here too? For 'status' we might want the *actual* limit
      // But getRateLimitStatus doesn't natively check overrides currently.
      // To be robust, let's fetch config first.
      // Optimization: Fetch config once outside loop (TODO - for now, just default limits or update method signature)
      const limit = this.getLimitForWindow(windowType, true); // Use AI limits as reference

      statuses.push({
        chatId,
        senderId,
        windowType,
        messageCount: status.messageCount,
        aiMessageCount: status.aiMessageCount,
        limit,
        percentUsed: (status.aiMessageCount / limit) * 100,
        isBlocked: status.isBlocked,
        windowStart: status.windowStart,
        windowEnd: status.windowEnd,
        lastCustomerMessage: status.lastCustomerMessage,
        sessionExpired: status.sessionExpired,
      });
    }

    return statuses;
  }

  /**
   * Block a chat from sending more messages
   */
  async blockChat(
    userId: number,
    chatId: string,
    reason: string,
    duration?: { hours?: number; until?: Date },
  ): Promise<void> {
    const now = new Date();
    const blockUntil =
      duration?.until ||
      (duration?.hours
        ? new Date(now.getTime() + duration.hours * 60 * 60 * 1000)
        : new Date(now.getTime() + 24 * 60 * 60 * 1000)); // Default 24h block

    // Update all current windows to blocked
    await db
      .update(rateLimitTracking)
      .set({
        isBlocked: true,
        blockedAt: now,
        blockReason: reason,
        windowEnd: blockUntil,
        updatedAt: now,
      })
      .where(
        and(
          eq(rateLimitTracking.userId, userId),
          eq(rateLimitTracking.chatId, chatId),
          gte(rateLimitTracking.windowEnd, now),
        ),
      );

    this.logger.warn(
      `Chat ${chatId} blocked until ${blockUntil.toISOString()}: ${reason}`,
    );
  }

  /**
   * Unblock a chat
   */
  async unblockChat(userId: number, chatId: string): Promise<void> {
    await db
      .update(rateLimitTracking)
      .set({
        isBlocked: false,
        blockedAt: null,
        blockReason: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(rateLimitTracking.userId, userId),
          eq(rateLimitTracking.chatId, chatId),
        ),
      );

    this.logger.log(`Chat ${chatId} unblocked`);
  }

  /**
   * Simulate high-frequency messaging (for testing)
   */
  async simulateHighFrequency(
    userId: number,
    chatId: string,
    messageCount: number,
  ): Promise<{
    blocked: boolean;
    triggeredAt: number;
    reason?: string;
  }> {
    let blocked = false;
    let triggeredAt = 0;
    let reason: string | undefined;

    for (let i = 0; i < messageCount; i++) {
      const check = await this.checkRateLimit(userId, chatId, {
        isAiMessage: true,
      });

      if (!check.allowed) {
        blocked = true;
        triggeredAt = i;
        reason = check.reason;
        break;
      }

      // Simulate the message being sent
      await this.recordMessage(userId, chatId, { isAiMessage: true });
    }

    return { blocked, triggeredAt, reason };
  }

  /**
   * Clear all rate limit tracking for a chat
   * Called when a chat is deleted to ensure fresh limits for new conversations
   */
  async clearChatRateLimits(chatId: string): Promise<void> {
    try {
      const result = await db
        .delete(rateLimitTracking)
        .where(eq(rateLimitTracking.chatId, chatId))
        .returning();

      this.logger.log(
        `Cleared ${result.length} rate limit records for chat ${chatId}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to clear rate limits for chat ${chatId}: ${error.message}`,
      );
      // Don't throw - this is cleanup, shouldn't block deletion
    }
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private getWindowBounds(
    windowType: WindowType,
    now: Date,
  ): { start: Date; end: Date } {
    const start = new Date(now);
    const end = new Date(now);

    switch (windowType) {
      case 'minute':
        start.setSeconds(0, 0);
        end.setSeconds(59, 999);
        break;
      case 'hour':
        start.setMinutes(0, 0, 0);
        end.setMinutes(59, 59, 999);
        break;
      case 'day':
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case '24h_session':
        // Session starts from last customer message, we use current time as start
        // and 24h later as end
        end.setTime(
          start.getTime() + this.config.sessionWindowHours * 60 * 60 * 1000,
        );
        break;
    }

    return { start, end };
  }

  private getLimitForWindow(
    windowType: WindowType,
    isAiMessage: boolean,
    customConfig?: RateLimitConfig,
  ): number {
    const config = customConfig || this.config;
    switch (windowType) {
      case 'minute':
        return isAiMessage
          ? config.aiMessagesPerMinute
          : config.messagesPerMinute;
      case 'hour':
        return isAiMessage ? config.aiMessagesPerHour : config.messagesPerHour;
      case 'day':
        return isAiMessage ? config.aiMessagesPerDay : config.messagesPerDay;
      case '24h_session':
        return config.aiMessagesPerChatPerHour * 24; // Max AI messages in 24h session
      default:
        return 100;
    }
  }

  private async getWindowStatus(
    userId: number,
    chatId: string,
    windowType: WindowType,
    senderId?: number,
  ): Promise<{
    messageCount: number;
    aiMessageCount: number;
    isBlocked: boolean;
    blockReason?: string;
    windowStart: Date;
    windowEnd: Date;
    lastCustomerMessage?: Date;
    sessionExpired: boolean;
  }> {
    const now = new Date();
    const { start, end } = this.getWindowBounds(windowType, now);

    const filters = [
      eq(rateLimitTracking.userId, userId),
      eq(rateLimitTracking.chatId, chatId),
      eq(rateLimitTracking.windowType, windowType),
      lte(rateLimitTracking.windowStart, now),
      gte(rateLimitTracking.windowEnd, now),
    ];

    if (senderId !== undefined && senderId !== null) {
      filters.push(eq(rateLimitTracking.senderId, senderId));
    } else {
      filters.push(sql`${rateLimitTracking.senderId} IS NULL`);
    }

    const [record] = await db
      .select()
      .from(rateLimitTracking)
      .where(and(...filters))
      .limit(1);

    if (!record) {
      return {
        messageCount: 0,
        aiMessageCount: 0,
        isBlocked: false,
        windowStart: start,
        windowEnd: end,
        sessionExpired: false,
      };
    }

    // Check session expiration for 24h window
    let sessionExpired = false;
    if (windowType === '24h_session' && record.lastCustomerMessageAt) {
      const hoursSince =
        (now.getTime() - record.lastCustomerMessageAt.getTime()) /
        (1000 * 60 * 60);
      sessionExpired = hoursSince >= this.config.sessionWindowHours;
    }

    return {
      messageCount: record.messageCount || 0,
      aiMessageCount: record.aiMessageCount || 0,
      isBlocked: record.isBlocked || false,
      blockReason: record.blockReason || undefined,
      windowStart: record.windowStart,
      windowEnd: record.windowEnd,
      lastCustomerMessage: record.lastCustomerMessageAt || undefined,
      sessionExpired,
    };
  }

  private async incrementWindowCounter(
    userId: number,
    chatId: string,
    windowType: WindowType,
    options: { isAiMessage: boolean; isTemplateMessage: boolean },
    senderId?: number,
  ): Promise<void> {
    const now = new Date();
    const { start, end } = this.getWindowBounds(windowType, now);

    const incrementAi = options.isAiMessage ? 1 : 0;
    const incrementTemplate = options.isTemplateMessage ? 1 : 0;

    // Use Find First + Update/Insert logic to ensure index consistency
    // Drizzle's ON CONFLICT with partial unique index (COALESCE) is tricky

    // 1. Check if row exists
    const filters = [
      eq(rateLimitTracking.userId, userId),
      eq(rateLimitTracking.chatId, chatId),
      eq(rateLimitTracking.windowType, windowType),
      eq(rateLimitTracking.windowStart, start),
    ];

    if (senderId !== undefined && senderId !== null) {
      filters.push(eq(rateLimitTracking.senderId, senderId));
    } else {
      // If senderId is null, we must explicitly check only rows where it is null to match "unique" logic
      filters.push(sql`${rateLimitTracking.senderId} IS NULL`);
    }

    const existing = await db
      .select({ id: rateLimitTracking.id })
      .from(rateLimitTracking)
      .where(and(...filters))
      .limit(1);

    if (existing && existing.length > 0) {
      // 2a. Update existing
      await db
        .update(rateLimitTracking)
        .set({
          messageCount: sql`message_count + 1`,
          aiMessageCount: sql`ai_message_count + ${incrementAi}`,
          templateMessageCount: sql`template_message_count + ${incrementTemplate}`,
          updatedAt: now,
        })
        .where(eq(rateLimitTracking.id, existing[0].id));
    } else {
      // 2b. Insert new
      try {
        await db.insert(rateLimitTracking).values({
          userId,
          chatId,
          senderId: senderId ?? null, // explicit null
          windowType,
          windowStart: start,
          windowEnd: end,
          messageCount: 1,
          aiMessageCount: incrementAi,
          templateMessageCount: incrementTemplate,
          updatedAt: now,
        });
      } catch (insertError) {
        // Handle race condition: Duplicate key? Retry update?
        // If unique constraint violation, it means it appeared between select and insert.
        // Just ignore (count off by 1 is acceptable) or try update again.
        this.logger.warn(
          `[RateLimit] Race condition on insert: ${insertError.message}. Ignoring.`,
        );
      }
    }
  }
}
