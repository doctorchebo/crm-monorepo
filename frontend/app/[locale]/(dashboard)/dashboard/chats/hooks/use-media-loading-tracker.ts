"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook to track media loading state for scroll positioning
 *
 * Problem: When opening a chat, we want to scroll to the bottom, but media
 * (images, GIFs, videos) might still be loading. If we scroll before they load,
 * the scroll position will be wrong once they render and change the container height.
 *
 * Solution: Track which media items are loading and provide a way to know when
 * all media has finished loading (or a reasonable timeout has passed).
 *
 * Usage:
 * 1. Call registerMedia(id) when a media element starts loading
 * 2. Call markMediaLoaded(id) when it finishes loading (or errors)
 * 3. Use isAllMediaLoaded or onAllMediaLoaded to trigger scroll
 */
export function useMediaLoadingTracker(chatId: string | null) {
  // Set of media IDs currently loading
  const loadingMediaRef = useRef<Set<string>>(new Set());

  // Counter to force re-renders when loading state changes
  const [loadingCount, setLoadingCount] = useState(0);

  // Callbacks waiting for all media to load
  const pendingCallbacksRef = useRef<Array<() => void>>([]);

  // Track the current chat to reset on chat change
  const currentChatIdRef = useRef<string | null>(null);

  // Timeout for safety - don't wait forever
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Reset tracking when chat changes
  useEffect(() => {
    if (chatId !== currentChatIdRef.current) {
      loadingMediaRef.current.clear();
      currentChatIdRef.current = chatId;
      setLoadingCount(0);

      // Clear any pending timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Clear pending callbacks
      pendingCallbacksRef.current = [];
    }
  }, [chatId]);

  // Register a media item as loading
  const registerMedia = useCallback((mediaId: string) => {
    if (!loadingMediaRef.current.has(mediaId)) {
      loadingMediaRef.current.add(mediaId);
      setLoadingCount((c) => c + 1);
    }
  }, []);

  // Mark a media item as loaded
  const markMediaLoaded = useCallback((mediaId: string) => {
    if (loadingMediaRef.current.has(mediaId)) {
      loadingMediaRef.current.delete(mediaId);
      setLoadingCount((c) => c - 1);

      // Check if all media is now loaded
      if (loadingMediaRef.current.size === 0) {
        // Fire all pending callbacks
        const callbacks = pendingCallbacksRef.current;
        pendingCallbacksRef.current = [];
        callbacks.forEach((cb) => cb());

        // Clear timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }
    }
  }, []);

  // Check if all registered media has loaded
  const isAllMediaLoaded = loadingMediaRef.current.size === 0;

  // Wait for all media to load (with timeout)
  const waitForAllMediaLoaded = useCallback(
    (callback: () => void, timeoutMs = 3000) => {
      // If already all loaded or nothing registered, call immediately
      if (loadingMediaRef.current.size === 0) {
        callback();
        return;
      }

      // Add to pending callbacks
      pendingCallbacksRef.current.push(callback);

      // Set up timeout as safety net
      if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => {
          // Timeout reached - fire callbacks anyway
          const callbacks = pendingCallbacksRef.current;
          pendingCallbacksRef.current = [];
          callbacks.forEach((cb) => cb());

          // Clear remaining loading items
          loadingMediaRef.current.clear();
          setLoadingCount(0);
        }, timeoutMs);
      }
    },
    []
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    registerMedia,
    markMediaLoaded,
    isAllMediaLoaded,
    waitForAllMediaLoaded,
    loadingCount: loadingMediaRef.current.size,
  };
}
