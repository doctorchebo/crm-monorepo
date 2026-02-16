"use client";

/**
 * ChatsPage — Thin Orchestrator
 *
 * This page coordinates the two main panels:
 *   - ChatListPanel  (left)  — chat search, labels, archive drawer
 *   - ChatDetailPanel (right) — messages, input, sidebar, modals
 *
 * It owns only cross-cutting concerns:
 *   1. Auth protection
 *   2. Core chat state (useChatState)
 *   3. Socket connection (useChatNotifications)
 *   4. Persistence (selected chat + sidebar tab)
 *   5. Current user identity
 *   6. Archived-chat → effective-chat resolution
 *   7. Delete-chat dialog (shared between panels)
 *
 * By NOT importing message handlers, reactions, pins, AI events, media
 * handlers, etc. at this level, we avoid initialising those hooks until
 * a chat is actually selected (ChatDetailPanel mounts).
 */

import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ArchivedChat } from "@/components/archived-chats-drawer";
import { DeleteChatDialog } from "@/components/dialogs/delete-chat-dialog";
import { useAuthProtection } from "@/hooks/use-auth";
import { useChatNotifications } from "@/hooks/use-chat-notifications";
import { useChatPersistence } from "@/hooks/use-chat-persistence";
import { useNotification } from "@/hooks/use-notification";
import { useSidebarExpanded } from "@/hooks/use-sidebar-expanded";
import { backendApi } from "@/lib/api/endpoints";

import {
  ChatDetailPanel,
  ChatDetailSkeleton,
  ChatEmptyStateSkeleton,
  ChatListPanel,
} from "./components";
import { useChatState } from "./hooks";
import type { Chat } from "./types";

// ---------------------------------------------------------------------------

