"use client";

import { ChatAIControls } from "@/components/chat-ai-controls";
import { HandoffBanner } from "@/components/handoff-banner";
import { Button } from "@/components/ui/button";
import { useHandoff } from "@/hooks/use-handoff";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Chat } from "../types";

interface ChatHeaderProps {
  chat: Chat;
  onSearchClick?: () => void;
  isSearchOpen?: boolean;
}

export function ChatHeader({
  chat,
  onSearchClick,
  isSearchOpen,
}: ChatHeaderProps) {
  const t = useTranslations("chats.search");
  const {
    handoffStatus,
    isLoading,
    isAIPaused,
    isAwaitingHandoff,
    pauseAI,
    resumeAI,
    requestHandoff,
    resolveHandoff,
    refetch,
  } = useHandoff(chat.chatId);

  const handleToggleAI = async (shouldEnable: boolean) => {
    // shouldEnable = true means user wants AI enabled (not paused)
    // shouldEnable = false means user wants AI disabled (paused)
    if (shouldEnable) {
      await resumeAI();
    } else {
      await pauseAI();
    }
  };

  const handleRequestHandoff = async () => {
    await requestHandoff("Manual handoff requested by user");
  };

  const handleResolveHandoff = async () => {
    await resolveHandoff(true, "Resolved by user");
  };

  const handleConfigSaved = () => {
    // Refresh the AI status after configuration is saved
    refetch();
  };

  // Determine if we should show the banner
  const showBanner =
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
          {/* AI Controls */}
          <ChatAIControls
            chatId={chat.chatId}
            chatName={chat.participantName || chat.participantPhone}
            isAIPaused={isAIPaused ?? true}
            hasActiveHandoff={isAwaitingHandoff}
            handoffPriority={handoffStatus?.priority}
            isLoading={isLoading}
            onToggleAI={handleToggleAI}
            onRequestHandoff={handleRequestHandoff}
            onResolveHandoff={handleResolveHandoff}
            onConfigSaved={handleConfigSaved}
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
        </div>
      </div>

      {/* Handoff banner - shown when intervention is needed */}
      {showBanner && (
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
          onResumeAI={resumeAI}
          onPauseAI={pauseAI}
          className="mx-4 mt-2"
        />
      )}
    </div>
  );
}
