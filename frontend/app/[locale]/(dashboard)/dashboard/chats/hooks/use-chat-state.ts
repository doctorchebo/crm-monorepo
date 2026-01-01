"use client";

import {
  NewChatEvent,
  useChatNotifications,
} from "@/hooks/use-chat-notifications";
import { backendApi } from "@/lib/api/endpoints";
import { useCallback, useEffect, useRef, useState } from "react";
import { PAGE_SIZE } from "../constants";
import type { Chat, Message, MessagesCacheEntry, Sender } from "../types";
import { scrollContainerToAbsoluteBottom, scrollDebug } from "./scroll-utils";
import { useScrollPositionManager } from "./use-scroll-position-manager";
import { useScrollToBottom } from "./use-scroll-to-bottom";

/**
 * Pagination state interface for type safety
 * Tracked via ref to avoid stale closures in async operations
 */
interface PaginationState {
  hasMore: boolean;
  hasMoreAfter: boolean; // For bidirectional scroll when in pinned context
  isLoading: boolean;
  isLoadingNewer: boolean; // For loading newer messages
  cursor: number;
  chatId: string | null;
}

interface UseChatStateReturn {
  // Chat state
  chats: Chat[];
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
  senders: Sender[];
  setSenders: React.Dispatch<React.SetStateAction<Sender[]>>;
  selectedChatId: string | null;
  setSelectedChatId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedChat: Chat | null;

  // Messages state
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  messageCount: number;
  setMessageCount: React.Dispatch<React.SetStateAction<number>>;

  // Loading states
  loading: boolean;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  isInitialLoad: boolean;
  setIsInitialLoad: React.Dispatch<React.SetStateAction<boolean>>;

  // Infinite scroll
  hasMoreMessages: boolean;
  setHasMoreMessages: React.Dispatch<React.SetStateAction<boolean>>;
  hasMoreAfter: boolean;
  setHasMoreAfter: React.Dispatch<React.SetStateAction<boolean>>;
  isLoadingOlderMessages: boolean;
  isLoadingNewerMessages: boolean;
  loadOlderMessages: () => Promise<void>;
  loadNewerMessages: () => Promise<void>;

  /**
   * Navigate to a pinned message context.
   * Replaces current messages with a window around the target message.
   * Returns the message ID to scroll to after messages are loaded.
   */
  navigateToPinnedContext: (
    messageId: string,
    contextMessages: Message[],
    hasMoreBefore: boolean,
    hasMoreAfter: boolean
  ) => Promise<void>;

  // Scroll management
  shouldAutoScroll: boolean;
  setShouldAutoScroll: React.Dispatch<React.SetStateAction<boolean>>;
  hasNewMessages: boolean;
  setHasNewMessages: React.Dispatch<React.SetStateAction<boolean>>;
  isScrollRestoring: boolean;
  scrollHelperToBottom: (smooth?: boolean) => boolean;
  scrollHelperRequestScroll: (smooth?: boolean) => (() => void) | undefined;
  scrollHelperIsAtBottom: (threshold?: number) => boolean;

  // Refs
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesCacheRef: React.MutableRefObject<Map<string, MessagesCacheEntry>>;
  /**
   * Ref to track which chat the current messages belong to.
   * Use this to validate before updating messages to prevent cross-chat contamination.
   */
  currentMessagesChatIdRef: React.MutableRefObject<string | null>;
  currentCursorRef: React.MutableRefObject<number>;
  isTransitioningRef: React.MutableRefObject<boolean>;

  // Handlers
  handleSelectChat: (chatId: string) => void;
  handleScrollToBottom: () => void;
}

