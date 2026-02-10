"use client";

/**
 * Hook for listening to template media thumbnail WebSocket events
 *
 * When a video or PDF is uploaded for a template header, a thumbnail is
 * generated asynchronously by a Lambda function. This hook listens for
 * the `template-media:thumbnail-ready` WebSocket event and provides callbacks
 * to update the UI with the thumbnail URL.
 *
 * NOTE: Handles race condition where WebSocket event may arrive BEFORE
 * the upload response returns and the callback is registered. Events
 * are cached and replayed when callbacks are registered.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtimeChat } from "./use-message-status-socket";

/**
 * Event payload for template media thumbnail ready
 */
export interface TemplateMediaThumbnailReadyEvent {
  /** The temporary ID that was returned from the upload endpoint */
  tempId: string;
  /** The S3 key of the original file (for reference) */
  originalS3Key: string;
  /** The S3 key of the generated thumbnail */
  thumbnailS3Key: string;
  /** Pre-signed URL for the thumbnail (ready to display) */
  thumbnailUrl: string;
  /** Thumbnail width in pixels */
  width?: number;
  /** Thumbnail height in pixels */
  height?: number;
}

/**
 * Map of pending uploads awaiting thumbnails
 * Key: tempId, Value: callback to update the URL
 */
type PendingUploadCallback = (thumbnailUrl: string) => void;

interface UseTemplateMediaThumbnailOptions {
  /** Whether to enable debug logging */
  debug?: boolean;
  /** How long to cache early events (ms) - default 60 seconds */
  earlyEventTtl?: number;
}

/**
 * Hook for receiving template media thumbnail updates via WebSocket
 *
 * @example
 * ```tsx
 * const { registerPendingThumbnail, unregisterPendingThumbnail } = useTemplateMediaThumbnail();
 *
 * // After upload returns tempId:
 * const result = await upload(file, "header", "VIDEO");
 * if (result.tempId) {
 *   registerPendingThumbnail(result.tempId, (thumbnailUrl) => {
 *     // Update header URL with thumbnail
 *     setHeaderUrl(thumbnailUrl);
 *   });
 * }
 *
 * // Cleanup on unmount or when component changes
 * useEffect(() => {
 *   return () => {
 *     if (tempId) unregisterPendingThumbnail(tempId);
 *   };
 * }, [tempId]);
 * ```
 */
