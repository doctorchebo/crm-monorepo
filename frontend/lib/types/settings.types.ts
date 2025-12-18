/**
 * User Settings Types
 *
 * TypeScript types for user settings management.
 * Mirrors the backend DTO structure.
 */

/**
 * Notification settings response from API
 */
export interface NotificationSettings {
  browserNotificationsEnabled: boolean;
  soundEnabled: boolean;
  soundVolume: number;
}

/**
 * DTO for updating notification settings
 * All fields are optional - only provided fields are updated
 */
export interface UpdateNotificationSettingsDto {
  browserNotificationsEnabled?: boolean;
  soundEnabled?: boolean;
  soundVolume?: number;
}

/**
 * Default notification settings
 * Used as fallback before settings are loaded
 */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  browserNotificationsEnabled: false,
  soundEnabled: true,
  soundVolume: 0.5,
};