export function useChatState(): UseChatStateReturn {
  // Core state
  const [chats, setChats] = useState<Chat[]>([]);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageCount, setMessageCount] = useState(0);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Infinite scroll state (React state for UI reactivity)
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [hasMoreAfter, setHasMoreAfter] = useState(false); // For bidirectional scroll when viewing pinned context
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [isLoadingNewerMessages, setIsLoadingNewerMessages] = useState(false);

  /**
   * CRITICAL: Pagination state ref for synchronous access
   *
   * This ref is the SOURCE OF TRUTH for pagination state.
   * React state (hasMoreMessages, isLoadingOlderMessages) is only for UI updates.
   *
   * Why a ref?
   * - React state updates are asynchronous and batched
   * - Callbacks capture state at creation time (stale closures)
   * - Refs provide synchronous, always-current values
   *
   * The chatId field ensures we don't process responses for stale chats.
   */
  const paginationRef = useRef<PaginationState>({
    hasMore: true,
    hasMoreAfter: false,
    isLoading: false,
    isLoadingNewer: false,
    cursor: 0,
    chatId: null,
  });

  // Legacy ref kept for backward compatibility with external consumers
  const currentCursorRef = useRef<number>(0);

  // Scroll management
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [isScrollRestoring, setIsScrollRestoring] = useState(false);

  // Refs
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesCacheRef = useRef<Map<string, MessagesCacheEntry>>(new Map());
  /**
   * CRITICAL: Track which chat the current messages belong to.
   * This prevents cross-chat message contamination when switching chats.
   * Messages should ONLY be updated if they belong to this chat ID.
   */
  const currentMessagesChatIdRef = useRef<string | null>(null);
  const previousChatIdRef = useRef<string | null>(null);
  const lastFetchedChatIdRef = useRef<string | null>(null); // Guards against duplicate fetches
  const isTransitioningRef = useRef(false);

  // Track which chats have had their initial scroll-to-bottom completed
  // This is SEPARATE from messagesCacheRef because caching happens BEFORE the scroll effect runs
  const initialScrollDoneRef = useRef<Set<string>>(new Set());

  /**
   * Ref to always have the current selectedChatId
   * This prevents stale closure issues in async callbacks
   * where the closure value might be outdated when the callback is invoked.
   */
  const selectedChatIdRef = useRef<string | null>(selectedChatId);
  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  /**
   * Ref for shouldAutoScroll to prevent stale closure issues
   */
  const shouldAutoScrollRef = useRef(shouldAutoScroll);
  useEffect(() => {
    shouldAutoScrollRef.current = shouldAutoScroll;
  }, [shouldAutoScroll]);

  // Initialize the scroll position manager - SINGLE SOURCE OF TRUTH for scroll positions
  const scrollPositionManager = useScrollPositionManager(messagesContainerRef, {
    bottomThreshold: 100,
    saveDebounceMs: 100,
  });

  // Initialize the scroll-to-bottom hook
  // NOTE: First load scroll is handled DIRECTLY when messages are fetched
  // This hook only handles new messages arriving while viewing
  const {
    scrollToBottom: scrollHelperToBottom,
    requestScrollToBottom: scrollHelperRequestScroll,
    isAtBottom: scrollHelperIsAtBottom,
  } = useScrollToBottom(messagesContainerRef, {
    messages,
    selectedChatId,
    shouldAutoScroll,
  });

  // Memoize selectedChat
  const selectedChat = chats.find((c) => c.chatId === selectedChatId) || null;

  // Get chat notifications context
  const {
    setActiveChatId,
    resetUnreadCount,
    chatUpdates,
    setAllUnreadCounts,
    onNewChat,
  } = useChatNotifications();

  // Subscribe to new chat events and add them to the chat list
  useEffect(() => {
    const unsubscribe = onNewChat((newChat: NewChatEvent) => {
      console.log(
        `[useChatState] 🆕 Received new chat event: ${newChat.chatId}`
      );

      // Add the new chat to the top of the list (most recent first)
      setChats((prevChats) => {
        // Check if chat already exists (avoid duplicates)
        const exists = prevChats.some((c) => c.chatId === newChat.chatId);
        if (exists) {
          console.log(
            `[useChatState] Chat ${newChat.chatId} already exists, skipping`
          );
          return prevChats;
        }

        // Transform the event to match the Chat type
        const chatToAdd: Chat = {
          id: 0, // Will be set by backend
          chatId: newChat.chatId,
          businessPhone: newChat.businessPhone,
          participantPhone: newChat.participantPhone,
          participantName: newChat.participantName,
          senderId: newChat.senderId,
          userId: newChat.userId,
          isActive: newChat.isActive,
          unreadCount: newChat.unreadCount,
          lastMessage: newChat.lastMessage || null,
          lastMessageType: newChat.lastMessageType || null,
          lastMessageTime: newChat.lastMessageTime || null,
          createdAt: newChat.createdAt,
          updatedAt: newChat.createdAt,
        };

        console.log(
          `[useChatState] Adding new chat to list: ${chatToAdd.chatId}`
        );

        // Add to beginning of list (newest first)
        return [chatToAdd, ...prevChats];
      });
    });

    return () => {
      unsubscribe();
    };
  }, [onNewChat]);

  // Initialize unread counts in the context when chats are loaded
  useEffect(() => {
    if (chats.length === 0) return;

    const counts = new Map<string, number>();
    chats.forEach((chat) => {
      counts.set(chat.chatId, chat.unreadCount || 0);
    });
    setAllUnreadCounts(counts);
  }, [chats.length]); // Only run when chats are loaded

  // Update active chat when selection changes (for notification sound suppression)
  useEffect(() => {
    setActiveChatId(selectedChatId);
    return () => {
      // Don't reset to null on unmount to avoid issues during navigation
    };
  }, [selectedChatId, setActiveChatId]);

  // Listen for chat updates from WebSocket and update local state
  // IMPORTANT: Skip unread count updates for the currently selected chat
  // Also: mark as read on the backend if new messages arrive for the active chat
  useEffect(() => {
    if (chatUpdates.size === 0) return;

    // Check if any updates are for the currently selected chat
    // If so, mark it as read on the backend to keep database in sync
    if (selectedChatId) {
      const selectedChatUpdate = chatUpdates.get(selectedChatId);
      if (selectedChatUpdate && selectedChatUpdate.unreadCount > 0) {
        // New message arrived for the active chat - mark as read on backend
        // This keeps the database in sync so refresh shows correct count
        backendApi.chats.markAsRead(selectedChatId).catch((error) => {
          console.error("Failed to mark active chat as read:", error);
        });
      }
    }

    setChats((prevChats) => {
      let hasUpdates = false;
      const updatedChats = prevChats.map((chat) => {
        const update = chatUpdates.get(chat.chatId);
        if (update) {
          hasUpdates = true;
          // Skip unread count update for currently selected chat
          // The selected chat should always show 0 unread
          const isSelectedChat = chat.chatId === selectedChatId;
          return {
            ...chat,
            unreadCount: isSelectedChat ? 0 : update.unreadCount,
            lastMessage: update.lastMessage || chat.lastMessage,
            lastMessageType: update.lastMessageType || chat.lastMessageType,
            lastMessageTime: update.lastMessageTime || chat.lastMessageTime,
            // Reaction activity tracking fields
            lastActivityType: update.lastActivityType ?? chat.lastActivityType,
            lastReactionEmoji:
              update.lastActivityType === "reaction"
                ? update.lastReactionEmoji
                : update.lastActivityType === "message"
                ? null
                : chat.lastReactionEmoji,
            lastReactionIsOwn:
              update.lastActivityType === "reaction"
                ? update.lastReactionIsOwn
                : update.lastActivityType === "message"
                ? null
                : chat.lastReactionIsOwn,
            lastReactedMessagePreview:
              update.lastActivityType === "reaction"
                ? update.lastReactedMessagePreview
                : update.lastActivityType === "message"
                ? null
                : chat.lastReactedMessagePreview,
          };
        }
        return chat;
      });

      return hasUpdates ? updatedChats : prevChats;
    });
  }, [chatUpdates, selectedChatId]);

  // Handler to select chat and save scroll position before switching
  const handleSelectChat = useCallback(
    async (chatId: string) => {
      // Skip if same chat
      if (chatId === selectedChatId) {
        return;
      }

      // CRITICAL: Notify scroll manager BEFORE switching
      // This saves the current scroll position synchronously
      scrollPositionManager.onChatWillChange(selectedChatId, chatId);

      // Save messages to cache before switching
      if (selectedChatId && messages.length > 0) {
        messagesCacheRef.current.set(selectedChatId, {
          messages: [...messages],
          hasMore: paginationRef.current.hasMore,
          cursor: paginationRef.current.cursor,
        });
        scrollDebug("[handleSelectChat] Saved to cache:", {
          chatId: selectedChatId,
          messageCount: messages.length,
          hasMore: paginationRef.current.hasMore,
          cursor: paginationRef.current.cursor,
        });
      }

      // Mark the chat as read when selecting it
      try {
        await backendApi.chats.markAsRead(chatId);
        resetUnreadCount(chatId);

        // Update local chat state to show 0 unread
        setChats((prev) =>
          prev.map((c) => (c.chatId === chatId ? { ...c, unreadCount: 0 } : c))
        );
      } catch (error) {
        console.error("Failed to mark chat as read:", error);
      }

      setSelectedChatId(chatId);
    },
    [selectedChatId, messages, resetUnreadCount, scrollPositionManager]
  );

  /**
   * Load older messages for infinite scroll
   *
   * CRITICAL: This function uses paginationRef (not React state) for all
   * pagination checks to avoid stale closure issues.
   *
   * Flow:
   * 1. Check ref for hasMore/isLoading (synchronous, always current)
   * 2. Set isLoading=true in ref FIRST (prevents concurrent calls)
   * 3. Fetch data
   * 4. Update ref with new cursor/hasMore
   * 5. Update React state for UI
   * 6. Restore scroll position
   */
  const loadOlderMessages = useCallback(async () => {
    // Read current pagination state from ref (always up-to-date)
    const currentState = paginationRef.current;
    const { hasMore, isLoading, cursor, chatId } = currentState;

    // Debug: Log entry state
    scrollDebug("[loadOlderMessages] Entry state:", {
      hasMore,
      isLoading,
      cursor,
      chatId,
    });

    // Guard: no chat selected
    if (!chatId) {
      scrollDebug("[loadOlderMessages] SKIP: No chat selected");
      return;
    }

    // Guard: no more messages to load
    if (!hasMore) {
      scrollDebug("[loadOlderMessages] SKIP: hasMore is false");
      return;
    }

    // Guard: already loading (prevent concurrent requests)
    if (isLoading) {
      scrollDebug("[loadOlderMessages] SKIP: Already loading");
      return;
    }

    const container = messagesContainerRef.current;
    if (!container) {
      scrollDebug("[loadOlderMessages] SKIP: No container ref");
      return;
    }

    // CRITICAL: Set loading state in ref FIRST (synchronous)
    // This prevents any concurrent calls before async operation starts
    paginationRef.current.isLoading = true;
    setIsLoadingOlderMessages(true);

    scrollDebug("[loadOlderMessages] STARTING fetch with cursor:", cursor);

    // Save scroll position for restoration after prepending messages
    const previousScrollHeight = container.scrollHeight;
    const previousScrollTop = container.scrollTop;

    try {
      const response = await backendApi.whatsapp.getChatMessages(
        chatId,
        cursor,
        PAGE_SIZE
      );

      // Race condition check: user may have switched chats during fetch
      if (paginationRef.current.chatId !== chatId) {
        scrollDebug("[loadOlderMessages] ABORT: Chat changed during fetch");
        paginationRef.current.isLoading = false;
        setIsLoadingOlderMessages(false);
        return;
      }

      scrollDebug("[loadOlderMessages] RESPONSE received:", {
        messageCount: response.messages?.length || 0,
        hasMore: response.hasMore,
        nextCursor: response.nextCursor,
      });

      // Handle empty response
      if (!response.messages || response.messages.length === 0) {
        scrollDebug(
          "[loadOlderMessages] COMPLETE: No more messages (empty response)"
        );
        paginationRef.current.hasMore = false;
        paginationRef.current.isLoading = false;
        setHasMoreMessages(false);
        setIsLoadingOlderMessages(false);
        return;
      }

      // Sort older messages by timestamp (ascending for display)
      const sortedOlderMessages = [...response.messages].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // Update messages state with deduplication
      setMessages((prevMessages) => {
        const existingIds = new Set(prevMessages.map((m) => m.messageId));
        const newMessages = sortedOlderMessages.filter(
          (m) => !existingIds.has(m.messageId)
        );
        const combined = [...newMessages, ...prevMessages];

        // Update cache with new state
        // IMPORTANT: Ensure cursor is a number to prevent string concatenation bugs
        messagesCacheRef.current.set(chatId, {
          messages: combined,
          hasMore: response.hasMore,
          cursor: Number(response.nextCursor) || 0,
        });

        scrollDebug("[loadOlderMessages] Messages updated:", {
          prevCount: prevMessages.length,
          newCount: newMessages.length,
          combinedCount: combined.length,
        });

        return combined;
      });

      // CRITICAL: Update pagination ref with new values
      // IMPORTANT: Ensure cursor is a number to prevent string concatenation bugs
      const nextCursor = Number(response.nextCursor) || 0;
      const newPaginationState: PaginationState = {
        hasMore: response.hasMore,
        hasMoreAfter: paginationRef.current.hasMoreAfter, // Preserve bidirectional state
        isLoading: false,
        isLoadingNewer: paginationRef.current.isLoadingNewer, // Preserve loading state
        cursor: nextCursor,
        chatId: chatId,
      };
      paginationRef.current = newPaginationState;

      scrollDebug(
        "[loadOlderMessages] COMPLETE - New pagination state:",
        newPaginationState
      );

      // Update legacy ref and React state
      currentCursorRef.current = nextCursor;
      setHasMoreMessages(response.hasMore);
      setIsLoadingOlderMessages(false);

      // Restore scroll position after DOM update
      requestAnimationFrame(() => {
        if (container && paginationRef.current.chatId === chatId) {
          const newScrollHeight = container.scrollHeight;
          const scrollDifference = newScrollHeight - previousScrollHeight;
          container.scrollTop = previousScrollTop + scrollDifference;
          scrollDebug("[loadOlderMessages] Scroll restored:", {
            previousScrollTop,
            scrollDifference,
            newScrollTop: previousScrollTop + scrollDifference,
          });
        }
      });
    } catch (err) {
      console.error("[loadOlderMessages] ERROR:", err);
      // Reset loading state on error
      paginationRef.current.isLoading = false;
      setIsLoadingOlderMessages(false);
    }
  }, []); // No dependencies - uses refs for all state

  /**
   * Load newer messages for bidirectional infinite scroll.
   * Used when user scrolls DOWN while viewing pinned message context.
   * Only active when hasMoreAfter is true (i.e., not viewing the latest messages).
   */
  const loadNewerMessages = useCallback(async () => {
    const currentState = paginationRef.current;
    const {
      chatId,
      hasMoreAfter: hasMoreAfterRef,
      isLoadingNewer,
    } = currentState;

    scrollDebug("[loadNewerMessages] Entry state:", {
      chatId,
      isLoadingNewer,
      hasMoreAfter: hasMoreAfterRef,
    });

    // Guard: no chat selected
    if (!chatId) {
      scrollDebug("[loadNewerMessages] SKIP: No chat selected");
      return;
    }

    // Guard: no more newer messages to load (use ref for synchronous check)
    if (!hasMoreAfterRef) {
      scrollDebug("[loadNewerMessages] SKIP: hasMoreAfter is false");
      return;
    }

    // Guard: already loading (prevent concurrent requests)
    if (isLoadingNewer) {
      scrollDebug("[loadNewerMessages] SKIP: Already loading");
      return;
    }

    const container = messagesContainerRef.current;
    if (!container) {
      scrollDebug("[loadNewerMessages] SKIP: No container ref");
      return;
    }

    // CRITICAL: Set loading state in ref FIRST (synchronous)
    paginationRef.current.isLoadingNewer = true;
    setIsLoadingNewerMessages(true);

    scrollDebug("[loadNewerMessages] STARTING fetch");

    // Get the newest message's timestamp to fetch messages after it
    const currentMessages =
      messagesCacheRef.current.get(chatId)?.messages || [];
    if (currentMessages.length === 0) {
      scrollDebug("[loadNewerMessages] SKIP: No current messages");
      paginationRef.current.isLoadingNewer = false;
      setIsLoadingNewerMessages(false);
      return;
    }

    // Find the newest message (last in array since sorted ascending by timestamp)
    const newestMessage = currentMessages[currentMessages.length - 1];
    const afterTimestamp = newestMessage.timestamp;

    try {
      const response = await backendApi.whatsapp.getNewerMessages(
        chatId,
        afterTimestamp,
        PAGE_SIZE
      );

      // Race condition check: user may have switched chats during fetch
      if (paginationRef.current.chatId !== chatId) {
        scrollDebug("[loadNewerMessages] ABORT: Chat changed during fetch");
        paginationRef.current.isLoadingNewer = false;
        setIsLoadingNewerMessages(false);
        return;
      }

      scrollDebug("[loadNewerMessages] RESPONSE received:", {
        messageCount: response.messages?.length || 0,
        hasMore: response.hasMore,
      });

      // Handle empty response
      if (!response.messages || response.messages.length === 0) {
        scrollDebug(
          "[loadNewerMessages] COMPLETE: No more messages (empty response)"
        );
        paginationRef.current.hasMoreAfter = false;
        paginationRef.current.isLoadingNewer = false;
        setHasMoreAfter(false);
        setIsLoadingNewerMessages(false);
        return;
      }

      // Sort newer messages by timestamp (ascending for display)
      const sortedNewerMessages = [...response.messages].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // Update messages state with deduplication - append to end
      setMessages((prevMessages) => {
        const existingIds = new Set(prevMessages.map((m) => m.messageId));
        const newMessages = sortedNewerMessages.filter(
          (m) => !existingIds.has(m.messageId)
        );
        const combined = [...prevMessages, ...newMessages];

        // Update cache with new state
        messagesCacheRef.current.set(chatId, {
          messages: combined,
          hasMore: paginationRef.current.hasMore,
          cursor: paginationRef.current.cursor,
        });

        scrollDebug("[loadNewerMessages] Messages updated:", {
          prevCount: prevMessages.length,
          newCount: newMessages.length,
          combinedCount: combined.length,
        });

        return combined;
      });

      // Update pagination ref and React state
      paginationRef.current.hasMoreAfter = response.hasMore;
      paginationRef.current.isLoadingNewer = false;
      setHasMoreAfter(response.hasMore);
      setIsLoadingNewerMessages(false);

      scrollDebug(
        "[loadNewerMessages] COMPLETE - hasMoreAfter:",
        response.hasMore
      );
    } catch (err) {
      console.error("[loadNewerMessages] ERROR:", err);
      paginationRef.current.isLoadingNewer = false;
      setIsLoadingNewerMessages(false);
    }
  }, []); // No dependencies - uses refs for all state

  /**
   * Navigate to a pinned message context.
   * REPLACES current messages with a window around the target message.
   * This is critical for performance - don't keep thousands of messages in memory.
   *
   * @param messageId - The ID of the pinned message to navigate to
   * @param contextMessages - Messages window from getMessageContext
   * @param hasMoreBefore - Whether there are older messages to load
   * @param hasMoreAfter - Whether there are newer messages to load
   */
  const navigateToPinnedContext = useCallback(
    async (
      messageId: string,
      contextMessages: Message[],
      contextHasMoreBefore: boolean,
      contextHasMoreAfter: boolean
    ) => {
      const chatId = paginationRef.current.chatId;
      if (!chatId) {
        scrollDebug("[navigateToPinnedContext] SKIP: No chat selected");
        return;
      }

      scrollDebug("[navigateToPinnedContext] Navigating to:", {
        messageId,
        contextMessageCount: contextMessages.length,
        hasMoreBefore: contextHasMoreBefore,
        hasMoreAfter: contextHasMoreAfter,
      });

      // Sort context messages by timestamp (ascending)
      const sortedMessages = [...contextMessages].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // CRITICAL: REPLACE messages, don't merge
      // This prevents memory bloat when navigating to old pinned messages
      setMessages(sortedMessages);

      // Calculate cursor for older messages pagination
      // The cursor should be the index position for offset-based pagination
      // Since we're in the middle of the conversation, we need to track position
      const oldestMessage = sortedMessages[0];
      const newestMessage = sortedMessages[sortedMessages.length - 1];

      // Update cache with the new window
      // Note: We use a special cursor value to indicate we're in pinned context mode
      messagesCacheRef.current.set(chatId, {
        messages: sortedMessages,
        hasMore: contextHasMoreBefore,
        cursor: 0, // Will be recalculated if user loads older messages
      });

      // Update pagination ref with all fields including bidirectional scroll state
      paginationRef.current = {
        hasMore: contextHasMoreBefore,
        hasMoreAfter: contextHasMoreAfter,
        isLoading: false,
        isLoadingNewer: false,
        cursor: 0,
        chatId: chatId,
      };

      // Update React state for UI
      setHasMoreMessages(contextHasMoreBefore);
      setHasMoreAfter(contextHasMoreAfter);

      scrollDebug("[navigateToPinnedContext] State updated:", {
        messageCount: sortedMessages.length,
        hasMoreBefore: contextHasMoreBefore,
        hasMoreAfter: contextHasMoreAfter,
        oldestTimestamp: oldestMessage?.timestamp,
        newestTimestamp: newestMessage?.timestamp,
      });
    },
    []
  );

  /**
   * Handle scroll to bottom button click.
   * If viewing pinned message context (hasMoreAfter = true), this will
   * refetch the latest messages to return to the normal view.
   *
   * Uses scrollContainerToAbsoluteBottom with retry mechanism to ensure
   * the scroll completes even if content is still rendering.
   */
  const handleScrollToBottom = useCallback(async () => {
    const chatId = paginationRef.current.chatId;
    const hasMoreAfterRef = paginationRef.current.hasMoreAfter;

    /**
     * Scroll to absolute bottom with retry mechanism.
     * Waits for DOM to update before initiating scroll.
     */
    const scrollToAbsoluteBottom = () => {
      // Use triple RAF to ensure React has committed and browser has painted
      // RAF1: React state flush, RAF2: Browser layout, RAF3: Safe to scroll
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollContainerToAbsoluteBottom(
              messagesContainerRef.current,
              true // smooth
            );
          });
        });
      });
    };

    // If we're in pinned context mode (hasMoreAfter is true),
    // we need to refetch the latest messages
    if (hasMoreAfterRef && chatId) {
      scrollDebug("[handleScrollToBottom] Returning to latest messages");

      try {
        // Fetch the latest messages (same as initial load)
        const response = await backendApi.whatsapp.getChatMessages(
          chatId,
          0,
          PAGE_SIZE
        );

        if (response.messages && response.messages.length > 0) {
          // Sort messages ascending by timestamp
          const sortedMessages = [...response.messages].sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );

          // Update state
          setMessages(sortedMessages);
          setHasMoreMessages(response.hasMore);
          setHasMoreAfter(false); // No longer in pinned context mode

          // Update cache
          messagesCacheRef.current.set(chatId, {
            messages: sortedMessages,
            hasMore: response.hasMore,
            cursor: Number(response.nextCursor) || 0,
          });

          // Update pagination ref with all fields
          paginationRef.current = {
            hasMore: response.hasMore,
            hasMoreAfter: false,
            isLoading: false,
            isLoadingNewer: false,
            cursor: Number(response.nextCursor) || 0,
            chatId: chatId,
          };
          currentCursorRef.current = Number(response.nextCursor) || 0;

          // Wait for DOM to update with new messages, then scroll with retry
          scrollToAbsoluteBottom();
        }
      } catch (err) {
        console.error(
          "[handleScrollToBottom] Error fetching latest messages:",
          err
        );
        // Even on error, try to scroll to current bottom
        scrollContainerToAbsoluteBottom(messagesContainerRef.current, true);
      }
    } else {
      // Not in pinned context mode - just scroll to bottom with retry mechanism
      scrollContainerToAbsoluteBottom(messagesContainerRef.current, true);
    }

    setHasNewMessages(false);
    setShouldAutoScroll(true);
  }, []); // No dependencies - uses refs for all mutable values

  // Handle scroll position tracking and infinite scroll trigger
  useEffect(() => {
    const messagesContainer = messagesContainerRef.current;
    if (!messagesContainer) return;

    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      const isAtBottom = scrollHelperIsAtBottom(50);
      setShouldAutoScroll(isAtBottom);

      if (isAtBottom) {
        setHasNewMessages(false);
      }

      const scrollTop = messagesContainer.scrollTop;
      const threshold = 100;

      // Read pagination state from ref (always current)
      const paginationState = paginationRef.current;
      const { hasMore, isLoading, cursor, chatId } = paginationState;

      // Debug: Log every scroll event that's near the top
      if (scrollTop < threshold + 50) {
        scrollDebug("[Scroll Handler] Near top:", {
          scrollTop,
          hasMore,
          isLoading,
          cursor,
          isTransitioning: isTransitioningRef.current,
          willTrigger:
            scrollTop < threshold &&
            hasMore &&
            !isLoading &&
            !isTransitioningRef.current,
        });
      }

      // Trigger load if user is near top and conditions are met
      if (
        scrollTop < threshold &&
        hasMore &&
        !isLoading &&
        !isTransitioningRef.current
      ) {
        scrollDebug("[Scroll Handler] >>> TRIGGERING loadOlderMessages <<<");
        loadOlderMessages();
      }

      // Bidirectional scroll: Check if user is near bottom and has more newer messages
      // This only triggers when viewing pinned message context (hasMoreAfter is true)
      const scrollHeight = messagesContainer.scrollHeight;
      const clientHeight = messagesContainer.clientHeight;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      if (distanceFromBottom < threshold && !isTransitioningRef.current) {
        scrollDebug("[Scroll Handler] >>> TRIGGERING loadNewerMessages <<<");
        loadNewerMessages();
      }

      // Save scroll position via the centralized manager
      // The manager handles all the guards (transitioning, save enabled, etc.)
      if (selectedChatId) {
        scrollPositionManager.handleScroll(selectedChatId);
      }
    };

    const debouncedHandleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(handleScroll, 50);
    };

    messagesContainer.addEventListener("scroll", debouncedHandleScroll);
    return () => {
      messagesContainer.removeEventListener("scroll", debouncedHandleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [
    selectedChatId,
    loadOlderMessages,
    loadNewerMessages,
    scrollHelperIsAtBottom,
    scrollPositionManager,
  ]);

  /**
   * UNIFIED CHAT SWITCH HANDLER
   *
   * This effect handles ALL aspects of switching to a new chat:
   * 1. Updates the currentMessagesChatIdRef (ownership tracking)
   * 2. Resets pagination state
   * 3. Either restores from cache OR clears for fresh fetch
   *
   * CRITICAL: This is the ONLY place that should modify messages during chat switch.
   * The separate "Fetch Messages" effect handles the actual data fetching.
   *
   * The key insight is:
   * - If we have cached messages, swap them in atomically (no clear → restore gap)
   * - If we don't have cache, clear messages to prevent cross-chat contamination
   */
  useEffect(() => {
    if (selectedChatId && selectedChatId !== previousChatIdRef.current) {
      const fromChat = previousChatIdRef.current;
      const toChat = selectedChatId;

      scrollDebug("[Chat Switch] From:", fromChat, "To:", toChat);

      // Update the chat ID that messages belong to FIRST
      // This is the source of truth for message ownership
      currentMessagesChatIdRef.current = toChat;

      // Check if we have cached messages for the new chat
      const cachedData = messagesCacheRef.current.get(toChat);
      const hasCachedMessages = cachedData && cachedData.messages.length > 0;

      scrollDebug("[Chat Switch] Cache status:", {
        toChat,
        hasCachedMessages,
        cachedMessageCount: cachedData?.messages?.length || 0,
      });

      if (hasCachedMessages) {
        // CACHED PATH: Atomically swap messages (no intermediate empty state)
        // This preserves DOM stability for scroll position restoration
        setMessages(cachedData.messages);
        setMessageCount(cachedData.messages.length);
        setHasMoreMessages(cachedData.hasMore);
        currentCursorRef.current = cachedData.cursor;

        // Sync pagination ref with cached data
        paginationRef.current = {
          hasMore: cachedData.hasMore,
          hasMoreAfter: false, // Reset when switching chats
          isLoading: false,
          isLoadingNewer: false,
          cursor: cachedData.cursor,
          chatId: toChat,
        };

        scrollDebug("[Chat Switch] Restored from cache:", {
          messageCount: cachedData.messages.length,
          cursor: cachedData.cursor,
          hasMore: cachedData.hasMore,
        });
      } else {
        // UNCACHED PATH: Clear messages to prevent cross-chat contamination
        // A fresh fetch will populate the messages
        setMessages([]);
        setMessageCount(0);
        setHasMoreMessages(true);
        currentCursorRef.current = 0;

        // Reset pagination ref for fresh fetch
        paginationRef.current = {
          hasMore: true,
          hasMoreAfter: false, // Reset when switching chats
          isLoading: false,
          isLoadingNewer: false,
          cursor: 0,
          chatId: toChat,
        };

        scrollDebug("[Chat Switch] Cleared for fresh fetch");
      }

      // Common state updates for both paths
      setIsLoadingOlderMessages(false);
      setIsLoadingNewerMessages(false);
      setHasMoreAfter(false); // Reset bidirectional scroll state when switching chats
      isTransitioningRef.current = true;
      setIsScrollRestoring(true);
      previousChatIdRef.current = toChat;
      setIsInitialLoad(true);
      setHasNewMessages(false);

      scrollDebug(
        "[Chat Switch] Complete. Pagination ref:",
        paginationRef.current
      );
    }
  }, [selectedChatId]);

  // Handle state transitions for first-time visit to chat (UNCACHED only)
  // For CACHED chats, scroll position is restored in the Fetch Messages effect
  // This effect only handles the case where we're loading a chat for the first time
  useEffect(() => {
    if (messages.length === 0 || !isInitialLoad) {
      return;
    }

    // For CACHED chats, the Fetch Messages effect handles everything including
    // scroll position restoration and calling onChatDidChange. Skip here.
    const hasCachedMessages = selectedChatId
      ? messagesCacheRef.current.has(selectedChatId)
      : false;

    if (hasCachedMessages) {
      // Just mark initial load as complete - Fetch Messages effect handles the rest
      setIsInitialLoad(false);
      return;
    }

    // For UNCACHED (first-time) chat loads:
    // Mark initial load complete and scroll to bottom
    setIsInitialLoad(false);
    setShouldAutoScroll(true);

    // Enable scroll position saving for this new chat
    if (selectedChatId) {
      scrollPositionManager.onChatDidChange(selectedChatId);
    }
  }, [selectedChatId, messages.length, isInitialLoad, scrollPositionManager]);

  // Fetch chats on mount
  useEffect(() => {
    const fetchChats = async () => {
      try {
        setLoading(true);
        setError(null);

        // Check for selectedChatId query parameter - only auto-select if explicitly provided
        const urlParams = new URLSearchParams(window.location.search);
        const querySelectedChatId = urlParams.get("selectedChatId");

        const sendersData = await backendApi.senders.list();
        if (Array.isArray(sendersData)) {
          setSenders(sendersData);
        }

        const data = await backendApi.whatsapp.getChats(0, 50);

        if (Array.isArray(data) && data.length > 0) {
          setChats(data);

          // Only auto-select a chat when navigating with a specific chat ID (e.g., from contacts page)
          // Otherwise, leave no chat selected - user must explicitly select one
          if (querySelectedChatId) {
            const chatExists = data.some(
              (c) => c.chatId === querySelectedChatId
            );
            if (chatExists) {
              setSelectedChatId(querySelectedChatId);
              // Mark the chat as read since we're auto-selecting it
              try {
                await backendApi.chats.markAsRead(querySelectedChatId);
                // Update local chat state to show 0 unread
                setChats((prev) =>
                  prev.map((c) =>
                    c.chatId === querySelectedChatId
                      ? { ...c, unreadCount: 0 }
                      : c
                  )
                );
              } catch (error) {
                console.error("Failed to mark chat as read:", error);
              }
            } else {
              // Chat not found yet - might be newly created, retry after a short delay
              setTimeout(async () => {
                try {
                  const retryData = await backendApi.whatsapp.getChats(0, 50);
                  if (Array.isArray(retryData) && retryData.length > 0) {
                    setChats(retryData);
                    const foundChat = retryData.find(
                      (c) => c.chatId === querySelectedChatId
                    );
                    if (foundChat) {
                      setSelectedChatId(querySelectedChatId);
                      // Mark the chat as read
                      try {
                        await backendApi.chats.markAsRead(querySelectedChatId);
                        setChats((prev) =>
                          prev.map((c) =>
                            c.chatId === querySelectedChatId
                              ? { ...c, unreadCount: 0 }
                              : c
                          )
                        );
                      } catch (error) {
                        console.error("Failed to mark chat as read:", error);
                      }
                    }
                    // If still not found, leave no chat selected
                  }
                } catch (retryErr) {
                  console.error("Retry fetch failed:", retryErr);
                }
              }, 300);
            }
          }
          // When no querySelectedChatId is provided, leave selectedChatId as null
          // User will see the empty state and can manually select a chat
        } else {
          setChats([]);
          setSelectedChatId(null);
        }
      } catch (err) {
        console.error("Error fetching chats:", err);
        setError("Failed to load chats");
        setChats([]);
        setSelectedChatId(null);
      } finally {
        setLoading(false);
      }
    };

    fetchChats();
  }, []);

  // Fetch messages when chat changes
  // CRITICAL: This effect complements the Chat Switch effect:
  // - Chat Switch effect handles cache restoration and message swapping
  // - This effect handles: fresh fetches for uncached chats, scroll restoration for cached chats
  useEffect(() => {
    console.log(
      "[Fetch Messages] Effect triggered. selectedChatId:",
      selectedChatId
    );

    if (!selectedChatId) {
      console.log("[Fetch Messages] SKIP: no selectedChatId");
      return;
    }

    // CRITICAL GUARD: Only run if this is a NEW chat selection
    // This prevents re-running when other dependencies change
    if (lastFetchedChatIdRef.current === selectedChatId) {
      console.log(
        "[Fetch Messages] SKIP: already fetched for:",
        selectedChatId
      );
      scrollDebug(
        "[Fetch Messages] Skipping - already fetched for:",
        selectedChatId
      );
      return;
    }

    console.log(
      "[Fetch Messages] RUNNING - new chat:",
      selectedChatId,
      "previous:",
      lastFetchedChatIdRef.current
    );
    scrollDebug(
      "[Fetch Messages] Running for:",
      selectedChatId,
      "Previous:",
      lastFetchedChatIdRef.current
    );

    // Mark this chat as the one we're loading
    const chatToLoad = selectedChatId;
    lastFetchedChatIdRef.current = chatToLoad;

    // Check if Chat Switch effect already restored from cache
    // If so, messages will already be populated
    const cachedData = messagesCacheRef.current.get(chatToLoad);
    const wasRestoredFromCache = cachedData && cachedData.messages.length > 0;

    console.log("[Fetch Messages] Cache check:", {
      chatToLoad,
      wasRestoredFromCache,
      cachedMessageCount: cachedData?.messages?.length || 0,
      cacheKeys: Array.from(messagesCacheRef.current.keys()),
    });
    scrollDebug("[Fetch Messages] Cache status:", {
      chatToLoad,
      wasRestoredFromCache,
      cachedMessageCount: cachedData?.messages?.length || 0,
    });

    if (wasRestoredFromCache) {
      console.log("[Fetch Messages] === CACHED CHAT PATH ===");
      // CACHED CHAT PATH
      // Messages already swapped in by Chat Switch effect
      // Use the scroll manager's event-driven restoration (waits for media)

      // Use async IIFE to handle the async restoration cleanly
      (async () => {
        console.log("[Fetch Messages:CACHED] Waiting for RAF...");
        // Wait for React to flush updates before restoring scroll
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        });
        console.log("[Fetch Messages:CACHED] RAF complete");

        // Check if user switched to another chat while waiting
        if (lastFetchedChatIdRef.current !== chatToLoad) {
          console.log(
            "[Fetch Messages:CACHED] ABORT: chat changed during RAF wait"
          );
          scrollDebug("[Cache Restore] Aborted: chat changed during RAF wait");
          return;
        }

        console.log(
          "[Fetch Messages:CACHED] Calling restoreScrollPosition for:",
          chatToLoad
        );
        // Restore scroll position - this WAITS for media to load (event-driven)
        const result = await scrollPositionManager.restoreScrollPosition(
          chatToLoad,
          { maxWaitMs: 5000 }
        );
        console.log(
          "[Fetch Messages:CACHED] restoreScrollPosition returned:",
          result
        );

        // Check again if user switched chats
        if (lastFetchedChatIdRef.current !== chatToLoad) {
          console.log(
            "[Fetch Messages:CACHED] ABORT: chat changed during restore"
          );
          scrollDebug("[Cache Restore] Aborted: chat changed during restore");
          return;
        }

        scrollDebug("[Cache Restore] Restoration complete:", result);

        // Update state based on restoration result
        setShouldAutoScroll(result.scrolledToBottom);
        console.log(
          "[Fetch Messages:CACHED] setShouldAutoScroll:",
          result.scrolledToBottom
        );

        // Finalize transition
        isTransitioningRef.current = false;
        setIsScrollRestoring(false);
        setIsInitialLoad(false);
        console.log("[Fetch Messages:CACHED] Transition finalized");

        // Signal scroll manager that transition is complete
        // Now user scrolls will be saved
        scrollPositionManager.onChatDidChange(chatToLoad);
        console.log("[Fetch Messages:CACHED] onChatDidChange called");
      })();

      return;
    }

    console.log(
      "[Fetch Messages] === UNCACHED CHAT PATH - fetching from backend ==="
    );

    // No cache - fetch messages from backend
    const fetchMessages = async () => {
      try {
        console.log(
          "[Fetch Messages:UNCACHED] Fetching messages for:",
          chatToLoad
        );
        setError(null);
        const response = await backendApi.whatsapp.getChatMessages(
          chatToLoad,
          0,
          PAGE_SIZE
        );
        console.log("[Fetch Messages:UNCACHED] Got response:", {
          messageCount: response?.messages?.length,
          hasMore: response?.hasMore,
        });

        // CRITICAL: Check if we're still on the same chat
        // Both checks ensure we don't contaminate a different chat's messages
        if (
          lastFetchedChatIdRef.current !== chatToLoad ||
          currentMessagesChatIdRef.current !== chatToLoad
        ) {
          console.log(
            "[Fetch Messages:UNCACHED] ABORT: Chat changed during fetch"
          );
          scrollDebug("[Initial Fetch] ABORT: Chat changed during fetch", {
            lastFetched: lastFetchedChatIdRef.current,
            currentMessages: currentMessagesChatIdRef.current,
            chatToLoad,
          });
          return; // User switched to another chat, ignore this response
        }

        if (response && response.messages) {
          console.log(
            "[Fetch Messages:UNCACHED] Processing",
            response.messages.length,
            "messages"
          );
          const fetchedSorted = [...response.messages].sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );

          // CRITICAL: Replace messages entirely - don't merge with previous chat's messages
          // Messages were already cleared when chat switched, so prevMessages should be empty
          // or contain only messages for this chat from real-time updates
          setMessages((prevMessages) => {
            // If prevMessages has items, they should be from real-time updates for THIS chat
            // (since we clear messages on chat switch and real-time only adds for current chat)
            if (prevMessages.length === 0) {
              return fetchedSorted;
            }

            // Merge with any real-time messages that arrived during fetch
            // These are guaranteed to be for the current chat due to our filtering
            const fetchedIds = new Set(fetchedSorted.map((m) => m.messageId));
            const realtimeMessages = prevMessages.filter(
              (m) => !fetchedIds.has(m.messageId)
            );

            if (realtimeMessages.length === 0) {
              return fetchedSorted;
            }

            // Merge and sort
            const merged = [...fetchedSorted, ...realtimeMessages].sort(
              (a, b) =>
                new Date(a.timestamp).getTime() -
                new Date(b.timestamp).getTime()
            );

            scrollDebug(
              `[Initial Fetch] Merged ${fetchedSorted.length} fetched with ${realtimeMessages.length} realtime messages`
            );

            return merged;
          });

          setMessageCount(response.messages.length);
          setHasMoreMessages(response.hasMore);
          // CRITICAL: Ensure cursor is a number to prevent string concatenation bugs
          const nextCursor = Number(response.nextCursor) || 0;
          currentCursorRef.current = nextCursor;

          // CRITICAL: Sync pagination ref with initial fetch
          paginationRef.current = {
            hasMore: response.hasMore,
            hasMoreAfter: false, // Initial fetch always starts at latest messages
            isLoading: false,
            isLoadingNewer: false,
            cursor: nextCursor,
            chatId: chatToLoad,
          };

          scrollDebug(
            "[Initial Fetch] Pagination state:",
            paginationRef.current
          );

          // Update cache - use fetchedSorted as base, sync messages handled by merge above
          messagesCacheRef.current.set(chatToLoad, {
            messages: fetchedSorted,
            hasMore: response.hasMore,
            cursor: nextCursor,
          });

          console.log(
            "[Fetch Messages:UNCACHED] Setting shouldAutoScroll=true. Messages set."
          );
          setShouldAutoScroll(true);

          // CRITICAL: Wait for React to render the messages, then scroll to bottom
          // We use double RAF to ensure React has flushed and the DOM is ready
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // Check if user switched chats while waiting
              if (lastFetchedChatIdRef.current !== chatToLoad) {
                console.log(
                  "[Fetch Messages:UNCACHED] ABORT scroll: chat changed during RAF wait"
                );
                return;
              }

              console.log(
                "[Fetch Messages:UNCACHED] Calling scrollHelperRequestScroll for reliable scroll"
              );
              scrollHelperRequestScroll(false);

              // Mark initial scroll as done for this chat
              console.log(
                "[Fetch Messages:UNCACHED] Marking initial scroll done for:",
                chatToLoad
              );
              initialScrollDoneRef.current.add(chatToLoad);
            });
          });

          // Finalize transition state
          // NOTE: onChatDidChange is NOT called here - it's handled by the
          // State Transitions effect when it sees messages arrive
          requestAnimationFrame(() => {
            if (lastFetchedChatIdRef.current !== chatToLoad) {
              return; // User switched, abort
            }
            isTransitioningRef.current = false;
            setIsScrollRestoring(false);
          });
        }
      } catch (err) {
        console.error("Error fetching messages:", err);
        setError("Failed to load messages");
        isTransitioningRef.current = false;
        setIsScrollRestoring(false);
      }
    };
    fetchMessages();
    // Depend on selectedChatId only
    // The ref-based guard prevents duplicate runs for the same chat
    // scrollPositionManager is stable (from useScrollPositionManager)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChatId]);

  return {
    chats,
    setChats,
    senders,
    setSenders,
    selectedChatId,
    setSelectedChatId,
    selectedChat,
    messages,
    setMessages,
    messageCount,
    setMessageCount,
    loading,
    error,
    setError,
    isInitialLoad,
    setIsInitialLoad,
    hasMoreMessages,
    setHasMoreMessages,
    hasMoreAfter,
    setHasMoreAfter,
    isLoadingOlderMessages,
    isLoadingNewerMessages,
    loadOlderMessages,
    loadNewerMessages,
    navigateToPinnedContext,
    shouldAutoScroll,
    setShouldAutoScroll,
    hasNewMessages,
    setHasNewMessages,
    isScrollRestoring,
    scrollHelperToBottom,
    scrollHelperRequestScroll,
    scrollHelperIsAtBottom,
    messagesContainerRef,
    messagesCacheRef,
    currentMessagesChatIdRef,
    currentCursorRef,
    isTransitioningRef,
    handleSelectChat,
    handleScrollToBottom,
  };
}
