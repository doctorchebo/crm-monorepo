"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  scrollDebug,
  isNearBottom as sharedIsNearBottom,
} from "./scroll-utils";

// ============================================================
// TYPES
// ============================================================

/**
 * Scroll position entry stored per chat
 * Includes metadata for intelligent restoration
 */
interface ScrollPositionEntry {
  /** The actual scroll position (scrollTop value) */
  scrollTop: number;
  /** The scroll height when position was saved (for validation) */
  scrollHeight: number;
  /** Whether user was at the bottom when saved */
  wasAtBottom: boolean;
  /** Timestamp when saved (for debugging/stale detection) */
  savedAt: number;
}

/**
 * Manager state tracked via refs for synchronous access
 */
interface ScrollManagerState {
  /** Currently active chat ID */
  activeChatId: string | null;
  /** Whether scroll saving is currently allowed */
  isSaveEnabled: boolean;
  /** Whether we're in the middle of a chat transition */
  isTransitioning: boolean;
  /** Whether scroll restoration is in progress */
  isRestoring: boolean;
}

/**
 * Configuration options for the scroll position manager
 */
export interface ScrollPositionManagerOptions {
  /** Threshold in pixels to consider "at bottom" */
  bottomThreshold?: number;
  /** Debounce delay for saving scroll position (ms) */
  saveDebounceMs?: number;
  /** Maximum age of saved position before considering stale (ms) */
  maxPositionAgeMs?: number;
}

/**
 * Return type of the scroll position manager hook
 */
export interface ScrollPositionManagerReturn {
  /** Save scroll position for current chat */
  saveScrollPosition: (chatId: string) => void;
  /** Restore scroll position for a chat */
  restoreScrollPosition: (chatId: string) => Promise<boolean>;
  /** Notify manager of chat switch (call BEFORE switching) */
  onChatWillChange: (fromChatId: string | null, toChatId: string) => void;
  /** Notify manager that chat switch is complete */
  onChatDidChange: (chatId: string) => void;
  /** Enable/disable scroll position saving */
  setScrollSaveEnabled: (enabled: boolean) => void;
  /** Check if scroll saving is currently enabled */
  isScrollSaveEnabled: () => boolean;
  /** Get saved position for a chat (without restoring) */
  getSavedPosition: (chatId: string) => ScrollPositionEntry | null;
  /** Clear saved position for a chat or all chats */
  clearSavedPositions: (chatId?: string) => void;
  /** Check if currently transitioning between chats */
  isTransitioning: () => boolean;
  /** Handle scroll event (call from scroll listener) */
  handleScroll: (chatId: string) => void;
}

// ============================================================
// CONSTANTS
// ============================================================

const DEFAULT_OPTIONS: Required<ScrollPositionManagerOptions> = {
  bottomThreshold: 100,
  saveDebounceMs: 100,
  maxPositionAgeMs: 30 * 60 * 1000, // 30 minutes
};

// ============================================================
// MAIN HOOK
// ============================================================

/**
 * useScrollPositionManager - A dedicated hook for managing chat scroll positions
 *
 * ARCHITECTURE:
 * This hook provides a single, centralized place for all scroll position
 * save/restore logic. It uses refs to avoid stale closure issues and provides
 * a clean API for the chat state management.
 *
 * KEY PRINCIPLES:
 * 1. SINGLE SOURCE OF TRUTH - All scroll position logic in one place
 * 2. LIFECYCLE AWARE - Properly handles chat transitions
 * 3. RACE CONDITION FREE - Uses refs and proper state machine
 * 4. DEBOUNCED SAVES - Prevents excessive saves during scroll
 * 5. INTELLIGENT RESTORE - Validates positions and handles edge cases
 *
 * USAGE:
 * 1. Call onChatWillChange BEFORE switching chats
 * 2. Call onChatDidChange AFTER switch is complete
 * 3. Call handleScroll from scroll event listener
 * 4. Use saveScrollPosition/restoreScrollPosition for manual control
 */
