"use client";

/**
 * Hook for listening to video compression WebSocket events
 * Updates media items in real-time when compression status changes
 */

import type { CompressionStatus } from "@/lib/api/kb-media";
import { useCallback, useEffect, useState } from "react";
import { mutate } from "swr";
import { useRealtimeChat } from "./use-message-status-socket";

/**
 * Compression status update event from WebSocket
 */
export interface CompressionStatusEvent {
  mediaId: string;
  status: CompressionStatus;
  progress?: number;
  compressedS3Key?: string;
  compressedFileSize?: number;
  originalFileSize?: number;
  error?: string;
}

interface UseCompressionUpdatesOptions {
  /** Object ID to filter updates for specific object's media */
  objectId?: string;
  /** Callback when compression status changes */
  onStatusChange?: (event: CompressionStatusEvent) => void;
  /** Callback when compression completes */
  onComplete?: (event: CompressionStatusEvent) => void;
  /** Callback when compression fails */
  onError?: (event: CompressionStatusEvent) => void;
}

/**
 * Subscribe to video compression status events via WebSocket
 *
 * Automatically invalidates SWR cache for media list when status changes.
 *
 * @example
 * ```tsx
 * useCompressionUpdates({
 *   objectId: 'abc-123',
 *   onStatusChange: (event) => {
 *     console.log('Compression status:', event.status);
 *   },
 *   onComplete: (event) => {
 *     toast.success('Video compressed successfully');
 *   },
 * });
 * ```
 */
export function useCompressionUpdates(
  options: UseCompressionUpdatesOptions = {}
) {
  const { objectId, onStatusChange, onComplete, onError } = options;
  const { socket, isConnected } = useRealtimeChat();

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Handle compression status updates
    const handleStatusUpdate = (event: CompressionStatusEvent) => {
      console.log("🎬 Compression status:", event.mediaId, event.status);

      // Call the status change callback
      onStatusChange?.(event);

      // Call specific callbacks based on status
      if (event.status === "completed") {
        onComplete?.(event);
      } else if (event.status === "failed") {
        onError?.(event);
      }

      // Invalidate SWR cache to refresh media list
      // This will cause the media list to re-fetch with updated compression status
      if (objectId) {
        mutate(`/api/kb/media/${objectId}`);
      }
    };

    // Listen for compression events
    socket.on("compression:status", handleStatusUpdate);
    socket.on("compression:completed", handleStatusUpdate);
    socket.on("compression:failed", handleStatusUpdate);

    return () => {
      socket.off("compression:status", handleStatusUpdate);
      socket.off("compression:completed", handleStatusUpdate);
      socket.off("compression:failed", handleStatusUpdate);
    };
  }, [socket, isConnected, objectId, onStatusChange, onComplete, onError]);

  return { isConnected };
}

/**
 * Hook for tracking compression progress with local state
 *
 * Provides a map of mediaId -> progress for real-time progress bars.
 *
 * @example
 * ```tsx
 * const { compressionProgress, isCompressing } = useCompressionProgress();
 *
 * // In render:
 * {isCompressing(mediaId) && (
 *   <Progress value={compressionProgress[mediaId]} />
 * )}
 * ```
 */
export function useCompressionProgress() {
  const { socket, isConnected } = useRealtimeChat();

  // Track progress for each media item being compressed
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [statusMap, setStatusMap] = useState<Record<string, CompressionStatus>>(
    {}
  );

  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleStatusUpdate = (event: CompressionStatusEvent) => {
      setStatusMap((prev) => ({
        ...prev,
        [event.mediaId]: event.status,
      }));

      if (event.progress !== undefined) {
        setProgressMap((prev) => ({
          ...prev,
          [event.mediaId]: event.progress!,
        }));
      }

      // Clear progress when completed or failed
      if (event.status === "completed" || event.status === "failed") {
        setTimeout(() => {
          setProgressMap((prev) => {
            const { [event.mediaId]: _, ...rest } = prev;
            return rest;
          });
          setStatusMap((prev) => {
            const { [event.mediaId]: _, ...rest } = prev;
            return rest;
          });
        }, 3000); // Keep showing for 3 seconds before clearing
      }
    };

    socket.on("compression:status", handleStatusUpdate);
    socket.on("compression:completed", handleStatusUpdate);
    socket.on("compression:failed", handleStatusUpdate);

    return () => {
      socket.off("compression:status", handleStatusUpdate);
      socket.off("compression:completed", handleStatusUpdate);
      socket.off("compression:failed", handleStatusUpdate);
    };
  }, [socket, isConnected]);

  const isCompressing = useCallback(
    (mediaId: string) => {
      const status = statusMap[mediaId];
      return status === "pending" || status === "processing";
    },
    [statusMap]
  );

  const getProgress = useCallback(
    (mediaId: string) => progressMap[mediaId] ?? 0,
    [progressMap]
  );

  const getStatus = useCallback(
    (mediaId: string) => statusMap[mediaId],
    [statusMap]
  );

  return {
    compressionProgress: progressMap,
    compressionStatus: statusMap,
    isCompressing,
    getProgress,
    getStatus,
    isConnected,
  };
}
