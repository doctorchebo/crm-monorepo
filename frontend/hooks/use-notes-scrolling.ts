/**
 * useNotesScrolling - Hook for managing notes thread scrolling behavior
 *
 * Features:
 * - Auto-scroll to bottom on initial load and when user adds a note
 * - Show scroll-to-bottom button when user scrolls up or new note from others
 * - Preserve scroll position when switching between chats
 * - Restore scroll position when returning to a chat
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface ScrollPosition {
  scrollTop: number;
  scrollHeight: number;
  isAtBottom: boolean;
}

interface UseNotesScrollingOptions {
  /** Current chat ID */
  chatId: string | null;
  /** Number of notes in the thread */
  notesCount: number;
  /** Whether notes are currently loading */
  isLoading: boolean;
  /** Threshold in pixels to consider "at bottom" */
  bottomThreshold?: number;
}

interface UseNotesScrollingReturn {
  /** Ref to attach to the scrollable container */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Whether to show the scroll-to-bottom button */
  showScrollButton: boolean;
  /** Function to scroll to bottom */
  scrollToBottom: (smooth?: boolean) => void;
  /** Call when user adds a note (always scrolls to bottom) */
  onUserAddedNote: () => void;
  /** Call when a remote note is received */
  onRemoteNoteReceived: () => void;
  /** Whether there's a new unread note (user hasn't scrolled to bottom) */
  hasNewNote: boolean;
  /** Dismiss the new note indicator */
  dismissNewNote: () => void;
}

// Store scroll positions per chat (persists during session)
const scrollPositionsCache = new Map<string, ScrollPosition>();

export function useNotesScrolling({
  chatId,
  notesCount,
  isLoading,
  bottomThreshold = 100,
}: UseNotesScrollingOptions): UseNotesScrollingReturn {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [hasNewNote, setHasNewNote] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const previousChatIdRef = useRef<string | null>(null);
  const previousNotesCountRef = useRef<number>(0);
  const isUserScrollingRef = useRef(false);

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
   * Scroll to bottom of the container
   */
  const scrollToBottom = useCallback((smooth = true) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? "smooth" : "instant",
    });

    setShowScrollButton(false);
    setHasNewNote(false);
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
    });
  }, [chatId, isNearBottom]);

  /**
   * Restore scroll position for a chat
   */
  const restoreScrollPosition = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !chatId) return;

    const savedPosition = scrollPositionsCache.get(chatId);
    if (savedPosition) {
      // If user was at bottom, scroll to bottom (notes may have changed)
      if (savedPosition.isAtBottom) {
        scrollToBottom(false);
      } else {
        // Calculate the scroll offset accounting for height changes
        const heightDelta = container.scrollHeight - savedPosition.scrollHeight;
        container.scrollTop = savedPosition.scrollTop + heightDelta;
      }
    } else {
      // First time viewing this chat's notes - scroll to bottom
      scrollToBottom(false);
    }
  }, [chatId, scrollToBottom]);

  /**
   * Handle scroll events
   */
  const handleScroll = useCallback(() => {
    isUserScrollingRef.current = true;
    const atBottom = isNearBottom();
    setShowScrollButton(!atBottom);

    // If user scrolled to bottom, clear new note indicator
    if (atBottom) {
      setHasNewNote(false);
    }

    // Save position after a brief delay to avoid rapid saves
    saveScrollPosition();
  }, [isNearBottom, saveScrollPosition]);

  /**
   * Called when user adds a note - always scroll to bottom
   */
  const onUserAddedNote = useCallback(() => {
    // Use a small timeout to allow the DOM to update
    requestAnimationFrame(() => {
      scrollToBottom(true);
    });
  }, [scrollToBottom]);

  /**
   * Called when a remote note is received
   */
  const onRemoteNoteReceived = useCallback(() => {
    if (isNearBottom()) {
      // If at bottom, auto-scroll to show new note
      requestAnimationFrame(() => {
        scrollToBottom(true);
      });
    } else {
      // If not at bottom, show indicator
      setHasNewNote(true);
      setShowScrollButton(true);
    }
  }, [isNearBottom, scrollToBottom]);

  /**
   * Dismiss new note indicator without scrolling
   */
  const dismissNewNote = useCallback(() => {
    setHasNewNote(false);
  }, []);

  // Handle chat change - save old position, restore new position
  useEffect(() => {
    if (chatId !== previousChatIdRef.current) {
      // Save position of previous chat before switching
      if (previousChatIdRef.current) {
        saveScrollPosition();
      }

      // Reset state for new chat
      setIsInitialLoad(true);
      setHasNewNote(false);
      setShowScrollButton(false);
      isUserScrollingRef.current = false;

      previousChatIdRef.current = chatId;
    }
  }, [chatId, saveScrollPosition]);

  // Handle initial load and notes count changes
  useEffect(() => {
    if (isLoading || !chatId) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    if (isInitialLoad) {
      // Initial load complete - restore or scroll to bottom
      requestAnimationFrame(() => {
        restoreScrollPosition();
        setIsInitialLoad(false);
        previousNotesCountRef.current = notesCount;
      });
    } else if (notesCount > previousNotesCountRef.current) {
      // New notes were added after initial load
      // The actual scroll behavior is handled by onUserAddedNote/onRemoteNoteReceived
      previousNotesCountRef.current = notesCount;
    }
  }, [chatId, isLoading, notesCount, isInitialLoad, restoreScrollPosition]);

  // Set up scroll event listener
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll]);

  return {
    scrollContainerRef,
    showScrollButton,
    scrollToBottom,
    onUserAddedNote,
    onRemoteNoteReceived,
    hasNewNote,
    dismissNewNote,
  };
}
