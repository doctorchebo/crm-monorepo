"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Message } from "../types";
import {
  scrollContainerToBottom,
  scrollDebug,
  isNearBottom as sharedIsNearBottom,
} from "./scroll-utils";

// ============================================================
// TYPES
// ============================================================

interface UseScrollToBottomDeps {
  messages: Message[];
  selectedChatId: string | null;
  isInitialLoad: boolean;
  shouldAutoScroll: boolean;
  /** Optional: Check if scroll position restoration should be skipped */
  skipScrollToBottom?: (chatId: string) => boolean;
}

interface ScrollSession {
  /** Unique identifier for this scroll session */
  id: string;
  /** Whether the session is still active */
  active: boolean;
  /** Cleanup function to tear down all listeners */
  cleanup: () => void;
}

// ============================================================
// CONSTANTS
// ============================================================

/**
 * Maximum time to wait for all media to load before giving up.
 * This is a safety net for extremely slow connections or broken media.
 */
const MAX_WAIT_TIME_MS = 8000;

/**
 * How long to wait after all pending media has loaded before considering scroll complete.
 * This handles cases where new media might be discovered after initial scan.
 */
const SETTLE_DELAY_MS = 100;

// ============================================================
// MAIN HOOK
// ============================================================

/**
 * useScrollToBottom - A robust, event-driven scroll-to-bottom solution
 *
 * ARCHITECTURE:
 * Instead of relying on timeouts or polling intervals, this implementation uses
 * an event-driven approach that directly listens to media load events.
 *
 * KEY PRINCIPLES:
 * 1. NO POLLING/INTERVALS - All scroll decisions are event-driven
 * 2. DIRECT MEDIA LISTENING - Listen to load/loadeddata/error events on actual media
 * 3. MUTATION AWARENESS - Track DOM changes to discover newly added media
 * 4. SESSION-BASED - Each scroll request creates a "session" that manages its lifecycle
 * 5. GRACEFUL DEGRADATION - Safety timeout only as last resort
 *
 * HOW IT WORKS:
 * When requestScrollToBottom is called:
 * 1. Create a new scroll session with a unique ID
 * 2. Immediately scroll to bottom (handles cases with no/cached media)
 * 3. Scan container for all media elements (img, video)
 * 4. Track which media is still loading (not complete)
 * 5. Attach load/error listeners to pending media
 * 6. Set up MutationObserver to catch dynamically added media
 * 7. On each media load: scroll to bottom, check if all media loaded
 * 8. When all media loaded + settle delay: complete the session
 * 9. Safety timeout ensures we don't wait forever
 *
 * This approach is robust because:
 * - Works regardless of how fast/slow media loads
 * - Handles lazy-loaded images and dynamically added content
 * - Properly handles GIFs (which are video elements in WhatsApp)
 * - No race conditions between different scroll calls
 * - Clean teardown prevents memory leaks
 */
