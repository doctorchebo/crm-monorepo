/**
 * useNotificationSettings Hook
 *
 * Manages user notification settings with:
 * - Fetching settings from backend
 * - Updating settings (with optimistic updates)
 * - Caching via SWR
 * - Loading/error states
 *
 * This hook provides a centralized way to access and modify
 * notification preferences throughout the application.
 */

"use client";

import { backendApi } from "@/lib/api/endpoints";
import { TokenManager } from "@/lib/auth/token-manager";
import type {
  NotificationSettings,
  UpdateNotificationSettingsDto,
} from "@/lib/types/settings.types";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/types/settings.types";
import { useCallback } from "react";
import useSWR from "swr";

// SWR cache key for notification settings
const NOTIFICATION_SETTINGS_KEY = "/settings/notifications";

/**
 * Fetcher function for SWR
 */
const fetchNotificationSettings = async (): Promise<NotificationSettings> => {
  try {
    return await backendApi.settings.getNotifications();
  } catch (error) {
    console.error("[useNotificationSettings] Error fetching settings:", error);
    // Return defaults on error to prevent app crashes
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
};

export interface UseNotificationSettingsReturn {
  /** Current notification settings (with defaults as fallback) */
  settings: NotificationSettings;
  /** Whether settings are currently being loaded */
  isLoading: boolean;
  /** Error if settings failed to load */
  error: Error | undefined;
  /** Update notification settings */
  updateSettings: (
    updates: UpdateNotificationSettingsDto
  ) => Promise<NotificationSettings>;
  /** Update a single setting */
  updateSetting: <K extends keyof UpdateNotificationSettingsDto>(
    key: K,
    value: UpdateNotificationSettingsDto[K]
  ) => Promise<NotificationSettings>;
  /** Refresh settings from server */
  refresh: () => Promise<void>;
}

/**
 * Hook to manage user notification settings
 */
export function useNotificationSettings(): UseNotificationSettingsReturn {
  // Only fetch settings if user is authenticated
  const isAuthenticated = TokenManager.isAccessTokenValid();

  const { data, error, isLoading, mutate } = useSWR<NotificationSettings>(
    // Use null key to disable fetching when not authenticated
    isAuthenticated ? NOTIFICATION_SETTINGS_KEY : null,
    fetchNotificationSettings,
    {
      // Keep settings cached and don't refetch too often
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 60000, // 1 minute deduping
      // Use defaults while loading
      fallbackData: DEFAULT_NOTIFICATION_SETTINGS,
    }
  );

  /**
   * Update multiple notification settings at once
   */
  const updateSettings = useCallback(
    async (
      updates: UpdateNotificationSettingsDto
    ): Promise<NotificationSettings> => {
      // Optimistic update
      const optimisticData: NotificationSettings = {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...data,
        ...updates,
      };

      try {
        // Update optimistically, then revalidate
        const result = await mutate(
          async () => {
            return await backendApi.settings.updateNotifications(updates);
          },
          {
            optimisticData,
            rollbackOnError: true,
            revalidate: false, // We already have the server response
          }
        );

        return result ?? optimisticData;
      } catch (error) {
        console.error(
          "[useNotificationSettings] Error updating settings:",
          error
        );
        throw error;
      }
    },
    [data, mutate]
  );

  /**
   * Update a single notification setting
   */
  const updateSetting = useCallback(
    async <K extends keyof UpdateNotificationSettingsDto>(
      key: K,
      value: UpdateNotificationSettingsDto[K]
    ): Promise<NotificationSettings> => {
      return updateSettings({ [key]: value } as UpdateNotificationSettingsDto);
    },
    [updateSettings]
  );

  /**
   * Force refresh settings from server
   */
  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    settings: data ?? DEFAULT_NOTIFICATION_SETTINGS,
    isLoading,
    error,
    updateSettings,
    updateSetting,
    refresh,
  };
}

/**
 * Hook to get just the browser notification enabled state
 * Useful for components that only need to check this one setting
 */
export function useBrowserNotificationsEnabled(): boolean {
  const { settings } = useNotificationSettings();
  return settings.browserNotificationsEnabled;
}

/**
 * Hook to get just the sound settings
 * Useful for the notification sound hook
 */
export function useSoundSettings(): { enabled: boolean; volume: number } {
  const { settings } = useNotificationSettings();
  return {
    enabled: settings.soundEnabled,
    volume: settings.soundVolume,
  };
}
