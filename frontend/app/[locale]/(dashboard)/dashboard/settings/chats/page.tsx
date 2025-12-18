"use client";

import {
  SettingsCategory,
  SettingsPage,
  SwitchSetting,
} from "@/components/settings";
import { useNotificationPermissionFlow } from "@/hooks/use-browser-notifications";
import { useNotification } from "@/hooks/use-notification";
import { useNotificationSettings } from "@/hooks/use-notification-settings";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

export default function ChatsSettingsPage() {
  const t = useTranslations("settingsChats");
  const { addNotification } = useNotification();

  // Get notification settings from backend
  const { settings, isLoading, updateSetting } = useNotificationSettings();

  // Browser notification permission flow
  const { isGranted, isDenied, isPending, isSupported, enableNotifications } =
    useNotificationPermissionFlow();

  // Local state for optimistic UI updates
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] =
    useState(settings.browserNotificationsEnabled);
  const [soundEnabled, setSoundEnabled] = useState(settings.soundEnabled);

  // Sync local state with server settings
  useEffect(() => {
    setBrowserNotificationsEnabled(settings.browserNotificationsEnabled);
    setSoundEnabled(settings.soundEnabled);
  }, [settings.browserNotificationsEnabled, settings.soundEnabled]);

  /**
   * Handle browser notifications toggle
   * - If enabling and permission not granted, request permission first
   * - Only enable if permission is granted
   */
  const handleBrowserNotificationsChange = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        // Try to enable notifications (will request permission if needed)
        const granted = await enableNotifications();

        if (granted) {
          // Permission granted, enable the setting
          setBrowserNotificationsEnabled(true);
          await updateSetting("browserNotificationsEnabled", true);
          addNotification(t("notificationsEnabled"), "success");
        } else if (isDenied) {
          // Permission was denied - show helpful message
          addNotification(t("notificationsDeniedMessage"), "warning", 6000);
          setBrowserNotificationsEnabled(false);
        } else {
          // Permission was not granted (user dismissed or not supported)
          setBrowserNotificationsEnabled(false);
        }
      } else {
        // Disabling - no permission needed
        setBrowserNotificationsEnabled(false);
        await updateSetting("browserNotificationsEnabled", false);
      }
    },
    [enableNotifications, isDenied, updateSetting, addNotification, t]
  );

  /**
   * Handle sound toggle
   */
  const handleSoundChange = useCallback(
    async (enabled: boolean) => {
      setSoundEnabled(enabled);
      await updateSetting("soundEnabled", enabled);
    },
    [updateSetting]
  );

  return (
    <SettingsPage title={t("title")} description={t("description")}>
      {/* Messages Category */}
      <SettingsCategory title={t("messagesCategory")}>
        <SwitchSetting
          id="message-notifications"
          title={t("messageNotifications")}
          description={
            isDenied
              ? t("messageNotificationsDescDenied")
              : t("messageNotificationsDesc")
          }
          checked={browserNotificationsEnabled}
          onCheckedChange={handleBrowserNotificationsChange}
          disabled={isLoading || isPending || !isSupported}
        />
      </SettingsCategory>

      {/* Notification Tones Category */}
      <SettingsCategory title={t("notificationTonesCategory")}>
        <SwitchSetting
          id="incoming-sounds"
          title={t("incomingSounds")}
          description={t("incomingSoundsDesc")}
          checked={soundEnabled}
          onCheckedChange={handleSoundChange}
          disabled={isLoading}
        />
      </SettingsCategory>
    </SettingsPage>
  );
}
