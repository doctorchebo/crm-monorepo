/**
 * AI Reply Settings Service
 * Manages user preferences for AI-powered replies
 */

import { db } from '@database/db.connection';
import { userSettings } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  AIReplySettings,
  AIStylePreferences,
  DEFAULT_AI_REPLY_SETTINGS,
  DEFAULT_RATE_LIMITS,
  RateLimitConfig,
} from '../types';

/**
 * Settings category for AI reply configuration
 */
const AI_REPLY_CATEGORY = 'ai_reply';

/**
 * Settings keys for AI reply configuration
 */
const SETTINGS_KEYS = {
  ENABLED: 'enabled',
  AUTO_REPLY_ENABLED: 'auto_reply_enabled',
  AUTO_REPLY_DELAY: 'auto_reply_delay_seconds',
  STYLE_PREFERENCES: 'style_preferences',
  RATE_LIMITS: 'rate_limits',
  PREFERRED_TEMPLATES: 'preferred_templates',
  AVOID_KEYWORDS: 'avoid_keywords',
  USE_MEMORY: 'use_memory',
  RECENT_MESSAGES_COUNT: 'recent_messages_count',
} as const;

@Injectable()
export class AIReplySettingsService {
  private readonly logger = new Logger(AIReplySettingsService.name);

  /**
   * Get all AI reply settings for a user
   */
  async getSettings(userId: number): Promise<AIReplySettings> {
    try {
      const settings = await db
        .select()
        .from(userSettings)
        .where(
          and(
            eq(userSettings.userId, userId),
            eq(userSettings.category, AI_REPLY_CATEGORY),
          ),
        );

      // Build settings object from database records
      const settingsMap = new Map<string, unknown>();
      for (const setting of settings) {
        settingsMap.set(setting.key, setting.value);
      }

      return {
        enabled: this.getValue<boolean>(
          settingsMap,
          SETTINGS_KEYS.ENABLED,
          DEFAULT_AI_REPLY_SETTINGS.enabled,
        ),
        autoReplyEnabled: this.getValue<boolean>(
          settingsMap,
          SETTINGS_KEYS.AUTO_REPLY_ENABLED,
          DEFAULT_AI_REPLY_SETTINGS.autoReplyEnabled,
        ),
        autoReplyDelaySeconds: this.getValue<number>(
          settingsMap,
          SETTINGS_KEYS.AUTO_REPLY_DELAY,
          DEFAULT_AI_REPLY_SETTINGS.autoReplyDelaySeconds,
        ),
        stylePreferences: this.getValue<AIStylePreferences>(
          settingsMap,
          SETTINGS_KEYS.STYLE_PREFERENCES,
          DEFAULT_AI_REPLY_SETTINGS.stylePreferences,
        ),
        rateLimits: this.getValue<Partial<RateLimitConfig>>(
          settingsMap,
          SETTINGS_KEYS.RATE_LIMITS,
          DEFAULT_AI_REPLY_SETTINGS.rateLimits,
        ),
        preferredTemplates: this.getValue<Record<string, string>>(
          settingsMap,
          SETTINGS_KEYS.PREFERRED_TEMPLATES,
          DEFAULT_AI_REPLY_SETTINGS.preferredTemplates,
        ),
        avoidKeywords: this.getValue<string[]>(
          settingsMap,
          SETTINGS_KEYS.AVOID_KEYWORDS,
          DEFAULT_AI_REPLY_SETTINGS.avoidKeywords,
        ),
        useMemory: this.getValue<boolean>(
          settingsMap,
          SETTINGS_KEYS.USE_MEMORY,
          DEFAULT_AI_REPLY_SETTINGS.useMemory,
        ),
        recentMessagesCount: this.getValue<number>(
          settingsMap,
          SETTINGS_KEYS.RECENT_MESSAGES_COUNT,
          DEFAULT_AI_REPLY_SETTINGS.recentMessagesCount,
        ),
      };
    } catch (error) {
      this.logger.error(`Failed to get AI settings for user ${userId}:`, error);
      return DEFAULT_AI_REPLY_SETTINGS;
    }
  }

  /**
   * Update a single AI reply setting
   */
  async updateSetting<K extends keyof AIReplySettings>(
    userId: number,
    key: K,
    value: AIReplySettings[K],
  ): Promise<void> {
    const settingsKey = this.mapSettingsKey(key);
    if (!settingsKey) {
      throw new Error(`Invalid settings key: ${key}`);
    }

    await this.upsertSetting(userId, settingsKey, value);
  }

