"use client";

import { SettingsCategory, SettingsPage } from "@/components/settings";
import { AiConfigSettings } from "@/components/settings/ai-config-settings";
import { useTranslations } from "next-intl";

/**
 * AI Settings Page
 *
 * Provides comprehensive AI configuration options including:
 * - Default AI behavior settings (tone, style, formality)
 * - Rate limiting and response limits
 * - Language preferences
 * - Template behavior settings
 *
 * These settings serve as defaults that can be overridden:
 * 1. Per workflow stage (via Kanban board stage settings)
 * 2. Per individual chat (via AI Settings modal in chat header)
 *
 * Priority order: Chat Override > Stage Settings > User Defaults > System Defaults
 */
export default function AiSettingsPage() {
  const t = useTranslations("settingsAi");

  return (
    <SettingsPage title={t("title")} description={t("description")}>
      <SettingsCategory
        title={t("defaultBehaviorCategory")}
        description={t("defaultBehaviorDescription")}
      >
        <div className="-mx-6 -my-4">
          <AiConfigSettings variant="embedded" />
        </div>
      </SettingsCategory>
    </SettingsPage>
  );
}
