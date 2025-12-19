"use client";

import { useChatNotifications } from "@/hooks/use-chat-notifications";
import { backendApi } from "@/lib/api/endpoints";
import { useCallback, useEffect, useRef, useState } from "react";
import { PAGE_SIZE } from "../constants";
import type { Chat, Message, MessagesCacheEntry, Sender } from "../types";
import { useScrollToBottom } from "./use-scroll-to-bottom";

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
  scrollPositionsRef: React.MutableRefObject<Map<string, number>>;
  currentCursorRef: React.MutableRefObject<number>;
  isTransitioningRef: React.MutableRefObject<boolean>;
  allowScrollSaveRef: React.MutableRefObject<boolean>;

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

  // Infinite scroll state
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const loadOlderMessagesLockRef = useRef(false);
  const currentCursorRef = useRef<number>(0);

  // Scroll management
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [isScrollRestoring, setIsScrollRestoring] = useState(false);

  // Refs
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesCacheRef = useRef<Map<string, MessagesCacheEntry>>(new Map());
  const scrollPositionsRef = useRef<Map<string, number>>(new Map());
  const previousChatIdRef = useRef<string | null>(null);
  const isTransitioningRef = useRef(false);
  const allowScrollSaveRef = useRef(false);

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
      console.log("=== HANDLE SELECT CHAT ===");
      console.log("Switching FROM:", selectedChatId, "TO:", chatId);

      const messagesContainer = messagesContainerRef.current;
      if (selectedChatId && messagesContainer) {
        const currentScroll = messagesContainer.scrollTop;
        scrollPositionsRef.current.set(selectedChatId, currentScroll);
        console.log("SAVED scroll for", selectedChatId, ":", currentScroll);

        if (messages.length > 0) {
          messagesCacheRef.current.set(selectedChatId, {
            messages: [...messages],
            hasMore: hasMoreMessages,
            cursor: currentCursorRef.current,
          });
          console.log(
            "CACHED",
            messages.length,
            "messages for",
            selectedChatId
          );
        }
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
        // Non-critical, don't block the UI
      }

      setSelectedChatId(chatId);
    },
    [selectedChatId, messages, hasMoreMessages, resetUnreadCount]
  );

  // Load older messages when user scrolls to top
  const loadOlderMessages = useCallback(async () => {
    if (
      !selectedChatId ||
      !hasMoreMessages ||
      isLoadingOlderMessages ||
      loadOlderMessagesLockRef.current
    ) {
      return;
    }

    const container = messagesContainerRef.current;
    if (!container) return;

    loadOlderMessagesLockRef.current = true;
    setIsLoadingOlderMessages(true);

    const previousScrollHeight = container.scrollHeight;
    const previousScrollTop = container.scrollTop;

    try {
      const response = await backendApi.whatsapp.getChatMessages(
        selectedChatId,
        currentCursorRef.current,
        PAGE_SIZE
      );

      if (!response.messages || response.messages.length === 0) {
        setHasMoreMessages(false);
        return;
      }

      const sortedOlderMessages = [...response.messages].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      setMessages((prevMessages) => {
        const existingIds = new Set(prevMessages.map((m) => m.messageId));
        const newMessages = sortedOlderMessages.filter(
          (m) => !existingIds.has(m.messageId)
        );

        const combined = [...newMessages, ...prevMessages];

        messagesCacheRef.current.set(selectedChatId, {
          messages: combined,
          hasMore: response.hasMore,
          cursor: response.nextCursor,
        });

        return combined;
      });

      setHasMoreMessages(response.hasMore);
      currentCursorRef.current = response.nextCursor;

      requestAnimationFrame(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          const scrollDifference = newScrollHeight - previousScrollHeight;
          container.scrollTop = previousScrollTop + scrollDifference;
        }
      });
    } catch (err) {
      console.error("Error loading older messages:", err);
    } finally {
      setIsLoadingOlderMessages(false);
      loadOlderMessagesLockRef.current = false;
    }
  }, [selectedChatId, hasMoreMessages, isLoadingOlderMessages]);

  // Handle scroll to bottom button click
  const handleScrollToBottom = useCallback(() => {
    scrollHelperToBottom(true); // smooth scroll
    setHasNewMessages(false);
    setShouldAutoScroll(true);
  }, [scrollHelperToBottom]);

  // Handle scroll position tracking
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
      if (
        scrollTop < threshold &&
        hasMoreMessages &&
        !isLoadingOlderMessages &&
        !loadOlderMessagesLockRef.current &&
        !isTransitioningRef.current
      ) {
        loadOlderMessages();
      }

      if (selectedChatId && allowScrollSaveRef.current) {
        const scrollPos = messagesContainer.scrollTop;
        scrollPositionsRef.current.set(selectedChatId, scrollPos);
      }
    };

    const debouncedHandleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(handleScroll, 100);
    };

    messagesContainer.addEventListener("scroll", debouncedHandleScroll);
    return () => {
      messagesContainer.removeEventListener("scroll", debouncedHandleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [
    selectedChatId,
    hasMoreMessages,
    isLoadingOlderMessages,
    loadOlderMessages,
    scrollHelperIsAtBottom,
  ]);

  // Handle chat switch - reset initial load and save last scroll position
  useEffect(() => {
    if (selectedChatId && selectedChatId !== previousChatIdRef.current) {
      console.log("=== CHAT SWITCH EFFECT ===");

      setHasMoreMessages(true);
      setIsLoadingOlderMessages(false);
      loadOlderMessagesLockRef.current = false;
      currentCursorRef.current = 0;

      isTransitioningRef.current = true;
      allowScrollSaveRef.current = false;
      setIsScrollRestoring(true);

      previousChatIdRef.current = selectedChatId;
      setIsInitialLoad(true);
      setHasNewMessages(false);
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
      allowScrollSaveRef.current = true;
      return;
    }

    // For first-time chat loads, we mark initial load complete immediately
    // The scroll-to-bottom hook will wait for media to load before completing scroll
    // This approach is event-driven rather than time-based
    setIsInitialLoad(false);
    setShouldAutoScroll(true);
    allowScrollSaveRef.current = true;
  }, [selectedChatId, messages.length, isInitialLoad]);

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
  useEffect(() => {
    if (!selectedChatId) return;

    const cachedData = messagesCacheRef.current.get(selectedChatId);
    const savedScrollPosition = scrollPositionsRef.current.get(selectedChatId);

    if (cachedData && cachedData.messages.length > 0) {
      setMessages(cachedData.messages);
      setMessageCount(cachedData.messages.length);
      setHasMoreMessages(cachedData.hasMore);
      currentCursorRef.current = cachedData.cursor;

      // Restore scroll position using requestAnimationFrame for proper timing
      // This runs after React has committed the DOM updates
      requestAnimationFrame(() => {
        const container = messagesContainerRef.current;
        if (!container) {
          isTransitioningRef.current = false;
          setIsScrollRestoring(false);
          return;
        }

        if (savedScrollPosition !== undefined && savedScrollPosition >= 0) {
          // Restore the saved position
          container.scrollTop = savedScrollPosition;
          const isAtBottom =
            container.scrollHeight -
              savedScrollPosition -
              container.clientHeight <
            50;
          setShouldAutoScroll(isAtBottom);
        } else {
          // No saved position - let the scroll hook handle scrolling to bottom
          setShouldAutoScroll(true);
        }

        // Use another RAF to ensure the scroll has been applied
        requestAnimationFrame(() => {
          isTransitioningRef.current = false;
          setIsScrollRestoring(false);
          setIsInitialLoad(false);
          allowScrollSaveRef.current = true;
        });
      });

      // Fetch fresh data in background
      backendApi.whatsapp
        .getChatMessages(selectedChatId, 0, PAGE_SIZE)
        .then((response) => {
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
              messagesCacheRef.current.set(selectedChatId, {
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
          selectedChatId,
          0,
          PAGE_SIZE
        );
        if (response && response.messages) {
          const sorted = [...response.messages].sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          setMessages(sorted);
          setMessageCount(sorted.length);
          setHasMoreMessages(response.hasMore);
          currentCursorRef.current = response.nextCursor;

          messagesCacheRef.current.set(selectedChatId, {
            messages: sorted,
            hasMore: response.hasMore,
            cursor: response.nextCursor,
          });

          setShouldAutoScroll(true);
          // The scroll hook will automatically scroll to bottom when messages arrive
          // No need to call scrollHelperRequestScroll here - the hook effect handles it

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              isTransitioningRef.current = false;
              setIsScrollRestoring(false);
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
    scrollPositionsRef,
    currentCursorRef,
    isTransitioningRef,
    allowScrollSaveRef,
    handleSelectChat,
    handleScrollToBottom,
  };
}
