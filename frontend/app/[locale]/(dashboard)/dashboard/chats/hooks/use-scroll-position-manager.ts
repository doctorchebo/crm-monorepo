"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  scrollDebug,
  isNearBottom as sharedIsNearBottom,
} from "./scroll-utils";

// ============================================================
// ARCHITECTURE OVERVIEW
// ============================================================
/**
 * SCROLL POSITION MANAGER - Event-Driven Architecture
 *
 * This hook manages scroll position save/restore for chat switching.
 * It uses a STRICTLY EVENT-DRIVEN approach with NO arbitrary timeouts.
 *
 * KEY PRINCIPLES:
 * 1. STATE MACHINE - Clear states with explicit transitions
 * 2. EVENT-DRIVEN - Use actual DOM events (load, error) to detect completion
 * 3. USER INTENT - Only save from USER scroll, distinguish from programmatic
 * 4. EXPLICIT COMPLETION - Restoration is async with proper completion signal
 *
 * STATE MACHINE:
 * - IDLE: Normal operation, listening for user scrolls
 * - TRANSITIONING: Chat switch in progress, all saves disabled
 * - RESTORING: Actively restoring scroll position, waiting for media
 *
 * NO TIMEOUTS: Instead of guessing "800ms should be enough", we:
 * - Listen to actual image/video load events
 * - Track programmatic vs user scrolls
 * - Use explicit state transitions
 */

// ============================================================
// TYPES
// ============================================================

/**
 * Scroll position entry stored per chat.
 * Uses distanceFromBottom for accuracy across content changes.
 */
interface ScrollPositionEntry {
  /** Distance from bottom of scrollable content - this is the key metric */
  distanceFromBottom: number;
  /** Whether user was at the bottom when saved */
  wasAtBottom: boolean;
  /** Timestamp when saved (for stale detection) */
  savedAt: number;
}

/**
 * Manager states - explicit state machine
 */
type ManagerState = "idle" | "transitioning" | "restoring";

/**
 * Configuration options
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
 * Options for restoreScrollPosition
 */
export interface RestoreOptions {
  /** Maximum time to wait for media stability (default: 5000ms) */
  maxWaitMs?: number;
}

/**
 * Result of restoreScrollPosition
 */
export interface RestoreResult {
  /** Whether restoration was successful */
  success: boolean;
  /** The scroll position that was applied */
  appliedScrollTop: number;
  /** Whether we scrolled to bottom (no saved position or was at bottom) */
  scrolledToBottom: boolean;
}

/**
 * Return type of the hook
 */
