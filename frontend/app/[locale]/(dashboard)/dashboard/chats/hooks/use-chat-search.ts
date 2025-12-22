"use client";

import { backendApi } from "@/lib/api/endpoints";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";

/**
 * Chat search result type from the API
 */
export interface ChatSearchResult {
  chatId: string;
  senderId: number;
  businessPhone?: string;
  participantPhone: string;
  participantName?: string;
  lastMessage?: string;
  lastMessageType?: string;
  lastMessageTime?: string;
  unreadCount: number;
  matchedField?: "name" | "phone";
}

interface UseChatSearchOptions {
  /**
   * Debounce delay in milliseconds
   * @default 200
   */
  debounceMs?: number;
  /**
   * Minimum characters before triggering search
   * @default 1
   */
  minChars?: number;
  /**
   * Number of results to fetch per request
   * @default 50
   */
  pageSize?: number;
}

interface UseChatSearchReturn {
  /**
   * Current input value (updates immediately)
   */
  searchQuery: string;
  /**
   * Debounced query that triggers search
   */
  debouncedQuery: string;
  /**
   * Search results from API
   */
  searchResults: ChatSearchResult[];
  /**
   * Total count of matching chats
   */
  totalResults: number;
  /**
   * Whether more results are available
   */
  hasMore: boolean;
  /**
   * Whether search is in progress
   */
  isSearching: boolean;
  /**
   * Whether we're in search mode (has query)
   */
  isSearchMode: boolean;
  /**
   * Any error during search
   */
  error: string | null;
  /**
   * Handle input change
   */
  handleSearchChange: (value: string) => void;
  /**
   * Clear the search
   */
  clearSearch: () => void;
  /**
   * Load more results (pagination)
   */
  loadMore: () => Promise<void>;
}

/**
 * Hook for searching chats with debounced API calls and pagination.
 *
 * Features:
 * - Immediate input updates for responsive UI
 * - Debounced API calls to prevent overwhelming the server
 * - Pagination support with load more
 * - Error handling
 * - React 18 transitions for smooth updates
 *
 * @example
 * ```tsx
 * const {
 *   searchQuery,
 *   searchResults,
 *   isSearchMode,
 *   isSearching,
 *   handleSearchChange,
 *   clearSearch,
 * } = useChatSearch({ debounceMs: 200 });
 *
 * // Use searchResults when in search mode, otherwise use full chat list
 * const displayedChats = isSearchMode ? searchResults : allChats;
 * ```
 */
export function useChatSearch(
  options: UseChatSearchOptions = {}
): UseChatSearchReturn {
  const { debounceMs = 200, minChars = 1, pageSize = 50 } = options;

  // Input state (immediate updates)
  const [searchQuery, setSearchQuery] = useState("");

  // Debounced query (triggers API calls)
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Search results state
  const [searchResults, setSearchResults] = useState<ChatSearchResult[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loading state using React 18 transitions
  const [isSearching, startTransition] = useTransition();

  // Track current skip for pagination
  const currentSkipRef = useRef(0);

  // Debounce timeout ref
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Abort controller for canceling pending requests
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Perform the actual search API call
   */
  const performSearch = useCallback(
    async (query: string, skip: number = 0) => {
      // Cancel any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      try {
        setError(null);

        const response = await backendApi.chats.search(query, {
          skip,
          take: pageSize,
        });

        // Check if request was aborted
        if (abortControllerRef.current?.signal.aborted) {
          return;
        }

        // If skip is 0, replace results; otherwise append
        if (skip === 0) {
          setSearchResults(response.results);
        } else {
          setSearchResults((prev) => [...prev, ...response.results]);
        }

        setTotalResults(response.total);
        setHasMore(response.hasMore);
        currentSkipRef.current = skip + response.results.length;
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        console.error("Chat search error:", err);
        setError(err instanceof Error ? err.message : "Search failed");
        setSearchResults([]);
        setTotalResults(0);
        setHasMore(false);
      }
    },
    [pageSize]
  );

  /**
   * Handle search input changes with debouncing
   */
  const handleSearchChange = useCallback(
    (value: string) => {
      // Update input immediately for responsive UI
      setSearchQuery(value);

      // Clear any pending debounce
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      // Clear results immediately when query is cleared
      if (!value || value.trim().length < minChars) {
        setDebouncedQuery("");
        setSearchResults([]);
        setTotalResults(0);
        setHasMore(false);
        setError(null);
        currentSkipRef.current = 0;
        return;
      }

      // Debounce the search
      debounceTimeoutRef.current = setTimeout(() => {
        const trimmedQuery = value.trim();
        setDebouncedQuery(trimmedQuery);
        currentSkipRef.current = 0;

        startTransition(() => {
          performSearch(trimmedQuery, 0);
        });
      }, debounceMs);
    },
    [debounceMs, minChars, performSearch]
  );

  /**
   * Clear the search and reset state
   */
  const clearSearch = useCallback(() => {
    // Clear debounce timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Cancel pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Reset all state
    setSearchQuery("");
    setDebouncedQuery("");
    setSearchResults([]);
    setTotalResults(0);
    setHasMore(false);
    setError(null);
    currentSkipRef.current = 0;
  }, []);

  /**
   * Load more results for pagination
   */
  const loadMore = useCallback(async () => {
    if (!debouncedQuery || !hasMore || isSearching) {
      return;
    }

    startTransition(() => {
      performSearch(debouncedQuery, currentSkipRef.current);
    });
  }, [debouncedQuery, hasMore, isSearching, performSearch]);

  /**
   * Whether we're in search mode (user has entered a search query)
   */
  const isSearchMode = useMemo(() => {
    return searchQuery.trim().length >= minChars;
  }, [searchQuery, minChars]);

  return {
    searchQuery,
    debouncedQuery,
    searchResults,
    totalResults,
    hasMore,
    isSearching,
    isSearchMode,
    error,
    handleSearchChange,
    clearSearch,
    loadMore,
  };
}
