"use client";

import { backendApi } from "@/lib/api/endpoints";
import { useCallback, useRef, useState } from "react";

/**
 * Response type from the backend pagination endpoint
 */
export interface PaginatedMessagesResponse {
  messages: Message[];
  hasMore: boolean;
  totalCount: number;
  nextCursor: number;
}

export interface Message {
  id?: number;
  messageId: string;
  text?: string | null;
  sender: string;
  direction: "inbound" | "outbound";
  timestamp: string;
  type: string;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  attachments?: any[];
  mediaMetadata?: Record<string, any>;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  editedAt?: string;
  replyToMessageId?: string | null;
  replyPreview?: any | null;
}

/**
 * Cache entry for storing paginated messages per chat
 */
export interface MessagesCacheEntry {
  messages: Message[];
  hasMore: boolean;
  totalCount: number;
  oldestLoadedCursor: number;
}

const PAGE_SIZE = 50;

/**
 * Custom hook for managing infinite scroll message loading
 * Handles pagination, caching, and scroll position preservation
 */
export function useInfiniteMessages() {
  // Messages cache - store messages and pagination state per chat
  const messagesCacheRef = useRef<Map<string, MessagesCacheEntry>>(new Map());

  // Current chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the current cursor (how many messages we've loaded)
  const currentCursorRef = useRef<number>(0);

  /**
   * Sort messages by timestamp ascending (oldest first for display)
   */
  const sortMessages = useCallback((msgs: Message[]): Message[] => {
    return [...msgs].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, []);

  /**
   * Load initial messages for a chat
   * Returns cached data if available, otherwise fetches from backend
   */
  const loadInitialMessages = useCallback(
    async (
      chatId: string
    ): Promise<{ fromCache: boolean; messages: Message[] }> => {
      // Check cache first
      const cached = messagesCacheRef.current.get(chatId);
      if (cached) {
        setMessages(cached.messages);
        setHasMore(cached.hasMore);
        setTotalCount(cached.totalCount);
        currentCursorRef.current = cached.oldestLoadedCursor;
        return { fromCache: true, messages: cached.messages };
      }

      // No cache - fetch from backend
      setIsInitialLoading(true);
      setError(null);

      try {
        const response: PaginatedMessagesResponse =
          await backendApi.whatsapp.getChatMessages(chatId, 0, PAGE_SIZE);

        const sortedMessages = sortMessages(response.messages);

        // Update state
        setMessages(sortedMessages);
        setHasMore(response.hasMore);
        setTotalCount(response.totalCount);
        currentCursorRef.current = response.nextCursor;

        // Update cache
        messagesCacheRef.current.set(chatId, {
          messages: sortedMessages,
          hasMore: response.hasMore,
          totalCount: response.totalCount,
          oldestLoadedCursor: response.nextCursor,
        });

        return { fromCache: false, messages: sortedMessages };
      } catch (err) {
        console.error("Error loading messages:", err);
        setError("Failed to load messages");
        return { fromCache: false, messages: [] };
      } finally {
        setIsInitialLoading(false);
      }
    },
    [sortMessages]
  );

  /**
   * Load older messages (for infinite scroll)
   * Prepends older messages to the existing list
   */
  const loadOlderMessages = useCallback(
    async (chatId: string): Promise<Message[]> => {
      if (!hasMore || isLoadingMore) {
        return [];
      }

      setIsLoadingMore(true);
      setError(null);

      try {
        const response: PaginatedMessagesResponse =
          await backendApi.whatsapp.getChatMessages(
            chatId,
            currentCursorRef.current,
            PAGE_SIZE
          );

        if (response.messages.length === 0) {
          setHasMore(false);
          return [];
        }

        const sortedOlderMessages = sortMessages(response.messages);

        // Prepend older messages to existing messages
        setMessages((prevMessages) => {
          // Deduplicate by messageId
          const existingIds = new Set(prevMessages.map((m) => m.messageId));
          const newMessages = sortedOlderMessages.filter(
            (m) => !existingIds.has(m.messageId)
          );

          // Combine and sort
          const combined = sortMessages([...newMessages, ...prevMessages]);

          // Update cache
          const cached = messagesCacheRef.current.get(chatId);
          if (cached) {
            messagesCacheRef.current.set(chatId, {
              ...cached,
              messages: combined,
              hasMore: response.hasMore,
              oldestLoadedCursor: response.nextCursor,
            });
          }

          return combined;
        });

        setHasMore(response.hasMore);
        currentCursorRef.current = response.nextCursor;

        return sortedOlderMessages;
      } catch (err) {
        console.error("Error loading older messages:", err);
        setError("Failed to load older messages");
        return [];
      } finally {
        setIsLoadingMore(false);
      }
    },
    [hasMore, isLoadingMore, sortMessages]
  );

  /**
   * Add a new message to the list (for real-time updates)
   */
  const addMessage = useCallback(
    (chatId: string, message: Message) => {
      setMessages((prevMessages) => {
        // Check if message already exists
        if (prevMessages.some((m) => m.messageId === message.messageId)) {
          return prevMessages;
        }

        const combined = sortMessages([...prevMessages, message]);

        // Update cache
        const cached = messagesCacheRef.current.get(chatId);
        if (cached) {
          messagesCacheRef.current.set(chatId, {
            ...cached,
            messages: combined,
            totalCount: cached.totalCount + 1,
          });
        }

        return combined;
      });

      setTotalCount((prev) => prev + 1);
    },
    [sortMessages]
  );

  /**
   * Update a message in the list (for status updates, edits, etc.)
   */
  const updateMessage = useCallback(
    (chatId: string, messageId: string, updates: Partial<Message>) => {
      setMessages((prevMessages) => {
        const updated = prevMessages.map((m) =>
          m.messageId === messageId ? { ...m, ...updates } : m
        );

        // Update cache
        const cached = messagesCacheRef.current.get(chatId);
        if (cached) {
          messagesCacheRef.current.set(chatId, {
            ...cached,
            messages: updated,
          });
        }

        return updated;
      });
    },
    []
  );

  /**
   * Update cache with latest messages (for background refresh)
   */
  const updateCache = useCallback(
    (chatId: string, newMessages: Message[]) => {
      const sortedMessages = sortMessages(newMessages);
      const cached = messagesCacheRef.current.get(chatId);

      if (cached) {
        // Merge new messages with existing, keeping the oldest ones loaded
        const existingIds = new Set(sortedMessages.map((m) => m.messageId));
        const olderMessages = cached.messages.filter(
          (m) => !existingIds.has(m.messageId)
        );
        const combined = sortMessages([...olderMessages, ...sortedMessages]);

        messagesCacheRef.current.set(chatId, {
          ...cached,
          messages: combined,
        });

        setMessages(combined);
      }
    },
    [sortMessages]
  );

  /**
   * Clear cache for a specific chat or all chats
   */
  const clearCache = useCallback((chatId?: string) => {
    if (chatId) {
      messagesCacheRef.current.delete(chatId);
    } else {
      messagesCacheRef.current.clear();
    }
  }, []);

  /**
   * Get cached data for a chat (without updating state)
   */
  const getCachedMessages = useCallback((chatId: string) => {
    return messagesCacheRef.current.get(chatId);
  }, []);

  /**
   * Reset state when switching chats
   */
  const resetState = useCallback(() => {
    setMessages([]);
    setHasMore(true);
    setTotalCount(0);
    setError(null);
    currentCursorRef.current = 0;
  }, []);

  return {
    // State
    messages,
    hasMore,
    totalCount,
    isLoadingMore,
    isInitialLoading,
    error,

    // Actions
    loadInitialMessages,
    loadOlderMessages,
    addMessage,
    updateMessage,
    updateCache,
    clearCache,
    getCachedMessages,
    resetState,

    // Direct setters for compatibility with existing code
    setMessages,
  };
}
