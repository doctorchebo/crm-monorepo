"use client";

import { MessageListItem } from "./message-list-item";
import { Attachment } from "@/lib/media/types";
import { ReceivedContact } from "@/lib/types/contact-message.types";
import { getDateKey } from "@/lib/utils/date-formatter";
import { Loader } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Chat, Message, MessageReaction } from "../types";
import { DateSeparator } from "./date-separator";
import { StickyDateHeader } from "./sticky-date-header";
import { Checkbox } from "@/components/ui/checkbox";
import { AITypingIndicator } from "@/components/ai-typing-indicator";

// ============================================================
// CONFIGURATION
// ============================================================

/**
 * Number of most recent messages to auto-play GIFs for when opening a chat
 */
const GIF_AUTO_PLAY_RECENT_COUNT = 5;

/**
 * Maximum age in milliseconds for a message to be considered "recent" for auto-play
 * 60 seconds = 60000ms
 */
const GIF_AUTO_PLAY_MAX_AGE_MS = 60 * 1000;

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Check if a message contains GIF attachments
 * Handles cases where attachments might be a JSON string or not an array
 */
function hasGifAttachment(message: Message): boolean {
  let attachments = message.attachments;

  // Handle case where attachments is a JSON string
  if (typeof attachments === "string") {
    try {
      attachments = JSON.parse(attachments);
    } catch {
      return false;
    }
  }

  // Ensure it's an array before calling .some()
  if (!Array.isArray(attachments)) {
    return false;
  }

  return attachments.some((a) => a.type === "gif");
}

/**
 * Check if a message is recent enough for auto-play
 * A message is "recent" if it's within the last N messages OR within the last X seconds
 */
function shouldAutoPlayGifs(
  message: Message,
  allMessages: Message[],
  chatId: string | undefined,
  previousChatIdRef: React.MutableRefObject<string | undefined>
): boolean {
  // Only auto-play when switching to a new chat
  const isNewChat = chatId !== previousChatIdRef.current;
  if (!isNewChat) return false;

  // Only auto-play if message has GIF attachments
  if (!hasGifAttachment(message)) return false;

  // Check if message is among the most recent N messages
  const messageIndex = allMessages.findIndex(
    (m) => m.messageId === message.messageId
  );
  const isAmongRecent =
    messageIndex >= 0 &&
    messageIndex >= allMessages.length - GIF_AUTO_PLAY_RECENT_COUNT;

  // Check if message is within the age threshold
  const messageTime = new Date(message.timestamp).getTime();
  const now = Date.now();
  const isWithinAgeThreshold = now - messageTime < GIF_AUTO_PLAY_MAX_AGE_MS;

  return isAmongRecent && isWithinAgeThreshold;
}

/**
 * Check if a date separator should be shown before a message.
 * Returns the date to show, or null if no separator needed.
 */
function shouldShowDateSeparator(
  currentMessage: Message,
  previousMessage: Message | null
): Date | null {
  const currentDate = new Date(currentMessage.timestamp);
  const currentDateKey = getDateKey(currentDate);

  if (!previousMessage) {
    // First message - always show date separator
    return currentDate;
  }

  const previousDateKey = getDateKey(new Date(previousMessage.timestamp));

  // Show separator if dates are different
  if (currentDateKey !== previousDateKey) {
    return currentDate;
  }

  return null;
}

/**
 * Conversation window status for determining if reactions are allowed
 */
interface ConversationWindowStatus {
  /** Whether we're within the 24-hour window */
  isWithinWindow: boolean;
}

