"use client";

import { backendApi } from "@/lib/api/endpoints";
import { useCallback, useRef, useState } from "react";
import { PAGE_SIZE } from "../constants";
import type { Message, MessagesCacheEntry } from "../types";

// ============================================================
// TYPES
// ============================================================

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

/**
 * Return type of the messages pagination hook
 */
export interface UseMessagesPaginationReturn {
  // State
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  messageCount: number;
  setMessageCount: React.Dispatch<React.SetStateAction<number>>;
  hasMoreMessages: boolean;
  isLoadingOlderMessages: boolean;

  // Cache
  messagesCacheRef: React.MutableRefObject<Map<string, MessagesCacheEntry>>;

  // Refs for external access
  paginationRef: React.MutableRefObject<PaginationState>;
  currentCursorRef: React.MutableRefObject<number>;

  // Actions
  loadInitialMessages: (
    chatId: string
  ) => Promise<{ fromCache: boolean; messages: Message[] }>;
  loadOlderMessages: (
    chatId: string,
    containerRef: React.RefObject<HTMLDivElement | null>
  ) => Promise<Message[]>;
  saveToCache: (chatId: string, messages: Message[]) => void;
  getCachedMessages: (chatId: string) => MessagesCacheEntry | undefined;
  clearCache: (chatId?: string) => void;
  resetPaginationState: (chatId: string) => void;
}

// ============================================================
// MAIN HOOK
// ============================================================

/**
 * useMessagesPagination - Handles message fetching, pagination, and caching
 *
 * RESPONSIBILITIES:
 * 1. Fetch initial messages for a chat
 * 2. Load older messages (infinite scroll)
 * 3. Cache messages per chat
 * 4. Track pagination state (cursor, hasMore)
 *
 * This hook is PURELY about data management - no scroll logic here.
 */