export default function ChatsPage() {
  const t = useTranslations("chats");
  const { addNotification } = useNotification();

  // Protect this route
  useAuthProtection();

  // -------------------------------------------------------------------------
  // Core state
  // -------------------------------------------------------------------------

  const chatState = useChatState();
  const { socket } = useChatNotifications();

  // Current user
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | undefined>(
    undefined,
  );

  // Archived chat being viewed in right panel
  const [viewedArchivedChat, setViewedArchivedChat] =
    useState<ArchivedChat | null>(null);

  // Delete dialog
  const [deleteChatId, setDeleteChatId] = useState<string | null>(null);
  const [deleteChatName, setDeleteChatName] = useState<string | undefined>(
    undefined,
  );
  const [lastDeletedChatId, setLastDeletedChatId] = useState<string | null>(
    null,
  );

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  const chatPersistence = useChatPersistence({
    onRestoreChatId: useCallback(
      (chatId: string) => chatState.setSelectedChatId(chatId),
      [chatState.setSelectedChatId],
    ),
  });

  const {
    isExpanded: isSidebarExpanded,
    toggle: toggleSidebar,
    isHydrated: isSidebarHydrated,
  } = useSidebarExpanded();

  // Persist chat selection whenever it changes
  useEffect(() => {
    chatPersistence.persistChatId(chatState.selectedChatId);
  }, [chatState.selectedChatId, chatPersistence.persistChatId]);

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  // Fetch current user once on mount
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const user = await backendApi.user.getProfile();
        setCurrentUserId(user.id);
        setCurrentUserName(user.name || user.email);
      } catch (error) {
        console.error("Failed to fetch current user:", error);
      }
    };
    fetchCurrentUser();
  }, []);

  // -------------------------------------------------------------------------
  // Computed: effective selected chat (regular or archived)
  // -------------------------------------------------------------------------

  const effectiveSelectedChat = useMemo(() => {
    if (
      viewedArchivedChat &&
      chatState.selectedChatId === viewedArchivedChat.chatId
    ) {
      return {
        ...viewedArchivedChat,
        unreadCount: viewedArchivedChat.unreadCount ?? 0,
        isActive: true,
        isArchived: true,
      } as Chat;
    }
    if (
      viewedArchivedChat &&
      chatState.selectedChatId !== viewedArchivedChat.chatId
    ) {
      setViewedArchivedChat(null);
    }
    return chatState.selectedChat;
  }, [viewedArchivedChat, chatState.selectedChatId, chatState.selectedChat]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleSelectArchivedChat = useCallback(
    (archivedChat: ArchivedChat) => {
      setViewedArchivedChat(archivedChat);
      chatState.setSelectedChatId(archivedChat.chatId);
    },
    [chatState],
  );

  const handleDeleteChatClick = useCallback(
    (chatId: string, participantName?: string) => {
      const chat = chatState.chats.find((c) => c.chatId === chatId);
      const archivedChat =
        viewedArchivedChat?.chatId === chatId ? viewedArchivedChat : null;
      const effectiveChat = chat || archivedChat;
      setDeleteChatId(chatId);
      setDeleteChatName(
        participantName ||
          effectiveChat?.participantName ||
          effectiveChat?.participantPhone,
      );
    },
    [chatState.chats, viewedArchivedChat],
  );

  const handleConfirmDeleteChat = useCallback(async () => {
    if (!deleteChatId) return;
    try {
      await backendApi.chats.delete(deleteChatId);
      setLastDeletedChatId(deleteChatId);
      setTimeout(() => setLastDeletedChatId(null), 100);
      chatState.setChats((prev) =>
        prev.filter((c) => c.chatId !== deleteChatId),
      );
      if (chatState.messagesCacheRef.current.has(deleteChatId)) {
        chatState.messagesCacheRef.current.delete(deleteChatId);
      }
      if (chatState.selectedChatId === deleteChatId) {
        chatState.setSelectedChatId(null);
        chatState.setMessages([]);
        chatState.setMessageCount(0);
      }
      if (viewedArchivedChat?.chatId === deleteChatId) {
        setViewedArchivedChat(null);
      }
      setDeleteChatId(null);
      setDeleteChatName(undefined);
      addNotification(t("chatList.chatDeleted"), "success");
    } catch (error) {
      console.error("Failed to delete chat:", error);
      addNotification(t("chatList.deleteFailed"), "error");
    }
  }, [deleteChatId, chatState, viewedArchivedChat, t, addNotification]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page Header */}
      <div className="border-b px-6 py-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-xs text-muted-foreground">{t("description")}</p>
        </div>
      </div>

      {/* Error Banner */}
      {chatState.error && (
        <div className="border-b bg-red-50 dark:bg-red-950 p-4 flex-shrink-0">
          <p className="text-sm text-red-700 dark:text-red-200">
            ⚠ {chatState.error}
          </p>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Chat List */}
        <div className="w-full lg:w-80 border-r flex flex-col bg-muted/30 relative">
          <ChatListPanel
            chats={chatState.chats}
            senders={chatState.senders}
            selectedChatId={chatState.selectedChatId}
            loading={chatState.loading}
            onSelectChat={chatState.handleSelectChat}
            setSelectedChatId={chatState.setSelectedChatId}
            setChats={chatState.setChats}
            refetchChats={chatState.refetchChats}
            onDeleteChat={handleDeleteChatClick}
            onSelectArchivedChat={handleSelectArchivedChat}
            lastDeletedChatId={lastDeletedChatId}
          />
        </div>

        {/* Right Panel: Chat Detail (only mounts when a chat is selected) */}
        <div className="hidden lg:flex flex-1 flex-col bg-background overflow-hidden min-h-0">
          {effectiveSelectedChat ? (
            <ChatDetailPanel
              chatState={chatState}
              selectedChat={effectiveSelectedChat}
              socket={socket}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              isSidebarExpanded={isSidebarExpanded}
              isSidebarHydrated={isSidebarHydrated}
              toggleSidebar={toggleSidebar}
              persistedTab={chatPersistence.persistedTab}
              persistSidebarTab={chatPersistence.persistSidebarTab}
              onDeleteChat={handleDeleteChatClick}
            />
          ) : chatState.loading ? (
            chatPersistence.hadPreviousChat ? (
              <ChatDetailSkeleton />
            ) : (
              <ChatEmptyStateSkeleton />
            )
          ) : (
            <div className="flex-1 flex items-center justify-center bg-muted/10">
              <div className="text-center max-w-sm px-4">
                <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-6">
                  <MessageSquare className="h-10 w-10 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  {t("selectChat")}
                </h3>
                {chatState.chats.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t("selectChatHint") ||
                      "Choose a conversation from the list to start messaging"}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Chat Confirmation — shared between both panels */}
      <DeleteChatDialog
        isOpen={!!deleteChatId}
        chatId={deleteChatId || ""}
        participantName={deleteChatName}
        onConfirm={handleConfirmDeleteChat}
        onCancel={() => {
          setDeleteChatId(null);
          setDeleteChatName(undefined);
        }}
      />
    </div>
  );
}
