"use client";

import { SettingsCategory, SettingsPage } from "@/components/settings";
import { AiConfigSettings } from "@/components/settings/ai-config-settings";
import { AiDefaultsSettings } from "@/components/settings/ai-defaults-settings";
import { SystemAiPromptsSettings } from "@/components/settings/system-ai-prompts-settings";
import { useTranslations } from "next-intl";

/**
 * AI Settings Page
 *
 * Provides comprehensive AI configuration options including:
 * - Default AI behavior for new chats (AI Replies & AI Paused switches)
 * - Default AI style settings (tone, style, formality)
 * - Rate limiting and response limits
 * - Language preferences
 * - Template behavior settings
 * - System AI Prompts (for system admins only)
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
      {/* Default AI Behavior for New Chats */}
      <SettingsCategory
        title={t("defaultsCategory")}
        description={t("defaultsCategoryDescription")}
      >
        <div className="-mx-6 -my-4">
          <AiDefaultsSettings variant="embedded" />
        </div>
      </SettingsCategory>

      {/* AI Style & Behavior Configuration */}
      <SettingsCategory
        title={t("defaultBehaviorCategory")}
        description={t("defaultBehaviorDescription")}
      >
        <div className="-mx-6 -my-4">
          <AiConfigSettings variant="embedded" />
        </div>
      </SettingsCategory>

      {/* System AI Prompts (Only visible to system admins) */}
      <SettingsCategory
        title={t("systemPromptsCategory")}
        description={t("systemPromptsCategoryDescription")}
      >
        <div className="-mx-6 -my-4">
          <SystemAiPromptsSettings variant="embedded" />
        </div>
      </SettingsCategory>
    </SettingsPage>
  );
}
