/**
 * AI Reply Rate Limiter Adapter
 * 
 * This is an ADAPTER that delegates to the workflow module's RateLimiterService
 * for actual rate limiting and tracking. It provides a compatibility layer for
 * the ai-reply module's legacy interface.
 * 
 * Key changes:
 * - Rate checks now use chatAiOverrides.maxMessagesPerHour
 * - Messages are tracked in rate_limit_tracking table
 * - Legacy in-memory cooldown preserved for repetitive content detection
 */

import { db } from '@database/db.connection';
import { chatAiOverrides, messages } from '@database/schema';
import { RateLimiterService as WorkflowRateLimiterService } from '@modules/workflow/services/rate-limiter.service';
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import {
  BlockReason,
  DEFAULT_RATE_LIMITS,
  RateLimitConfig,
  RateLimitStatus,
} from '../types';

// ============================================================================
// In-Memory Cache for Cooldown and Repetition Detection Only
// ============================================================================

interface ChatRateLimitCache {
  lastMessageAt: Date | null;
  recentHashes: Array<{ hash: string; timestamp: Date }>;
  cooldownUntil: Date | null;
  lastChecked: Date;
}

/**
 * Rate Limiter Adapter for AI Reply Module
 * Delegates to workflow's RateLimiterService for rate limiting + tracking
 */
