/**
 * useNotesInfiniteScroll - Hook for managing notes infinite scroll and search
 *
 * Features:
 * - Cursor-based pagination for loading older/newer notes
 * - Bidirectional infinite scroll (up for older, down for newer)
 * - Notes search functionality
 * - Auto-scroll to bottom on initial load and when user adds a note
 * - Show scroll-to-bottom button when user scrolls up
 * - Navigate to specific note from search results with proper batch loading
 * - Real-time WebSocket integration
 * - Scroll position persistence between chats
 *
 * Architecture:
 * - Maintains a local cache of notes per chat
 * - Uses cursor-based pagination for efficient data fetching
 * - Supports "around" query for loading context around a search result
 * - Integrates with useNotesSocket for real-time updates
 */

"use client";

import {
  backendApi,
  type NoteResponse,
  type NoteSearchResult,
  type NotesPagination,
  type NotesSearchResponse,
  type PaginatedNotesResponse,
} from "@/lib/api/endpoints";
import { useCallback, useEffect, useRef, useState } from "react";

// ==================== Types ====================

export interface NotesInfiniteScrollState {
  /** All loaded notes (in chronological order, oldest first) */
  notes: NoteResponse[];
  /** Pagination metadata */
  pagination: NotesPagination | null;
  /** Whether initial data is loading */
  isLoading: boolean;
  /** Whether more data is being loaded */
  isLoadingMore: boolean;
  /** Error message if any */
  error: string | null;
}

export interface NotesSearchState {
  /** Whether search mode is active */
  isSearchActive: boolean;
  /** Current search query */
  query: string;
  /** Search results */
  results: NoteSearchResult[];
  /** Whether search is in progress */
  isSearching: boolean;
  /** Total results count */
  total: number;
  /** Currently highlighted note ID (from search navigation) */
  highlightedNoteId: number | null;
}

export interface UseNotesInfiniteScrollOptions {
  /** Current chat ID */
  chatId: string | null;
  /** Number of notes to fetch per page */
  pageSize?: number;
  /** Threshold in pixels to trigger load more */
  loadMoreThreshold?: number;
  /** Threshold in pixels to consider "at bottom" */
  bottomThreshold?: number;
  /** Debounce delay for search in ms */
  searchDebounceMs?: number;
  /** Cooldown after loading more to prevent rapid re-triggers (ms) */
  loadCooldownMs?: number;
  /** Distance threshold (in pixels) for using smooth scroll vs instant scroll when adding notes */
  smoothScrollThreshold?: number;
}

export interface UseNotesInfiniteScrollReturn {
  /** Current state of notes */
  state: NotesInfiniteScrollState;
  /** Search state */
  searchState: NotesSearchState;
  /** Ref to attach to the scrollable container */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Whether to show the scroll-to-bottom button */
  showScrollButton: boolean;
  /** Number of new notes indicator (0 if none) */
  newNotesCount: number;
  /** Function to scroll to bottom */
  scrollToBottom: (smooth?: boolean) => void;
  /** Load more older notes (called when scrolling up) */
  loadOlderNotes: () => Promise<void>;
  /** Load more newer notes (called when scrolling down) */
  loadNewerNotes: () => Promise<void>;
  /** Call when user adds a note */
  onUserAddedNote: (note: NoteResponse) => void;
  /** Call when a remote note is received via WebSocket */
  onRemoteNoteReceived: (note: NoteResponse) => void;
  /** Call when a note is deleted via WebSocket */
  onNoteDeleted: (noteId: number) => void;
  /** Toggle search mode */
  toggleSearch: () => void;
  /** Set search query (triggers debounced search) */
  setSearchQuery: (query: string) => void;
  /** Clear search and return to normal view */
  clearSearch: () => void;
  /** Navigate to a search result note */
  navigateToNote: (noteId: number) => Promise<void>;
  /** Dismiss the highlight on a note */
  dismissHighlight: () => void;
  /** Refresh notes (full reload) */
  refresh: () => Promise<void>;
}

// ==================== Scroll Position Cache ====================

interface CachedScrollState {
  scrollTop: number;
  scrollHeight: number;
  isAtBottom: boolean;
  oldestNoteId: number | null;
  newestNoteId: number | null;
}

const scrollPositionsCache = new Map<string, CachedScrollState>();

// ==================== Main Hook ====================

