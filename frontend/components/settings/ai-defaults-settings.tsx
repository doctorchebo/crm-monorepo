"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAiConfig } from "@/hooks/use-ai-config";
import type { UpdateAiConfigurationDto } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import {
  Bot,
  HelpCircle,
  MessageCircleQuestion,
  PauseCircle,
  PlayCircle,
  Power,
  Sparkles,
  Waypoints,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

interface AiDefaultsSettingsProps {
  /**
   * Display variant:
   * - "card" (default): Wrapped in a Card component with header
   * - "embedded": No card wrapper, for use inside SettingsCategory
   */
  variant?: "card" | "embedded";
}

// Simple toast replacement
const toast = {
  success: (msg: string) => console.log(`✓ ${msg}`),
  error: (msg: string) => console.error(`✗ ${msg}`),
};

/**
 * AI Defaults Settings Component
 *
 * Allows users to configure default AI behavior for new chats:
 * - AI Replies: Master switch to enable/disable AI for new chats
 * - AI Paused: Whether AI starts paused when enabled (requires AI Replies to be ON)
 *
 * These settings apply to all new chats. Individual chats can override these defaults.
 */
export function AiDefaultsSettings({
  variant = "card",
}: AiDefaultsSettingsProps) {
  const t = useTranslations("settingsAi");
  const { userConfig, loadingUserConfig, updateUserConfig } = useAiConfig();

  const [saving, setSaving] = useState(false);

  const handleUpdate = useCallback(
    async (field: keyof UpdateAiConfigurationDto, value: unknown) => {
      try {
        setSaving(true);
        await updateUserConfig({ [field]: value });
        toast.success(t("settingsSaved"));
      } catch {
        toast.error(t("settingsError"));
      } finally {
        setSaving(false);
      }
    },
    [updateUserConfig, t],
  );

  /**
   * Handle AI Replies toggle
   * When turning OFF, AI Paused setting becomes irrelevant
   */
  const handleAiRepliesToggle = useCallback(
    async (enabled: boolean) => {
      await handleUpdate("defaultAiRepliesEnabled", enabled);
    },
    [handleUpdate],
  );

  /**
   * Handle AI Paused toggle
   * Only effective when AI Replies is enabled
   */
  const handleAiPausedToggle = useCallback(
    async (paused: boolean) => {
      await handleUpdate("defaultAiPaused", paused);
    },
    [handleUpdate],
  );

  /**
   * Handle Conversation Strategy change
   */
  const handleConversationStrategyChange = useCallback(
    async (strategy: "direct" | "qualifying" | "guided") => {
      await handleUpdate("conversationStrategy", strategy);
    },
    [handleUpdate],
  );

  // Loading state
  if (loadingUserConfig) {
    const loadingContent = (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );

    if (variant === "embedded") {
      return loadingContent;
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            {t("defaultsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>{loadingContent}</CardContent>
      </Card>
    );
  }

  // Error state
  if (!userConfig) {
    const errorContent = (
      <p className="text-muted-foreground py-4">{t("loadError")}</p>
    );

    if (variant === "embedded") {
      return errorContent;
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            {t("defaultsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>{errorContent}</CardContent>
      </Card>
    );
  }

  const aiRepliesEnabled = userConfig.defaultAiRepliesEnabled ?? false;
  const aiPaused = userConfig.defaultAiPaused ?? true;
  const conversationStrategy = userConfig.conversationStrategy ?? "qualifying";

  const settingsContent = (
    <div className="space-y-6">
      {/* AI Replies Master Switch */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "p-2 rounded-lg",
              aiRepliesEnabled
                ? "bg-green-100 dark:bg-green-900/30"
                : "bg-gray-100 dark:bg-gray-800",
            )}
          >
            <Power
              className={cn(
                "h-5 w-5",
                aiRepliesEnabled
                  ? "text-green-600 dark:text-green-400"
                  : "text-gray-400",
              )}
            />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Label className="text-base font-medium">
                {t("aiRepliesLabel")}
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>{t("aiRepliesTooltip")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("aiRepliesDescription")}
            </p>
          </div>
        </div>
        <Switch
          checked={aiRepliesEnabled}
          onCheckedChange={handleAiRepliesToggle}
          disabled={saving}
        />
      </div>

      {/* AI Paused Switch - Only enabled when AI Replies is ON */}
      <div
        className={cn(
          "flex items-center justify-between transition-opacity",
          !aiRepliesEnabled && "opacity-50",
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "p-2 rounded-lg",
              aiRepliesEnabled && !aiPaused
                ? "bg-violet-100 dark:bg-violet-900/30"
                : "bg-gray-100 dark:bg-gray-800",
            )}
          >
            {aiRepliesEnabled && !aiPaused ? (
              <PlayCircle className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            ) : (
              <PauseCircle className="h-5 w-5 text-gray-400" />
            )}
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Label
                className={cn(
                  "text-base font-medium",
                  !aiRepliesEnabled && "text-muted-foreground",
                )}
              >
                {t("aiPausedLabel")}
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>{t("aiPausedTooltip")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-sm text-muted-foreground">
              {!aiRepliesEnabled
                ? t("aiPausedDisabledHint")
                : aiPaused
                  ? t("aiPausedOnDescription")
                  : t("aiPausedOffDescription")}
            </p>
          </div>
        </div>
        <Switch
          checked={!aiPaused}
          onCheckedChange={(active) => handleAiPausedToggle(!active)}
          disabled={saving || !aiRepliesEnabled}
        />
      </div>

      {/* Conversation Strategy - Only shown when AI Replies is ON */}
      <div
        className={cn(
          "space-y-4 transition-opacity",
          !aiRepliesEnabled && "opacity-50",
        )}
      >
        <div className="flex items-center gap-2">
          <Label
            className={cn(
              "text-base font-medium",
              !aiRepliesEnabled && "text-muted-foreground",
            )}
          >
            {t("conversationStrategyLabel")}
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>{t("conversationStrategyTooltip")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("conversationStrategyDescription")}
        </p>

        <RadioGroup
          value={conversationStrategy}
          onValueChange={(value) =>
            handleConversationStrategyChange(
              value as "direct" | "qualifying" | "guided",
            )
          }
          disabled={saving || !aiRepliesEnabled}
          className="grid gap-3"
        >
          {/* Direct Strategy */}
          <div
            className={cn(
              "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all",
              conversationStrategy === "direct"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50",
              !aiRepliesEnabled && "cursor-not-allowed",
            )}
          >
            <RadioGroupItem
              value="direct"
              id="strategy-direct"
              className="mt-1"
            />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-500" />
                <Label
                  htmlFor="strategy-direct"
                  className="font-medium cursor-pointer"
                >
                  {t("strategyDirectLabel")}
                </Label>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("strategyDirectDescription")}
              </p>
            </div>
          </div>

          {/* Qualifying Strategy */}
          <div
            className={cn(
              "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all",
              conversationStrategy === "qualifying"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50",
              !aiRepliesEnabled && "cursor-not-allowed",
            )}
          >
            <RadioGroupItem
              value="qualifying"
              id="strategy-qualifying"
              className="mt-1"
            />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <MessageCircleQuestion className="h-4 w-4 text-violet-500" />
                <Label
                  htmlFor="strategy-qualifying"
                  className="font-medium cursor-pointer"
                >
                  {t("strategyQualifyingLabel")}
                </Label>
                <span className="text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full">
                  {t("recommended")}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("strategyQualifyingDescription")}
              </p>
            </div>
          </div>

          {/* Guided Strategy */}
          <div
            className={cn(
              "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all",
              conversationStrategy === "guided"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50",
              !aiRepliesEnabled && "cursor-not-allowed",
            )}
          >
            <RadioGroupItem
              value="guided"
              id="strategy-guided"
              className="mt-1"
            />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Waypoints className="h-4 w-4 text-emerald-500" />
                <Label
                  htmlFor="strategy-guided"
                  className="font-medium cursor-pointer"
                >
                  {t("strategyGuidedLabel")}
                </Label>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("strategyGuidedDescription")}
              </p>
            </div>
          </div>
        </RadioGroup>
      </div>

      {/* Status Summary */}
      <div
        className={cn(
          "p-4 rounded-lg border",
          aiRepliesEnabled && !aiPaused
            ? "bg-violet-50 dark:bg-violet-900/10 border-violet-200 dark:border-violet-800"
            : aiRepliesEnabled
              ? "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800"
              : "bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700",
        )}
      >
        <div className="flex items-center gap-2">
          <Bot
            className={cn(
              "h-5 w-5",
              aiRepliesEnabled && !aiPaused
                ? "text-violet-600 dark:text-violet-400"
                : aiRepliesEnabled
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-gray-400",
            )}
          />
          <span className="text-sm font-medium">
            {!aiRepliesEnabled
              ? t("statusSummaryOff")
              : aiPaused
                ? t("statusSummaryPaused")
                : t("statusSummaryActive")}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {!aiRepliesEnabled
            ? t("statusSummaryOffDetail")
            : aiPaused
              ? t("statusSummaryPausedDetail")
              : t("statusSummaryActiveDetail")}
        </p>
      </div>
    </div>
  );

  // Return embedded variant (just the content)
  if (variant === "embedded") {
    return <div className="p-6">{settingsContent}</div>;
  }

  // Return card variant (default)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          {t("defaultsTitle")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("defaultsDescription")}
        </p>
      </CardHeader>
      <CardContent>{settingsContent}</CardContent>
    </Card>
  );
}