@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger('AIReplyRateLimiter');

  /**
   * In-memory cache for quick cooldown and repetition checks only
   * Actual rate limiting is done via workflow's RateLimiterService
   */
  private readonly cache = new Map<string, ChatRateLimitCache>();

  /**
   * Cache TTL in milliseconds (5 minutes)
   */
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    @Inject(forwardRef(() => WorkflowRateLimiterService))
    private readonly workflowRateLimiter: WorkflowRateLimiterService,
  ) {
    this.logger.log('AI Reply Rate Limiter initialized (using workflow rate limiter)');
  }

  /**
   * Check if sending a message is allowed for a chat
   * Now delegates to workflow's rate limiter which checks chatAiOverrides
   */
  async checkRateLimit(
    chatId: string,
    config: RateLimitConfig = DEFAULT_RATE_LIMITS,
  ): Promise<RateLimitStatus> {
    const now = new Date();

    // Check local cooldown first (fastest check)
    const cached = this.cache.get(chatId);
    if (cached?.cooldownUntil && cached.cooldownUntil > now) {
      const cooldownRemaining = Math.ceil(
        (cached.cooldownUntil.getTime() - now.getTime()) / 1000,
      );
      return {
        canSend: false,
        messagesLastHour: 0,
        messagesToday: 0,
        cooldownRemaining,
        blockReason: 'anti_ban_cooldown',
        hourlyResetAt: this.getHourlyResetTime(now),
        dailyResetAt: this.getDailyResetTime(now),
      };
    }

    // Check minimum time between messages
    if (cached?.lastMessageAt) {
      const secondsSinceLastMessage = Math.floor(
        (now.getTime() - cached.lastMessageAt.getTime()) / 1000,
      );
      if (secondsSinceLastMessage < config.minSecondsBetweenMessages) {
        return {
          canSend: false,
          messagesLastHour: 0,
          messagesToday: 0,
          cooldownRemaining:
            config.minSecondsBetweenMessages - secondsSinceLastMessage,
          blockReason: 'anti_ban_cooldown',
          hourlyResetAt: this.getHourlyResetTime(now),
          dailyResetAt: this.getDailyResetTime(now),
        };
      }
    }

    // Get userId from chatAiOverrides for workflow rate limiter
    const [override] = await db
      .select({ userId: chatAiOverrides.userId })
      .from(chatAiOverrides)
      .where(eq(chatAiOverrides.chatId, chatId))
      .limit(1);

    const userId = override?.userId ?? 1; // Fallback if no override exists

    // Delegate to workflow rate limiter for actual rate check
    // This checks chatAiOverrides.maxMessagesPerHour and rate_limit_tracking
    const workflowCheck = await this.workflowRateLimiter.checkRateLimit(
      userId,
      chatId,
      { isAiMessage: true },
    );

    if (!workflowCheck.allowed) {
      return {
        canSend: false,
        messagesLastHour: workflowCheck.limits.find(l => l.type === 'hour')?.current ?? 0,
        messagesToday: workflowCheck.limits.find(l => l.type === 'day')?.current ?? 0,
        cooldownRemaining: 0,
        blockReason: 'hourly_limit_reached',
        hourlyResetAt: workflowCheck.resetTime ?? this.getHourlyResetTime(now),
        dailyResetAt: this.getDailyResetTime(now),
      };
    }

    // Also query messages table for display purposes
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const [hourlyCount, dailyCount] = await Promise.all([
      this.getOutboundMessageCount(chatId, hourAgo),
      this.getOutboundMessageCount(chatId, startOfDay),
    ]);

    return {
      canSend: true,
      messagesLastHour: hourlyCount,
      messagesToday: dailyCount,
      cooldownRemaining: 0,
      hourlyResetAt: this.getHourlyResetTime(now),
      dailyResetAt: this.getDailyResetTime(now),
    };
  }

  /**
   * Check if content would be repetitive (anti-spam)
   * Uses simple hash comparison of recent messages
   */
  async isRepetitiveContent(
    chatId: string,
    content: string,
    config: RateLimitConfig = DEFAULT_RATE_LIMITS,
  ): Promise<{ isRepetitive: boolean; similarCount: number }> {
    const contentHash = this.hashContent(content);
    const cached = this.cache.get(chatId);

    if (!cached || this.isCacheStale(cached)) {
      // Refresh cache from database
      await this.refreshCache(chatId);
    }

    const freshCache = this.cache.get(chatId);
    if (!freshCache) {
      return { isRepetitive: false, similarCount: 0 };
    }

    // Count similar hashes in recent messages
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const recentSimilar = freshCache.recentHashes.filter(
      (h) => h.hash === contentHash && h.timestamp > hourAgo,
    );

    const similarCount = recentSimilar.length;
    const isRepetitive = similarCount >= config.maxSimilarMessages;

    if (isRepetitive) {
      this.logger.warn(
        `Repetitive content detected for chat ${chatId}: ${similarCount} similar messages`,
      );
    }

    return { isRepetitive, similarCount };
  }

  /**
   * Record that a message was sent
   * Now delegates to workflow rate limiter to populate rate_limit_tracking
   */
  async recordMessageSent(chatId: string, content: string, userId?: number): Promise<void> {
    const now = new Date();
    const contentHash = this.hashContent(content);

    // Update local cache for repetition detection
    let cached = this.cache.get(chatId);
    if (!cached) {
      cached = {
        lastMessageAt: now,
        recentHashes: [],
        cooldownUntil: null,
        lastChecked: now,
      };
    }

    cached.lastMessageAt = now;
    cached.recentHashes.push({ hash: contentHash, timestamp: now });

    // Keep only last hour of hashes
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    cached.recentHashes = cached.recentHashes.filter(
      (h) => h.timestamp > hourAgo,
    );

    this.cache.set(chatId, cached);

    // Record in workflow rate limiter for rate_limit_tracking table
    if (userId) {
      try {
        await this.workflowRateLimiter.recordMessage(userId, chatId, {
          isAiMessage: true,
        });
        this.logger.debug(`[RateLimit] Recorded AI message for chat ${chatId} in tracking table`);
      } catch (error) {
        this.logger.error(`[RateLimit] Failed to record message: ${error.message}`);
      }
    }
  }

  /**
   * Apply cooldown to a chat (after rate limit violation)
   */
  applyCooldown(chatId: string, seconds: number): void {
    const cooldownUntil = new Date(Date.now() + seconds * 1000);
    let cached = this.cache.get(chatId);

    if (!cached) {
      cached = {
        lastMessageAt: null,
        recentHashes: [],
        cooldownUntil,
        lastChecked: new Date(),
      };
    } else {
      cached.cooldownUntil = cooldownUntil;
    }

    this.cache.set(chatId, cached);
    this.logger.log(`Applied ${seconds}s cooldown to chat ${chatId}`);
  }

  /**
   * Clear cooldown for a chat (admin override)
   */
  clearCooldown(chatId: string): void {
    const cached = this.cache.get(chatId);
    if (cached) {
      cached.cooldownUntil = null;
      this.cache.set(chatId, cached);
    }
  }

  /**
   * Get comprehensive rate limit status with analysis
   */
  async getDetailedStatus(
    chatId: string,
    content: string,
    config: RateLimitConfig = DEFAULT_RATE_LIMITS,
  ): Promise<{
    rateLimit: RateLimitStatus;
    repetition: { isRepetitive: boolean; similarCount: number };
    canSend: boolean;
    blockReason?: BlockReason;
  }> {
    const [rateLimit, repetition] = await Promise.all([
      this.checkRateLimit(chatId, config),
      this.isRepetitiveContent(chatId, content, config),
    ]);

    let canSend = rateLimit.canSend && !repetition.isRepetitive;
    let blockReason: BlockReason | undefined = rateLimit.blockReason;

    if (!blockReason && repetition.isRepetitive) {
      blockReason = 'repetitive_content';
      canSend = false;
    }

    return {
      rateLimit,
      repetition,
      canSend,
      blockReason,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Get count of outbound messages since a given timestamp
   */
  private async getOutboundMessageCount(
    chatId: string,
    since: Date,
  ): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(
        and(
          eq(messages.chatId, chatId),
          eq(messages.direction, 'outbound'),
          gte(messages.timestamp, since),
        ),
      );

    return Number(result[0]?.count ?? 0);
  }

  /**
   * Refresh cache from database
   */
  private async refreshCache(chatId: string): Promise<void> {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Get recent outbound messages
    const recentMessages = await db
      .select({
        text: messages.text,
        timestamp: messages.timestamp,
      })
      .from(messages)
      .where(
        and(
          eq(messages.chatId, chatId),
          eq(messages.direction, 'outbound'),
          gte(messages.timestamp, hourAgo),
        ),
      )
      .orderBy(desc(messages.timestamp))
      .limit(20);

    const recentHashes = recentMessages
      .filter((m) => m.text)
      .map((m) => ({
        hash: this.hashContent(m.text!),
        timestamp: m.timestamp,
      }));

    const lastMessage = recentMessages[0];

    this.cache.set(chatId, {
      lastMessageAt: lastMessage?.timestamp ?? null,
      recentHashes,
      cooldownUntil: null,
      lastChecked: now,
    });
  }

  /**
   * Check if cache entry is stale
   */
  private isCacheStale(cached: ChatRateLimitCache): boolean {
    return Date.now() - cached.lastChecked.getTime() > this.CACHE_TTL_MS;
  }

  /**
   * Simple content hash for similarity comparison
   * Normalizes whitespace and converts to lowercase
   */
  private hashContent(content: string): string {
    const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim();
    // Simple hash - for production, consider using crypto
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Get the next hourly reset time
   */
  private getHourlyResetTime(now: Date): Date {
    const reset = new Date(now);
    reset.setMinutes(0, 0, 0);
    reset.setHours(reset.getHours() + 1);
    return reset;
  }

  /**
   * Get the next daily reset time (midnight)
   */
  private getDailyResetTime(now: Date): Date {
    const reset = new Date(now);
    reset.setHours(24, 0, 0, 0);
    return reset;
  }

  /**
   * Clear all cached data (for testing or admin purposes)
   */
  clearAllCache(): void {
    this.cache.clear();
    this.logger.log('Rate limiter cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }
}