export interface ScrollPositionManagerReturn {
  /** Notify manager of chat switch - saves current position immediately */
  onChatWillChange: (fromChatId: string | null, toChatId: string) => void;
  /** Notify manager that chat switch is fully complete - enables user scroll tracking */
  onChatDidChange: (chatId: string) => void;
  /** Restore scroll position - waits for media to load, returns promise */
  restoreScrollPosition: (
    chatId: string,
    options?: RestoreOptions
  ) => Promise<RestoreResult>;
  /** Get saved position for a chat (for inspection) */
  getSavedPosition: (chatId: string) => ScrollPositionEntry | null;
  /** Clear saved positions */
  clearSavedPositions: (chatId?: string) => void;
  /** Handle scroll event from scroll listener */
  handleScroll: (chatId: string) => void;
  /** Check if currently transitioning/restoring */
  isTransitioning: () => boolean;
  /** Get current state (for debugging) */
  getState: () => ManagerState;
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
// HELPER: Wait for media to load (event-driven, no arbitrary timeout)
// ============================================================

/**
 * Waits for all images and videos in a container to finish loading.
 * Uses actual DOM events - not timeouts.
 *
 * @param container - The scroll container to scan
 * @param maxWaitMs - Maximum wait time (safety net for broken media)
 * @returns Promise that resolves when all media is loaded or max wait reached
 */
function waitForMediaLoaded(
  container: HTMLDivElement,
  maxWaitMs: number = 5000
): Promise<void> {
  return new Promise((resolve) => {
    // Find all media elements
    const images = Array.from(container.querySelectorAll("img"));
    const videos = Array.from(container.querySelectorAll("video"));

    // Filter to only pending (not yet loaded) media
    const pendingImages = images.filter((img) => {
      // Not complete, or complete but broken (no dimensions)
      return !img.complete || img.naturalWidth === 0;
    });

    const pendingVideos = videos.filter((video) => {
      // readyState < 2 means HAVE_CURRENT_DATA not reached
      // Or no dimensions yet
      return video.readyState < 2 || video.videoWidth === 0;
    });

    const totalPending = pendingImages.length + pendingVideos.length;

    scrollDebug("[waitForMediaLoaded] Initial scan:", {
      totalImages: images.length,
      pendingImages: pendingImages.length,
      totalVideos: videos.length,
      pendingVideos: pendingVideos.length,
    });

    // If nothing pending, resolve immediately
    if (totalPending === 0) {
      scrollDebug("[waitForMediaLoaded] All media already loaded");
      resolve();
      return;
    }

    // Tracking
    let remaining = totalPending;
    let resolved = false;
    const cleanupFns: (() => void)[] = [];

    const onMediaComplete = () => {
      if (resolved) return;
      remaining--;
      scrollDebug("[waitForMediaLoaded] Media loaded, remaining:", remaining);
      if (remaining <= 0) {
        resolved = true;
        cleanup();
        resolve();
      }
    };

    const cleanup = () => {
      cleanupFns.forEach((fn) => fn());
    };

    // Safety timeout - only as a fallback for truly broken media
    const safetyTimer = setTimeout(() => {
      if (!resolved) {
        scrollDebug(
          "[waitForMediaLoaded] Safety timeout reached, proceeding with",
          remaining,
          "pending"
        );
        resolved = true;
        cleanup();
        resolve();
      }
    }, maxWaitMs);
    cleanupFns.push(() => clearTimeout(safetyTimer));

    // Attach listeners to pending images
    pendingImages.forEach((img) => {
      const handleLoad = () => onMediaComplete();
      const handleError = () => onMediaComplete();

      img.addEventListener("load", handleLoad, { once: true });
      img.addEventListener("error", handleError, { once: true });

      cleanupFns.push(() => {
        img.removeEventListener("load", handleLoad);
        img.removeEventListener("error", handleError);
      });

      // Double-check: might have loaded while we were setting up
      if (img.complete && img.naturalWidth > 0) {
        // Already loaded, call handler
        handleLoad();
      }
    });

    // Attach listeners to pending videos
    pendingVideos.forEach((video) => {
      const handleReady = () => onMediaComplete();
      const handleError = () => onMediaComplete();

      // Listen to multiple events for better coverage
      video.addEventListener("loadeddata", handleReady, { once: true });
      video.addEventListener("canplay", handleReady, { once: true });
      video.addEventListener("error", handleError, { once: true });

      cleanupFns.push(() => {
        video.removeEventListener("loadeddata", handleReady);
        video.removeEventListener("canplay", handleReady);
        video.removeEventListener("error", handleError);
      });

      // Double-check: might have loaded while setting up
      if (video.readyState >= 2 && video.videoWidth > 0) {
        handleReady();
      }
    });
  });
}

// ============================================================
// HELPER: Wait for scrollHeight to stabilize
// ============================================================

/**
 * Waits for the container's scrollHeight to stabilize.
 * Uses RAF polling to detect when height stops changing.
 *
 * @param container - The scroll container
 * @param maxWaitMs - Maximum wait time
 * @returns Promise that resolves with the stable scrollHeight
 */
function waitForHeightStabilization(
  container: HTMLDivElement,
  maxWaitMs: number = 2000
): Promise<number> {
  return new Promise((resolve) => {
    let lastHeight = container.scrollHeight;
    let stableCount = 0;
    const requiredStableFrames = 5; // Need 5 consecutive stable frames (~83ms)
    let frameCount = 0;
    const maxFrames = Math.ceil(maxWaitMs / 16.67); // ~60 FPS

    const checkStability = () => {
      frameCount++;
      const currentHeight = container.scrollHeight;

      console.log(
        "[waitForHeightStabilization] Frame",
        frameCount,
        "height:",
        currentHeight,
        "lastHeight:",
        lastHeight,
        "stableCount:",
        stableCount
      );

      if (currentHeight === lastHeight) {
        stableCount++;
        if (stableCount >= requiredStableFrames) {
          console.log(
            "[waitForHeightStabilization] Height stable at:",
            currentHeight
          );
          resolve(currentHeight);
          return;
        }
      } else {
        // Height changed, reset counter
        stableCount = 0;
        lastHeight = currentHeight;
      }

      if (frameCount >= maxFrames) {
        console.log(
          "[waitForHeightStabilization] Max frames reached, using:",
          currentHeight
        );
        resolve(currentHeight);
        return;
      }

      requestAnimationFrame(checkStability);
    };

    requestAnimationFrame(checkStability);
  });
}

// ============================================================
// MAIN HOOK
// ============================================================

export function useScrollPositionManager(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: ScrollPositionManagerOptions = {}
): ScrollPositionManagerReturn {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Storage for scroll positions per chat
  const positionsRef = useRef<Map<string, ScrollPositionEntry>>(new Map());

  // State machine
  const stateRef = useRef<ManagerState>("idle");
  const activeChatIdRef = useRef<string | null>(null);

  // Debounce timer for saves
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Track programmatic scrolls to avoid saving them
  // When we set scroll programmatically, we set this ref before the scroll
  // and clear it after a microtask (to catch the resulting scroll event)
  const programmaticScrollRef = useRef<boolean>(false);

  // Track the scroll position we programmatically set, to detect user deviation
  const lastProgrammaticScrollTopRef = useRef<number | null>(null);

  // ============================================================
  // HELPER: Check if at bottom
  // ============================================================
  const isNearBottom = useCallback(
    (container: HTMLDivElement): boolean => {
      return sharedIsNearBottom(container, opts.bottomThreshold);
    },
    [opts.bottomThreshold]
  );

  // ============================================================
  // HELPER: Create position entry
  // ============================================================
  const createPositionEntry = useCallback(
    (container: HTMLDivElement): ScrollPositionEntry => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;

      return {
        distanceFromBottom,
        wasAtBottom: isNearBottom(container),
        savedAt: Date.now(),
      };
    },
    [isNearBottom]
  );

