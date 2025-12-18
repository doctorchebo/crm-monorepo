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
  useEffect(() => {
    if (chatUpdates.size === 0) return;

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
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
      setHasNewMessages(false);
      setShouldAutoScroll(true);
    }
  }, []);

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

    const timer = setTimeout(() => {
      setIsInitialLoad(false);
      setShouldAutoScroll(true);
      allowScrollSaveRef.current = true;
      console.log("Initial load complete, scroll saving enabled");
    }, 2000);

    return () => {
      clearTimeout(timer);
    };
  }, [selectedChatId, messages.length, isInitialLoad]);

  // Fetch chats on mount
  useEffect(() => {
    const fetchChats = async () => {
      try {
        setLoading(true);
        setError(null);

        const urlParams = new URLSearchParams(window.location.search);
        const querySelectedChatId = urlParams.get("selectedChatId");

        const sendersData = await backendApi.senders.list();
        if (Array.isArray(sendersData)) {
          setSenders(sendersData);
        }

        const data = await backendApi.whatsapp.getChats(0, 50);

        if (Array.isArray(data) && data.length > 0) {
          setChats(data);

          let chatToSelect: string | null = null;

          if (querySelectedChatId) {
            const chatExists = data.some(
              (c) => c.chatId === querySelectedChatId
            );
            if (chatExists) {
              chatToSelect = querySelectedChatId;
            } else {
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
                    } else {
                      setSelectedChatId(retryData[0].chatId);
                    }
                  }
                } catch (retryErr) {
                  console.error("Retry fetch failed:", retryErr);
                }
              }, 300);
              chatToSelect = data[0].chatId;
            }
          } else {
            chatToSelect = data[0].chatId;
          }

          setSelectedChatId(chatToSelect);
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

      const restoreScrollWhenReady = () => {
        const container = messagesContainerRef.current;
        if (!container) {
          isTransitioningRef.current = false;
          setIsScrollRestoring(false);
          return;
        }

        let scrollRestored = false;
        let attempts = 0;
        const maxAttempts = 50;

        const tryRestoreScroll = () => {
          if (scrollRestored) return;
          attempts++;

          const currentScrollHeight = container.scrollHeight;
          const currentClientHeight = container.clientHeight;
          const maxScrollTop = currentScrollHeight - currentClientHeight;

          const isContentReady =
            savedScrollPosition === undefined ||
            savedScrollPosition <= maxScrollTop ||
            attempts >= maxAttempts;

          if (isContentReady) {
            scrollRestored = true;

            if (savedScrollPosition !== undefined && savedScrollPosition >= 0) {
              container.scrollTop = savedScrollPosition;
              const isAtBottom =
                currentScrollHeight -
                  savedScrollPosition -
                  currentClientHeight <
                50;
              setShouldAutoScroll(isAtBottom);
            } else {
              container.scrollTop = container.scrollHeight;
              setShouldAutoScroll(true);
            }

            setTimeout(() => {
              isTransitioningRef.current = false;
              setIsScrollRestoring(false);
              setIsInitialLoad(false);
              allowScrollSaveRef.current = true;
            }, 50);
          } else {
            setTimeout(tryRestoreScroll, 20);
          }
        };

        requestAnimationFrame(() => {
          tryRestoreScroll();
        });
      };

      restoreScrollWhenReady();

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
          scrollHelperRequestScroll(false);

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
  }, [selectedChatId, scrollHelperRequestScroll]);

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
