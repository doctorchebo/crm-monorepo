"use client";

import { useChatNotifications } from "@/hooks/use-chat-notifications";
import { backendApi } from "@/lib/api/endpoints";
import { useCallback, useEffect, useRef, useState } from "react";
import { PAGE_SIZE } from "../constants";
import type { Chat, Message, MessagesCacheEntry, Sender } from "../types";
import { scrollDebug } from "./scroll-utils";
import { useScrollPositionManager } from "./use-scroll-position-manager";
import { useScrollToBottom } from "./use-scroll-to-bottom";

/**
 * Pagination state interface for type safety
 * Tracked via ref to avoid stale closures in async operations
 */
interface PaginationState {
  hasMore: boolean;
  isLoading: boolean;
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
  isLoadingOlderMessages: boolean;
  loadOlderMessages: () => Promise<void>;

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
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);

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
    isLoading: false,
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
  const previousChatIdRef = useRef<string | null>(null);
  const lastFetchedChatIdRef = useRef<string | null>(null); // Guards against duplicate fetches
  const isTransitioningRef = useRef(false);

  // Initialize the scroll position manager - SINGLE SOURCE OF TRUTH for scroll positions
  const scrollPositionManager = useScrollPositionManager(messagesContainerRef, {
    bottomThreshold: 100,
    saveDebounceMs: 100,
  });

  // Callback to check if scroll-to-bottom should be skipped
  // This is passed to useScrollToBottom to prevent it from overriding restored positions
  const skipScrollToBottom = useCallback(
    (chatId: string): boolean => {
      // Check if we have a saved scroll position for this chat that's NOT at bottom
      const savedPosition = scrollPositionManager.getSavedPosition(chatId);
      const shouldSkip = savedPosition !== null && !savedPosition.wasAtBottom;
      scrollDebug("[useChatState] skipScrollToBottom check:", {
        chatId,
        hasSavedPosition: savedPosition !== null,
        wasAtBottom: savedPosition?.wasAtBottom,
        shouldSkip,
      });
      return shouldSkip;
    },
    [scrollPositionManager]
  );

  // Initialize the scroll-to-bottom hook
  const {
    scrollToBottom: scrollHelperToBottom,
    requestScrollToBottom: scrollHelperRequestScroll,
    isAtBottom: scrollHelperIsAtBottom,
  } = useScrollToBottom(messagesContainerRef, {
    messages,
    selectedChatId,
    isInitialLoad,
    shouldAutoScroll,
    skipScrollToBottom,
  });

  // Memoize selectedChat
  const selectedChat = chats.find((c) => c.chatId === selectedChatId) || null;

  // Get chat notifications context
  const { setActiveChatId, resetUnreadCount, chatUpdates, setAllUnreadCounts } =
    useChatNotifications();

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
      const newPaginationState = {
        hasMore: response.hasMore,
        isLoading: false,
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

  // Handle scroll to bottom button click
  const handleScrollToBottom = useCallback(() => {
    scrollHelperToBottom(true); // smooth scroll
    setHasNewMessages(false);
    setShouldAutoScroll(true);
  }, [scrollHelperToBottom]);

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
    scrollHelperIsAtBottom,
    scrollPositionManager,
  ]);

  // Handle chat switch - reset state and update pagination ref
  useEffect(() => {
    if (selectedChatId && selectedChatId !== previousChatIdRef.current) {
      scrollDebug(
        "[Chat Switch] From:",
        previousChatIdRef.current,
        "To:",
        selectedChatId
      );

      // CRITICAL: Reset pagination ref with new chatId
      paginationRef.current = {
        hasMore: true,
        isLoading: false,
        cursor: 0,
        chatId: selectedChatId,
      };

      // Reset React state
      setHasMoreMessages(true);
      setIsLoadingOlderMessages(false);
      currentCursorRef.current = 0;

      // Set transitioning flags
      isTransitioningRef.current = true;
      setIsScrollRestoring(true);

      // Update previousChatIdRef for the Chat Switch effect's own guard
      previousChatIdRef.current = selectedChatId;
      setIsInitialLoad(true);
      setHasNewMessages(false);

      scrollDebug("[Chat Switch] Pagination ref reset:", paginationRef.current);
    }
  }, [selectedChatId]);

  // Handle state transitions for first-time visit to chat
  // This effect marks the initial load as complete once messages are present
  // The scroll-to-bottom hook handles the actual scrolling and media waiting
  useEffect(() => {
    if (messages.length === 0 || !isInitialLoad) {
      return;
    }

    const hasCachedMessages = selectedChatId
      ? messagesCacheRef.current.has(selectedChatId)
      : false;

    if (hasCachedMessages) {
      setIsInitialLoad(false);
      // Notify scroll manager that transition is complete
      if (selectedChatId) {
        scrollPositionManager.onChatDidChange(selectedChatId);
      }
      return;
    }

    // For first-time chat loads, we mark initial load complete immediately
    // The scroll-to-bottom hook will wait for media to load before completing scroll
    // This approach is event-driven rather than time-based
    setIsInitialLoad(false);
    setShouldAutoScroll(true);
    // Notify scroll manager that transition is complete
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
  // CRITICAL: This effect should only run ONCE per chat switch
  useEffect(() => {
    if (!selectedChatId) return;

    // CRITICAL GUARD: Only run if this is a NEW chat selection
    // This prevents re-running when other dependencies change
    if (lastFetchedChatIdRef.current === selectedChatId) {
      scrollDebug(
        "[Fetch Messages] Skipping - already fetched for:",
        selectedChatId
      );
      return;
    }

    scrollDebug(
      "[Fetch Messages] Running for:",
      selectedChatId,
      "Previous:",
      lastFetchedChatIdRef.current
    );

    // Mark this chat as the one we're loading
    const chatToLoad = selectedChatId;
    lastFetchedChatIdRef.current = chatToLoad;

    const cachedData = messagesCacheRef.current.get(chatToLoad);
    scrollDebug("[Fetch Messages] Cache check:", {
      chatToLoad,
      hasCachedData: !!cachedData,
      cachedMessageCount: cachedData?.messages?.length || 0,
    });

    if (cachedData && cachedData.messages.length > 0) {
      setMessages(cachedData.messages);
      setMessageCount(cachedData.messages.length);
      setHasMoreMessages(cachedData.hasMore);
      currentCursorRef.current = cachedData.cursor;

      // CRITICAL: Sync pagination ref with cached data
      paginationRef.current = {
        hasMore: cachedData.hasMore,
        isLoading: false,
        cursor: cachedData.cursor,
        chatId: chatToLoad,
      };

      scrollDebug("[Cache Restore] Pagination state:", paginationRef.current);

      // CRITICAL: For cached chats with saved scroll positions, we need to:
      // 1. Let the scroll-to-bottom hook skip (via skipScrollToBottom callback)
      // 2. Then manually apply the saved position
      // 3. Enable scroll saving

      const savedPosition = scrollPositionManager.getSavedPosition(chatToLoad);
      const hasSavedPosition =
        savedPosition !== null && !savedPosition.wasAtBottom;

      scrollDebug("[Cache Restore] Scroll position info:", {
        chatToLoad,
        hasSavedPosition,
        savedScrollTop: savedPosition?.scrollTop,
        savedScrollHeight: savedPosition?.scrollHeight,
        wasAtBottom: savedPosition?.wasAtBottom,
      });

      // Restore scroll position after DOM is updated
      // We need multiple RAFs to ensure React has flushed all updates
      const applyScrollPosition = () => {
        // CRITICAL: Check if we're still on the same chat
        if (lastFetchedChatIdRef.current !== chatToLoad) {
          return; // User switched to another chat, abort
        }

        const container = messagesContainerRef.current;
        if (!container) {
          isTransitioningRef.current = false;
          setIsScrollRestoring(false);
          return;
        }

        scrollDebug("[Cache Restore] Container state before scroll:", {
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight,
          currentScrollTop: container.scrollTop,
        });

        if (hasSavedPosition && savedPosition) {
          // Calculate relative position if content height changed
          // If the saved scrollHeight is different, we need to adjust
          const scrollHeightDiff =
            container.scrollHeight - savedPosition.scrollHeight;
          let targetScrollTop = savedPosition.scrollTop;

          // If new content was added at the bottom, adjust scroll position
          if (scrollHeightDiff > 0 && savedPosition.scrollHeight > 0) {
            // Content grew - keep the same visual position
            targetScrollTop = savedPosition.scrollTop;
          }

          // Clamp to valid range
          const maxScroll = container.scrollHeight - container.clientHeight;
          targetScrollTop = Math.max(0, Math.min(targetScrollTop, maxScroll));

          container.scrollTop = targetScrollTop;
          setShouldAutoScroll(false);
          scrollDebug(
            "[Cache Restore] Applied saved scroll position:",
            targetScrollTop,
            "(original:",
            savedPosition.scrollTop,
            ")"
          );
        } else {
          // No saved position or was at bottom - scroll to bottom
          container.scrollTop = container.scrollHeight;
          setShouldAutoScroll(true);
          scrollDebug(
            "[Cache Restore] Scrolled to bottom (no saved position or was at bottom)"
          );
        }

        // Finalize transition
        requestAnimationFrame(() => {
          if (lastFetchedChatIdRef.current !== chatToLoad) {
            return;
          }
          isTransitioningRef.current = false;
          setIsScrollRestoring(false);
          setIsInitialLoad(false);
          scrollPositionManager.onChatDidChange(chatToLoad);
        });
      };

      // Use multiple RAFs to ensure DOM is fully updated
      // RAF 1: React commits the state change
      // RAF 2: Browser paints
      // RAF 3: We apply scroll position
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(applyScrollPosition);
        });
      });

      // Fetch fresh data in background
      backendApi.whatsapp
        .getChatMessages(chatToLoad, 0, PAGE_SIZE)
        .then((response) => {
          // CRITICAL: Check if we're still on the same chat
          if (lastFetchedChatIdRef.current !== chatToLoad) {
            return; // User switched to another chat, ignore this response
          }

          if (response && response.messages) {
            const sorted = [...response.messages].sort(
              (a, b) =>
                new Date(a.timestamp).getTime() -
                new Date(b.timestamp).getTime()
            );
            if (sorted.length > cachedData.messages.length) {
              const existingIds = new Set(sorted.map((m) => m.messageId));
              const olderMessages = cachedData.messages.filter(
                (m) => !existingIds.has(m.messageId)
              );
              const combined = [...olderMessages, ...sorted].sort(
                (a, b) =>
                  new Date(a.timestamp).getTime() -
                  new Date(b.timestamp).getTime()
              );
              setMessages(combined);
              setMessageCount(combined.length);
              messagesCacheRef.current.set(chatToLoad, {
                messages: combined,
                hasMore: cachedData.hasMore,
                cursor: cachedData.cursor,
              });
            }
          }
        })
        .catch(console.error);

      return;
    }

    // No cache - fetch messages
    setMessages([]);

    const fetchMessages = async () => {
      try {
        setError(null);
        const response = await backendApi.whatsapp.getChatMessages(
          chatToLoad,
          0,
          PAGE_SIZE
        );

        // CRITICAL: Check if we're still on the same chat
        if (lastFetchedChatIdRef.current !== chatToLoad) {
          return; // User switched to another chat, ignore this response
        }

        if (response && response.messages) {
          const sorted = [...response.messages].sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          setMessages(sorted);
          setMessageCount(sorted.length);
          setHasMoreMessages(response.hasMore);
          // CRITICAL: Ensure cursor is a number to prevent string concatenation bugs
          const nextCursor = Number(response.nextCursor) || 0;
          currentCursorRef.current = nextCursor;

          // CRITICAL: Sync pagination ref with initial fetch
          paginationRef.current = {
            hasMore: response.hasMore,
            isLoading: false,
            cursor: nextCursor,
            chatId: chatToLoad,
          };

          scrollDebug(
            "[Initial Fetch] Pagination state:",
            paginationRef.current
          );

          messagesCacheRef.current.set(chatToLoad, {
            messages: sorted,
            hasMore: response.hasMore,
            cursor: nextCursor,
          });

          setShouldAutoScroll(true);
          // The scroll hook will automatically scroll to bottom when messages arrive
          // No need to call scrollHelperRequestScroll here - the hook effect handles it

          requestAnimationFrame(() => {
            if (lastFetchedChatIdRef.current !== chatToLoad) {
              return; // User switched, abort
            }
            requestAnimationFrame(() => {
              if (lastFetchedChatIdRef.current !== chatToLoad) {
                return; // User switched, abort
              }
              isTransitioningRef.current = false;
              setIsScrollRestoring(false);
              // Notify scroll manager that transition is complete
              scrollPositionManager.onChatDidChange(chatToLoad);
            });
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
    // Only depend on selectedChatId - the ref-based guard prevents duplicate runs
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
    isLoadingOlderMessages,
    loadOlderMessages,
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
    currentCursorRef,
    isTransitioningRef,
    handleSelectChat,
    handleScrollToBottom,
  };
}
