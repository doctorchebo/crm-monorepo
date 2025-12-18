"use client";

import {
  SettingsCategory,
  SettingsPage,
  SwitchSetting,
} from "@/components/settings";
import { useTranslations } from "next-intl";
import { useState } from "react";

export default function ChatsSettingsPage() {
  const t = useTranslations("settingsChats");

  // State for message settings
  const [messageNotifications, setMessageNotifications] = useState(true);

  // State for notification tones settings
  const [incomingSounds, setIncomingSounds] = useState(true);

  return (
    <SettingsPage title={t("title")} description={t("description")}>
      {/* Messages Category */}
      <SettingsCategory title={t("messagesCategory")}>
        <SwitchSetting
          id="message-notifications"
          title={t("messageNotifications")}
          description={t("messageNotificationsDesc")}
          checked={messageNotifications}
          onCheckedChange={setMessageNotifications}
        />
      </SettingsCategory>

      {/* Notification Tones Category */}
      <SettingsCategory title={t("notificationTonesCategory")}>
        <SwitchSetting
          id="incoming-sounds"
          title={t("incomingSounds")}
          description={t("incomingSoundsDesc")}
          checked={incomingSounds}
          onCheckedChange={setIncomingSounds}
        />
      </SettingsCategory>
    </SettingsPage>
  );
}
