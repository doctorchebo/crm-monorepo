/**
 * Rate Limiter Service
 * Anti-ban guardrails for WhatsApp messaging compliance
 *
 * Features:
 * - Per-chat hourly/daily rate limits
 * - Repetitive content detection
 * - Cooldown enforcement
 * - Policy violation tracking
 */

import { db } from '@database/db.connection';
import { messages } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import {
  BlockReason,
  DEFAULT_RATE_LIMITS,
  RateLimitConfig,
  RateLimitStatus,
} from '../types';

// ============================================================================
// In-Memory Cache for Rate Limiting
// ============================================================================

interface ChatRateLimitCache {
  lastMessageAt: Date | null;
  recentHashes: Array<{ hash: string; timestamp: Date }>;
  cooldownUntil: Date | null;
  lastChecked: Date;
}

/**
 * Rate Limiter Service
 * Provides anti-ban guardrails for WhatsApp messaging
 */
@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);

  /**
   * In-memory cache for quick rate limit checks
   * Key: chatId, Value: cached rate limit data
   */
  private readonly cache = new Map<string, ChatRateLimitCache>();

  /**
   * Cache TTL in milliseconds (5 minutes)
   */
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  /**
   * Check if sending a message is allowed for a chat
   * Combines database lookups with in-memory caching for performance
   */
  async checkRateLimit(
    chatId: string,
    config: RateLimitConfig = DEFAULT_RATE_LIMITS,
  ): Promise<RateLimitStatus> {
    const now = new Date();

    // Check cooldown first (fastest check)
    const cached = this.cache.get(chatId);
    if (cached?.cooldownUntil && cached.cooldownUntil > now) {
      const cooldownRemaining = Math.ceil(
        (cached.cooldownUntil.getTime() - now.getTime()) / 1000,
      );
      return {
        canSend: false,
        messagesLastHour: 0, // Will be fetched if needed
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

    // Query database for message counts
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const [hourlyCount, dailyCount] = await Promise.all([
      this.getOutboundMessageCount(chatId, hourAgo),
      this.getOutboundMessageCount(chatId, startOfDay),
    ]);

    // Check hourly limit
    if (hourlyCount >= config.maxMessagesPerHour) {
      this.applyCooldown(chatId, config.cooldownSeconds);
      return {
        canSend: false,
        messagesLastHour: hourlyCount,
        messagesToday: dailyCount,
        cooldownRemaining: config.cooldownSeconds,
        blockReason: 'hourly_limit_reached',
        hourlyResetAt: this.getHourlyResetTime(now),
        dailyResetAt: this.getDailyResetTime(now),
      };
    }

    // Check daily limit
    if (dailyCount >= config.maxMessagesPerDay) {
      return {
        canSend: false,
        messagesLastHour: hourlyCount,
        messagesToday: dailyCount,
        cooldownRemaining: 0,
        blockReason: 'daily_limit_reached',
        hourlyResetAt: this.getHourlyResetTime(now),
        dailyResetAt: this.getDailyResetTime(now),
      };
    }

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
   * Record that a message was sent (update cache)
   */
  recordMessageSent(chatId: string, content: string): void {
    const now = new Date();
    const contentHash = this.hashContent(content);

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