export function useMessagesPagination(): UseMessagesPaginationReturn {
  // Messages state
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);

  // Cache ref - stores messages per chat
  const messagesCacheRef = useRef<Map<string, MessagesCacheEntry>>(new Map());

  /**
   * CRITICAL: Pagination state ref for synchronous access
   *
   * This ref is the SOURCE OF TRUTH for pagination state.
   * React state (hasMoreMessages, isLoadingOlderMessages) is only for UI updates.
   */
  const paginationRef = useRef<PaginationState>({
    hasMore: true,
    isLoading: false,
    cursor: 0,
    chatId: null,
  });

  // Legacy ref for backward compatibility
  const currentCursorRef = useRef<number>(0);

  // ============================================================
  // HELPER: Sort messages by timestamp
  // ============================================================
  const sortMessages = useCallback((msgs: Message[]): Message[] => {
    return [...msgs].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, []);

  // ============================================================
  // HELPER: Deduplicate messages
  // ============================================================
  const deduplicateMessages = useCallback((msgs: Message[]): Message[] => {
    const seen = new Map<string, Message>();
    for (const msg of msgs) {
      seen.set(msg.messageId, msg);
    }
    return Array.from(seen.values());
  }, []);

  // ============================================================
  // Reset pagination state for a new chat
  // ============================================================
  const resetPaginationState = useCallback((chatId: string): void => {
    paginationRef.current = {
      hasMore: true,
      isLoading: false,
      cursor: 0,
      chatId,
    };
    currentCursorRef.current = 0;
    setHasMoreMessages(true);
    setIsLoadingOlderMessages(false);
  }, []);

  // ============================================================
  // Load initial messages for a chat
  // ============================================================
  const loadInitialMessages = useCallback(
    async (
      chatId: string
    ): Promise<{ fromCache: boolean; messages: Message[] }> => {
      // Check cache first
      const cached = messagesCacheRef.current.get(chatId);
      if (cached && cached.messages.length > 0) {
        // Restore from cache
        setMessages(cached.messages);
        setMessageCount(cached.messages.length);
        setHasMoreMessages(cached.hasMore);
        currentCursorRef.current = cached.cursor;

        // Sync pagination ref
        paginationRef.current = {
          hasMore: cached.hasMore,
          isLoading: false,
          cursor: cached.cursor,
          chatId,
        };

        console.log("[MessagesPagination] Restored from cache:", {
          chatId,
          messageCount: cached.messages.length,
          cursor: cached.cursor,
        });

        return { fromCache: true, messages: cached.messages };
      }

      // No cache - fetch from backend
      console.log("[MessagesPagination] Fetching from backend:", { chatId });

      // Reset state for fresh load
      setMessages([]);
      resetPaginationState(chatId);

      try {
        const response = await backendApi.whatsapp.getChatMessages(
          chatId,
          0,
          PAGE_SIZE
        );

        // Race condition check
        if (paginationRef.current.chatId !== chatId) {
          console.log(
            "[MessagesPagination] Chat changed during fetch, aborting"
          );
          return { fromCache: false, messages: [] };
        }

        const sorted = sortMessages(response.messages || []);
        const nextCursor = Number(response.nextCursor) || 0;

        // Update state
        setMessages(sorted);
        setMessageCount(sorted.length);
        setHasMoreMessages(response.hasMore);
        currentCursorRef.current = nextCursor;

        // Update pagination ref
        paginationRef.current = {
          hasMore: response.hasMore,
          isLoading: false,
          cursor: nextCursor,
          chatId,
        };

        // Update cache
        messagesCacheRef.current.set(chatId, {
          messages: sorted,
          hasMore: response.hasMore,
          cursor: nextCursor,
        });

        console.log("[MessagesPagination] Initial fetch complete:", {
          chatId,
          messageCount: sorted.length,
          hasMore: response.hasMore,
          cursor: nextCursor,
        });

        return { fromCache: false, messages: sorted };
      } catch (err) {
        console.error("[MessagesPagination] Error loading messages:", err);
        return { fromCache: false, messages: [] };
      }
    },
    [sortMessages, resetPaginationState]
  );

  // ============================================================
  // Load older messages (infinite scroll)
  // ============================================================
  const loadOlderMessages = useCallback(
    async (
      chatId: string,
      containerRef: React.RefObject<HTMLDivElement | null>
    ): Promise<Message[]> => {
      // Read from ref for synchronous, up-to-date values
      const { hasMore, isLoading, cursor } = paginationRef.current;

      // Guard conditions
      if (!hasMore) {
        console.log("[MessagesPagination] loadOlderMessages: No more messages");
        return [];
      }

      if (isLoading) {
        console.log("[MessagesPagination] loadOlderMessages: Already loading");
        return [];
      }

      if (paginationRef.current.chatId !== chatId) {
        console.log("[MessagesPagination] loadOlderMessages: Wrong chat");
        return [];
      }

      const container = containerRef.current;
      if (!container) {
        console.log("[MessagesPagination] loadOlderMessages: No container");
        return [];
      }

      // Set loading state FIRST (synchronous via ref)
      paginationRef.current.isLoading = true;
      setIsLoadingOlderMessages(true);

      // Save scroll position for restoration
      const previousScrollHeight = container.scrollHeight;
      const previousScrollTop = container.scrollTop;

      try {
        const response = await backendApi.whatsapp.getChatMessages(
          chatId,
          cursor,
          PAGE_SIZE
        );

        // Race condition check
        if (paginationRef.current.chatId !== chatId) {
          console.log("[MessagesPagination] Chat changed during fetch");
          paginationRef.current.isLoading = false;
          setIsLoadingOlderMessages(false);
          return [];
        }

        // Handle empty response
        if (!response.messages || response.messages.length === 0) {
          paginationRef.current.hasMore = false;
          paginationRef.current.isLoading = false;
          setHasMoreMessages(false);
          setIsLoadingOlderMessages(false);
          return [];
        }

        const sortedOlder = sortMessages(response.messages);
        const nextCursor = Number(response.nextCursor) || 0;

        // Update messages with deduplication
        let combinedMessages: Message[] = [];
        setMessages((prevMessages) => {
          const combined = deduplicateMessages([
            ...sortedOlder,
            ...prevMessages,
          ]);
          combinedMessages = sortMessages(combined);

          // Update cache
          messagesCacheRef.current.set(chatId, {
            messages: combinedMessages,
            hasMore: response.hasMore,
            cursor: nextCursor,
          });

          return combinedMessages;
        });

        // Update pagination ref
        paginationRef.current = {
          hasMore: response.hasMore,
          isLoading: false,
          cursor: nextCursor,
          chatId,
        };
        currentCursorRef.current = nextCursor;
        setHasMoreMessages(response.hasMore);
        setIsLoadingOlderMessages(false);

        // Restore scroll position
        requestAnimationFrame(() => {
          if (container && paginationRef.current.chatId === chatId) {
            const newScrollHeight = container.scrollHeight;
            const scrollDiff = newScrollHeight - previousScrollHeight;
            container.scrollTop = previousScrollTop + scrollDiff;
          }
        });

        console.log("[MessagesPagination] Loaded older messages:", {
          count: sortedOlder.length,
          hasMore: response.hasMore,
          cursor: nextCursor,
        });

        return sortedOlder;
      } catch (err) {
        console.error(
          "[MessagesPagination] Error loading older messages:",
          err
        );
        paginationRef.current.isLoading = false;
        setIsLoadingOlderMessages(false);
        return [];
      }
    },
    [sortMessages, deduplicateMessages]
  );

  // ============================================================
  // Save messages to cache
  // ============================================================
  const saveToCache = useCallback((chatId: string, msgs: Message[]): void => {
    const current = paginationRef.current;
    messagesCacheRef.current.set(chatId, {
      messages: msgs,
      hasMore: current.hasMore,
      cursor: current.cursor,
    });
  }, []);

  // ============================================================
  // Get cached messages
  // ============================================================
  const getCachedMessages = useCallback(
    (chatId: string): MessagesCacheEntry | undefined => {
      return messagesCacheRef.current.get(chatId);
    },
    []
  );

  // ============================================================
  // Clear cache
  // ============================================================
  const clearCache = useCallback((chatId?: string): void => {
    if (chatId) {
      messagesCacheRef.current.delete(chatId);
    } else {
      messagesCacheRef.current.clear();
    }
  }, []);

  return {
    // State
    messages,
    setMessages,
    messageCount,
    setMessageCount,
    hasMoreMessages,
    isLoadingOlderMessages,

    // Cache
    messagesCacheRef,

    // Refs
    paginationRef,
    currentCursorRef,

    // Actions
    loadInitialMessages,
    loadOlderMessages,
    saveToCache,
    getCachedMessages,
    clearCache,
    resetPaginationState,
  };
}
