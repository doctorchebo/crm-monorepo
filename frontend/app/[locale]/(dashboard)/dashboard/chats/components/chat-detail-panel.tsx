"use client";

/**
 * ChatDetailPanel
 *
 * Isolated right panel for the chats page. Contains all message display,
 * input, sidebar, and modal logic. This component only mounts when a chat
 * is selected, so its heavy hooks (reactions, pins, AI events, message
 * handlers, media handlers) don't initialise until needed.
 *
 * By extracting this from page.tsx, we achieve:
 * 1. Left panel (ChatListPanel) state changes don't trigger right panel re-renders
 * 2. Heavy hooks only run when a chat is actually selected
 * 3. Code is organized by concern and much easier to extend
 */

import { ArrowDown } from "lucide-react";
import { useTranslations } from "next-intl";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Socket } from "socket.io-client";
import useSWR from "swr";

import { AiRegenerateBanner } from "@/components/chat/AiRegenerateBanner";
import { AiReplyPreviewPanel } from "@/components/chat/AiReplyPreviewPanel";
import { LocationPickerModal } from "@/components/location";
import { RateLimitBanner } from "@/components/rate-limit-banner";
import { Button } from "@/components/ui/button";
import {
  ChatSidebar,
  ChatSidebarHandle,
  type SidebarTab,
} from "@/components/ui/chat-sidebar";
import type { RateLimitInfo } from "@/hooks/use-ai-events";
import { useAIEvents } from "@/hooks/use-ai-events";
import { useHandoff } from "@/hooks/use-handoff";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { useNotification } from "@/hooks/use-notification";
import type { SupportedLanguage } from "@/lib/api/endpoints";
import { backendApi } from "@/lib/api/endpoints";
import { CHAT_SIDEBAR } from "@/lib/constants/sidebar";