interface MessagesListProps {
  messages: Message[];
  selectedChat: Chat | null;
  isLoadingOlderMessages: boolean;
  hasMoreMessages: boolean;
  messageRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  isScrollRestoring: boolean;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  t: (key: string) => string;
  parseContactsFromMessage: (message: Message) => ReceivedContact[] | null;
  handleViewAllContacts: (contacts: ReceivedContact[]) => void;
  handleStartChatWithContact: (contact: any) => void;
  handleReplyById: (messageId: string) => void;
  handleDeleteMessage: (messageId: string) => void;
  handleDownloadById: (messageId: string) => void;
  handleScrollToMessage: (messageId: string) => void;
  handleImageClick: (
    messageId: string,
    attachments: Attachment[],
    index: number
  ) => void;
  handleShowDownloadMenu: (
    messageId: string,
    attachments: Attachment[],
    position: { x: number; y: number }
  ) => void;
  handleVideoPlay: (videoId: string, url: string) => void;
  highlightedMessageId?: string | null;
  // Reactions
  /** Map of message ID to reactions */
  reactionsMap?: Record<string, MessageReaction[]>;
  /** Map of message ID to customer reactions (from WhatsApp user) */
  customerReactionsMap?: Record<
    string,
    {
      messageId: string;
      emoji: string;
      senderPhone: string;
      timestamp?: string;
    } | null
  >;
  /** Current user's ID for identifying own reactions */
  currentUserId?: number;
  /** Handler when a reaction is selected */
  handleReactionSelect?: (messageId: string, emoji: string) => void;
  /** Set of message IDs that just had reaction changes (for animation) */
  animatingReactionIds?: Set<string>;
  // Pins
  /** Set of pinned message IDs for this chat */
  pinnedMessageIds?: Set<string>;
  /** Handler when pin is requested */
  handlePinMessage?: (messageId: string) => void;
  /** Handler when unpin is requested */
  handleUnpinMessage?: (messageId: string) => void;
  // Conversation window (for reaction availability)
  /**
   * Conversation window status - determines if reactions are allowed
   * When outside the 24-hour window, reactions should be disabled
   */
  conversationWindow?: ConversationWindowStatus;

  // Selection Mode
  isSelectionMode?: boolean;
  selectedMessageIds?: Set<string>;
  onToggleSelection?: (messageId: string) => void;
  isAITyping?: boolean;
}

