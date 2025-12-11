/**
 * useMessageStatusTracking Hook
 *
 * Handles message delivery status tracking with:
 * - Optimistic UI updates (assume "sent" immediately)
 * - Background polling for delivery/read status
 * - Efficient status caching and deduplication
 *
 * Architecture:
 * - Sends message with status "pending"
 * - Optimistically updates to "sent" in UI
 * - Polls every 5 seconds for delivery/read updates
 * - Stops polling when message reaches "read" status
 *
 * This approach provides instant visual feedback while maintaining
 * accurate delivery tracking from Meta's webhooks.
 */

import { backendApi } from "@/lib/api/endpoints";
import { useCallback, useEffect, useRef, useState } from "react";

interface MessageStatusTrackingOptions {
  pollInterval?: number; // MS between status polls (default: 5000)
  stopPollOnStatus?: "read" | "delivered"; // Stop polling at this status
  autoStart?: boolean; // Auto-start polling when message is outbound
}

interface MessageStatusData {
  messageId: string;
  direction: "inbound" | "outbound";
  currentStatus: "pending" | "sent" | "delivered" | "read" | "failed";
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedReason?: string;
  statusHistory: Array<{
    status: string;
    timestamp: string;
    failureReason?: string;
  }>;
  updatedAt: string;
}

/**
 * Hook for tracking message delivery status
 * Polls the server for updates and maintains optimistic UI state
 *
 * @param messageId - The message ID to track
 * @param initialStatus - Initial status for optimistic update
 * @param options - Configuration options
 *
 * @example
 * const { status, isPolling, stopPolling } = useMessageStatusTracking(
 *   messageId,
 *   "pending",
 *   { pollInterval: 3000 }
 * );
 */
export function useMessageStatusTracking(
  messageId: string,
  initialStatus:
    | "pending"
    | "sent"
    | "delivered"
    | "read"
    | "failed" = "pending",
  options: MessageStatusTrackingOptions = {}
) {
  const {
    pollInterval = 5000,
    stopPollOnStatus = "read",
    autoStart = true,
  } = options;

  const [status, setStatus] = useState<
    "pending" | "sent" | "delivered" | "read" | "failed"
  >(initialStatus);
  const [statusData, setStatusData] = useState<MessageStatusData | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchRef = useRef<number>(0);
  const statusCacheRef = useRef<MessageStatusData | null>(null);

  /**
   * Fetch message status from backend
   */
  const fetchStatus = useCallback(async () => {
    try {
      const now = Date.now();
      const cached = statusCacheRef.current;

      // Implement basic caching - don't fetch more than once per second
      if (cached && now - lastFetchRef.current < 1000) {
        return cached;
      }

      const data = await backendApi.whatsapp.getStatus(messageId);
      const typedData = data as MessageStatusData;

      lastFetchRef.current = now;
      statusCacheRef.current = typedData;
      setStatusData(typedData);
      setStatus(typedData.currentStatus);
      setError(null);

      return typedData;
    } catch (err) {
      console.error("Error fetching message status:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch message status"
      );
      return null;
    }
  }, [messageId]);

  /**
   * Start polling for status updates
   */
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return; // Already polling

    setIsPolling(true);

    // Immediate first fetch
    fetchStatus().then((data) => {
      // Check if we should stop polling
      if (data && data.currentStatus === stopPollOnStatus) {
        setIsPolling(false);
        return;
      }

      // Set up interval for subsequent polls
      pollingIntervalRef.current = setInterval(async () => {
        const statusData = await fetchStatus();

        if (!statusData) return;

        // Stop polling when message reaches target status
        if (statusData.currentStatus === stopPollOnStatus) {
          stopPolling();
        }
      }, pollInterval);
    });
  }, [fetchStatus, pollInterval, stopPollOnStatus]);

  /**
   * Stop polling for status updates
   */
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  /**
   * Manually trigger a status refresh
   */
  const refresh = useCallback(async () => {
    return await fetchStatus();
  }, [fetchStatus]);

  // Auto-start polling on mount if enabled
  useEffect(() => {
    // Only auto-start for outbound messages in pending/sent state
    if (
      autoStart &&
      (initialStatus === "pending" || initialStatus === "sent")
    ) {
      startPolling();
    }

    return () => {
      stopPolling();
    };
  }, [autoStart, initialStatus, startPolling, stopPolling]);

  return {
    status,
    statusData,
    isPolling,
    error,
    startPolling,
    stopPolling,
    refresh,
  };
}

/**
 * Hook for batch status tracking of multiple messages
 * More efficient than tracking individually
 */
export function useMultipleMessageStatusTracking(
  messageIds: string[],
  options: MessageStatusTrackingOptions = {}
) {
  const [statusMap, setStatusMap] = useState<
    Map<string, "pending" | "sent" | "delivered" | "read" | "failed">
  >(new Map());
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const completedMessagesRef = useRef<Set<string>>(new Set());

  const fetchAllStatuses = useCallback(async () => {
    try {
      // Only fetch messages that haven't reached the stop status
      const messagesToFetch = messageIds.filter(
        (id) => !completedMessagesRef.current.has(id)
      );

      if (messagesToFetch.length === 0) {
        // All messages have reached stop status, stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
          setIsPolling(false);
        }
        return;
      }

      const statuses = await Promise.all(
        messagesToFetch.map((id) =>
          backendApi.whatsapp.getStatus(id).catch(() => null)
        )
      );

      const newMap = new Map<
        string,
        "pending" | "sent" | "delivered" | "read" | "failed"
      >(statusMap);

      const stopPollOnStatus = options.stopPollOnStatus || "read";

      messagesToFetch.forEach((id, index) => {
        if (statuses[index]) {
          const data = statuses[index] as MessageStatusData;
          newMap.set(id, data.currentStatus);

          // Mark as completed if it reached stop status
          if (
            data.currentStatus === stopPollOnStatus ||
            data.currentStatus === "read" ||
            data.currentStatus === "failed"
          ) {
            completedMessagesRef.current.add(id);
          }
        }
      });

      setStatusMap(newMap);
      setError(null);
    } catch (err) {
      console.error("Error fetching multiple message statuses:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch statuses");
    }
  }, [messageIds, options.stopPollOnStatus]);

  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;

    setIsPolling(true);
    fetchAllStatuses();

    pollingIntervalRef.current = setInterval(
      fetchAllStatuses,
      options.pollInterval || 15000 // Default to 15 seconds
    );
  }, [fetchAllStatuses, options.pollInterval]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  // Auto-start on mount if enabled
  useEffect(() => {
    if (options.autoStart !== false && messageIds.length > 0) {
      startPolling();
    }

    return () => {
      stopPolling();
    };
  }, [options.autoStart, messageIds.length]); // Only depend on LENGTH, not the array itself

  return {
    statusMap,
    isPolling,
    error,
    startPolling,
    stopPolling,
    refresh: fetchAllStatuses,
  };
}

export default useMessageStatusTracking;