export function useScrollToBottom(
  containerRef: React.RefObject<HTMLDivElement | null>,
  deps: UseScrollToBottomDeps
) {
  const {
    messages,
    selectedChatId,
    isInitialLoad,
    shouldAutoScroll,
    skipScrollToBottom,
  } = deps;

  // Tracking refs for the automatic scroll effect
  const lastChatIdRef = useRef<string | null>(null);
  const lastMessageCountRef = useRef(0);
  const hasScrolledForChatRef = useRef<string | null>(null);

  // Active scroll session reference
  const activeSessionRef = useRef<ScrollSession | null>(null);

  // Track if user has intentionally scrolled away from bottom
  // This prevents observers from snapping back to bottom
  const userScrolledAwayRef = useRef(false);
  const lastScrollTopRef = useRef(0);

  // ============================================================
  // CORE SCROLL FUNCTIONS
  // ============================================================

  /**
   * Perform an immediate scroll to bottom.
   * This is a synchronous operation - no waiting for media.
   */
  const scrollToBottom = useCallback(
    (smooth = false): boolean => {
      // CRITICAL: Reset user scroll intent since this is an explicit scroll request
      userScrolledAwayRef.current = false;
      return scrollContainerToBottom(containerRef.current, smooth);
    },
    [containerRef]
  );

  /**
   * Check if the container is scrolled near the bottom.
   * Uses shared utility for consistency.
   */
  const isAtBottom = useCallback(
    (threshold = 100): boolean => {
      return sharedIsNearBottom(containerRef.current, threshold);
    },
    [containerRef]
  );

  /**
   * Cancel any active scroll session.
   * Called when switching chats or unmounting.
   */
  const cancelPendingScroll = useCallback(() => {
    if (activeSessionRef.current) {
      activeSessionRef.current.active = false;
      activeSessionRef.current.cleanup();
      activeSessionRef.current = null;
    }
  }, []);

  // ============================================================
  // MEDIA-AWARE SCROLL REQUEST
  // ============================================================

  /**
   * Request a scroll to bottom that waits for all media to load.
   *
   * This is the heart of the solution - it creates a "scroll session"
   * that monitors media loading and scrolls as content loads.
   */
  const requestScrollToBottom = useCallback(
    (smooth = false): (() => void) | undefined => {
      // Cancel any existing session
      cancelPendingScroll();

      // CRITICAL: Reset user scroll intent since this is an explicit scroll request
      userScrolledAwayRef.current = false;

      const container = containerRef.current;
      if (!container) return undefined;

      // Generate unique session ID for debugging
      const sessionId = `scroll-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;

      // Track pending media elements
      const pendingMedia = new Set<HTMLElement>();
      const attachedListeners = new Map<
        HTMLElement,
        { load: () => void; error: () => void; loadeddata?: () => void }
      >();

      let isActive = true;
      let settleTimeoutId: ReturnType<typeof setTimeout> | null = null;
      let safetyTimeoutId: ReturnType<typeof setTimeout> | null = null;
      let mutationObserver: MutationObserver | null = null;
      let resizeObserver: ResizeObserver | null = null;

      // ============================================================
      // HELPER: Check if user is near bottom (uses shared utility)
      // ============================================================
      const isNearBottom = (threshold = 150): boolean => {
        return sharedIsNearBottom(containerRef.current, threshold);
      };

      // ============================================================
      // HELPER: Perform scroll (only if user hasn't scrolled away)
      // ============================================================
      const doScroll = () => {
        if (!isActive) return;
        // CRITICAL: Don't scroll if user has intentionally scrolled away
        if (userScrolledAwayRef.current) return;
        scrollContainerToBottom(containerRef.current, smooth);
      };

      // ============================================================
      // HELPER: Cleanup everything
      // ============================================================
      const cleanup = () => {
        isActive = false;

        // Clear timeouts
        if (settleTimeoutId) clearTimeout(settleTimeoutId);
        if (safetyTimeoutId) clearTimeout(safetyTimeoutId);

        // Remove all media listeners
        attachedListeners.forEach((listeners, element) => {
          element.removeEventListener("load", listeners.load);
          element.removeEventListener("error", listeners.error);
          if (listeners.loadeddata) {
            element.removeEventListener("loadeddata", listeners.loadeddata);
            // Also remove the video-specific events we added
            element.removeEventListener("loadedmetadata", listeners.loadeddata);
            element.removeEventListener("canplay", listeners.loadeddata);
          }
        });
        attachedListeners.clear();

        // Disconnect observers
        mutationObserver?.disconnect();
        resizeObserver?.disconnect();

        pendingMedia.clear();
      };

      // ============================================================
      // HELPER: Check if scroll session is complete
      // ============================================================
      const checkComplete = () => {
        if (!isActive) return;

        if (pendingMedia.size === 0) {
          // All media loaded - scroll one more time and wait for settle
          doScroll();

          // Clear any existing settle timeout
          if (settleTimeoutId) clearTimeout(settleTimeoutId);

          // Wait a brief moment to catch any late additions, then complete
          settleTimeoutId = setTimeout(() => {
            if (!isActive) return;

            // Final scroll and cleanup
            doScroll();
            cleanup();
            if (activeSessionRef.current?.id === sessionId) {
              activeSessionRef.current = null;
            }
          }, SETTLE_DELAY_MS);
        }
      };

      // ============================================================
      // HELPER: Handle media element load
      // ============================================================
      const handleMediaLoad = (element: HTMLElement) => {
        if (!isActive) return;

        pendingMedia.delete(element);
        doScroll();
        checkComplete();
      };

      // ============================================================
      // HELPER: Check if media element is still loading
      // ============================================================
      const isMediaLoading = (element: HTMLElement): boolean => {
        if (element instanceof HTMLImageElement) {
          // For images: check if complete AND has dimensions
          // naturalWidth/Height are 0 until the image is decoded
          if (!element.complete) return true;
          if (element.naturalWidth === 0 || element.naturalHeight === 0)
            return true;
          return false;
        }

        if (element instanceof HTMLVideoElement) {
          // For videos (including GIFs): check multiple conditions
          // readyState < 2 means not enough data loaded
          if (element.readyState < 2) return true;

          // Also check if video has intrinsic dimensions
          // videoWidth/videoHeight are 0 until metadata is loaded
          if (element.videoWidth === 0 || element.videoHeight === 0)
            return true;

          return false;
        }

        return false;
      };

      // ============================================================
      // HELPER: Attach listeners to a media element
      // ============================================================
      const attachMediaListeners = (element: HTMLElement) => {
        if (!isActive || attachedListeners.has(element)) return;

        const onLoad = () => handleMediaLoad(element);
        const onError = () => handleMediaLoad(element); // Treat error as "done"

        if (element instanceof HTMLImageElement) {
          element.addEventListener("load", onLoad);
          element.addEventListener("error", onError);
          attachedListeners.set(element, { load: onLoad, error: onError });
        } else if (element instanceof HTMLVideoElement) {
          // For videos, we need to listen to multiple events:
          // - loadedmetadata: fires when dimensions become available
          // - loadeddata: fires when first frame is ready
          // - canplay: fires when enough data is loaded to start playing
          // We use all of them to ensure we catch the moment when video is ready
          element.addEventListener("loadedmetadata", onLoad);
          element.addEventListener("loadeddata", onLoad);
          element.addEventListener("canplay", onLoad);
          element.addEventListener("error", onError);
          attachedListeners.set(element, {
            load: onLoad, // We'll use 'load' key for removal, stored callback handles all
            error: onError,
            loadeddata: onLoad,
          });
        }
      };

      // ============================================================
      // HELPER: Scan container for media and track loading state
      // ============================================================
      const scanForMedia = () => {
        if (!isActive || !container) return;

        // Find all images and videos
        const images = container.querySelectorAll("img");
        const videos = container.querySelectorAll("video");

        // Process images
        images.forEach((img) => {
          if (isMediaLoading(img)) {
            if (!pendingMedia.has(img)) {
              pendingMedia.add(img);
              attachMediaListeners(img);
            }
          }
        });

        // Process videos (including GIFs which are MP4 in WhatsApp)
        videos.forEach((video) => {
          if (isMediaLoading(video)) {
            if (!pendingMedia.has(video)) {
              pendingMedia.add(video);
              attachMediaListeners(video);
            }
          }
        });

        // Also check for GIF containers that don't have a video element yet
        // The video element is conditionally rendered after mediaUrl is available
        const gifContainers = container.querySelectorAll(
          '[data-media-container="gif"]'
        );
        gifContainers.forEach((gifContainer) => {
          const video = gifContainer.querySelector("video");
          // If no video element yet, the GIF is still loading
          if (!video && !pendingMedia.has(gifContainer as HTMLElement)) {
            // Track the container as pending - we'll scroll when video appears
            pendingMedia.add(gifContainer as HTMLElement);
            // Use MutationObserver to detect when video is added to this container
            const gifObserver = new MutationObserver((mutations) => {
              for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                  if (node instanceof HTMLVideoElement) {
                    // Video added - stop observing container, start tracking video
                    gifObserver.disconnect();
                    pendingMedia.delete(gifContainer as HTMLElement);
                    if (isMediaLoading(node)) {
                      pendingMedia.add(node);
                      attachMediaListeners(node);
                    }
                    doScroll();
                    checkComplete();
                    return;
                  }
                }
              }
            });
            gifObserver.observe(gifContainer, {
              childList: true,
              subtree: true,
            });
          }
        });
      };

      // ============================================================
      // INITIALIZE SESSION
      // ============================================================

      // Immediate scroll first
      doScroll();

      // Use requestAnimationFrame to ensure React has finished rendering
      // This catches the case where the DOM is updated but React effects haven't run yet
      requestAnimationFrame(() => {
        if (!isActive) return;

        // Initial media scan after React has rendered
        scanForMedia();

        // Scroll again after scan in case content was already there
        doScroll();

        // Do another scan on the next frame to catch any async rendering
        requestAnimationFrame(() => {
          if (!isActive) return;
          scanForMedia();
          doScroll();
          checkComplete();
        });
      });

      // Set up MutationObserver to catch dynamically added media
      mutationObserver = new MutationObserver((mutations) => {
        if (!isActive) return;

        let hasNewMedia = false;

        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLElement) {
              // Check if the node itself is media
              if (
                node instanceof HTMLImageElement ||
                node instanceof HTMLVideoElement
              ) {
                hasNewMedia = true;
              }
              // Check for media within the node
              if (node.querySelector("img") || node.querySelector("video")) {
                hasNewMedia = true;
              }
              // Check for GIF containers
              if (
                node.matches('[data-media-container="gif"]') ||
                node.querySelector('[data-media-container="gif"]')
              ) {
                hasNewMedia = true;
              }
            }
          }
        }

        if (hasNewMedia) {
          // Clear settle timeout since we have new content
          if (settleTimeoutId) {
            clearTimeout(settleTimeoutId);
            settleTimeoutId = null;
          }

          // CRITICAL: Only scroll for new content if user hasn't scrolled away
          if (!userScrolledAwayRef.current && isNearBottom(200)) {
            doScroll();
          }

          // Scan for new media
          scanForMedia();

          // Re-check completion
          checkComplete();
        }
      });

      mutationObserver.observe(container, {
        childList: true,
        subtree: true,
      });

      // Set up ResizeObserver as backup for content size changes
      // This catches cases where media dimensions change after load
      // CRITICAL: Only scroll if user is still near bottom
      resizeObserver = new ResizeObserver(() => {
        if (!isActive) return;
        if (userScrolledAwayRef.current) return;
        // Only scroll if we're already near the bottom
        if (isNearBottom(200)) {
          doScroll();
        }
      });
      resizeObserver.observe(container);

      // Safety timeout - don't wait forever
      safetyTimeoutId = setTimeout(() => {
        if (!isActive) return;

        // Final scroll attempt and cleanup
        doScroll();
        cleanup();
        if (activeSessionRef.current?.id === sessionId) {
          activeSessionRef.current = null;
        }
      }, MAX_WAIT_TIME_MS);

      // Check completion (handles case where all media is already loaded)
      checkComplete();

      // Create session object
      const session: ScrollSession = {
        id: sessionId,
        active: true,
        cleanup,
      };

      activeSessionRef.current = session;

      // Return cleanup function
      return () => {
        cleanup();
        if (activeSessionRef.current?.id === sessionId) {
          activeSessionRef.current = null;
        }
      };
    },
    [containerRef, cancelPendingScroll]
  );

  // ============================================================
  // AUTOMATIC SCROLL EFFECT
  // ============================================================

  /**
   * Main effect that triggers scroll-to-bottom based on state changes.
   *
   * This handles:
   * - Opening a new chat (always scroll to bottom, UNLESS skipScrollToBottom returns true)
   * - Initial message load for a chat (always scroll to bottom, UNLESS skipScrollToBottom returns true)
   * - New messages arriving (only if user was at bottom)
   */
  useEffect(() => {
    // Skip if no chat selected
    if (!selectedChatId) {
      lastChatIdRef.current = null;
      hasScrolledForChatRef.current = null;
      return;
    }

    // Skip if no messages
    if (messages.length === 0) {
      lastMessageCountRef.current = 0;
      return;
    }

    // Detect state changes
    const isNewChat = lastChatIdRef.current !== selectedChatId;
    const isFirstMessagesForChat =
      hasScrolledForChatRef.current !== selectedChatId;
    const isNewMessages = messages.length !== lastMessageCountRef.current;

    // Update tracking refs
    lastChatIdRef.current = selectedChatId;
    lastMessageCountRef.current = messages.length;

    // Determine if we should scroll
    const shouldScrollToBottomForNewChat =
      isNewChat || isFirstMessagesForChat || (isInitialLoad && isNewMessages);

    if (shouldScrollToBottomForNewChat) {
      hasScrolledForChatRef.current = selectedChatId;

      // CRITICAL: Check if we should skip scrolling to bottom
      // This allows scroll position restoration to work
      if (skipScrollToBottom && skipScrollToBottom(selectedChatId)) {
        scrollDebug(
          "[ScrollToBottom] Skipping scroll - position will be restored by manager"
        );
        return;
      }

      return requestScrollToBottom(false);
    }

    // After initial load, only scroll if user was at bottom
    if (
      !isInitialLoad &&
      shouldAutoScroll &&
      isNewMessages &&
      isAtBottom(100)
    ) {
      scrollToBottom(false);
    }
  }, [
    messages.length,
    selectedChatId,
    isInitialLoad,
    shouldAutoScroll,
    skipScrollToBottom,
    requestScrollToBottom,
    scrollToBottom,
    isAtBottom,
  ]);

  // ============================================================
  // CLEANUP ON UNMOUNT
  // ============================================================

  useEffect(() => {
    return () => {
      cancelPendingScroll();
    };
  }, [cancelPendingScroll]);

  // ============================================================
  // USER SCROLL INTENT DETECTION
  // ============================================================

  /**
   * Detect when user intentionally scrolls away from bottom.
   * This prevents the observers from snapping back to bottom.
   *
   * The key insight is: if user scrolls UP while we have an active scroll session,
   * they're intentionally trying to read older content. We should respect that.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const currentScrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const distanceFromBottom = scrollHeight - currentScrollTop - clientHeight;

      // Detect if user scrolled UP (away from bottom)
      const scrolledUp = currentScrollTop < lastScrollTopRef.current;

      // If user scrolled up and is no longer near bottom, mark as scrolled away
      if (scrolledUp && distanceFromBottom > 200) {
        userScrolledAwayRef.current = true;
        // Cancel any active scroll session since user wants to stay where they are
        if (activeSessionRef.current) {
          cancelPendingScroll();
        }
      }

      // If user is back at bottom, clear the flag
      if (distanceFromBottom < 50) {
        userScrolledAwayRef.current = false;
      }

      lastScrollTopRef.current = currentScrollTop;
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [containerRef, cancelPendingScroll]);

  // Reset user scroll intent when chat changes
  useEffect(() => {
    userScrolledAwayRef.current = false;
    lastScrollTopRef.current = 0;
  }, [selectedChatId]);

  // ============================================================
  // PUBLIC API
  // ============================================================

  return {
    /** Immediately scroll to bottom (no media waiting) */
    scrollToBottom,
    /** Request scroll to bottom with media loading awareness */
    requestScrollToBottom,
    /** Check if container is scrolled near bottom */
    isAtBottom,
    /** Cancel any pending scroll session */
    cancelPendingScroll,
  };
}