export function useTemplateMediaThumbnail(
  options: UseTemplateMediaThumbnailOptions = {},
) {
  const { debug = false, earlyEventTtl = 60000 } = options;
  const { socket, isConnected } = useRealtimeChat();

  // Map of pending uploads: tempId -> callback
  const pendingUploadsRef = useRef<Map<string, PendingUploadCallback>>(
    new Map(),
  );

  // Cache for early-arriving events (before callback is registered)
  // Key: tempId, Value: { event, timestamp }
  const earlyEventsRef = useRef<
    Map<string, { event: TemplateMediaThumbnailReadyEvent; timestamp: number }>
  >(new Map());

  // Track the number of pending uploads for reactivity
  const [pendingCount, setPendingCount] = useState(0);

  /**
   * Register a pending upload to receive thumbnail callback
   * If the event already arrived (cached), defer the callback to avoid React render issues
   */
  const registerPendingThumbnail = useCallback(
    (tempId: string, onThumbnailReady: PendingUploadCallback) => {
      if (debug) {
        console.log(
          `📷 [useTemplateMediaThumbnail] Registering pending thumbnail for tempId: ${tempId}`,
        );
      }

      // Check if event already arrived (race condition: WebSocket faster than HTTP response)
      const cachedEvent = earlyEventsRef.current.get(tempId);
      if (cachedEvent) {
        const age = Date.now() - cachedEvent.timestamp;
        if (age < earlyEventTtl) {
          // Event arrived before callback was registered
          // Use setTimeout to defer callback and avoid "Cannot update component while rendering" error
          console.log(
            `📷 [useTemplateMediaThumbnail] Found cached early event for tempId: ${tempId} (age: ${age}ms), deferring callback`,
          );
          earlyEventsRef.current.delete(tempId);
          setTimeout(() => {
            onThumbnailReady(cachedEvent.event.thumbnailUrl);
          }, 0);
          return;
        } else {
          // Event is too old, discard it
          console.log(
            `📷 [useTemplateMediaThumbnail] Discarding stale cached event for tempId: ${tempId} (age: ${age}ms)`,
          );
          earlyEventsRef.current.delete(tempId);
        }
      }

      // No cached event, register for future
      pendingUploadsRef.current.set(tempId, onThumbnailReady);
      setPendingCount((c) => c + 1);
    },
    [debug, earlyEventTtl],
  );

  /**
   * Unregister a pending upload (cleanup)
   */
  const unregisterPendingThumbnail = useCallback(
    (tempId: string) => {
      if (pendingUploadsRef.current.has(tempId)) {
        if (debug) {
          console.log(
            `📷 [useTemplateMediaThumbnail] Unregistering pending thumbnail for tempId: ${tempId}`,
          );
        }
        pendingUploadsRef.current.delete(tempId);
        setPendingCount((c) => Math.max(0, c - 1));
      }
      // Also clean up any cached early events
      earlyEventsRef.current.delete(tempId);
    },
    [debug],
  );

  /**
   * Check if a tempId is pending
   */
  const isPending = useCallback((tempId: string): boolean => {
    return pendingUploadsRef.current.has(tempId);
  }, []);

  // Listen for WebSocket events
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleThumbnailReady = (event: TemplateMediaThumbnailReadyEvent) => {
      console.log(
        `📷 [useTemplateMediaThumbnail] Received template-media:thumbnail-ready event:`,
        event,
      );

      const callback = pendingUploadsRef.current.get(event.tempId);
      if (callback) {
        // Call the registered callback with the thumbnail URL
        callback(event.thumbnailUrl);

        // Remove from pending
        pendingUploadsRef.current.delete(event.tempId);
        setPendingCount((c) => Math.max(0, c - 1));

        if (debug) {
          console.log(
            `📷 [useTemplateMediaThumbnail] Thumbnail ready for tempId: ${event.tempId}, URL: ${event.thumbnailUrl}`,
          );
        }
      } else {
        // No callback registered yet - cache the event for when callback is registered
        // This handles the race condition where WebSocket is faster than HTTP response
        console.log(
          `📷 [useTemplateMediaThumbnail] No pending callback for tempId: ${event.tempId}, caching event for later`,
        );
        earlyEventsRef.current.set(event.tempId, {
          event,
          timestamp: Date.now(),
        });
      }
    };

    socket.on("template-media:thumbnail-ready", handleThumbnailReady);

    return () => {
      socket.off("template-media:thumbnail-ready", handleThumbnailReady);
    };
  }, [socket, isConnected, debug]);

  // Cleanup stale cached events periodically
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now();
      for (const [tempId, cached] of earlyEventsRef.current.entries()) {
        if (now - cached.timestamp > earlyEventTtl) {
          if (debug) {
            console.log(
              `📷 [useTemplateMediaThumbnail] Cleaning up stale cached event for tempId: ${tempId}`,
            );
          }
          earlyEventsRef.current.delete(tempId);
        }
      }
    }, 30000); // Run every 30 seconds

    return () => clearInterval(cleanup);
  }, [debug, earlyEventTtl]);

  return {
    /** Register a callback for when a thumbnail is ready */
    registerPendingThumbnail,
    /** Unregister a pending thumbnail callback */
    unregisterPendingThumbnail,
    /** Check if a tempId is pending */
    isPending,
    /** Number of pending thumbnails */
    pendingCount,
    /** Whether WebSocket is connected */
    isConnected,
  };
}
