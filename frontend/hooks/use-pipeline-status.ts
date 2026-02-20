import { backendApi, type ChatPipelineStatus } from "@/lib/api/endpoints";
import { useCallback, useEffect, useState } from "react";

interface UsePipelineStatusOptions {
  /** The chat ID to check status for */
  chatId: string | null;
  /** Whether to auto-fetch on mount and chatId change */
  autoFetch?: boolean;
}

interface UsePipelineStatusReturn {
  /** Current pipeline status for the chat */
  status: ChatPipelineStatus | null;
  /** Whether the status is currently loading */
  loading: boolean;
  /** Any error that occurred during fetch */
  error: string | null;
  /** Whether the chat has no stage assigned (orphaned or never assigned) */
  hasNoStage: boolean;
  /** Refresh the status */
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch and track pipeline status for a chat
 *
 * Useful for:
 * - Detecting when a chat has no stage assigned (orphaned)
 * - Getting the current stage information
 * - Triggering the stage assignment modal
 *
 * @example
 * ```tsx
 * const { status, hasNoStage, loading } = usePipelineStatus({ chatId: selectedChatId });
 *
 * // Show stage assignment modal when chat has no stage
 * useEffect(() => {
 *   if (hasNoStage && !loading) {
 *     setShowStageAssignmentModal(true);
 *   }
 * }, [hasNoStage, loading]);
 * ```
 */
export function usePipelineStatus({
  chatId,
  autoFetch = true,
}: UsePipelineStatusOptions): UsePipelineStatusReturn {
  const [status, setStatus] = useState<ChatPipelineStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!chatId) {
      setStatus(null);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const statusData = await backendApi.stages.getChatStatus(chatId);
      setStatus(statusData);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch pipeline status";
      setError(message);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  // Auto-fetch on mount and chatId change
  useEffect(() => {
    if (autoFetch && chatId) {
      fetchStatus();
    }
  }, [autoFetch, chatId, fetchStatus]);

  // Determine if chat has no stage assigned
  const hasNoStage =
    !loading && status !== null && status.currentStage === null;

  return {
    status,
    loading,
    error,
    hasNoStage,
    refresh: fetchStatus,
  };
}