  /**
   * Update multiple AI reply settings at once
   */
  async updateSettings(
    userId: number,
    updates: Partial<AIReplySettings>,
  ): Promise<AIReplySettings> {
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        await this.updateSetting(
          userId,
          key as keyof AIReplySettings,
          value as AIReplySettings[keyof AIReplySettings],
        );
      }
    }

    return this.getSettings(userId);
  }

  /**
   * Get style preferences for a user
   */
  async getStylePreferences(userId: number): Promise<AIStylePreferences> {
    const settings = await this.getSettings(userId);
    return settings.stylePreferences;
  }

  /**
   * Update style preferences
   */
  async updateStylePreferences(
    userId: number,
    preferences: Partial<AIStylePreferences>,
  ): Promise<AIStylePreferences> {
    const current = await this.getStylePreferences(userId);
    const updated = { ...current, ...preferences };
    await this.updateSetting(userId, 'stylePreferences', updated);
    return updated;
  }

  /**
   * Get effective rate limit configuration (user overrides + defaults)
   */
  async getEffectiveRateLimits(userId: number): Promise<RateLimitConfig> {
    const settings = await this.getSettings(userId);
    return {
      ...DEFAULT_RATE_LIMITS,
      ...settings.rateLimits,
    };
  }

  /**
   * Check if AI replies are enabled for a user
   */
  async isEnabled(userId: number): Promise<boolean> {
    const settings = await this.getSettings(userId);
    return settings.enabled;
  }

  /**
   * Check if auto-reply is enabled for a user
   */
  async isAutoReplyEnabled(userId: number): Promise<boolean> {
    const settings = await this.getSettings(userId);
    return settings.enabled && settings.autoReplyEnabled;
  }

  /**
   * Reset all AI reply settings to defaults
   */
  async resetToDefaults(userId: number): Promise<AIReplySettings> {
    // Delete all existing settings
    await db
      .delete(userSettings)
      .where(
        and(
          eq(userSettings.userId, userId),
          eq(userSettings.category, AI_REPLY_CATEGORY),
        ),
      );

    this.logger.log(`Reset AI reply settings to defaults for user ${userId}`);
    return DEFAULT_AI_REPLY_SETTINGS;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Upsert a setting value
   */
  private async upsertSetting(
    userId: number,
    key: string,
    value: unknown,
  ): Promise<void> {
    // Check if setting exists
    const existing = await db
      .select()
      .from(userSettings)
      .where(
        and(
          eq(userSettings.userId, userId),
          eq(userSettings.category, AI_REPLY_CATEGORY),
          eq(userSettings.key, key),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      // Update
      await db
        .update(userSettings)
        .set({
          value: value as object,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(userSettings.userId, userId),
            eq(userSettings.category, AI_REPLY_CATEGORY),
            eq(userSettings.key, key),
          ),
        );
    } else {
      // Insert
      await db.insert(userSettings).values({
        userId,
        category: AI_REPLY_CATEGORY,
        key,
        value: value as object,
      });
    }
  }

  /**
   * Get value from settings map with fallback to default
   */
  private getValue<T>(
    map: Map<string, unknown>,
    key: string,
    defaultValue: T,
  ): T {
    const value = map.get(key);
    if (value === undefined || value === null) {
      return defaultValue;
    }
    return value as T;
  }

  /**
   * Map AIReplySettings key to database key
   */
  private mapSettingsKey(key: keyof AIReplySettings): string | null {
    const mapping: Record<keyof AIReplySettings, string> = {
      enabled: SETTINGS_KEYS.ENABLED,
      autoReplyEnabled: SETTINGS_KEYS.AUTO_REPLY_ENABLED,
      autoReplyDelaySeconds: SETTINGS_KEYS.AUTO_REPLY_DELAY,
      stylePreferences: SETTINGS_KEYS.STYLE_PREFERENCES,
      rateLimits: SETTINGS_KEYS.RATE_LIMITS,
      preferredTemplates: SETTINGS_KEYS.PREFERRED_TEMPLATES,
      avoidKeywords: SETTINGS_KEYS.AVOID_KEYWORDS,
      useMemory: SETTINGS_KEYS.USE_MEMORY,
      recentMessagesCount: SETTINGS_KEYS.RECENT_MESSAGES_COUNT,
    };
    return mapping[key] || null;
  }
}