  // ============================================================
  // HELPER: Validate saved position
  // ============================================================
  const isPositionValid = useCallback(
    (entry: ScrollPositionEntry): boolean => {
      // Check age
      return Date.now() - entry.savedAt <= opts.maxPositionAgeMs;
    },
    [opts.maxPositionAgeMs]
  );

  // ============================================================
  // INTERNAL: Save scroll position immediately
  // ============================================================
  const saveScrollPositionImmediate = useCallback(
    (chatId: string, force: boolean = false): void => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      // Only save in IDLE state unless forced
      if (!force && stateRef.current !== "idle") {
        return;
      }

      // Only save for active chat unless forced
      if (!force && activeChatIdRef.current !== chatId) {
        return;
      }

      const entry = createPositionEntry(container);

      positionsRef.current.set(chatId, entry);

      scrollDebug("[ScrollManager] Saved position:", {
        chatId,
        distanceFromBottom: entry.distanceFromBottom,
        wasAtBottom: entry.wasAtBottom,
        state: stateRef.current,
        forced: force,
      });
    },
    [containerRef, createPositionEntry]
  );

  // ============================================================
  // PUBLIC: Handle chat will change (BEFORE switching)
  // ============================================================
  const onChatWillChange = useCallback(
    (fromChatId: string | null, toChatId: string): void => {
      scrollDebug("[ScrollManager] Chat will change:", {
        from: fromChatId,
        to: toChatId,
        currentState: stateRef.current,
      });

      // Clear pending saves
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      // Save current position IMMEDIATELY with force=true
      if (fromChatId) {
        saveScrollPositionImmediate(fromChatId, true);
      }

      // Transition to TRANSITIONING state
      stateRef.current = "transitioning";
    },
    [saveScrollPositionImmediate]
  );

  // ============================================================
  // PUBLIC: Restore scroll position (async, waits for media)
  // ============================================================
  const restoreScrollPosition = useCallback(
    async (
      chatId: string,
      options: RestoreOptions = {}
    ): Promise<RestoreResult> => {
      const { maxWaitMs = 5000 } = options;

      const container = containerRef.current;
      if (!container) {
        scrollDebug("[ScrollManager] Restore failed: no container");
        return { success: false, appliedScrollTop: 0, scrolledToBottom: false };
      }

      // Transition to RESTORING state
      stateRef.current = "restoring";
      activeChatIdRef.current = chatId;

      scrollDebug("[ScrollManager] Starting restore for:", chatId);

      // Wait for media to load - this is EVENT-DRIVEN, not a timeout guess
      await waitForMediaLoaded(container, maxWaitMs);

      // Re-check we're still on the same chat after waiting
      if (activeChatIdRef.current !== chatId) {
        scrollDebug("[ScrollManager] Restore aborted: chat changed");
        return { success: false, appliedScrollTop: 0, scrolledToBottom: false };
      }

      // CRITICAL: Wait for scrollHeight to stabilize BEFORE applying scroll
      // This fixes the issue where cached images render but DOM height hasn't settled
      const stableHeight = await waitForHeightStabilization(container, 2000);

      // Re-check we're still on the same chat after waiting
      if (activeChatIdRef.current !== chatId) {
        scrollDebug(
          "[ScrollManager] Restore aborted: chat changed during height wait"
        );
        return { success: false, appliedScrollTop: 0, scrolledToBottom: false };
      }

      // Re-get container (might have unmounted/remounted)
      const currentContainer = containerRef.current;
      if (!currentContainer) {
        scrollDebug("[ScrollManager] Restore failed: container gone");
        stateRef.current = "idle";
        return { success: false, appliedScrollTop: 0, scrolledToBottom: false };
      }

      // Get saved position
      const entry = positionsRef.current.get(chatId);

      // Determine if we should scroll to bottom or restore position
      const shouldScrollToBottom =
        !entry || entry.wasAtBottom || !isPositionValid(entry);
      // CRITICAL: Ensure distanceFromBottom is a number
      const savedDistanceFromBottom = entry
        ? Number(entry.distanceFromBottom)
        : 0;

      // Function to calculate and apply scroll position
      const applyScrollPosition = (): {
        scrollTop: number;
        scrolledToBottom: boolean;
      } => {
        const cont = containerRef.current;
        if (!cont) return { scrollTop: 0, scrolledToBottom: false };

        let targetScrollTop: number;
        let scrolledToBottom = false;

        // CRITICAL: Ensure all values are numbers
        const scrollHeight = Number(cont.scrollHeight);
        const clientHeight = Number(cont.clientHeight);

        if (shouldScrollToBottom) {
          targetScrollTop = scrollHeight - clientHeight;
          scrolledToBottom = true;
        } else {
          // Calculate from distanceFromBottom
          targetScrollTop =
            scrollHeight - clientHeight - savedDistanceFromBottom;
          // Clamp to valid range
          const maxScroll = scrollHeight - clientHeight;
          targetScrollTop = Math.max(0, Math.min(targetScrollTop, maxScroll));
        }

        // Mark as programmatic scroll
        programmaticScrollRef.current = true;
        lastProgrammaticScrollTopRef.current = targetScrollTop;
        cont.scrollTop = targetScrollTop;

        return { scrollTop: targetScrollTop, scrolledToBottom };
      };

      // Apply initial scroll position
      let result = applyScrollPosition();

      scrollDebug("[ScrollManager] Initial scroll applied:", {
        targetScrollTop: result.scrollTop,
        scrolledToBottom: result.scrolledToBottom,
        savedDistanceFromBottom,
      });

      // Set up a ResizeObserver to re-apply scroll position if content changes
      // This handles late-loading media that wasn't detected by waitForMediaLoaded
      return new Promise((resolve) => {
        let stabilityCheckCount = 0;
        const maxStabilityChecks = 20; // Max ~2 seconds of monitoring
        let lastScrollHeight = currentContainer.scrollHeight;
        let stableCount = 0;
        const requiredStableChecks = 3; // Need 3 consecutive stable checks

        const resizeObserver = new ResizeObserver(() => {
          // Only act if still restoring for this chat
          if (
            stateRef.current !== "restoring" ||
            activeChatIdRef.current !== chatId
          ) {
            return;
          }

          const cont = containerRef.current;
          if (!cont) return;

          // Re-apply scroll position when content size changes
          result = applyScrollPosition();
          scrollDebug("[ScrollManager] Re-applied scroll after resize:", {
            newScrollTop: result.scrollTop,
            scrollHeight: cont.scrollHeight,
          });
        });

        resizeObserver.observe(currentContainer);

        // Stability checker - polls for stable content height
        const checkStability = () => {
          stabilityCheckCount++;

          // Safety limit
          if (stabilityCheckCount >= maxStabilityChecks) {
            scrollDebug(
              "[ScrollManager] Max stability checks reached, finalizing"
            );
            finalize();
            return;
          }

          // Check if chat changed
          if (activeChatIdRef.current !== chatId) {
            finalize();
            return;
          }

          const cont = containerRef.current;
          if (!cont) {
            finalize();
            return;
          }

          // Check if height is stable
          if (cont.scrollHeight === lastScrollHeight) {
            stableCount++;
            if (stableCount >= requiredStableChecks) {
              scrollDebug("[ScrollManager] Content stable, finalizing");
              finalize();
              return;
            }
          } else {
            // Height changed, reset stability counter and re-apply scroll
            stableCount = 0;
            lastScrollHeight = cont.scrollHeight;
            result = applyScrollPosition();
          }

          // Check again
          requestAnimationFrame(checkStability);
        };

        const finalize = () => {
          resizeObserver.disconnect();
          programmaticScrollRef.current = false;

          scrollDebug("[ScrollManager] Restore complete:", {
            appliedScrollTop: result.scrollTop,
            scrolledToBottom: result.scrolledToBottom,
            finalScrollHeight: containerRef.current?.scrollHeight,
          });

          resolve({
            success: true,
            appliedScrollTop: result.scrollTop,
            scrolledToBottom: result.scrolledToBottom,
          });
        };

        // Start stability checking after a brief delay to let initial render settle
        requestAnimationFrame(() => {
          requestAnimationFrame(checkStability);
        });
      });
    },
    [containerRef, isPositionValid]
  );

  // ============================================================
  // PUBLIC: Handle chat did change (AFTER switch complete)
  // ============================================================
  const onChatDidChange = useCallback((chatId: string): void => {
    scrollDebug("[ScrollManager] Chat did change:", {
      chatId,
      previousState: stateRef.current,
    });

    // Update active chat
    activeChatIdRef.current = chatId;

    // Transition to IDLE state - now user scrolls will be saved
    stateRef.current = "idle";

    // Clear programmatic scroll tracking
    programmaticScrollRef.current = false;
    lastProgrammaticScrollTopRef.current = null;
  }, []);

  // ============================================================
  // PUBLIC: Get saved position
  // ============================================================
  const getSavedPosition = useCallback(
    (chatId: string): ScrollPositionEntry | null => {
      const entry = positionsRef.current.get(chatId);
      if (!entry) return null;
      if (!isPositionValid(entry)) {
        positionsRef.current.delete(chatId);
        return null;
      }
      return entry;
    },
    [isPositionValid]
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
  // PUBLIC: Handle scroll event
  // ============================================================
  const handleScroll = useCallback(
    (chatId: string): void => {
      // Only save scrolls in IDLE state
      if (stateRef.current !== "idle") {
        return;
      }

      // Only for active chat
      if (activeChatIdRef.current !== chatId) {
        return;
      }

      // Skip programmatic scrolls
      if (programmaticScrollRef.current) {
        return;
      }

      // Skip if this matches our last programmatic scroll (within threshold)
      const container = containerRef.current;
      if (container && lastProgrammaticScrollTopRef.current !== null) {
        const diff = Math.abs(
          container.scrollTop - lastProgrammaticScrollTopRef.current
        );
        if (diff < 5) {
          // This is likely the scroll event from our programmatic scroll
          return;
        }
        // User has scrolled away from programmatic position - clear it
        lastProgrammaticScrollTopRef.current = null;
      }

      // Clear any pending save and schedule a new one (debounced)
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(() => {
        saveScrollPositionImmediate(chatId);
        saveTimerRef.current = null;
      }, opts.saveDebounceMs);
    },
    [containerRef, saveScrollPositionImmediate, opts.saveDebounceMs]
  );

  // ============================================================
  // PUBLIC: Check if transitioning
  // ============================================================
  const isTransitioning = useCallback((): boolean => {
    return stateRef.current !== "idle";
  }, []);

  // ============================================================
  // PUBLIC: Get current state
  // ============================================================
  const getState = useCallback((): ManagerState => {
    return stateRef.current;
  }, []);

  // ============================================================
  // CLEANUP
  // ============================================================
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  return {
    onChatWillChange,
    onChatDidChange,
    restoreScrollPosition,
    getSavedPosition,
    clearSavedPositions,
    handleScroll,
    isTransitioning,
    getState,
  };
}
