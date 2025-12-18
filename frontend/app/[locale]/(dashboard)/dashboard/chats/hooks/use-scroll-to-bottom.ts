"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Message } from "../types";

interface UseScrollToBottomDeps {
  messages: Message[];
  selectedChatId: string | null;
  isInitialLoad: boolean;
  shouldAutoScroll: boolean;
}

/**
 * Simple scroll helper - just scrolls to bottom and watches for content changes
 * Uses multiple strategies to ensure scroll happens reliably
 */
export function useScrollToBottom(
  containerRef: React.RefObject<HTMLDivElement | null>,
  deps: UseScrollToBottomDeps
) {
  const { messages, selectedChatId, isInitialLoad, shouldAutoScroll } = deps;
  const pendingScrollRef = useRef(false);
  const lastChatIdRef = useRef<string | null>(null);
  const lastMessageCountRef = useRef(0);
  const cleanupFnRef = useRef<(() => void) | null>(null);

  // Simple function to scroll to bottom
  const scrollToBottom = useCallback(
    (smooth = false) => {
      const container = containerRef.current;
      if (!container) return false;

      if (smooth) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        });
      } else {
        container.scrollTop = container.scrollHeight;
      }
      return true;
    },
    [containerRef]
  );

  // Check if user is at bottom
  const isAtBottom = useCallback(
    (threshold = 100) => {
      const container = containerRef.current;
      if (!container) return true;
      return (
        container.scrollHeight - container.scrollTop - container.clientHeight <
        threshold
      );
    },
    [containerRef]
  );

  // Request scroll - will keep trying until content is scrolled
  const requestScrollToBottom = useCallback(
    (smooth = false) => {
      // Clean up any previous request
      if (cleanupFnRef.current) {
        cleanupFnRef.current();
        cleanupFnRef.current = null;
      }

      pendingScrollRef.current = true;
      let frameCount = 0;
      const maxFrames = 60; // Try for about 1 second at 60fps
      let rafId: number;
      let resizeObserver: ResizeObserver | null = null;
      let mutationObserver: MutationObserver | null = null;

      const doScroll = () => {
        if (!pendingScrollRef.current) return;

        const container = containerRef.current;
        if (!container) return;

        // Scroll to bottom
        if (smooth && frameCount === 0) {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: "smooth",
          });
        } else {
          container.scrollTop = container.scrollHeight;
        }
      };

      // Immediate scroll attempt
      doScroll();

      // RAF polling - most reliable for catching React renders
      const poll = () => {
        if (!pendingScrollRef.current || frameCount >= maxFrames) {
          return;
        }
        frameCount++;
        doScroll();
        rafId = requestAnimationFrame(poll);
      };
      rafId = requestAnimationFrame(poll);

      // Also use observers as backup
      const container = containerRef.current;
      if (container) {
        resizeObserver = new ResizeObserver(doScroll);
        resizeObserver.observe(container);

        mutationObserver = new MutationObserver(doScroll);
        mutationObserver.observe(container, { childList: true, subtree: true });
      }

      // Cleanup function
      const cleanup = () => {
        pendingScrollRef.current = false;
        cancelAnimationFrame(rafId);
        resizeObserver?.disconnect();
        mutationObserver?.disconnect();
      };

      // Auto-cleanup after 2 seconds
      const timeoutId = window.setTimeout(cleanup, 2000);

      // Store cleanup that also clears timeout
      cleanupFnRef.current = () => {
        clearTimeout(timeoutId);
        cleanup();
      };

      return cleanupFnRef.current;
    },
    [containerRef]
  );

  // Main effect: scroll to bottom when messages change for a new chat or during initial load
  useEffect(() => {
    // Skip if no chat selected
    if (!selectedChatId) {
      lastChatIdRef.current = null;
      return;
    }

    // Skip if no messages - but update refs
    if (messages.length === 0) {
      lastMessageCountRef.current = 0;
      return;
    }

    // Detect if this is a new chat or new messages
    const isNewChat = lastChatIdRef.current !== selectedChatId;
    const isNewMessages = messages.length !== lastMessageCountRef.current;

    // Update tracking refs BEFORE triggering scroll
    lastChatIdRef.current = selectedChatId;
    lastMessageCountRef.current = messages.length;

    // Scroll on:
    // 1. New chat selected (with messages)
    // 2. Messages loaded during initial load
    if (isNewChat || (isInitialLoad && isNewMessages)) {
      const cleanup = requestScrollToBottom(false);
      return cleanup;
    }

    // After initial load, only scroll if shouldAutoScroll and user is at bottom
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
    requestScrollToBottom,
    scrollToBottom,
    isAtBottom,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupFnRef.current) {
        cleanupFnRef.current();
      }
    };
  }, []);

  return {
    scrollToBottom,
    requestScrollToBottom,
    isAtBottom,
    cancelPendingScroll: () => {
      pendingScrollRef.current = false;
    },
  };
}
