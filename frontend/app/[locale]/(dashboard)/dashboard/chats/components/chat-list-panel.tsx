"use client";

/**
 * ChatListPanel
 *
 * Isolated left panel component for the chats page.
 * Manages its own state for search, labels, and archive.
 *
 * Wrapped in React.memo to prevent re-renders when right panel state
 * changes (e.g., new messages, reactions, AI events). This is a key
 * performance optimization — the chat list only re-renders when the
 * chat data itself changes.
 */

import { Archive, Loader2, MessageSquare, Search, Tag, X } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useCallback, useState } from "react";

import {
  ArchivedChat,
  ArchivedChatsDrawer,
} from "@/components/archived-chats-drawer";
import { ChatsSenderSection } from "@/components/chats-sender-section";
import {
  ChatSelectionBanner,
  LabelFilterChips,
  LabelSelectorModal,
  LabelsManagementPanel,
} from "@/components/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNotification } from "@/hooks/use-notification";
import { backendApi } from "@/lib/api/endpoints";

import { useChatSearch, useLabelsIntegration } from "../hooks";
import type { Chat, Sender } from "../types";
import { ChatSearchResults } from "./chat-search-results";
import { ChatListSkeleton } from "./chat-skeletons";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatListPanelProps {
  /** All loaded chats */
  chats: Chat[];
  /** Sender accounts for grouping */
  senders: Sender[];
  /** Currently selected chat ID */
  selectedChatId: string | null;
  /** Whether chats are loading */
  loading: boolean;
  /** Select a chat */
  onSelectChat: (chatId: string) => void;
  /** Stable setter from useState — for archive/unarchive operations */
  setSelectedChatId: React.Dispatch<React.SetStateAction<string | null>>;
  /** Stable setter from useState — for archive/unarchive operations */
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
  /** Refetch chats from server */
  refetchChats: () => Promise<void>;
  /** Open delete confirmation dialog (shared with right panel) */
  onDeleteChat: (chatId: string, participantName?: string) => void;
  /** Notify parent when an archived chat is selected for viewing */
  onSelectArchivedChat: (chat: ArchivedChat) => void;
  /** Last deleted chat ID — lets archive drawer react to deletions */
  lastDeletedChatId: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ChatListPanel = React.memo(function ChatListPanel({
  chats,
  senders,
  selectedChatId,
  loading,
  onSelectChat,
  setSelectedChatId,
  setChats,
  refetchChats,
  onDeleteChat,
  onSelectArchivedChat,
  lastDeletedChatId,
}: ChatListPanelProps) {
  const t = useTranslations("chats");
  const { addNotification } = useNotification();

  // -------------------------------------------------------------------------
  // Internal state
  // -------------------------------------------------------------------------

  const [isArchivedDrawerOpen, setIsArchivedDrawerOpen] = useState(false);

  // -------------------------------------------------------------------------
  // Internal hooks
  // -------------------------------------------------------------------------

  const chatSearch = useChatSearch({ debounceMs: 200, minChars: 1 });

  const labelsIntegration = useLabelsIntegration({
    chats,
    selectedChatId,
    onChatsRefetch: refetchChats,
  });

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleArchiveChat = useCallback(
    async (chatId: string) => {
      try {
        await backendApi.chats.archive(chatId);
        setChats((prev) => prev.filter((c) => c.chatId !== chatId));
        if (selectedChatId === chatId) {
          setSelectedChatId(null);
        }
        addNotification(t("chatList.chatArchived"), "success");
      } catch (error) {
        console.error("Failed to archive chat:", error);
        addNotification(t("chatList.archiveFailed"), "error");
      }
    },
    [selectedChatId, setChats, setSelectedChatId, addNotification, t],
  );

  const handleUnarchiveChat = useCallback(
    async (chatId: string) => {
      try {
        await backendApi.chats.unarchive(chatId);
        const data = await backendApi.whatsapp.getChats(0, 50);
        if (Array.isArray(data)) {
          setChats(data);
        }
        addNotification(t("chatList.chatUnarchived"), "success");
      } catch (error) {
        console.error("Failed to unarchive chat:", error);
        addNotification(t("chatList.unarchiveFailed"), "error");
        throw error;
      }
    },
    [setChats, addNotification, t],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="w-full lg:w-80 border-r flex flex-col bg-muted/30 relative">
      {/* Bulk Selection Banner */}
      {labelsIntegration.selectionMode && (
        <ChatSelectionBanner
          selectedCount={labelsIntegration.selectedChatIds.length}
          onCancel={labelsIntegration.exitSelectionMode}
          onLabel={labelsIntegration.openLabelModal}
        />
      )}

      {/* Search Input */}
      <div className="p-4 border-b">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("searchChats")}
              value={chatSearch.searchQuery}
              onChange={(e) => chatSearch.handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-9"
            />
            {chatSearch.searchQuery && (
              <button
                onClick={chatSearch.clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                {chatSearch.isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
              </button>
            )}
          </div>

          {/* Archived Chats Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsArchivedDrawerOpen(true)}
            title={t("chatList.archivedChats")}
            className="flex-shrink-0"
          >
            <Archive className="h-4 w-4" />
          </Button>

          {/* Labels Management Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={labelsIntegration.openManagementPanel}
                  className="flex-shrink-0"
                >
                  <Tag className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("chatList.manageLabels")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Label Filter */}
        <div className="mt-2 flex items-center gap-2">
          <LabelFilterChips
            labels={labelsIntegration.labels}
            selectedLabelId={labelsIntegration.selectedLabelFilter}
            onSelectLabel={labelsIntegration.setSelectedLabelFilter}
          />
          {labelsIntegration.selectedLabelFilter && (
            <span className="text-xs text-muted-foreground">
              {labelsIntegration.filteredChats.length} {t("chatList.chats")}
            </span>
          )}
        </div>

        {/* Search results count */}
        {chatSearch.isSearchMode && !chatSearch.isSearching && (
          <p className="text-xs text-muted-foreground mt-2">
            {chatSearch.totalResults === 0
              ? t("chatList.noResultsFor", {
                  query: chatSearch.searchQuery,
                })
              : t("chatList.resultsCount", {
                  count: chatSearch.totalResults,
                })}
          </p>
        )}
      </div>

      {/* Chat List Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && !chatSearch.isSearchMode ? (
          <ChatListSkeleton />
        ) : chatSearch.isSearchMode ? (
          /* Search Results Mode */
          chatSearch.searchResults.length === 0 && !chatSearch.isSearching ? (
            <div className="flex flex-col items-center justify-center h-full p-4 text-center">
              <Search className="h-12 w-12 text-muted-foreground mb-3 opacity-40" />
              <p className="text-muted-foreground">
                {t("chatList.noResultsFor", {
                  query: chatSearch.searchQuery,
                })}
              </p>
            </div>
          ) : (
            <ChatSearchResults
              results={chatSearch.searchResults}
              senders={senders}
              selectedChatId={selectedChatId}
              onSelectChat={(chatId) => {
                onSelectChat(chatId);
              }}
              searchQuery={chatSearch.searchQuery}
              hasMore={chatSearch.hasMore}
              onLoadMore={chatSearch.loadMore}
              isLoading={chatSearch.isSearching}
            />
          )
        ) : labelsIntegration.filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            {labelsIntegration.selectedLabelFilter ? (
              <>
                <Tag className="h-12 w-12 text-muted-foreground mb-3 opacity-40" />
                <p className="text-muted-foreground">
                  {t("chatList.noChatsWithLabel")}
                </p>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => labelsIntegration.setSelectedLabelFilter(null)}
                  className="mt-2"
                >
                  {t("chatList.clearFilter")}
                </Button>
              </>
            ) : (
              <>
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-3 opacity-40" />
                <p className="text-muted-foreground">{t("noChats")}</p>
              </>
            )}
          </div>
        ) : (
          /* Normal Chat List Mode */
          senders.map((sender) => {
            const senderChats = labelsIntegration.filteredChats.filter(
              (c) => c.senderId === sender.id,
            );
            if (senderChats.length === 0) return null;
            return (
              <ChatsSenderSection
                key={sender.id}
                senderPhoneNumber={sender.phoneNumber}
                senderDisplayName={sender.displayName}
                chats={senderChats}
                selectedChatId={selectedChatId}
                onSelectChat={onSelectChat}
                onArchiveChat={handleArchiveChat}
                onDeleteChat={onDeleteChat}
                onLabelChat={labelsIntegration.enterSelectionMode}
                selectionMode={labelsIntegration.selectionMode}
                selectedChatIds={labelsIntegration.selectedChatIds}
                onToggleChatSelection={labelsIntegration.toggleChatSelection}
              />
            );
          })
        )}
      </div>

      {/* Archived Chats Drawer */}
      <ArchivedChatsDrawer
        isOpen={isArchivedDrawerOpen}
        onClose={() => setIsArchivedDrawerOpen(false)}
        onUnarchiveChat={handleUnarchiveChat}
        onDeleteChat={onDeleteChat}
        onSelectArchivedChat={onSelectArchivedChat}
        selectedChatId={selectedChatId}
        deletedChatId={lastDeletedChatId}
        senders={senders}
      />

      {/* Labels Management Panel */}
      <LabelsManagementPanel
        isOpen={labelsIntegration.managementPanelOpen}
        onClose={labelsIntegration.closeManagementPanel}
        labels={labelsIntegration.labels}
        isLoading={labelsIntegration.isLoadingLabels}
        onCreateLabel={async (name, color, emoji) => {
          await labelsIntegration.handleCreateLabel(name, color, emoji);
        }}
        onUpdateLabel={labelsIntegration.handleUpdateLabel}
        onDeleteLabel={labelsIntegration.handleDeleteLabel}
        chatsWithLabel={labelsIntegration.chatsWithViewingLabel}
        isLoadingChats={labelsIntegration.isLoadingChatsWithLabel}
        onViewLabelChats={labelsIntegration.handleViewLabelChats}
        onAddLabelsToChats={labelsIntegration.handleAddLabelsToChats}
        onRemoveLabelFromChats={labelsIntegration.handleRemoveLabelFromChats}
      />

      {/* Label Selector Modal */}
      <LabelSelectorModal
        open={labelsIntegration.labelModalOpen}
        onOpenChange={(open) => {
          if (!open) labelsIntegration.closeLabelModal();
        }}
        labels={labelsIntegration.labels}
        selectedLabelIds={labelsIntegration.selectedLabelsInModal}
        isLoading={false}
        onSelectionChange={labelsIntegration.handleLabelSelectionChange}
        onCreateLabel={labelsIntegration.handleCreateLabel}
        onConfirm={labelsIntegration.handleApplyLabels}
        title={`Label ${labelsIntegration.labelModalChatIds.length} chat${labelsIntegration.labelModalChatIds.length !== 1 ? "s" : ""}`}
        description="Selected labels will be added to all selected chats"
      />
    </div>
  );
});
