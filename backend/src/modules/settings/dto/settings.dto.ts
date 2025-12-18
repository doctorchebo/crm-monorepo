/**
 * User Settings DTOs
 *
 * Data Transfer Objects for user settings management.
 * These DTOs provide type safety and validation for settings operations.
 */

import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

/**
 * Settings categories enum for type safety
 */
export enum SettingsCategory {
  NOTIFICATIONS = 'notifications',
  APPEARANCE = 'appearance',
  CHAT = 'chat',
  PRIVACY = 'privacy',
}

/**
 * Notification settings keys
 */
export enum NotificationSettingKey {
  BROWSER_NOTIFICATIONS_ENABLED = 'browser_notifications_enabled',
  SOUND_ENABLED = 'sound_enabled',
  SOUND_VOLUME = 'sound_volume',
}

/**
 * DTO for updating notification settings
 */
export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsBoolean()
  browserNotificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  soundEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  soundVolume?: number;
}

/**
 * Response DTO for notification settings
 */
export interface NotificationSettingsResponse {
  browserNotificationsEnabled: boolean;
  soundEnabled: boolean;
  soundVolume: number;
}

/**
 * Default notification settings
 * Used when user has no settings stored yet
 */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettingsResponse = {
  browserNotificationsEnabled: false, // Off by default as per requirements
  soundEnabled: true,
  soundVolume: 0.5,
};

/**
 * Generic setting response type
 */
export interface SettingResponse {
  id: number;
  userId: number;
  category: string;
  key: string;
  value: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Bulk settings update DTO
 */
export class BulkUpdateSettingsDto {
  @IsEnum(SettingsCategory)
  category: SettingsCategory;

  settings: Record<string, unknown>;
}
