"use client";

import { ChatAIControls } from "@/components/chat-ai-controls";
import { AssigneeSelector } from "@/components/chat/assignee-selector";
import { HandoffBanner } from "@/components/handoff-banner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHandoff } from "@/hooks/use-handoff";
import { PanelRightClose, PanelRightOpen, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import type { Chat } from "../types";

interface ChatHeaderProps {
  chat: Chat;
  onSearchClick?: () => void;
  isSearchOpen?: boolean;
  onAIToggle?: (enabled: boolean) => Promise<void>;
  isRateLimited?: boolean;
  onConfigSaved?: () => void;
  /** Whether the sidebar panel is expanded */
  isSidebarExpanded?: boolean;
  /** Callback when sidebar toggle is clicked */
  onSidebarToggle?: () => void;
}

export function ChatHeader({
  chat,
  onSearchClick,
  isSearchOpen,
  onAIToggle,
  isRateLimited,
  onConfigSaved: parentOnConfigSaved,
  isSidebarExpanded,
  onSidebarToggle,
}: ChatHeaderProps) {
  const t = useTranslations("chats.search");
  const tSidebar = useTranslations("chats.sidebar");
  const {
    handoffStatus,
    aiStatus,
    isLoading,
    isAIPaused,
    isAwaitingHandoff,
    pauseAI,
    resumeAI,
    requestHandoff,
    resolveHandoff,
    refetch,
  } = useHandoff(chat.chatId);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  /**
   * Handle AI toggle.
   * When enabling AI, resume it. When disabling, pause it.
   */
  const handleToggleAI = useCallback(
    async (shouldEnable: boolean) => {
      try {
        if (shouldEnable) {
          if (onAIToggle) {
            await onAIToggle(true);
          } else {
            await resumeAI();
          }
        } else {
          if (onAIToggle) {
            await onAIToggle(false);
          } else {
            await pauseAI();
          }
        }
        refetch();
      } catch (error) {
        console.error("Failed to toggle AI:", error);
      }
    },
    [onAIToggle, pauseAI, resumeAI, refetch],
  );

  const handleRequestHandoff = async () => {
    await requestHandoff("Manual handoff requested by user");
  };

  const handleResolveHandoff = async () => {
    await resolveHandoff(true, "Resolved by user (AI Resumed)");
  };

  const handleResolveManual = async () => {
    // Resolve handoff but keep AI paused (Manual Mode)
    await resolveHandoff(false, "Resolved by user (Manual Mode)");
  };

  const handleConfigSaved = () => {
    // Refresh the AI status after configuration is saved
    refetch();
    // Notify parent if handler provided (to clear rate limit)
    parentOnConfigSaved?.();
  };

  // Determine if we should show the banner
  const showHandoffBanner =
    handoffStatus &&
    handoffStatus.awaitingHandoff &&
    handoffStatus.status !== "resolved";

  return (
    <div className="flex-shrink-0">
      {/* Header bar */}
      <div className="border-b px-6 py-2 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {chat.participantName || chat.participantPhone}
          </h2>
          <p className="text-xs text-muted-foreground">
            {chat.participantPhone}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Assignee Selector */}
          <AssigneeSelector
            chatId={chat.chatId}
            assigneeId={chat.assignedTo}
            teamId={chat.teamId}
          />

          {/* AI Controls */}
          <ChatAIControls
            chatId={chat.chatId}
            chatName={chat.participantName || chat.participantPhone}
            isAIPaused={isAIPaused ?? true}
            hasActiveHandoff={isAwaitingHandoff}
            handoffPriority={handoffStatus?.priority}
            isLoading={isLoading}
            isRateLimited={isRateLimited}
            onToggleAI={handleToggleAI}
            onRequestHandoff={handleRequestHandoff}
            onResolveHandoff={handleResolveHandoff}
            onConfigSaved={handleConfigSaved}
            isConfigModalOpen={isSettingsOpen}
            onOpenConfigModal={setIsSettingsOpen}
            aiConfigEnabled={aiStatus?.aiConfigEnabled ?? false}
          />

          {/* Search button */}
          <Button
            variant={isSearchOpen ? "default" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={onSearchClick}
            title={t("title")}
          >
            <Search className="h-4 w-4" />
            <span className="sr-only">{t("title")}</span>
          </Button>

          {/* Sidebar toggle button - only visible on xl screens where sidebar can be shown */}
          {onSidebarToggle && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hidden xl:flex"
                  onClick={onSidebarToggle}
                >
                  {isSidebarExpanded ? (
                    <PanelRightClose className="h-4 w-4" />
                  ) : (
                    <PanelRightOpen className="h-4 w-4" />
                  )}
                  <span className="sr-only">
                    {isSidebarExpanded
                      ? tSidebar("collapsePanel")
                      : tSidebar("expandPanel")}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isSidebarExpanded
                  ? tSidebar("collapsePanel")
                  : tSidebar("expandPanel")}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Handoff banner - shown when intervention is needed */}
      {showHandoffBanner && (
        <HandoffBanner
          chatId={chat.chatId}
          priority={handoffStatus.priority || "medium"}
          status={handoffStatus.status || "pending"}
          reason={handoffStatus.reason || handoffStatus.handoffReason}
          aiReasoning={handoffStatus.aiReasoning}
          triggeredAt={
            handoffStatus.triggeredAt ||
            handoffStatus.handoffRequestedAt ||
            new Date().toISOString()
          }
          acknowledgedAt={handoffStatus.acknowledgedAt}
          isAIPaused={isAIPaused ?? false}
          onResolve={handleResolveHandoff}
          onResolveManual={handleResolveManual}
          onResumeAI={() => handleToggleAI(true)}
          onPauseAI={pauseAI}
          className="mx-4 mt-2"
        />
      )}
    </div>
  );
}