export function useScrollPositionManager(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: ScrollPositionManagerOptions = {}
): ScrollPositionManagerReturn {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Storage for scroll positions per chat
  const positionsRef = useRef<Map<string, ScrollPositionEntry>>(new Map());

  // Manager state ref for synchronous access
  const stateRef = useRef<ScrollManagerState>({
    activeChatId: null,
    isSaveEnabled: false,
    isTransitioning: false,
    isRestoring: false,
  });

  // Debounce timer ref
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ============================================================
  // HELPER: Check if scrolled near bottom (uses shared utility)
  // ============================================================
  const isNearBottom = useCallback(
    (container: HTMLDivElement): boolean => {
      return sharedIsNearBottom(container, opts.bottomThreshold);
    },
    [opts.bottomThreshold]
  );

  // ============================================================
  // HELPER: Create scroll position entry
  // ============================================================
  const createPositionEntry = useCallback(
    (container: HTMLDivElement): ScrollPositionEntry => {
      return {
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        wasAtBottom: isNearBottom(container),
        savedAt: Date.now(),
      };
    },
    [isNearBottom]
  );

  // ============================================================
  // HELPER: Validate saved position is still usable
  // ============================================================
  const isPositionValid = useCallback(
    (entry: ScrollPositionEntry, container: HTMLDivElement): boolean => {
      // Check if position is too old
      if (Date.now() - entry.savedAt > opts.maxPositionAgeMs) {
        return false;
      }

      // If user was at bottom, we'll scroll to bottom anyway
      if (entry.wasAtBottom) {
        return true;
      }

      // Position should be within reasonable bounds
      // Allow some variance for content changes
      const maxValidScroll = container.scrollHeight + 500;
      if (entry.scrollTop > maxValidScroll) {
        return false;
      }

      return true;
    },
    [opts.maxPositionAgeMs]
  );

  // ============================================================
  // CORE: Save scroll position (immediate)
  // ============================================================
  const saveScrollPositionImmediate = useCallback(
    (chatId: string, force: boolean = false): void => {
      const container = containerRef.current;
      if (!container) return;

      const state = stateRef.current;

      // If not forced, check conditions
      if (!force) {
        // Don't save if not enabled or transitioning
        if (
          !state.isSaveEnabled ||
          state.isTransitioning ||
          state.isRestoring
        ) {
          return;
        }

        // Don't save for wrong chat
        if (state.activeChatId !== chatId) {
          return;
        }
      }

      const entry = createPositionEntry(container);
      positionsRef.current.set(chatId, entry);

      scrollDebug("[ScrollPositionManager] Saved position:", {
        chatId,
        scrollTop: entry.scrollTop,
        scrollHeight: entry.scrollHeight,
        wasAtBottom: entry.wasAtBottom,
        forced: force,
      });
    },
    [containerRef, createPositionEntry]
  );

  // ============================================================
  // PUBLIC: Save scroll position (debounced for scroll events)
  // ============================================================
  const saveScrollPosition = useCallback(
    (chatId: string): void => {
      // Clear any pending save
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      // Schedule debounced save
      saveTimerRef.current = setTimeout(() => {
        saveScrollPositionImmediate(chatId);
        saveTimerRef.current = null;
      }, opts.saveDebounceMs);
    },
    [saveScrollPositionImmediate, opts.saveDebounceMs]
  );

  // ============================================================
  // PUBLIC: Restore scroll position
  // ============================================================
  const restoreScrollPosition = useCallback(
    async (chatId: string): Promise<boolean> => {
      const container = containerRef.current;
      if (!container) {
        return false;
      }

      const state = stateRef.current;
      const entry = positionsRef.current.get(chatId);

      // If no saved position, scroll to bottom
      if (!entry) {
        scrollDebug(
          "[ScrollPositionManager] No saved position, scrolling to bottom"
        );
        state.isRestoring = true;
        container.scrollTop = container.scrollHeight;
        state.isRestoring = false;
        return true;
      }

      // Validate the saved position
      if (!isPositionValid(entry, container)) {
        scrollDebug(
          "[ScrollPositionManager] Saved position invalid, scrolling to bottom"
        );
        positionsRef.current.delete(chatId);
        state.isRestoring = true;
        container.scrollTop = container.scrollHeight;
        state.isRestoring = false;
        return true;
      }

      // If user was at bottom, scroll to bottom
      if (entry.wasAtBottom) {
        scrollDebug(
          "[ScrollPositionManager] Was at bottom, scrolling to bottom"
        );
        state.isRestoring = true;
        container.scrollTop = container.scrollHeight;
        state.isRestoring = false;
        return true;
      }

      // Restore the exact position
      scrollDebug("[ScrollPositionManager] Restoring position:", {
        chatId,
        scrollTop: entry.scrollTop,
      });

      state.isRestoring = true;

      // Use double RAF to ensure DOM is fully rendered
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (containerRef.current) {
              containerRef.current.scrollTop = entry.scrollTop;
            }
            state.isRestoring = false;
            resolve(true);
          });
        });
      });
    },
    [containerRef, isPositionValid]
  );

  // ============================================================
  // PUBLIC: Handle chat will change (call BEFORE switching)
  // ============================================================
  const onChatWillChange = useCallback(
    (fromChatId: string | null, toChatId: string): void => {
      const state = stateRef.current;

      scrollDebug("[ScrollPositionManager] Chat will change:", {
        from: fromChatId,
        to: toChatId,
      });

      // Clear any pending debounced saves
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      // CRITICAL: Save current position IMMEDIATELY with force=true
      // This bypasses the isSaveEnabled check since we're leaving the chat
      if (fromChatId) {
        saveScrollPositionImmediate(fromChatId, true);
      }

      // Mark as transitioning
      state.isTransitioning = true;
      state.isSaveEnabled = false;
    },
    [saveScrollPositionImmediate]
  );

  // ============================================================
  // PUBLIC: Handle chat did change (call AFTER switch complete)
  // ============================================================
  const onChatDidChange = useCallback((chatId: string): void => {
    const state = stateRef.current;

    scrollDebug("[ScrollPositionManager] Chat did change:", { chatId });

    // Update active chat
    state.activeChatId = chatId;
    state.isTransitioning = false;

    // Re-enable saving after a short delay
    // This prevents immediate saves from scroll events during render
    setTimeout(() => {
      if (stateRef.current.activeChatId === chatId) {
        stateRef.current.isSaveEnabled = true;
        scrollDebug("[ScrollPositionManager] Saving enabled for:", chatId);
      }
    }, 200);
  }, []);

  // ============================================================
  // PUBLIC: Set scroll save enabled
  // ============================================================
  const setScrollSaveEnabled = useCallback((enabled: boolean): void => {
    stateRef.current.isSaveEnabled = enabled;
  }, []);

  // ============================================================
  // PUBLIC: Check if scroll save enabled
  // ============================================================
  const isScrollSaveEnabled = useCallback((): boolean => {
    return stateRef.current.isSaveEnabled;
  }, []);

  // ============================================================
  // PUBLIC: Get saved position
  // ============================================================
  const getSavedPosition = useCallback(
    (chatId: string): ScrollPositionEntry | null => {
      return positionsRef.current.get(chatId) || null;
    },
    []
  );

  // ============================================================
  // PUBLIC: Clear saved positions
  // ============================================================
  const clearSavedPositions = useCallback((chatId?: string): void => {
    if (chatId) {
      positionsRef.current.delete(chatId);
    } else {
      positionsRef.current.clear();
    }
  }, []);

  // ============================================================
  // PUBLIC: Check if transitioning
  // ============================================================
  const isTransitioning = useCallback((): boolean => {
    return stateRef.current.isTransitioning;
  }, []);

  // ============================================================
  // PUBLIC: Handle scroll event
  // ============================================================
  const handleScroll = useCallback(
    (chatId: string): void => {
      const state = stateRef.current;

      // Skip if conditions not met
      if (
        !state.isSaveEnabled ||
        state.isTransitioning ||
        state.isRestoring ||
        state.activeChatId !== chatId
      ) {
        return;
      }

      // Debounced save
      saveScrollPosition(chatId);
    },
    [saveScrollPosition]
  );

  // ============================================================
  // CLEANUP on unmount
  // ============================================================
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  return {
    saveScrollPosition,
    restoreScrollPosition,
    onChatWillChange,
    onChatDidChange,
    setScrollSaveEnabled,
    isScrollSaveEnabled,
    getSavedPosition,
    clearSavedPositions,
    isTransitioning,
    handleScroll,
  };
}
