/**
 * useHandoff Hook
 * Manages human-AI handoff state and actions for a chat
 *
 * Features:
 * - Fetch handoff status
 * - Pause/resume AI
 * - Request/resolve handoff
 * - Real-time status updates via WebSocket
 */

import { backendApi } from "@/lib/api/endpoints";
import { useCallback, useEffect, useState } from "react";

export interface HandoffStatus {
  chatId: string;
  awaitingHandoff: boolean;
  handoffRequestedAt?: string;
  handoffReason?: string;
  aiPaused: boolean;
  aiPausedAt?: string;
  aiPausedBy?: number;
  currentStageId: string;
  currentStageName: string;
  // Extended fields for banner display
  priority?: "low" | "medium" | "high" | "critical";
  status?:
    | "pending"
    | "acknowledged"
    | "in_progress"
    | "resolved"
    | "escalated";
  reason?: string;
  aiReasoning?: string;
  triggeredAt?: string;
  acknowledgedAt?: string;
}

export interface AIStatus {
  chatId: string;
  aiEnabled: boolean;
  aiConfigEnabled?: boolean; // New field from backend
  reason?: string;
  isRateLimited?: boolean;
  rateLimitReset?: string;
}

export function useHandoff(chatId: string | null) {
  const [handoffStatus, setHandoffStatus] = useState<HandoffStatus | null>(
    null,
  );
  const [aiStatus, setAIStatus] = useState<AIStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch handoff status
  const fetchStatus = useCallback(async () => {
    if (!chatId) return;

    setIsLoading(true);
    setError(null);

    try {
      const [handoff, ai] = await Promise.all([
        backendApi.aiHandoff.getHandoffStatus(chatId),
        backendApi.aiHandoff.getAIStatus(chatId),
      ]);

      setHandoffStatus(handoff);
      setAIStatus(ai);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch status");
    } finally {
      setIsLoading(false);
    }
  }, [chatId]);

  // Pause AI for this chat
  const pauseAI = useCallback(async () => {
    if (!chatId) return;

    try {
      await backendApi.aiHandoff.pauseAI(chatId);
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pause AI");
    }
  }, [chatId, fetchStatus]);

  // Resume AI for this chat with optional goal
  const resumeAI = useCallback(
    async (goalType?: string, goalDescription?: string) => {
      if (!chatId) return;

      try {
        await backendApi.aiHandoff.resumeAI(chatId, goalType, goalDescription);
        await fetchStatus();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to resume AI");
      }
    },
    [chatId, fetchStatus],
  );

  // Request human handoff
  const requestHandoff = useCallback(
    async (reason: string) => {
      if (!chatId) return;

      try {
        await backendApi.aiHandoff.requestHandoff({ chatId, reason });
        await fetchStatus();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to request handoff",
        );
      }
    },
    [chatId, fetchStatus],
  );

  // Resolve handoff
  const resolveHandoff = useCallback(
    async (resumeAI: boolean = false, resolution?: string) => {
      if (!chatId) return;

      try {
        await backendApi.aiHandoff.resolveHandoff({
          chatId,
          resumeAI,
          resolution,
        });
        await fetchStatus();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to resolve handoff",
        );
      }
    },
    [chatId, fetchStatus],
  );

  // Fetch on mount and when chatId changes
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    handoffStatus,
    aiStatus,
    isLoading,
    error,
    // Actions
    pauseAI,
    resumeAI,
    requestHandoff,
    resolveHandoff,
    refetch: fetchStatus,
    // Computed states
    isAIPaused: aiStatus?.aiEnabled === false || handoffStatus?.aiPaused,
    isAwaitingHandoff: handoffStatus?.awaitingHandoff ?? false,
  };
}