export function useNotesInfiniteScroll({
  chatId,
  pageSize = 20,
  loadMoreThreshold = 100,
  bottomThreshold = 100,
  searchDebounceMs = 300,
  loadCooldownMs = 500,
  smoothScrollThreshold = 500,
}: UseNotesInfiniteScrollOptions): UseNotesInfiniteScrollReturn {
  // ==================== State ====================

  const [state, setState] = useState<NotesInfiniteScrollState>({
    notes: [],
    pagination: null,
    isLoading: true,
    isLoadingMore: false,
    error: null,
  });

  const [searchState, setSearchState] = useState<NotesSearchState>({
    isSearchActive: false,
    query: "",
    results: [],
    isSearching: false,
    total: 0,
    highlightedNoteId: null,
  });

  const [showScrollButton, setShowScrollButton] = useState(false);
  const [newNotesCount, setNewNotesCount] = useState(0);

  // ==================== Refs ====================

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const previousChatIdRef = useRef<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Loading state refs for preventing race conditions
   * Using refs instead of state to avoid re-renders and ensure synchronous checks
   */
  const loadingRef = useRef(false);
  const loadCooldownRef = useRef(false);

  /**
   * Flag to track if we're in the middle of a scroll position restoration
   * This prevents the scroll handler from triggering during programmatic scrolls
   */
  const isRestoringScrollRef = useRef(false);

  /**
   * Flag to track initial load completion for scroll-to-bottom
   */
  const initialScrollDoneRef = useRef(false);

  // ==================== Utility Functions ====================

  /**
   * Check if the container is scrolled to (near) the bottom
   */
  const isNearBottom = useCallback((): boolean => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollHeight - scrollTop - clientHeight <= bottomThreshold;
  }, [bottomThreshold]);

  /**
   * Check if the container is scrolled to (near) the top
   */
  const isNearTop = useCallback((): boolean => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    return container.scrollTop <= loadMoreThreshold;
  }, [loadMoreThreshold]);

  /**
   * Get the distance from the bottom of the scroll container in pixels
   * Returns 0 if at bottom, positive number representing pixels from bottom
   */
  const getDistanceFromBottom = useCallback((): number => {
    const container = scrollContainerRef.current;
    if (!container) return 0;
    const { scrollTop, scrollHeight, clientHeight } = container;
    return Math.max(0, scrollHeight - scrollTop - clientHeight);
  }, []);

  /**
   * Scroll to bottom of the container
   * Uses double RAF to ensure DOM has updated before scrolling
   */
  const scrollToBottom = useCallback((smooth = true) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Mark that we're doing programmatic scroll
    isRestoringScrollRef.current = true;

    // Use double RAF to ensure the DOM has been painted
    const performScroll = () => {
      if (!scrollContainerRef.current) return;
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "instant",
      });

      setShowScrollButton(false);
      setNewNotesCount(0);

      // Reset the flag after scroll completes
      setTimeout(
        () => {
          isRestoringScrollRef.current = false;
        },
        smooth ? 300 : 50,
      );
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(performScroll);
    });
  }, []);

  /**
   * Scroll to a specific note by ID
   */
  const scrollToNote = useCallback((noteId: number, smooth = true) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    isRestoringScrollRef.current = true;

    const noteElement = container.querySelector(`[data-note-id="${noteId}"]`);
    if (noteElement) {
      noteElement.scrollIntoView({
        behavior: smooth ? "smooth" : "instant",
        block: "center",
      });

      setTimeout(
        () => {
          isRestoringScrollRef.current = false;
        },
        smooth ? 300 : 50,
      );
    } else {
      isRestoringScrollRef.current = false;
    }
  }, []);

  /**
   * Save current scroll position for the chat
   */
  const saveScrollPosition = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !chatId) return;

    scrollPositionsCache.set(chatId, {
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      isAtBottom: isNearBottom(),
      oldestNoteId: state.pagination?.oldestId ?? null,
      newestNoteId: state.pagination?.newestId ?? null,
    });
  }, [chatId, isNearBottom, state.pagination]);

  /**
   * Start load cooldown to prevent rapid re-triggers
   */
  const startLoadCooldown = useCallback(() => {
    loadCooldownRef.current = true;
    setTimeout(() => {
      loadCooldownRef.current = false;
    }, loadCooldownMs);
  }, [loadCooldownMs]);

  // ==================== Data Fetching ====================

  /**
   * Fetch initial notes for a chat
   */
  const fetchInitialNotes = useCallback(async () => {
    if (!chatId) return;

    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Reset initial scroll flag
    initialScrollDoneRef.current = false;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response: PaginatedNotesResponse =
        await backendApi.notes.getPaginated(chatId, { limit: pageSize });

      setState({
        notes: response.notes,
        pagination: response.pagination,
        isLoading: false,
        isLoadingMore: false,
        error: null,
      });

      // Initial scroll will be handled by the useEffect that watches state.notes
    } catch (error: any) {
      if (error.name === "AbortError") return;
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error.message || "Failed to load notes",
      }));
    }
  }, [chatId, pageSize]);

  /**
   * Load older notes (when scrolling up)
   */
  const loadOlderNotes = useCallback(async () => {
    // Guard conditions - prevent loading if:
    // 1. No chat ID
    // 2. No more previous notes
    // 3. Already loading (ref check for synchronous guard)
    // 4. In cooldown period (prevents rapid re-triggers)
    // 5. Currently restoring scroll position
    if (
      !chatId ||
      !state.pagination?.hasPrevious ||
      loadingRef.current ||
      loadCooldownRef.current ||
      isRestoringScrollRef.current
    ) {
      return;
    }

    const oldestId = state.pagination.oldestId;
    if (!oldestId) return;

    loadingRef.current = true;
    setState((prev) => ({ ...prev, isLoadingMore: true }));

    try {
      // Save current scroll position to maintain it after prepending
      const container = scrollContainerRef.current;
      const scrollHeightBefore = container?.scrollHeight ?? 0;
      const scrollTopBefore = container?.scrollTop ?? 0;

      const response: PaginatedNotesResponse =
        await backendApi.notes.getPaginated(chatId, {
          limit: pageSize,
          cursor: oldestId,
          direction: "before",
        });

      // If no new notes returned, just mark as done
      if (response.notes.length === 0) {
        setState((prev) => ({
          ...prev,
          pagination: {
            ...prev.pagination!,
            hasPrevious: false,
          },
          isLoadingMore: false,
        }));
        loadingRef.current = false;
        startLoadCooldown();
        return;
      }

      // Mark that we're restoring scroll position
      isRestoringScrollRef.current = true;

      setState((prev) => ({
        ...prev,
        notes: [...response.notes, ...prev.notes],
        pagination: {
          ...prev.pagination!,
          hasPrevious: response.pagination.hasPrevious,
          oldestId:
            response.pagination.oldestId ?? prev.pagination?.oldestId ?? null,
        },
        isLoadingMore: false,
      }));

      // Maintain scroll position after prepending
      // Use double RAF to ensure the DOM has been updated
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (container) {
            const scrollHeightAfter = container.scrollHeight;
            const heightDelta = scrollHeightAfter - scrollHeightBefore;
            // Set scroll position directly without animation
            container.scrollTop = scrollTopBefore + heightDelta;
          }

          // Reset flags after a short delay to allow scroll to settle
          setTimeout(() => {
            isRestoringScrollRef.current = false;
            loadingRef.current = false;
            startLoadCooldown();
          }, 100);
        });
      });
    } catch (error: any) {
      console.error("[NotesInfiniteScroll] Error loading older notes:", error);
      setState((prev) => ({ ...prev, isLoadingMore: false }));
      loadingRef.current = false;
      isRestoringScrollRef.current = false;
      startLoadCooldown();
    }
  }, [chatId, state.pagination, pageSize, startLoadCooldown]);

  /**
   * Load newer notes (for bidirectional scroll after navigating to older note)
   */
  const loadNewerNotes = useCallback(async () => {
    // Guard conditions
    if (
      !chatId ||
      !state.pagination?.hasMore ||
      loadingRef.current ||
      loadCooldownRef.current ||
      isRestoringScrollRef.current
    ) {
      return;
    }

    const newestId = state.pagination.newestId;
    if (!newestId) return;

    loadingRef.current = true;
    setState((prev) => ({ ...prev, isLoadingMore: true }));

    try {
      const response: PaginatedNotesResponse =
        await backendApi.notes.getPaginated(chatId, {
          limit: pageSize,
          cursor: newestId,
          direction: "after",
        });

      setState((prev) => ({
        ...prev,
        notes: [...prev.notes, ...response.notes],
        pagination: {
          ...prev.pagination!,
          hasMore: response.pagination.hasMore,
          newestId:
            response.pagination.newestId ?? prev.pagination?.newestId ?? null,
        },
        isLoadingMore: false,
      }));

      startLoadCooldown();
    } catch (error: any) {
      console.error("[NotesInfiniteScroll] Error loading newer notes:", error);
      setState((prev) => ({ ...prev, isLoadingMore: false }));
    } finally {
      loadingRef.current = false;
    }
  }, [chatId, state.pagination, pageSize, startLoadCooldown]);

  /**
   * Navigate to a specific note (from search results)
   * Loads notes around that note if not currently loaded
   */
  const navigateToNote = useCallback(
    async (noteId: number) => {
      if (!chatId) return;

      // Check if note is already loaded
      const existingNote = state.notes.find((n) => n.id === noteId);
      if (existingNote) {
        // Note is already loaded, just scroll to it and highlight
        setSearchState((prev) => ({
          ...prev,
          isSearchActive: false,
          highlightedNoteId: noteId,
        }));
        requestAnimationFrame(() => {
          scrollToNote(noteId);
        });
        return;
      }

      // Note not loaded - fetch notes around this note
      setState((prev) => ({ ...prev, isLoading: true }));

      try {
        const response: PaginatedNotesResponse =
          await backendApi.notes.getPaginated(chatId, {
            limit: pageSize,
            aroundId: noteId,
          });

        setState({
          notes: response.notes,
          pagination: response.pagination,
          isLoading: false,
          isLoadingMore: false,
          error: null,
        });

        setSearchState((prev) => ({
          ...prev,
          isSearchActive: false,
          highlightedNoteId: noteId,
        }));

        // Scroll to the note after rendering
        requestAnimationFrame(() => {
          scrollToNote(noteId);
        });
      } catch (error: any) {
        console.error("[NotesInfiniteScroll] Error navigating to note:", error);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "Failed to navigate to note",
        }));
      }
    },
    [chatId, state.notes, pageSize, scrollToNote],
  );

  /**
   * Dismiss highlight on a note
   */
  const dismissHighlight = useCallback(() => {
    setSearchState((prev) => ({ ...prev, highlightedNoteId: null }));
  }, []);

  /**
   * Refresh notes (full reload)
   */
  const refresh = useCallback(async () => {
    await fetchInitialNotes();
  }, [fetchInitialNotes]);

  // ==================== Search Functions ====================

  /**
   * Toggle search mode
   */
  const toggleSearch = useCallback(() => {
    setSearchState((prev) => ({
      ...prev,
      isSearchActive: !prev.isSearchActive,
      query: "",
      results: [],
      total: 0,
      highlightedNoteId: null,
    }));
  }, []);

  /**
   * Perform search
   */
  const performSearch = useCallback(
    async (query: string) => {
      if (!chatId || !query.trim()) {
        setSearchState((prev) => ({
          ...prev,
          results: [],
          total: 0,
          isSearching: false,
        }));
        return;
      }

      setSearchState((prev) => ({ ...prev, isSearching: true }));

      try {
        const response: NotesSearchResponse = await backendApi.notes.search(
          chatId,
          query.trim(),
          { limit: 50 },
        );

        setSearchState((prev) => ({
          ...prev,
          results: response.results,
          total: response.total,
          isSearching: false,
        }));
      } catch (error: any) {
        console.error("[NotesInfiniteScroll] Search error:", error);
        setSearchState((prev) => ({
          ...prev,
          results: [],
          total: 0,
          isSearching: false,
        }));
      }
    },
    [chatId],
  );

  /**
   * Set search query (with debouncing)
   */
  const setSearchQuery = useCallback(
    (query: string) => {
      setSearchState((prev) => ({ ...prev, query }));

      // Clear existing timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      // Debounce the search
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(query);
      }, searchDebounceMs);
    },
    [performSearch, searchDebounceMs],
  );

  /**
   * Clear search and return to normal view
   */
  const clearSearch = useCallback(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    setSearchState({
      isSearchActive: false,
      query: "",
      results: [],
      isSearching: false,
      total: 0,
      highlightedNoteId: null,
    });
  }, []);

  // ==================== Real-time Updates ====================

  /**
   * Handle user adding a note
   * Checks for duplicates to prevent race condition with WebSocket
   * Uses instant scroll if far from bottom, smooth scroll if close
   */
  const onUserAddedNote = useCallback(
    (note: NoteResponse) => {
      // Calculate distance before state update (while we still have accurate scroll position)
      const distanceFromBottom = getDistanceFromBottom();
      const useSmooth = distanceFromBottom <= smoothScrollThreshold;

      setState((prev) => {
        // Check if we already have this note (race condition with WebSocket)
        if (prev.notes.some((n) => n.id === note.id)) {
          return prev;
        }

        return {
          ...prev,
          notes: [...prev.notes, note],
          pagination: prev.pagination
            ? {
                ...prev.pagination,
                newestId: note.id,
              }
            : null,
        };
      });

      // Scroll to bottom: smooth if close, instant if far
      scrollToBottom(useSmooth);
    },
    [scrollToBottom, getDistanceFromBottom, smoothScrollThreshold],
  );

  /**
   * Handle remote note received via WebSocket
   */
  const onRemoteNoteReceived = useCallback(
    (note: NoteResponse) => {
      // Check if we already have this note
      setState((prev) => {
        if (prev.notes.some((n) => n.id === note.id)) {
          return prev;
        }

        return {
          ...prev,
          notes: [...prev.notes, note],
          pagination: prev.pagination
            ? {
                ...prev.pagination,
                newestId: note.id,
              }
            : null,
        };
      });

      // If user is near bottom, scroll to show new note
      if (isNearBottom()) {
        requestAnimationFrame(() => {
          scrollToBottom(true);
        });
      } else {
        // Show indicator that there's a new note
        setNewNotesCount((prev) => prev + 1);
        setShowScrollButton(true);
      }
    },
    [isNearBottom, scrollToBottom],
  );

  /**
   * Handle note deleted via WebSocket
   */
  const onNoteDeleted = useCallback((noteId: number) => {
    setState((prev) => ({
      ...prev,
      notes: prev.notes.filter((n) => n.id !== noteId),
    }));

    // Also remove from search results if present
    setSearchState((prev) => ({
      ...prev,
      results: prev.results.filter((r) => r.id !== noteId),
      total: Math.max(0, prev.total - 1),
    }));
  }, []);

  // ==================== Scroll Handling ====================

  /**
   * Handle scroll events
   * Uses refs for synchronous checks to prevent race conditions
   */
  const handleScroll = useCallback(() => {
    // Ignore scroll events during programmatic scroll restoration
    if (isRestoringScrollRef.current) {
      return;
    }

    const atBottom = isNearBottom();
    const atTop = isNearTop();

    // Update scroll button visibility
    setShowScrollButton(!atBottom || newNotesCount > 0);

    // If user scrolled to bottom, clear new note indicator
    if (atBottom) {
      setNewNotesCount(0);
    }

    // Trigger load more when near top
    // Additional guards: not loading, not in cooldown
    if (
      atTop &&
      state.pagination?.hasPrevious &&
      !loadingRef.current &&
      !loadCooldownRef.current
    ) {
      loadOlderNotes();
    }

    // Trigger load more when near bottom (for bidirectional scroll)
    if (
      atBottom &&
      state.pagination?.hasMore &&
      !loadingRef.current &&
      !loadCooldownRef.current
    ) {
      loadNewerNotes();
    }

    // Save position
    saveScrollPosition();
  }, [
    isNearBottom,
    isNearTop,
    newNotesCount,
    state.pagination,
    loadOlderNotes,
    loadNewerNotes,
    saveScrollPosition,
  ]);

  // ==================== Effects ====================

  // Handle chat change
  useEffect(() => {
    if (chatId !== previousChatIdRef.current) {
      // Save position of previous chat
      if (previousChatIdRef.current) {
        saveScrollPosition();
      }

      // Reset state for new chat
      setState({
        notes: [],
        pagination: null,
        isLoading: true,
        isLoadingMore: false,
        error: null,
      });

      setSearchState({
        isSearchActive: false,
        query: "",
        results: [],
        isSearching: false,
        total: 0,
        highlightedNoteId: null,
      });

      setShowScrollButton(false);
      setNewNotesCount(0);

      // Reset refs
      loadingRef.current = false;
      loadCooldownRef.current = false;
      isRestoringScrollRef.current = false;
      initialScrollDoneRef.current = false;

      previousChatIdRef.current = chatId;

      // Fetch notes for new chat
      if (chatId) {
        fetchInitialNotes();
      }
    }
  }, [chatId, saveScrollPosition, fetchInitialNotes]);

  /**
   * Effect to scroll to bottom after initial notes are loaded
   * This is separate from fetchInitialNotes to ensure proper timing
   */
  useEffect(() => {
    // Only scroll to bottom if:
    // 1. We have notes
    // 2. We're not loading
    // 3. We haven't done the initial scroll yet
    if (
      state.notes.length > 0 &&
      !state.isLoading &&
      !initialScrollDoneRef.current
    ) {
      initialScrollDoneRef.current = true;
      // Use instant scroll for initial load (no animation needed)
      scrollToBottom(false);
    }
  }, [state.notes.length, state.isLoading, scrollToBottom]);

  // Set up scroll event listener
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // ==================== Return ====================

  return {
    state,
    searchState,
    scrollContainerRef,
    showScrollButton: showScrollButton || newNotesCount > 0,
    newNotesCount,
    scrollToBottom,
    loadOlderNotes,
    loadNewerNotes,
    onUserAddedNote,
    onRemoteNoteReceived,
    onNoteDeleted,
    toggleSearch,
    setSearchQuery,
    clearSearch,
    navigateToNote,
    dismissHighlight,
    refresh,
  };
}
