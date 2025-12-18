import { db } from '@database/db.connection';
import { Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import * as schema from '../../database/schema';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationSettingKey,
  NotificationSettingsResponse,
  SettingsCategory,
  UpdateNotificationSettingsDto,
} from './dto/settings.dto';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  /**
   * Get a single setting value for a user
   */
  async getSetting<T = unknown>(
    userId: number,
    category: SettingsCategory,
    key: string,
  ): Promise<T | null> {
    const result = await db
      .select()
      .from(schema.userSettings)
      .where(
        and(
          eq(schema.userSettings.userId, userId),
          eq(schema.userSettings.category, category),
          eq(schema.userSettings.key, key),
        ),
      )
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return result[0].value as T;
  }

  /**
   * Set a single setting value for a user
   */
  async setSetting(
    userId: number,
    category: SettingsCategory,
    key: string,
    value: unknown,
  ): Promise<void> {
    const existing = await this.getSetting(userId, category, key);

    if (existing !== null) {
      // Update existing setting
      await db
        .update(schema.userSettings)
        .set({
          value: value as object,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.userSettings.userId, userId),
            eq(schema.userSettings.category, category),
            eq(schema.userSettings.key, key),
          ),
        );
    } else {
      // Insert new setting
      await db.insert(schema.userSettings).values({
        userId,
        category,
        key,
        value: value as object,
      });
    }
  }

  /**
   * Get all settings for a user in a specific category
   */
  async getSettingsByCategory(
    userId: number,
    category: SettingsCategory,
  ): Promise<Record<string, unknown>> {
    const results = await db
      .select()
      .from(schema.userSettings)
      .where(
        and(
          eq(schema.userSettings.userId, userId),
          eq(schema.userSettings.category, category),
        ),
      );

    const settings: Record<string, unknown> = {};
    for (const result of results) {
      settings[result.key] = result.value;
    }

    return settings;
  }

  /**
   * Set multiple settings for a user in a category
   */
  async setSettingsByCategory(
    userId: number,
    category: SettingsCategory,
    settings: Record<string, unknown>,
  ): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      await this.setSetting(userId, category, key, value);
    }
  }

  /**
   * Get notification settings for a user
   * Returns defaults for any missing settings
   */
  async getNotificationSettings(
    userId: number,
  ): Promise<NotificationSettingsResponse> {
    const settings = await this.getSettingsByCategory(
      userId,
      SettingsCategory.NOTIFICATIONS,
    );

    return {
      browserNotificationsEnabled:
        settings[NotificationSettingKey.BROWSER_NOTIFICATIONS_ENABLED] ??
        DEFAULT_NOTIFICATION_SETTINGS.browserNotificationsEnabled,
      soundEnabled:
        settings[NotificationSettingKey.SOUND_ENABLED] ??
        DEFAULT_NOTIFICATION_SETTINGS.soundEnabled,
      soundVolume:
        settings[NotificationSettingKey.SOUND_VOLUME] ??
        DEFAULT_NOTIFICATION_SETTINGS.soundVolume,
    } as NotificationSettingsResponse;
  }

  /**
   * Update notification settings for a user
   * Only updates provided fields
   */
  async updateNotificationSettings(
    userId: number,
    dto: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettingsResponse> {
    this.logger.log(`Updating notification settings for user ${userId}`);

    const updates: Record<string, unknown> = {};

    if (dto.browserNotificationsEnabled !== undefined) {
      updates[NotificationSettingKey.BROWSER_NOTIFICATIONS_ENABLED] =
        dto.browserNotificationsEnabled;
    }

    if (dto.soundEnabled !== undefined) {
      updates[NotificationSettingKey.SOUND_ENABLED] = dto.soundEnabled;
    }

    if (dto.soundVolume !== undefined) {
      updates[NotificationSettingKey.SOUND_VOLUME] = dto.soundVolume;
    }

    if (Object.keys(updates).length > 0) {
      await this.setSettingsByCategory(
        userId,
        SettingsCategory.NOTIFICATIONS,
        updates,
      );
    }

    // Return the updated settings
    return this.getNotificationSettings(userId);
  }

  /**
   * Delete all settings for a user
   * Typically called when user account is deleted
   */
  async deleteUserSettings(userId: number): Promise<void> {
    await db
      .delete(schema.userSettings)
      .where(eq(schema.userSettings.userId, userId));
  }

  // =====================================================
  // Legacy/Future methods for team settings (placeholder)
  // =====================================================

  async getTeamSettings(teamId: string) {
    // TODO: Implement when team settings are needed
    return null;
  }

  async updateTeamSettings(teamId: string, settings: any) {
    // TODO: Implement when team settings are needed
    return null;
  }

  async getWhatsAppConfig(teamId: string) {
    // TODO: Fetch WhatsApp/Twilio configuration
    return null;
  }

  async updateWhatsAppConfig(teamId: string, config: any) {
    // TODO: Update Twilio configuration
    return null;
  }

  async getAutomationSettings(teamId: string) {
    // TODO: Fetch automation preferences (LLM settings, response delays, etc)
    return null;
  }

  async updateAutomationSettings(teamId: string, settings: any) {
    // TODO: Update automation settings
    return null;
  }
}