import type { UseChatStateReturn } from "../hooks";
import {
  useContactHandlers,
  useInputFocus,
  useMediaHandlers,
  useMessageHandlers,
  useMessageSearch,
  usePins,
  useReactions,
} from "../hooks";
import type { Chat, Message, PinDuration } from "../types";
import { calculateConversationWindow } from "../utils";
import {
  ChatHeader,
  ChatsModals,
  MessageInputArea,
  MessageSearchPanel,
  MessagesList,
  PinDurationModal,
  PinnedMessagesSection,
  PinReplaceModal,
  SelectionBanner,
  TemplateSendModal,
  TemplatesPanel,
} from "./index";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatDetailPanelProps {
  /** Core chat state — includes all message / scroll / pagination state */
  chatState: UseChatStateReturn;
  /** The effective selected chat (regular or archived) — computed by parent */
  selectedChat: Chat;
  /** Shared socket for WebSocket events */
  socket: Socket | null;
  /** Current user ID for reactions */
  currentUserId: number | null;
  /** Current user display name for reactions */
  currentUserName: string | undefined;
  /** Whether the sidebar (notes/profile) is expanded */
  isSidebarExpanded: boolean;
  /** Whether sidebar hydration is complete */
  isSidebarHydrated: boolean;
  /** Toggle sidebar */
  toggleSidebar: () => void;
  /** Persisted sidebar tab */
  persistedTab: SidebarTab | null;
  /** Persist sidebar tab preference */
  persistSidebarTab: (tab: SidebarTab) => void;
  /** Open delete confirmation dialog (managed by parent) */
  onDeleteChat: (chatId: string, participantName?: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatDetailPanel({
  chatState,
  selectedChat,
  socket,
  currentUserId,
  currentUserName,
  isSidebarExpanded,
  isSidebarHydrated,
  toggleSidebar,
  persistedTab,
  persistSidebarTab,
  onDeleteChat,
}: ChatDetailPanelProps) {
  const t = useTranslations("chats");
  const { addNotification } = useNotification();

  // -------------------------------------------------------------------------
  // Refs
  // -------------------------------------------------------------------------

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const separatorRef = useRef<HTMLDivElement>(null);
  const chatSidebarRef = useRef<ChatSidebarHandle>(null);
  const notesPanelRef = useRef<HTMLDivElement>(null);

  // -------------------------------------------------------------------------
  // Shorthand
  // -------------------------------------------------------------------------

  const selectedChatId = chatState.selectedChatId;

  // -------------------------------------------------------------------------
  // Internal state
  // -------------------------------------------------------------------------

  // Rate limit
  const [fetchedRateLimitInfo, setFetchedRateLimitInfo] =
    useState<RateLimitInfo | null>(null);

  // Contact / language
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null,
  );
  const [customerLanguage, setCustomerLanguage] = useState<
    SupportedLanguage | undefined
  >(undefined);

  // Sidebar resize
  const [notesPanelWidth, setNotesPanelWidth] = useState<number>(
    CHAT_SIDEBAR.DEFAULT_WIDTH,
  );

  // Location modal
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);

  // Pin modals
  const [pinDurationModalOpen, setPinDurationModalOpen] = useState(false);
  const [pinReplaceModalOpen, setPinReplaceModalOpen] = useState(false);
  const [pendingPinMessageId, setPendingPinMessageId] = useState<string | null>(
    null,
  );

  // -------------------------------------------------------------------------
  // Hooks — media upload
  // -------------------------------------------------------------------------

  const { isUploading } = useMediaUpload();

  // -------------------------------------------------------------------------
  // Hooks — AI
  // -------------------------------------------------------------------------

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
  } = useAIEvents(selectedChatId, socket);

  const {
    aiStatus,
    isAIPaused,
    pauseAI,
    resumeAI,
    refetch: refetchHandoff,
  } = useHandoff(selectedChatId);

  const aiConfigEnabled = aiStatus?.aiConfigEnabled ?? false;
  const automationEnabled = aiConfigEnabled && !isAIPaused;
  const activeRateLimit = rateLimitInfo || fetchedRateLimitInfo;

  // -------------------------------------------------------------------------
  // Hooks — input focus
  // -------------------------------------------------------------------------

  const { inputRef: messageInputRef, triggerFocus } = useInputFocus({
    selectedChatId,
    isChatReady: !chatState.isInitialLoad,
    isLoading: chatState.loading,
  });

  // -------------------------------------------------------------------------
  // Hooks — message, media, contact handlers
  // -------------------------------------------------------------------------

  const messageHandlers = useMessageHandlers({
    selectedChatId,
    selectedChat,
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

  const mediaHandlers = useMediaHandlers({
    selectedChatId,
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

  const contactHandlers = useContactHandlers({
    selectedChatId,
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

  // -------------------------------------------------------------------------
  // Hooks — reactions & pins
  // -------------------------------------------------------------------------

  const reactions = useReactions({
    currentUserId: currentUserId || undefined,
    currentUserName,
    enabled: !!currentUserId,
    chatId: selectedChatId || undefined,
    socket,
  });

  const pins = usePins({
    chatId: selectedChatId,
    enabled: !!selectedChatId,
    socket,
  });

  // -------------------------------------------------------------------------
  // Hooks — message search
  // -------------------------------------------------------------------------

  const messageSearch = useMessageSearch();

  // -------------------------------------------------------------------------
  // Hooks — templates
  // -------------------------------------------------------------------------

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

  const approvedTemplates = useMemo(() => {
    return templates.filter((template) =>
      template.locales?.some((locale) => locale.approvalStatus === "approved"),
    );
  }, [templates]);

  const conversationWindow = useMemo(
    () => calculateConversationWindow(chatState.messages),
    [chatState.messages],
  );

  const visibleTemplates = useMemo(() => {
    return templates.filter((template) => template.isVisible);
  }, [templates]);

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  // Maintain scroll-to-bottom when bottom sections (TemplatesPanel, InputArea)
  // mount after the initial render and shrink the messages container height.
  // Without this, the scroll position stays fixed while the container gets
  // shorter, causing the thread to appear scrolled up from the bottom.
  useEffect(() => {
    const container = chatState.messagesContainerRef.current;
    if (!container) return;

    let wasAtBottom = true;
    let lastHeight = container.clientHeight;

    const trackScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      wasAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    };

    const observer = new ResizeObserver((entries) => {
      const newHeight = entries[0]?.contentRect.height;
      if (newHeight != null && newHeight < lastHeight && wasAtBottom) {
        // Container shrank while user was at the bottom — stay at bottom
        container.scrollTop = container.scrollHeight - container.clientHeight;
      }
      if (newHeight != null) lastHeight = newHeight;
    });

    container.addEventListener("scroll", trackScroll, { passive: true });
    observer.observe(container);
    trackScroll();

    return () => {
      container.removeEventListener("scroll", trackScroll);
      observer.disconnect();
    };
  }, [chatState.messagesContainerRef]);

  // Sync rate limit state with backend on chat change
  useEffect(() => {
    if (!selectedChatId) return;

    const fetchRateLimitStatus = async () => {
      try {
        const status = await backendApi.aiHandoff.getAIStatus(selectedChatId!);
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
  }, [selectedChatId]);

  // Auto-scroll when AI typing starts
  useEffect(() => {
    if (isAITyping && selectedChatId) {
      const isNearBottom = chatState.scrollHelperIsAtBottom(200);
      if (isNearBottom) {
        chatState.scrollHelperRequestScroll(true);
      }
    }
  }, [
    isAITyping,
    selectedChatId,
    chatState.scrollHelperIsAtBottom,
    chatState.scrollHelperRequestScroll,
  ]);

  // Refetch handoff when rate limit event arrives
  useEffect(() => {
    if (rateLimitInfo) {
      refetchHandoff();
    }
  }, [rateLimitInfo, refetchHandoff]);

  // Load reactions for messages
  const messagesLength = chatState.messages.length;
  useEffect(() => {
    if (messagesLength > 0) {
      const messageIds = chatState.messages.map((m: Message) => m.messageId);
      reactions.loadReactionsForMessages(messageIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesLength, reactions.loadReactionsForMessages]);

  // Clear reactions on chat change
  useEffect(() => {
    reactions.clearReactions();
  }, [selectedChatId, reactions.clearReactions]);

  // Resolve contact from chat participant
  useEffect(() => {
    if (!selectedChatId) {
      setSelectedContactId(null);
      setCustomerLanguage(undefined);
      return;
    }
    if (selectedContactId) return;
    const chat = selectedChat;
    if (!chat?.participantPhone) return;

    let cancelled = false;
    (async () => {
      try {
        const contact = await backendApi.contacts.getByPhone(
          chat.participantPhone,
        );
        if (
          cancelled ||
          !contact ||
          typeof contact !== "object" ||
          !("contactId" in contact)
        )
          return;
        const id = (contact as { contactId: string }).contactId;
        setSelectedContactId(id);
        try {
          const full = await backendApi.contacts.get(id);
          if (
            !cancelled &&
            full &&
            typeof full === "object" &&
            "language" in full
          ) {
            setCustomerLanguage(
              (full as { language?: SupportedLanguage | null }).language ||
                undefined,
            );
          }
        } catch {
          // Language is optional
        }
      } catch {
        // Contact not found
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChatId, selectedChat?.participantPhone]);

  // -------------------------------------------------------------------------
  // Handlers — AI
  // -------------------------------------------------------------------------

  const handleAIToggle = useCallback(
    async (shouldEnable: boolean) => {
      if (shouldEnable) {
        await resumeAI();
        hideRegenerateBanner();
      } else {
        await pauseAI();
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
      enableRegenerateBanner,
      hideRegenerateBanner,
    ],
  );

  const handleAiSend = useCallback(
    async (content: string, mediaAttachment?: any, interactiveData?: any) => {
      if (!selectedChatId) return;
      try {
        await backendApi.aiReview.sendReviewed({
          chatId: selectedChatId,
          content,
          mediaAttachment,
          interactiveData,
        });
        clearPendingReview();
        hideRegenerateBanner();
      } catch (error) {
        console.error("Failed to send reviewed AI response:", error);
        addNotification(
          t("failedToSendAiResponse") || "Failed to send AI response",
          "error",
        );
      }
    },
    [
      selectedChatId,
      clearPendingReview,
      hideRegenerateBanner,
      addNotification,
      t,
    ],
  );

  const handleAiDiscard = useCallback(async () => {
    if (!selectedChatId) return;
    try {
      await backendApi.aiReview.discardPending(selectedChatId);
      clearPendingReview();
      enableRegenerateBanner();
    } catch (error) {
      console.error("Failed to discard AI review:", error);
      clearPendingReview();
      enableRegenerateBanner();
    }
  }, [selectedChatId, clearPendingReview, enableRegenerateBanner]);

  // -------------------------------------------------------------------------
  // Handlers — pins
  // -------------------------------------------------------------------------

  const handlePinMessage = useCallback(
    (messageId: string) => {
      if (pins.pinCount.count >= 3) {
        setPendingPinMessageId(messageId);
        setPinReplaceModalOpen(true);
      } else {
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
        if (pins.pinCount.count >= 3) {
          const oldestPin = pins.pinnedMessages[0];
          if (oldestPin) {
            await pins.unpinMessage(oldestPin.messageId);
          }
        }
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
    setPinReplaceModalOpen(false);
    setPinDurationModalOpen(true);
  }, []);

  const handleNavigateToPinnedMessage = useCallback(
    async (messageId: string) => {
      const existingMessage = chatState.messages.find(
        (m: Message) => m.messageId === messageId,
      );
      if (existingMessage) {
        messageHandlers.handleScrollToMessage(
          messageId,
          chatState.messagesContainerRef,
          chatState.messages,
        );
        return;
      }
      try {
        const context = await pins.getMessageContext(messageId);
        if (context && context.messages.length > 0) {
          await chatState.navigateToPinnedContext(
            messageId,
            context.messages,
            context.hasMoreBefore,
            context.hasMoreAfter,
          );
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                messageHandlers.handleScrollToMessage(
                  messageId,
                  chatState.messagesContainerRef,
                  context.messages,
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

  // -------------------------------------------------------------------------
  // Handlers — search
  // -------------------------------------------------------------------------

  const handleSearchSelectMessage = useCallback(
    async (messageId: string) => {
      if (!selectedChatId) return;
      await messageSearch.scrollToMessage(
        messageId,
        chatState.messages,
        chatState.setMessages,
        chatState.messagesCacheRef,
        chatState.currentMessagesChatIdRef,
        selectedChatId,
        messageHandlers.messageRefs,
        chatState.messagesContainerRef,
      );
    },
    [
      selectedChatId,
      chatState.messages,
      chatState.setMessages,
      chatState.messagesCacheRef,
      chatState.currentMessagesChatIdRef,
      chatState.messagesContainerRef,
      messageHandlers.messageRefs,
      messageSearch,
    ],
  );

  // -------------------------------------------------------------------------
  // Handlers — catalog & location
  // -------------------------------------------------------------------------

  const handleLocationClick = useCallback(() => {
    setLocationPickerOpen(true);
  }, []);

  const handleLocationSend = useCallback(
    async (locationData: {
      latitude: number;
      longitude: number;
      name?: string;
      address?: string;
    }) => {
      if (!selectedChatId || !selectedChat) return;
      try {
        await backendApi.whatsapp.sendLocation({
          to: selectedChat.participantPhone,
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          name: locationData.name,
          address: locationData.address,
          senderId: selectedChat.senderId,
          replyToMessageId: messageHandlers.replyingToMessage?.messageId,
        });
        setLocationPickerOpen(false);
        messageHandlers.handleCancelReply();
        addNotification(
          t("location.sentSuccessfully") || "Location sent successfully",
          "success",
        );
      } catch (error) {
        console.error("Failed to send location:", error);
        addNotification(
          t("location.sendFailed") || "Failed to send location",
          "error",
        );
      }
    },
    [
      selectedChatId,
      selectedChat,
      messageHandlers.replyingToMessage?.messageId,
      messageHandlers.handleCancelReply,
      addNotification,
      t,
    ],
  );

  // -------------------------------------------------------------------------
  // Handlers — contact resolution
  // -------------------------------------------------------------------------

  const handleContactResolved = useCallback(async (contactId: string) => {
    setSelectedContactId(contactId);
    try {
      const contact = await backendApi.contacts.get(contactId);
      if (contact && typeof contact === "object" && "language" in contact) {
        setCustomerLanguage(
          (contact as { language?: SupportedLanguage | null }).language ||
            undefined,
        );
      }
    } catch {
      // Ignore — language is optional
    }
  }, []);

  // -------------------------------------------------------------------------
  // Handlers — sidebar tab
  // -------------------------------------------------------------------------

  const handleSidebarTabChange = useCallback(
    (tab: SidebarTab) => {
      persistSidebarTab(tab);
    },
    [persistSidebarTab],
  );

  // -------------------------------------------------------------------------
  // Handlers — sidebar resize
  // -------------------------------------------------------------------------

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = notesPanelWidth;
    let currentWidth: number = startWidth;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const maxWidth = containerRef.current
        ? containerRef.current.clientWidth * CHAT_SIDEBAR.MAX_WIDTH_RATIO
        : CHAT_SIDEBAR.FALLBACK_MAX_WIDTH;
      currentWidth = Math.max(
        CHAT_SIDEBAR.MIN_WIDTH,
        Math.min(startWidth - deltaX, maxWidth),
      );
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

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      <ChatHeader
        chat={selectedChat}
        onSearchClick={messageSearch.toggleSearch}
        isSearchOpen={messageSearch.isSearchOpen}
        onAIToggle={handleAIToggle}
        isRateLimited={!!activeRateLimit}
        onConfigSaved={() => {
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
            <MessagesList
              messages={chatState.messages}
              selectedChat={selectedChat}
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
              handleViewAllContacts={contactHandlers.handleViewAllContacts}
              handleStartChatWithContact={
                contactHandlers.handleStartChatWithContact
              }
              handleReplyById={messageHandlers.handleReplyById}
              handleDeleteMessage={messageHandlers.handleDeleteMessage}
              handleDownloadById={mediaHandlers.handleDownloadById}
              handleScrollToMessage={messageHandlers.handleScrollToMessage}
              handleImageClick={mediaHandlers.handleImageClick}
              handleShowDownloadMenu={mediaHandlers.handleShowDownloadMenu}
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

            {/* Scroll to Bottom Button */}
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
                    <span className="ml-1 text-xs">{t("returnToLatest")}</span>
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Selection Banner */}
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

          {/* AI Regeneration Banner */}
          {showRegenerateBanner &&
            !pendingReview &&
            !activeRateLimit &&
            !isAITyping &&
            automationEnabled &&
            chatState.messages[chatState.messages.length - 1]?.direction ===
              "inbound" && (
              <AiRegenerateBanner
                chatId={selectedChat.chatId}
                onRegenerateTriggered={() => {
                  hideRegenerateBanner();
                }}
              />
            )}

          {/* Templates Panel — only when automation is DISABLED */}
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

          {/* Input Area */}
          {!messageHandlers.isSelectionMode && pendingReview ? (
            <AiReplyPreviewPanel
              content={pendingReview.content}
              mediaAttachment={pendingReview.mediaAttachment}
              interactiveData={pendingReview.interactiveData}
              onSend={handleAiSend}
              onDiscard={handleAiDiscard}
              isSending={false}
            />
          ) : (
            !messageHandlers.isSelectionMode &&
            !automationEnabled && (
              <MessageInputArea
                messageInputRef={messageInputRef}
                addMoreInputRef={mediaHandlers.addMoreInputRef}
                replyingToMessage={messageHandlers.replyingToMessage}
                selectedChat={selectedChat}
                currentAttachmentType={mediaHandlers.currentAttachmentType}
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
                onLocationClick={handleLocationClick}
                conversationWindow={conversationWindow}
              />
            )
          )}

          {/* Media Staging and Preview Modals */}
          <ChatsModals
            mediaStagingOpen={mediaHandlers.mediaStagingOpen}
            stagedFiles={mediaHandlers.stagedFiles}
            isUploading={isUploading}
            sendButtonText={t("send")}
            onCloseStagingModal={mediaHandlers.handleCloseStagingModal}
            onSendMediaFromStaging={mediaHandlers.handleSendMediaFromStaging}
            onAddMoreMedia={mediaHandlers.handleAddMoreMedia}
            onRemoveStagedFile={mediaHandlers.handleRemoveStagedFile}
            onEditStagedImage={mediaHandlers.handleEditStagedImage}
            onStagedImageEdited={mediaHandlers.handleStagedImageEdited}
            focusFileId={mediaHandlers.focusFileId}
            previewModalOpen={mediaHandlers.previewModalOpen}
            previewMediaItems={mediaHandlers.previewMediaItems}
            previewInitialIndex={mediaHandlers.previewInitialIndex}
            onClosePreviewModal={() => mediaHandlers.setPreviewModalOpen(false)}
            onPreviewGoToMessage={messageHandlers.handleScrollToMessage}
            onPreviewReply={messageHandlers.handleReplyById}
            onPreviewPin={handlePinMessage}
            onPreviewReact={reactions.handleReactionSelect}
            downloadMenuOpen={mediaHandlers.downloadMenuOpen}
            downloadMenuPosition={mediaHandlers.downloadMenuPosition}
            currentMessageAttachments={mediaHandlers.currentMessageAttachments}
            downloadLoading={mediaHandlers.downloadLoading}
            onDownloadSingle={mediaHandlers.handleDownloadSingle}
            onDownloadPack={mediaHandlers.handleDownloadPack}
            onCloseDownloadMenu={() => mediaHandlers.setDownloadMenuOpen(false)}
            deleteDialogOpen={messageHandlers.deleteDialogOpen}
            deletingMessageId={messageHandlers.deletingMessageId}
            onCloseDeleteDialog={() =>
              messageHandlers.setDeleteDialogOpen(false)
            }
            onConfirmDelete={messageHandlers.handleConfirmDeleteMessage}
            videoPreview={mediaHandlers.videoPreview}
            onCloseVideoPreview={() => mediaHandlers.setVideoPreview(null)}
            cameraOpen={mediaHandlers.cameraOpen}
            onCameraCapture={mediaHandlers.handleCameraCapture}
            onCameraClose={mediaHandlers.handleCameraClose}
            imageEditorOpen={mediaHandlers.imageEditorOpen}
            imageToEdit={mediaHandlers.imageToEdit}
            imageEditorSource={mediaHandlers.imageEditorSource}
            onImageEditorSend={mediaHandlers.handleImageEditorSend}
            onImageEditorRetake={mediaHandlers.handleImageEditorRetake}
            onImageEditorClose={mediaHandlers.handleImageEditorClose}
            sendContactsModalOpen={contactHandlers.sendContactsModalOpen}
            contactPreviewModalOpen={contactHandlers.contactPreviewModalOpen}
            viewContactsModalOpen={contactHandlers.viewContactsModalOpen}
            quickContactFormOpen={contactHandlers.quickContactFormOpen}
            senderSelectModalOpen={contactHandlers.senderSelectModalOpen}
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
            onStartChatWithContact={contactHandlers.handleStartChatWithContact}
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

        {/* Resizable Separator */}
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

        {/* Notes Panel or Search Panel */}
        {isSidebarHydrated && isSidebarExpanded && (
          <div
            ref={notesPanelRef}
            className="hidden xl:flex flex-col overflow-hidden"
            style={{ width: `${notesPanelWidth}px` }}
          >
            {messageSearch.isSearchOpen ? (
              <MessageSearchPanel
                chatId={selectedChatId!}
                participantName={selectedChat?.participantName}
                isOpen={messageSearch.isSearchOpen}
                onClose={messageSearch.closeSearch}
                onSelectMessage={handleSearchSelectMessage}
              />
            ) : (
              selectedChatId &&
              currentUserId && (
                <ChatSidebar
                  ref={chatSidebarRef}
                  chatId={selectedChatId}
                  contactId={selectedContactId}
                  currentUserId={currentUserId}
                  onProfileUpdate={() => {}}
                  participantPhone={selectedChat?.participantPhone}
                  participantName={selectedChat?.participantName}
                  onContactCreated={handleContactResolved}
                  initialTab={persistedTab || "profile"}
                  onTabChange={handleSidebarTabChange}
                />
              )
            )}
          </div>
        )}
      </div>

      {/* Pin Duration Modal */}
      <PinDurationModal
        isOpen={pinDurationModalOpen}
        onClose={() => {
          setPinDurationModalOpen(false);
          setPendingPinMessageId(null);
        }}
        onConfirm={handlePinDurationSelect}
      />

      {/* Pin Replace Modal */}
      <PinReplaceModal
        isOpen={pinReplaceModalOpen}
        onClose={() => {
          setPinReplaceModalOpen(false);
          setPendingPinMessageId(null);
        }}
        onConfirm={handlePinReplace}
        oldestPinMessage={pins.pinnedMessages[0]?.message?.text || null}
      />

      {/* Location Picker Modal */}
      <LocationPickerModal
        isOpen={locationPickerOpen}
        onClose={() => setLocationPickerOpen(false)}
        onSend={handleLocationSend}
      />

      {/* Template Send Modal */}
      <TemplateSendModal
        open={!!messageHandlers.pendingTemplate}
        template={messageHandlers.pendingTemplate}
        contactId={selectedContactId}
        senderId={selectedChat?.senderId}
        chatId={selectedChatId || undefined}
        customerLanguage={customerLanguage}
        onSend={messageHandlers.handleSendTemplate}
        onClose={messageHandlers.handleCloseSendModal}
      />
    </>
  );
}
