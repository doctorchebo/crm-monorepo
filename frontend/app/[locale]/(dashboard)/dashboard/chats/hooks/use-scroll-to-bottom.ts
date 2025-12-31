"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Message } from "../types";
import {
  scrollContainerToBottom,
  isNearBottom as sharedIsNearBottom,
} from "./scroll-utils";

// ============================================================
// TYPES
// ============================================================

interface UseScrollToBottomDeps {
  messages: Message[];
  selectedChatId: string | null;
  shouldAutoScroll: boolean;
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
  const { messages, selectedChatId, shouldAutoScroll } = deps;

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
      console.log("[requestScrollToBottom] CALLED - creating scroll session");

      // Cancel any existing session
      cancelPendingScroll();

      // CRITICAL: Reset user scroll intent since this is an explicit scroll request
      userScrolledAwayRef.current = false;
      // Also reset lastScrollTop to prevent false "scrolled up" detection
      lastScrollTopRef.current = 0;

      const container = containerRef.current;
      if (!container) {
        console.log("[requestScrollToBottom] ABORT: no container");
        return undefined;
      }

      console.log("[requestScrollToBottom] Container found, starting session");

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
        if (!isActive) {
          console.log("[doScroll] SKIP: session not active");
          return;
        }
        // CRITICAL: Don't scroll if user has intentionally scrolled away
        if (userScrolledAwayRef.current) {
          console.log("[doScroll] SKIP: user scrolled away");
          return;
        }
        const beforeScrollTop = containerRef.current?.scrollTop;
        const scrollHeight = containerRef.current?.scrollHeight;
        const clientHeight = containerRef.current?.clientHeight;
        console.log("[doScroll] SCROLLING TO BOTTOM. Before:", {
          scrollTop: beforeScrollTop,
          scrollHeight,
          clientHeight,
          targetScrollTop:
            scrollHeight && clientHeight ? scrollHeight - clientHeight : "N/A",
        });
        scrollContainerToBottom(containerRef.current, smooth);
        console.log(
          "[doScroll] After scrollTop:",
          containerRef.current?.scrollTop
        );
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

          // CRITICAL: Scroll to bottom if user hasn't intentionally scrolled away
          // We do NOT check isNearBottom here - during initial load, content might
          // push us far from bottom, but we still want to follow the content
          if (!userScrolledAwayRef.current) {
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
      // We scroll on ANY resize if user hasn't scrolled away - this ensures
      // we follow content during initial load even if pushed far from bottom
      resizeObserver = new ResizeObserver(() => {
        if (!isActive) return;
        if (userScrolledAwayRef.current) return;
        doScroll();
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
   * Effect to handle auto-scrolling for NEW messages arriving while viewing a chat.
   *
   * IMPORTANT: This effect does NOT handle initial scroll-to-bottom on first load.
   * First load scroll is handled DIRECTLY by use-chat-state.ts when messages are fetched.
   * This eliminates race conditions between effects.
   *
   * This effect ONLY handles:
   * - New messages arriving while user is at bottom → auto-scroll to show new message
   * - Reset tracking when chat changes
   */
  useEffect(() => {
    // Skip if no chat selected
    if (!selectedChatId) {
      lastChatIdRef.current = null;
      lastMessageCountRef.current = 0;
      hasScrolledForChatRef.current = null;
      return;
    }

    // Detect chat change and reset tracking
    const isNewChat = lastChatIdRef.current !== selectedChatId;
    if (isNewChat) {
      console.log(
        "[ScrollToBottom Effect] Chat changed, resetting tracking refs"
      );
      lastMessageCountRef.current = 0;
      hasScrolledForChatRef.current = null;
      userScrolledAwayRef.current = false;
      lastScrollTopRef.current = 0;
      lastChatIdRef.current = selectedChatId;
    }

    // Skip if no messages yet
    if (messages.length === 0) {
      return;
    }

    // Check if this is new messages arriving (not first load)
    const previousMessageCount = lastMessageCountRef.current;
    const isNewMessages =
      previousMessageCount > 0 && messages.length > previousMessageCount;

    // Update message count tracking
    lastMessageCountRef.current = messages.length;

    // Auto-scroll for new messages only if user was at bottom
    if (isNewMessages && shouldAutoScroll && isAtBottom(100)) {
      console.log(
        "[ScrollToBottom Effect] New message arrived, user at bottom, scrolling"
      );
      scrollToBottom(false);
    }
  }, [
    messages.length,
    selectedChatId,
    shouldAutoScroll,
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

  // NOTE: User scroll intent and message count reset is now handled INSIDE the main
  // scroll effect when it detects a new chat. This ensures proper ordering:
  // 1. Main effect runs, detects isNewChat
  // 2. Resets refs immediately
  // 3. Continues with scroll logic using fresh state

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
