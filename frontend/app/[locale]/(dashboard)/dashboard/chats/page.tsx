"use client";

import {
  Archive,
  ArrowDown,
  Loader2,
  MessageSquare,
  Search,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useSWR from "swr";

import {
  ArchivedChat,
  ArchivedChatsDrawer,
} from "@/components/archived-chats-drawer";
import { ChatsSenderSection } from "@/components/chats-sender-section";
import { DeleteChatDialog } from "@/components/dialogs/delete-chat-dialog";
import { RateLimitBanner } from "@/components/rate-limit-banner";
import { Button } from "@/components/ui/button";
import {
  ChatSidebar,
  ChatSidebarHandle,
  SidebarTab,
} from "@/components/ui/chat-sidebar";
import { Input } from "@/components/ui/input";
import { useAIEvents } from "@/hooks/use-ai-events";
import { useAuthProtection } from "@/hooks/use-auth";
import { useChatNotifications } from "@/hooks/use-chat-notifications";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { useNotification } from "@/hooks/use-notification";
import { useSidebarExpanded } from "@/hooks/use-sidebar-expanded";
import { backendApi } from "@/lib/api/endpoints";
import { PendingUpload } from "@/lib/media/types";

// Local imports
import { AiRegenerateBanner } from "@/components/chat/AiRegenerateBanner";
import { AiReplyPreviewPanel } from "@/components/chat/AiReplyPreviewPanel";
import type { RateLimitInfo } from "@/hooks/use-ai-events";
import { useChatPersistence } from "@/hooks/use-chat-persistence";
import { useHandoff } from "@/hooks/use-handoff";
import type { SupportedLanguage } from "@/lib/api/endpoints";
import {
  ChatDetailSkeleton,
  ChatEmptyStateSkeleton,
  ChatHeader,
  ChatListSkeleton,
  ChatSearchResults,
  ChatsModals,
  MessageInputArea,
  MessageSearchPanel,
  MessagesList,
  PinDurationModal,
  PinnedMessagesSection,
  PinReplaceModal,
  SelectionBanner,
  TemplatesPanel,
} from "./components";
import {
  useChatSearch,
  useChatState,
  useContactHandlers,
  useInputFocus,
  useMediaHandlers,
  useMessageHandlers,
  useMessageSearch,
  usePins,
  useReactions,
} from "./hooks";
import type { Chat, Template } from "./types";
import { PinDuration } from "./types";
import { calculateConversationWindow } from "./utils";

export default function ChatsPage() {
  const t = useTranslations("chats");
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const separatorRef = useRef<HTMLDivElement>(null);
  const chatSidebarRef = useRef<ChatSidebarHandle>(null);
  const notesPanelRef = useRef<HTMLDivElement>(null);
  const { addNotification } = useNotification();
  // Protect this route
  useAuthProtection();

  // Initialize media upload hook
  const hookResult = useMediaUpload();
  const pendingUploads = hookResult.pendingUploads as Map<
    string,
    PendingUpload
  >;
  const { isUploading } = hookResult;

  // Rate limit state
  const [fetchedRateLimitInfo, setFetchedRateLimitInfo] =
    useState<RateLimitInfo | null>(null);

  // Archive/Delete state
  const [isArchivedDrawerOpen, setIsArchivedDrawerOpen] = useState(false);
  const [viewedArchivedChat, setViewedArchivedChat] =
    useState<ArchivedChat | null>(null);
  const [deleteChatId, setDeleteChatId] = useState<string | null>(null);
  const [deleteChatName, setDeleteChatName] = useState<string | undefined>(
    undefined,
  );
  const [lastDeletedChatId, setLastDeletedChatId] = useState<string | null>(
    null,
  );

  // Sync automation enabled state with backend - MOVED DOWN

  // User state
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | undefined>(
    undefined,
  );

  // Sidebar state
  const [notesPanelWidth, setNotesPanelWidth] = useState(320);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null,
  );
  const [customerLanguage, setCustomerLanguage] = useState<
    SupportedLanguage | undefined
  >(undefined);

  // Chat state hook - manages chats, messages, pagination, scroll
  const chatState = useChatState();

  // Chat/sidebar tab persistence hook
  // - Restores selected chat on page reload
  // - Restores sidebar tab (profile/notes) on page reload
  // - Does NOT change tab when switching chats
  const chatPersistence = useChatPersistence({
    onRestoreChatId: useCallback(
      (chatId: string) => {
        // Only restore if chatState is ready and has chats
        // The actual selection happens after chats are loaded
        chatState.setSelectedChatId(chatId);
      },
      [chatState.setSelectedChatId],
    ),
  });

  // Sidebar expanded/collapsed state persistence
  // - Default is expanded (true)
  // - User's preference persists across sessions via localStorage
  const {
    isExpanded: isSidebarExpanded,
    toggle: toggleSidebar,
    isHydrated: isSidebarHydrated,
  } = useSidebarExpanded();

  // Persist chat selection whenever it changes
  useEffect(() => {
    chatPersistence.persistChatId(chatState.selectedChatId);
  }, [chatState.selectedChatId, chatPersistence.persistChatId]);

  // Handler for sidebar tab changes (to persist on page reload)
  const handleSidebarTabChange = useCallback(
    (tab: SidebarTab) => {
      chatPersistence.persistSidebarTab(tab);
    },
    [chatPersistence.persistSidebarTab],
  );

  // Get socket for AI events
  const { socket } = useChatNotifications();

  // AI Events hook - handles typing indicator, rate limits, and pending reviews
  const {
    isAITyping,
    isAIProcessing,
    rateLimitInfo,
    pendingReview,
    showRegenerateBanner,
    clearPendingReview,
    setAIProcessing,
    enableRegenerateBanner,
    hideRegenerateBanner,
  } = useAIEvents(chatState.selectedChatId, socket);

  // AI state from useHandoff - source of truth for AI toggle
  // Must be after chatState is defined
  const {
    aiStatus,
    isAIPaused,
    pauseAI,
    resumeAI,
    refetch: refetchHandoff,
  } = useHandoff(chatState.selectedChatId);

  // Derived state: AI is enabled in config AND not paused
  const aiConfigEnabled = aiStatus?.aiConfigEnabled ?? false;
  const automationEnabled = aiConfigEnabled && !isAIPaused;

  // Combined rate limit info (socket takes precedence for updates, fetches for init)
  const activeRateLimit = rateLimitInfo || fetchedRateLimitInfo;

  // Sync rate limit state with backend on chat change
  useEffect(() => {
    if (!chatState.selectedChatId) return;

    const fetchRateLimitStatus = async () => {
      try {
        const status = await backendApi.aiWorkflow.getAIStatus(
          chatState.selectedChatId!,
        );

        // If rate limited, set the rate limit info
        if (status.isRateLimited) {
          setFetchedRateLimitInfo({
            chatId: status.chatId,
            currentCount: status.rateLimitCurrentCount || 0,
            maxCount: status.rateLimitMaxCount || 0,
            resetTime: status.rateLimitReset?.toString(),
            timestamp: new Date().toISOString(),
          });
        } else {
          setFetchedRateLimitInfo(null);
        }
      } catch (error) {
        console.error("Failed to fetch AI status:", error);
      }
    };

    fetchRateLimitStatus();
  }, [chatState.selectedChatId]);

  // Auto-scroll to bottom when AI typing indicator appears
  // This ensures the typing animation is visible without user needing to scroll
  useEffect(() => {
    if (isAITyping && chatState.selectedChatId) {
      // Only auto-scroll if user is already near the bottom
      // This respects users who are reading older messages
      const isNearBottom = chatState.scrollHelperIsAtBottom(200);
      if (isNearBottom) {
        chatState.scrollHelperRequestScroll(true); // smooth scroll
      }
    }
  }, [
    isAITyping,
    chatState.selectedChatId,
    chatState.scrollHelperIsAtBottom,
    chatState.scrollHelperRequestScroll,
  ]);

  // If socket rate limit event comes in, trigger refetch
  useEffect(() => {
    if (rateLimitInfo) {
      refetchHandoff();
    }
  }, [rateLimitInfo, refetchHandoff]);

  // Handler for when AI is toggled ON - auto-trigger response if last message is inbound
  const handleAIToggle = useCallback(
    async (shouldEnable: boolean) => {
      if (shouldEnable) {
        await resumeAI();
        // Hide regenerate banner when AI is resumed
        hideRegenerateBanner();
        // Check if last message is inbound and trigger AI response
        const lastMessage = chatState.messages[chatState.messages.length - 1];
        if (lastMessage?.direction === "inbound" && chatState.selectedChatId) {
          try {
            await backendApi.aiReview.regenerate(chatState.selectedChatId);
          } catch (error) {
            console.error("Failed to trigger AI response:", error);
          }
        }
      } else {
        await pauseAI();
        // Show regenerate banner if last message is inbound (user paused while waiting for response)
        const lastMessage = chatState.messages[chatState.messages.length - 1];
        if (lastMessage?.direction === "inbound") {
          enableRegenerateBanner();
        }
      }
    },
    [
      resumeAI,
      pauseAI,
      chatState.messages,
      chatState.selectedChatId,
      enableRegenerateBanner,
      hideRegenerateBanner,
    ],
  );

  // AI Review Handlers
  const handleAiSend = useCallback(
    async (content: string, mediaAttachment?: any, interactiveData?: any) => {
      if (!chatState.selectedChatId) return;
      try {
        await backendApi.aiReview.sendReviewed({
          chatId: chatState.selectedChatId,
          content,
          mediaAttachment,
          interactiveData,
        });
        clearPendingReview();
        hideRegenerateBanner(); // Hide banner after successful send
        // The message will also be received via WebSocket which will hide the banner
      } catch (error) {
        console.error("Failed to send reviewed AI response:", error);
        addNotification(
          t("failedToSendAiResponse") || "Failed to send AI response",
          "error",
        );
      }
    },
    [
      chatState.selectedChatId,
      clearPendingReview,
      hideRegenerateBanner,
      addNotification,
      t,
    ],
  );

  const handleAiDiscard = useCallback(async () => {
    if (!chatState.selectedChatId) return;
    try {
      await backendApi.aiReview.discardPending(chatState.selectedChatId);
      clearPendingReview();
      // Enable regenerate banner since user discarded the AI response
      enableRegenerateBanner();
    } catch (error) {
      console.error("Failed to discard AI review:", error);
      clearPendingReview(); // Clear locally anyway
      enableRegenerateBanner();
    }
  }, [chatState.selectedChatId, clearPendingReview, enableRegenerateBanner]);

  // Chat search hook - manages searching through chat list
  const chatSearch = useChatSearch({ debounceMs: 200, minChars: 1 });

  // Message search hook - manages search panel, scroll-to-message, highlighting
  const messageSearch = useMessageSearch();

  // Input focus hook - manages reliable input focusing on chat selection
  // isChatReady: true when initial load is complete (isInitialLoad becomes false after messages are loaded)
  const { inputRef: messageInputRef, triggerFocus } = useInputFocus({
    selectedChatId: chatState.selectedChatId,
    isChatReady: !chatState.isInitialLoad,
    isLoading: chatState.loading,
  });

  // Message handlers hook - manages sending, replying, deleting messages
  const messageHandlers = useMessageHandlers({
    selectedChatId: chatState.selectedChatId,
    selectedChat: chatState.selectedChat,
    selectedContactId,
    messages: chatState.messages,
    setMessages: chatState.setMessages,
    setMessageCount: chatState.setMessageCount,
    setError: chatState.setError,
    messagesContainerRef: chatState.messagesContainerRef,
    messagesCacheRef: chatState.messagesCacheRef,
    currentMessagesChatIdRef: chatState.currentMessagesChatIdRef,
    shouldAutoScroll: chatState.shouldAutoScroll,
    setShouldAutoScroll: chatState.setShouldAutoScroll,
    setHasNewMessages: chatState.setHasNewMessages,
    scrollHelperRequestScroll: chatState.scrollHelperRequestScroll,
    chats: chatState.chats,
    onFocusInput: triggerFocus,
  });

  // Media handlers hook - manages media staging, uploads, previews, downloads
  const mediaHandlers = useMediaHandlers({
    selectedChatId: chatState.selectedChatId,
    chats: chatState.chats,
    messages: chatState.messages,
    setMessages: chatState.setMessages,
    setMessageCount: chatState.setMessageCount,
    setError: chatState.setError,
    messagesCacheRef: chatState.messagesCacheRef,
    currentMessagesChatIdRef: chatState.currentMessagesChatIdRef,
    setShouldAutoScroll: chatState.setShouldAutoScroll,
    scrollHelperRequestScroll: chatState.scrollHelperRequestScroll,
    replyingToMessage: messageHandlers.replyingToMessage,
    setReplyingToMessage: messageHandlers.setReplyingToMessage,
  });

  // Contact handlers hook - manages contact sending, saving, viewing
  const contactHandlers = useContactHandlers({
    selectedChatId: chatState.selectedChatId,
    chats: chatState.chats,
    setChats: chatState.setChats,
    setSelectedChatId: chatState.setSelectedChatId,
    senders: chatState.senders,
    setMessages: chatState.setMessages,
    setMessageCount: chatState.setMessageCount,
    setError: chatState.setError,
    messagesCacheRef: chatState.messagesCacheRef,
    currentMessagesChatIdRef: chatState.currentMessagesChatIdRef,
    setShouldAutoScroll: chatState.setShouldAutoScroll,
    scrollHelperRequestScroll: chatState.scrollHelperRequestScroll,
  });

  // Fetch templates from API
  const { data: templates = [], isLoading: templatesLoading } = useSWR(
    "visible-templates",
    async () => {
      try {
        return await backendApi.templates.list(true);
      } catch (error) {
        console.error("Failed to fetch templates:", error);
        return [];
      }
    },
  );

  // Filter templates to only show those with at least one approved locale
  const approvedTemplates = useMemo(() => {
    return (templates as Template[]).filter((template) =>
      template.locales?.some((locale) => locale.approvalStatus === "approved"),
    );
  }, [templates]);

  // Calculate conversation window status based on messages
  // This determines if we're within the 24-hour window for free-form messaging
  const conversationWindow = useMemo(
    () => calculateConversationWindow(chatState.messages),
    [chatState.messages],
  );

  // All visible templates (for the new template panel with availability logic)
  const visibleTemplates = useMemo(() => {
    return (templates as Template[]).filter((template) => template.isVisible);
  }, [templates]);

  // Fetch current user on mount
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

  // Reactions hook - manages reactions state, WebSocket updates, and API calls
  const reactions = useReactions({
    currentUserId: currentUserId || undefined,
    currentUserName,
    enabled: !!currentUserId,
    chatId: chatState.selectedChatId || undefined,
  });

  // Pins hook - manages pinned messages state, WebSocket updates, and API calls
  const pins = usePins({
    chatId: chatState.selectedChatId,
    enabled: !!chatState.selectedChatId,
  });

  // Pin modal state
  const [pinDurationModalOpen, setPinDurationModalOpen] = useState(false);
  const [pinReplaceModalOpen, setPinReplaceModalOpen] = useState(false);
  const [pendingPinMessageId, setPendingPinMessageId] = useState<string | null>(
    null,
  );

  // Load reactions when messages change
  useEffect(() => {
    if (chatState.messages.length > 0) {
      const messageIds = chatState.messages.map((m) => m.messageId);
      reactions.loadReactionsForMessages(messageIds);
    }
  }, [chatState.messages, reactions.loadReactionsForMessages]);

  // Clear reactions when chat changes
  useEffect(() => {
    reactions.clearReactions();
  }, [chatState.selectedChatId, reactions.clearReactions]);

  // NOTE: Notes fetching and WebSocket subscription is now handled internally
  // by the NotesPanel component via useNotesInfiniteScroll hook

  // Handler for when a contact is resolved (created or found) from the sidebar
  // This updates the selectedContactId and fetches language for template availability
  const handleContactResolved = useCallback(async (contactId: string) => {
    setSelectedContactId(contactId);
    // Fetch customer language for template availability
    try {
      const contact = await backendApi.contacts.get(contactId);
      if (contact && typeof contact === "object" && "language" in contact) {
        setCustomerLanguage(
          (contact as { language?: SupportedLanguage | null }).language ||
            undefined,
        );
      }
    } catch {
      // Ignore errors - language is optional
    }
  }, []);

  // Clear contact state when chat changes
  useEffect(() => {
    if (!chatState.selectedChatId) {
      setSelectedContactId(null);
      setCustomerLanguage(undefined);
    }
  }, [chatState.selectedChatId]);

  // Pin handlers
  const handlePinMessage = useCallback(
    (messageId: string) => {
      // Check if already at pin limit (3)
      if (pins.pinCount.count >= 3) {
        // Show replace modal
        setPendingPinMessageId(messageId);
        setPinReplaceModalOpen(true);
      } else {
        // Show duration modal
        setPendingPinMessageId(messageId);
        setPinDurationModalOpen(true);
      }
    },
    [pins.pinCount.count],
  );

  const handleUnpinMessage = useCallback(
    async (messageId: string) => {
      try {
        await pins.unpinMessage(messageId);
      } catch (error) {
        console.error("Failed to unpin message:", error);
        addNotification(t("unpinFailed"), "error");
      }
    },
    [pins, addNotification, t],
  );

  const handlePinDurationSelect = useCallback(
    async (duration: PinDuration) => {
      if (!pendingPinMessageId) return;
      try {
        // Check if we need to replace an existing pin (when at limit)
        if (pins.pinCount.count >= 3) {
          const oldestPin = pins.pinnedMessages[0];
          if (oldestPin) {
            // First unpin the oldest message
            await pins.unpinMessage(oldestPin.messageId);
          }
        }
        // Pin the new message with selected duration
        await pins.pinMessage(pendingPinMessageId, duration);
        setPinDurationModalOpen(false);
        setPendingPinMessageId(null);
      } catch (error) {
        console.error("Failed to pin message:", error);
        addNotification(t("pinFailed"), "error");
      }
    },
    [pendingPinMessageId, pins, addNotification, t],
  );

  const handlePinReplace = useCallback(() => {
    // Close replace modal and show duration modal
    // The actual replacement happens in handlePinDurationSelect
    setPinReplaceModalOpen(false);
    setPinDurationModalOpen(true);
  }, []);

  const handleNavigateToPinnedMessage = useCallback(
    async (messageId: string) => {
      // First try to scroll to message if it exists in current messages
      const existingMessage = chatState.messages.find(
        (m) => m.messageId === messageId,
      );
      if (existingMessage) {
        // Pass container ref and current messages for "is last" check
        messageHandlers.handleScrollToMessage(
          messageId,
          chatState.messagesContainerRef,
          chatState.messages,
        );
        return;
      }

      // Message not in current view, need to fetch context
      try {
        const context = await pins.getMessageContext(messageId);
        if (context && context.messages.length > 0) {
          // Use navigateToPinnedContext to properly handle bidirectional scroll
          // This REPLACES messages (not merges) for better performance
          await chatState.navigateToPinnedContext(
            messageId,
            context.messages,
            context.hasMoreBefore,
            context.hasMoreAfter,
          );

          // Wait for DOM to update with new messages before scrolling
          // Triple RAF ensures: 1) React commits, 2) Browser layouts, 3) Safe to scroll
          // Pass context.messages directly to avoid stale closure issues
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                messageHandlers.handleScrollToMessage(
                  messageId,
                  chatState.messagesContainerRef,
                  context.messages, // Pass the fresh context messages
                );
              });
            });
          });
        }
      } catch (error) {
        console.error("Failed to navigate to pinned message:", error);
        addNotification(t("navigationFailed"), "error");
      }
    },
    [chatState, messageHandlers, pins, addNotification, t],
  );

  // Archive chat handler
  const handleArchiveChat = useCallback(
    async (chatId: string) => {
      try {
        await backendApi.chats.archive(chatId);
        // Remove from local chats list
        chatState.setChats((prev) => prev.filter((c) => c.chatId !== chatId));
        // If this was the selected chat, deselect it
        if (chatState.selectedChatId === chatId) {
          chatState.setSelectedChatId(null);
        }
        addNotification(t("chatList.chatArchived"), "success");
      } catch (error) {
        console.error("Failed to archive chat:", error);
        addNotification(t("chatList.archiveFailed"), "error");
      }
    },
    [chatState, t, addNotification],
  );

  // Unarchive chat handler
  const handleUnarchiveChat = useCallback(
    async (chatId: string) => {
      try {
        await backendApi.chats.unarchive(chatId);
        // Fetch the unarchived chat and add it back to the list
        const data = await backendApi.whatsapp.getChats(0, 50);
        if (Array.isArray(data)) {
          chatState.setChats(data);
        }
        addNotification(t("chatList.chatUnarchived"), "success");
      } catch (error) {
        console.error("Failed to unarchive chat:", error);
        addNotification(t("chatList.unarchiveFailed"), "error");
        throw error; // Re-throw so the drawer can handle it
      }
    },
    [chatState, t, addNotification],
  );

  // Select an archived chat for viewing (without adding to main list)
  const handleSelectArchivedChat = useCallback(
    (archivedChat: ArchivedChat) => {
      // Set the archived chat for viewing
      setViewedArchivedChat(archivedChat);
      // Set the selected chat ID so messages load
      chatState.setSelectedChatId(archivedChat.chatId);
    },
    [chatState],
  );

  // Computed selected chat: use archived chat if viewing one, otherwise use regular selected chat
  const effectiveSelectedChat = useMemo(() => {
    if (
      viewedArchivedChat &&
      chatState.selectedChatId === viewedArchivedChat.chatId
    ) {
      // Convert ArchivedChat to Chat format for display
      return {
        ...viewedArchivedChat,
        unreadCount: viewedArchivedChat.unreadCount ?? 0,
        isActive: true,
        isArchived: true,
      } as Chat;
    }
    // Clear viewed archived chat if we selected a different chat
    if (
      viewedArchivedChat &&
      chatState.selectedChatId !== viewedArchivedChat.chatId
    ) {
      setViewedArchivedChat(null);
    }
    return chatState.selectedChat;
  }, [viewedArchivedChat, chatState.selectedChatId, chatState.selectedChat]);

  // Open delete chat confirmation
  const handleDeleteChatClick = useCallback(
    (chatId: string, participantName?: string) => {
      // First check regular chats
      const chat = chatState.chats.find((c) => c.chatId === chatId);
      // If not found and we have a viewed archived chat with matching ID, use that
      const archivedChat =
        viewedArchivedChat?.chatId === chatId ? viewedArchivedChat : null;
      const effectiveChat = chat || archivedChat;

      setDeleteChatId(chatId);
      // Use passed participantName, or fall back to chat data, or phone number
      setDeleteChatName(
        participantName ||
          effectiveChat?.participantName ||
          effectiveChat?.participantPhone,
      );
    },
    [chatState.chats, viewedArchivedChat],
  );

  // Confirm delete chat
  const handleConfirmDeleteChat = useCallback(async () => {
    if (!deleteChatId) return;

    try {
      await backendApi.chats.delete(deleteChatId);
      // Track deleted chat ID for archived drawer to react
      setLastDeletedChatId(deleteChatId);
      // Clear it after a short delay so it can be used again for the same ID
      setTimeout(() => setLastDeletedChatId(null), 100);
      // Remove from local chats list
      chatState.setChats((prev) =>
        prev.filter((c) => c.chatId !== deleteChatId),
      );
      // Clear messages cache for deleted chat to free memory
      if (chatState.messagesCacheRef.current.has(deleteChatId)) {
        chatState.messagesCacheRef.current.delete(deleteChatId);
      }
      // If this was the selected chat, deselect it and clear messages
      if (chatState.selectedChatId === deleteChatId) {
        chatState.setSelectedChatId(null);
        chatState.setMessages([]);
        chatState.setMessageCount(0);
      }
      // Clear viewed archived chat if it was deleted
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

  // Handle search result message selection
  const handleSearchSelectMessage = useCallback(
    async (messageId: string) => {
      if (!chatState.selectedChatId) return;

      await messageSearch.scrollToMessage(
        messageId,
        chatState.messages,
        chatState.setMessages,
        chatState.messagesCacheRef,
        chatState.currentMessagesChatIdRef,
        chatState.selectedChatId,
        messageHandlers.messageRefs,
        chatState.messagesContainerRef,
      );
    },
    [
      chatState.selectedChatId,
      chatState.messages,
      chatState.setMessages,
      chatState.messagesCacheRef,
      chatState.currentMessagesChatIdRef,
      chatState.messagesContainerRef,
      messageHandlers.messageRefs,
      messageSearch,
    ],
  );

  // Handle separator drag to resize notes panel
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = notesPanelWidth;
    let currentWidth = startWidth;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const maxWidth = containerRef.current
        ? containerRef.current.clientWidth * 0.6
        : 800;
      currentWidth = Math.max(250, Math.min(startWidth - deltaX, maxWidth));

      if (notesPanelRef.current) {
        notesPanelRef.current.style.width = `${currentWidth}px`;
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      setNotesPanelWidth(currentWidth);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header with Controls */}
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

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Chat List */}
        <div className="w-full lg:w-80 border-r flex flex-col bg-muted/30 relative">
          {/* Search Input */}
          <div className="p-4 border-b">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("searchChats")}
                  value={chatSearch.searchQuery}
                  onChange={(e) =>
                    chatSearch.handleSearchChange(e.target.value)
                  }
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
          <div className="flex-1 overflow-y-auto">
            {chatState.loading && !chatSearch.isSearchMode ? (
              <ChatListSkeleton />
            ) : chatSearch.isSearchMode ? (
              /* Search Results Mode */
              chatSearch.searchResults.length === 0 &&
              !chatSearch.isSearching ? (
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
                  senders={chatState.senders}
                  selectedChatId={chatState.selectedChatId}
                  onSelectChat={(chatId) => {
                    chatState.handleSelectChat(chatId);
                    // Optionally clear search after selection
                    // chatSearch.clearSearch();
                  }}
                  searchQuery={chatSearch.searchQuery}
                  hasMore={chatSearch.hasMore}
                  onLoadMore={chatSearch.loadMore}
                  isLoading={chatSearch.isSearching}
                />
              )
            ) : chatState.chats.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-3 opacity-40" />
                <p className="text-muted-foreground">{t("noChats")}</p>
              </div>
            ) : (
              /* Normal Chat List Mode */
              chatState.senders.map((sender) => {
                const senderChats = chatState.chats.filter(
                  (c) => c.senderId === sender.id,
                );
                return (
                  <ChatsSenderSection
                    key={sender.id}
                    senderPhoneNumber={sender.phoneNumber}
                    senderDisplayName={sender.displayName}
                    chats={senderChats}
                    selectedChatId={chatState.selectedChatId}
                    onSelectChat={chatState.handleSelectChat}
                    onArchiveChat={handleArchiveChat}
                    onDeleteChat={handleDeleteChatClick}
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
            onDeleteChat={handleDeleteChatClick}
            onSelectArchivedChat={handleSelectArchivedChat}
            selectedChatId={chatState.selectedChatId}
            deletedChatId={lastDeletedChatId}
            senders={chatState.senders}
          />
        </div>

        {/* Right Panel: Chat Detail + Notes/Search */}
        <div className="hidden lg:flex flex-1 flex-col bg-background overflow-hidden min-h-0">
          {effectiveSelectedChat ? (
            <>
              <ChatHeader
                chat={effectiveSelectedChat}
                onSearchClick={messageSearch.toggleSearch}
                isSearchOpen={messageSearch.isSearchOpen}
                onAIToggle={handleAIToggle}
                isRateLimited={!!activeRateLimit}
                onConfigSaved={() => {
                  // Clear rate limit info when config is saved (user may have increased limit)
                  setFetchedRateLimitInfo(null);
                  refetchHandoff();
                }}
                isSidebarExpanded={isSidebarExpanded}
                onSidebarToggle={toggleSidebar}
              />

              {/* Messages + Notes/Search Container */}
              <div className="flex flex-1 overflow-hidden" ref={containerRef}>
                {/* Messages Area */}
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
                  {/* Pinned Messages Section */}
                  {pins.pinnedMessages.length > 0 && (
                    <PinnedMessagesSection
                      pinnedMessages={pins.pinnedMessages}
                      currentIndex={pins.currentPinIndex}
                      onPinClick={handleNavigateToPinnedMessage}
                      onUnpin={handleUnpinMessage}
                      onGoToMessage={handleNavigateToPinnedMessage}
                      onIndexChange={pins.setCurrentPinIndex}
                    />
                  )}

                  {/* Messages scroll container wrapper */}
                  <div className="relative flex-1 min-h-0 overflow-hidden">
                    {/* Show messages list - don't block on initial sync */}
                    <MessagesList
                      messages={chatState.messages}
                      selectedChat={effectiveSelectedChat}
                      isLoadingOlderMessages={chatState.isLoadingOlderMessages}
                      hasMoreMessages={chatState.hasMoreMessages}
                      messageRefs={messageHandlers.messageRefs}
                      isScrollRestoring={chatState.isScrollRestoring}
                      messagesContainerRef={chatState.messagesContainerRef}
                      messagesEndRef={messagesEndRef}
                      t={t}
                      parseContactsFromMessage={
                        contactHandlers.parseContactsFromMessage
                      }
                      handleViewAllContacts={
                        contactHandlers.handleViewAllContacts
                      }
                      handleStartChatWithContact={
                        contactHandlers.handleStartChatWithContact
                      }
                      handleReplyById={messageHandlers.handleReplyById}
                      handleDeleteMessage={messageHandlers.handleDeleteMessage}
                      handleDownloadById={mediaHandlers.handleDownloadById}
                      handleScrollToMessage={
                        messageHandlers.handleScrollToMessage
                      }
                      handleImageClick={mediaHandlers.handleImageClick}
                      handleShowDownloadMenu={
                        mediaHandlers.handleShowDownloadMenu
                      }
                      handleVideoPlay={mediaHandlers.handleVideoPlay}
                      highlightedMessageId={messageSearch.highlightedMessageId}
                      reactionsMap={reactions.reactionsMap}
                      customerReactionsMap={reactions.customerReactionsMap}
                      currentUserId={currentUserId || undefined}
                      handleReactionSelect={reactions.handleReactionSelect}
                      animatingReactionIds={reactions.animatingReactionIds}
                      pinnedMessageIds={pins.pinnedMessageIds}
                      handlePinMessage={handlePinMessage}
                      handleUnpinMessage={handleUnpinMessage}
                      conversationWindow={conversationWindow}
                      isSelectionMode={messageHandlers.isSelectionMode}
                      selectedMessageIds={messageHandlers.selectedMessageIds}
                      onToggleSelection={messageHandlers.handleToggleSelection}
                      isAITyping={isAITyping}
                    />

                    {/* Scroll to Bottom Button - shows when viewing old messages or when there are new messages */}
                    {(chatState.hasNewMessages || chatState.hasMoreAfter) && (
                      <div className="absolute bottom-4 right-4 z-20">
                        <Button
                          onClick={chatState.handleScrollToBottom}
                          size="sm"
                          className="rounded-full shadow-lg bg-primary hover:bg-primary/90"
                          title={
                            chatState.hasMoreAfter
                              ? t("returnToLatest")
                              : "Scroll to latest message"
                          }
                        >
                          <ArrowDown className="h-4 w-4" />
                          {chatState.hasMoreAfter && (
                            <span className="ml-1 text-xs">
                              {t("returnToLatest")}
                            </span>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Selection Banner - Shows above templates when in selection mode */}
                  {messageHandlers.isSelectionMode && (
                    <SelectionBanner
                      selectedCount={messageHandlers.selectedMessageIds.size}
                      onCancel={messageHandlers.handleExitSelectionMode}
                      onDelete={messageHandlers.handleDeleteSelected}
                    />
                  )}

                  {/* Rate Limit Banner */}
                  {activeRateLimit && (
                    <RateLimitBanner
                      resetTime={activeRateLimit.resetTime}
                      currentCount={activeRateLimit.currentCount}
                      maxCount={activeRateLimit.maxCount}
                    />
                  )}

                  {/* AI Regeneration Banner - Only shown after user explicitly discards AI response */}
                  {showRegenerateBanner &&
                    !pendingReview &&
                    !activeRateLimit &&
                    !isAITyping &&
                    automationEnabled &&
                    chatState.messages[chatState.messages.length - 1]
                      ?.direction === "inbound" && (
                      <AiRegenerateBanner
                        chatId={effectiveSelectedChat.chatId}
                        onRegenerateTriggered={() => {
                          // Hide the banner after triggering regeneration
                          hideRegenerateBanner();
                          console.log("Regeneration triggered");
                        }}
                      />
                    )}

                  {/* Templates Panel - Only show if automation is DISABLED */}
                  {!automationEnabled && (
                    <TemplatesPanel
                      templates={visibleTemplates}
                      templatesLoading={templatesLoading}
                      onApplyTemplate={messageHandlers.handleApplyTemplate}
                      conversationWindow={conversationWindow}
                      customerLanguage={customerLanguage}
                      t={t}
                    />
                  )}

                  {/* Input Area - Hidden in selection mode or when AI review is pending */}
                  {!messageHandlers.isSelectionMode && pendingReview ? (
                    <AiReplyPreviewPanel
                      content={pendingReview.content}
                      mediaAttachment={pendingReview.mediaAttachment}
                      interactiveData={pendingReview.interactiveData}
                      onSend={handleAiSend}
                      onDiscard={handleAiDiscard}
                      isSending={false} // Todo: Add sending state if needed
                    />
                  ) : (
                    !messageHandlers.isSelectionMode &&
                    !automationEnabled && (
                      <MessageInputArea
                        messageInputRef={messageInputRef}
                        addMoreInputRef={mediaHandlers.addMoreInputRef}
                        replyingToMessage={messageHandlers.replyingToMessage}
                        selectedChat={effectiveSelectedChat}
                        currentAttachmentType={
                          mediaHandlers.currentAttachmentType
                        }
                        templateInput={messageHandlers.templateInput}
                        isUploading={isUploading}
                        t={t}
                        onSend={messageHandlers.handleSendMessage}
                        onSendVoiceNote={mediaHandlers.handleSendVoiceNote}
                        onTemplateUsed={messageHandlers.handleTemplateUsed}
                        onCancelReply={messageHandlers.handleCancelReply}
                        onFilesSelected={mediaHandlers.handleFilesSelected}
                        onContactsClick={contactHandlers.handleContactsClick}
                        onCameraClick={mediaHandlers.handleCameraClick}
                        conversationWindow={conversationWindow}
                      />
                    )
                  )}

                  {/* Media Staging and Preview Modals (within messages area) */}
                  <ChatsModals
                    // Media staging
                    mediaStagingOpen={mediaHandlers.mediaStagingOpen}
                    stagedFiles={mediaHandlers.stagedFiles}
                    isUploading={isUploading}
                    sendButtonText={t("send")}
                    onCloseStagingModal={mediaHandlers.handleCloseStagingModal}
                    onSendMediaFromStaging={
                      mediaHandlers.handleSendMediaFromStaging
                    }
                    onAddMoreMedia={mediaHandlers.handleAddMoreMedia}
                    onRemoveStagedFile={mediaHandlers.handleRemoveStagedFile}
                    onEditStagedImage={mediaHandlers.handleEditStagedImage}
                    onStagedImageEdited={mediaHandlers.handleStagedImageEdited}
                    focusFileId={mediaHandlers.focusFileId}
                    // Media preview - enhanced version with all batch media items
                    previewModalOpen={mediaHandlers.previewModalOpen}
                    previewMediaItems={mediaHandlers.previewMediaItems}
                    previewInitialIndex={mediaHandlers.previewInitialIndex}
                    onClosePreviewModal={() =>
                      mediaHandlers.setPreviewModalOpen(false)
                    }
                    // Preview action handlers
                    onPreviewGoToMessage={messageHandlers.handleScrollToMessage}
                    onPreviewReply={messageHandlers.handleReplyById}
                    onPreviewPin={handlePinMessage}
                    onPreviewReact={reactions.handleReactionSelect}
                    // Download menu
                    downloadMenuOpen={mediaHandlers.downloadMenuOpen}
                    downloadMenuPosition={mediaHandlers.downloadMenuPosition}
                    currentMessageAttachments={
                      mediaHandlers.currentMessageAttachments
                    }
                    downloadLoading={mediaHandlers.downloadLoading}
                    onDownloadSingle={mediaHandlers.handleDownloadSingle}
                    onDownloadPack={mediaHandlers.handleDownloadPack}
                    onCloseDownloadMenu={() =>
                      mediaHandlers.setDownloadMenuOpen(false)
                    }
                    // Delete dialog
                    deleteDialogOpen={messageHandlers.deleteDialogOpen}
                    deletingMessageId={messageHandlers.deletingMessageId}
                    onCloseDeleteDialog={() =>
                      messageHandlers.setDeleteDialogOpen(false)
                    }
                    onConfirmDelete={messageHandlers.handleConfirmDeleteMessage}
                    // Video preview
                    videoPreview={mediaHandlers.videoPreview}
                    onCloseVideoPreview={() =>
                      mediaHandlers.setVideoPreview(null)
                    }
                    // Camera capture
                    cameraOpen={mediaHandlers.cameraOpen}
                    onCameraCapture={mediaHandlers.handleCameraCapture}
                    onCameraClose={mediaHandlers.handleCameraClose}
                    // Image editor
                    imageEditorOpen={mediaHandlers.imageEditorOpen}
                    imageToEdit={mediaHandlers.imageToEdit}
                    imageEditorSource={mediaHandlers.imageEditorSource}
                    onImageEditorSend={mediaHandlers.handleImageEditorSend}
                    onImageEditorRetake={mediaHandlers.handleImageEditorRetake}
                    onImageEditorClose={mediaHandlers.handleImageEditorClose}
                    // Contact modals
                    sendContactsModalOpen={
                      contactHandlers.sendContactsModalOpen
                    }
                    contactPreviewModalOpen={
                      contactHandlers.contactPreviewModalOpen
                    }
                    viewContactsModalOpen={
                      contactHandlers.viewContactsModalOpen
                    }
                    quickContactFormOpen={contactHandlers.quickContactFormOpen}
                    senderSelectModalOpen={
                      contactHandlers.senderSelectModalOpen
                    }
                    contactsToSend={contactHandlers.contactsToSend}
                    contactsToView={contactHandlers.contactsToView}
                    contactToSave={contactHandlers.contactToSave}
                    contactToStartChat={contactHandlers.contactToStartChat}
                    allContacts={contactHandlers.allContacts}
                    senders={chatState.senders}
                    isSendingContacts={contactHandlers.isSendingContacts}
                    isSavingContact={contactHandlers.isSavingContact}
                    contactsLoading={contactHandlers.contactsLoading}
                    onCloseSendContactsModal={() =>
                      contactHandlers.setSendContactsModalOpen(false)
                    }
                    onContactsSelected={contactHandlers.handleContactsSelected}
                    onCloseContactPreviewModal={() => {
                      contactHandlers.setContactPreviewModalOpen(false);
                      contactHandlers.setContactsToSend([]);
                    }}
                    onBackToContactSelection={() => {
                      contactHandlers.setContactPreviewModalOpen(false);
                      contactHandlers.setSendContactsModalOpen(true);
                    }}
                    onConfirmSendContacts={contactHandlers.handleSendContacts}
                    onStartChatWithContact={
                      contactHandlers.handleStartChatWithContact
                    }
                    onCloseViewContactsModal={() => {
                      contactHandlers.setViewContactsModalOpen(false);
                      contactHandlers.setContactsToView([]);
                    }}
                    onSaveContactFromMessage={
                      contactHandlers.handleSaveContactFromMessage
                    }
                    onCloseQuickContactForm={() => {
                      contactHandlers.setQuickContactFormOpen(false);
                      contactHandlers.setContactToSave(null);
                    }}
                    onQuickSaveContact={contactHandlers.handleQuickSaveContact}
                    onCloseSenderSelectModal={() => {
                      contactHandlers.setSenderSelectModalOpen(false);
                      contactHandlers.setContactToStartChat(null);
                    }}
                    onSenderSelectedForContact={
                      contactHandlers.handleSenderSelectedForContact
                    }
                  />
                </div>

                {/* Resizable Separator - only show when sidebar is expanded and search is not open */}
                {isSidebarHydrated &&
                  isSidebarExpanded &&
                  !messageSearch.isSearchOpen && (
                    <div
                      ref={separatorRef}
                      onMouseDown={handleMouseDown}
                      className="w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors"
                      title="Drag to resize"
                    />
                  )}

                {/* Notes Panel or Search Panel - only show when sidebar is expanded */}
                {isSidebarHydrated && isSidebarExpanded && (
                  <div
                    ref={notesPanelRef}
                    className="hidden xl:flex flex-col overflow-hidden"
                    style={{ width: `${notesPanelWidth}px` }}
                  >
                    {messageSearch.isSearchOpen ? (
                      // Search Panel - slides in from right
                      <MessageSearchPanel
                        chatId={chatState.selectedChatId!}
                        participantName={effectiveSelectedChat?.participantName}
                        isOpen={messageSearch.isSearchOpen}
                        onClose={messageSearch.closeSearch}
                        onSelectMessage={handleSearchSelectMessage}
                      />
                    ) : (
                      // Notes/Profile Panel
                      chatState.selectedChatId &&
                      currentUserId && (
                        <ChatSidebar
                          ref={chatSidebarRef}
                          chatId={chatState.selectedChatId}
                          contactId={selectedContactId}
                          currentUserId={currentUserId}
                          onProfileUpdate={() => {}}
                          participantPhone={
                            effectiveSelectedChat?.participantPhone
                          }
                          participantName={
                            effectiveSelectedChat?.participantName
                          }
                          onContactCreated={handleContactResolved}
                          initialTab={chatPersistence.persistedTab || "profile"}
                          onTabChange={handleSidebarTabChange}
                        />
                      )
                    )}
                  </div>
                )}
              </div>
            </>
          ) : chatState.loading ? (
            // Loading state - show appropriate skeleton based on whether a chat was previously selected
            chatPersistence.hadPreviousChat ? (
              <ChatDetailSkeleton />
            ) : (
              <ChatEmptyStateSkeleton />
            )
          ) : (
            // Not loading, no chat selected - show empty state
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

      {/* Delete Chat Confirmation Dialog */}
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

      {/* Pin Duration Selection Modal */}
      <PinDurationModal
        isOpen={pinDurationModalOpen}
        onClose={() => {
          setPinDurationModalOpen(false);
          setPendingPinMessageId(null);
        }}
        onConfirm={handlePinDurationSelect}
      />

      {/* Pin Replace Modal (when at 3 pin limit) */}
      <PinReplaceModal
        isOpen={pinReplaceModalOpen}
        onClose={() => {
          setPinReplaceModalOpen(false);
          setPendingPinMessageId(null);
        }}
        onConfirm={handlePinReplace}
        oldestPinMessage={pins.pinnedMessages[0]?.message?.text || null}
      />
    </div>
  );
}