export function MessagesList({
  messages,
  selectedChat,
  isLoadingOlderMessages,
  hasMoreMessages,
  messageRefs,
  isScrollRestoring,
  messagesContainerRef,
  messagesEndRef,
  t,
  parseContactsFromMessage,
  handleViewAllContacts,
  handleStartChatWithContact,
  handleReplyById,
  handleDeleteMessage,
  handleDownloadById,
  handleScrollToMessage,
  handleImageClick,
  handleShowDownloadMenu,
  handleVideoPlay,
  highlightedMessageId,
  reactionsMap = {},
  customerReactionsMap = {},
  currentUserId,
  handleReactionSelect,
  animatingReactionIds = new Set(),
  pinnedMessageIds = new Set(),
  handlePinMessage,
  handleUnpinMessage,
  conversationWindow,
  isSelectionMode,
  selectedMessageIds,
  onToggleSelection,
  isAITyping,
}: MessagesListProps) {
  // Determine if reactions should be disabled (outside 24-hour window)
  // This logic is now moved into the map function for each message
  // const isReactionDisabled =
  //   conversationWindow !== undefined && !conversationWindow.isWithinWindow;

  // Tooltip text for disabled reactions
  // const reactionDisabledTooltip = isReactionDisabled
  //   ? t("reactions.disabledOutsideWindow") ||
  //   "Reactions are only available within the 24-hour conversation window"
  //   : undefined;

  // Track previous chat ID to detect chat switches (for GIF auto-play on chat open)
  const previousChatIdRef = useRef<string | undefined>(undefined);

  // Track known message IDs to detect newly arrived messages
  const knownMessageIdsRef = useRef<Set<string>>(new Set());

  // Track newly arrived GIF messages that should auto-play
  // These are messages that arrived via WebSocket while the chat is open
  const [newlyArrivedGifMessageIds, setNewlyArrivedGifMessageIds] = useState<
    Set<string>
  >(new Set());

  // Detect newly arrived messages with GIFs and mark them for auto-play
  useEffect(() => {
    // Only process if we have a selected chat (chat is open)
    if (!selectedChat?.chatId) {
      return;
    }

    const currentKnownIds = knownMessageIdsRef.current;
    const newGifMessageIds: string[] = [];

    // Find messages that are new (not in known set) and have GIF attachments
    for (const message of messages) {
      const messageId = message.messageId;
      if (!messageId) continue;

      // Skip if we already know this message
      if (currentKnownIds.has(messageId)) continue;

      // Add to known messages
      currentKnownIds.add(messageId);

      // Check if this message has GIF attachments
      if (hasGifAttachment(message)) {
        // Only auto-play for inbound messages (messages we receive, not send)
        // This matches the expected behavior - user wants to see incoming GIFs play
        if (message.direction === "inbound") {
          newGifMessageIds.push(messageId);
        }
      }
    }

    // If we found new GIF messages, add them to the auto-play set
    // Note: We don't clear these IDs with a timeout anymore.
    // The GIF component has internal tracking (hasAutoPlayedRef) that prevents
    // duplicate auto-plays. The IDs are only cleared when the chat changes.
    if (newGifMessageIds.length > 0) {
      setNewlyArrivedGifMessageIds((prev) => {
        const updated = new Set(prev);
        newGifMessageIds.forEach((id) => updated.add(id));
        return updated;
      });
    }
  }, [messages, selectedChat?.chatId]);

  // Reset known message IDs when chat changes
  useEffect(() => {
    if (selectedChat?.chatId !== previousChatIdRef.current) {
      // Chat changed - reset the known message set with current messages
      knownMessageIdsRef.current = new Set(
        messages.map((m) => m.messageId).filter(Boolean) as string[]
      );
      // Clear any pending auto-play from previous chat
      setNewlyArrivedGifMessageIds(new Set());
    }
  }, [selectedChat?.chatId, messages]);

  // Compute which message IDs should auto-play their GIFs on chat open
  // This only happens on initial chat load, not when receiving new messages
  const autoPlayGifMessageIds = useMemo(() => {
    const ids = new Set<string>();

    // Only compute if we have a chat and it's a new chat
    if (
      !selectedChat?.chatId ||
      selectedChat.chatId === previousChatIdRef.current
    ) {
      return ids;
    }

    // Find messages with GIFs that should auto-play
    messages.forEach((message) => {
      if (
        message.messageId &&
        shouldAutoPlayGifs(
          message,
          messages,
          selectedChat.chatId,
          previousChatIdRef
        )
      ) {
        ids.add(message.messageId);
      }
    });

    return ids;
  }, [selectedChat?.chatId, messages]);

  // Combined auto-play set: GIFs from chat open + newly arrived GIFs
  // This merges both scenarios where GIFs should auto-play
  const combinedAutoPlayGifIds = useMemo(() => {
    const combined = new Set<string>();
    autoPlayGifMessageIds.forEach((id) => combined.add(id));
    newlyArrivedGifMessageIds.forEach((id) => combined.add(id));
    return combined;
  }, [autoPlayGifMessageIds, newlyArrivedGifMessageIds]);

  // Update previousChatIdRef after computing auto-play
  // This ensures auto-play only happens once when opening a chat
  useEffect(() => {
    if (
      selectedChat?.chatId &&
      selectedChat.chatId !== previousChatIdRef.current
    ) {
      // Use a small delay to allow the auto-play memo to use the old value first
      const timeoutId = setTimeout(() => {
        previousChatIdRef.current = selectedChat.chatId;
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [selectedChat?.chatId]);

  return (
    <div
      ref={messagesContainerRef}
      className="h-full overflow-y-auto p-3"
      style={{
        opacity: isScrollRestoring ? 0 : 1,
      }}
    >
      {/* Sticky date header - shows current date based on scroll position */}
      {messages.length > 0 && (
        <StickyDateHeader containerRef={messagesContainerRef} />
      )}

      {/* Loading older messages indicator */}
      {isLoadingOlderMessages && (
        <div className="flex items-center justify-center py-3">
          <Loader className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">
            Loading older messages...
          </span>
        </div>
      )}

      {/* Beginning of conversation indicator */}
      {!hasMoreMessages && messages.length > 0 && (
        <div className="flex items-center justify-center py-3">
          <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
            Beginning of conversation
          </div>
        </div>
      )}

      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">No messages yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((message, index) => {
            // Check if we need a date separator before this message
            const previousMessage = index > 0 ? messages[index - 1] : null;
            const showDateSeparator = shouldShowDateSeparator(
              message,
              previousMessage
            );
            const separatorDate = showDateSeparator
              ? new Date(message.timestamp)
              : null;

            const isOutbound = message.direction === "outbound";
            const isDeleted = !!message.isDeleted;
            const isHighlighted = highlightedMessageId === message.messageId;

            // Optimization: Check selection state using Set
            const isSelected =
              isSelectionMode &&
              selectedMessageIds &&
              !!message.messageId &&
              selectedMessageIds.has(message.messageId);

            const timeString = new Date(message.timestamp).toLocaleTimeString(
              [],
              {
                hour: "2-digit",
                minute: "2-digit",
              }
            );

            // Reactions logic
            const messageReactions =
              reactionsMap[message.messageId!] || [];
            const userReaction = messageReactions.find(
              (r) => r.userId === currentUserId
            );
            const customerReaction =
              customerReactionsMap[message.messageId!] || undefined;
            const reactionAnimating =
              animatingReactionIds.has(message.messageId!);
            const isPinned = pinnedMessageIds.has(message.messageId!);

            // Check if reactions are disabled (outside window)
            let isReactionDisabled = false;
            let reactionDisabledTooltip = undefined;

            if (
              conversationWindow &&
              !conversationWindow.isWithinWindow &&
              !isOutbound
            ) {
              isReactionDisabled = true;
              reactionDisabledTooltip = t("reactions.disabledOutsideWindow");
            }

            return (
              <MessageListItem
                key={message.messageId || message.id}
                message={message}
                selectedChat={selectedChat}
                currentUserId={currentUserId}
                isOutbound={isOutbound}
                isDeleted={!!message.isDeleted}
                isSelected={!!isSelected}
                isSelectionMode={!!isSelectionMode}
                isHighlighted={isHighlighted}
                separatorDate={separatorDate}
                timeString={timeString}
                userReaction={userReaction}
                customerReaction={customerReaction}
                reactions={messageReactions}
                reactionAnimating={reactionAnimating}
                isReactionDisabled={isReactionDisabled}
                reactionDisabledTooltip={reactionDisabledTooltip}
                isPinned={isPinned}
                autoPlayGifs={
                  message.messageId
                    ? combinedAutoPlayGifIds.has(message.messageId)
                    : false
                }
                onToggleSelection={onToggleSelection}
                onSetMessageRef={(el) => {
                  if (el && message.messageId) {
                    messageRefs.current.set(message.messageId, el);
                  }
                }}
                onViewAllContacts={handleViewAllContacts}
                onStartChat={handleStartChatWithContact}
                onReply={handleReplyById}
                onDelete={isOutbound ? handleDeleteMessage : undefined}
                onDownload={handleDownloadById}
                onImageClick={handleImageClick}
                onShowDownloadMenu={handleShowDownloadMenu}
                onVideoPlay={handleVideoPlay}
                onScrollToMessage={handleScrollToMessage}
                onReactionSelect={handleReactionSelect}
                onPin={handlePinMessage}
                onUnpin={handleUnpinMessage}
                parseContactsFromMessage={parseContactsFromMessage}
                t={t}
              />
            );
          })}

          {isAITyping && (
            <div className="px-4 py-2">
              <AITypingIndicator />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div >
      )}
    </div >
  );
}
