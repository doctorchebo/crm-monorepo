/**
 * useUsageTracking Hook
 * Manages AI usage tracking and throttle status
 *
 * Features:
 * - Fetch usage summary and status
 * - Monitor usage limits
 * - Display warnings when approaching limits
 */

import { backendApi } from "@/lib/api/endpoints";
import { useCallback, useEffect, useState } from "react";

export interface UsageSummary {
  totalTokens: number;
  totalCost: number;
  requestCount: number;
  byProvider: Record<
    string,
    { tokens: number; cost: number; requests: number }
  >;
  byOperationType: Record<
    string,
    { tokens: number; cost: number; requests: number }
  >;
  periodStart: string;
  periodEnd: string;
}

export interface UsageStatus {
  currentUsage: number;
  limit: number;
  percentUsed: number;
  remaining: number;
  isAtLimit: boolean;
  isNearLimit: boolean;
  limitType: string;
  limitPeriod: string;
  periodEnd?: string;
}

export interface ThrottleStatus {
  isThrottled: boolean;
  aiPausedChats: number;
  usageStatuses: UsageStatus[];
  warnings: string[];
  recommendations: string[];
}

export function useUsageTracking(options?: {
  period?: "daily" | "weekly" | "monthly" | "all";
  autoRefresh?: boolean;
  refreshInterval?: number;
}) {
  const {
    period = "monthly",
    autoRefresh = true,
    refreshInterval = 60000,
  } = options || {};

  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [statuses, setStatuses] = useState<UsageStatus[]>([]);
  const [throttleStatus, setThrottleStatus] = useState<ThrottleStatus | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch usage summary
  const fetchSummary = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await backendApi.usage.getSummary({ period });
      setSummary(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch usage summary"
      );
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  // Fetch usage statuses
  const fetchStatuses = useCallback(async () => {
    try {
      const data = await backendApi.usage.getStatus();
      setStatuses(data);
    } catch (err) {
      console.error("Failed to fetch usage statuses:", err);
    }
  }, []);

  // Fetch throttle status
  const fetchThrottleStatus = useCallback(async () => {
    try {
      const data = await backendApi.usage.getThrottleStatus();
      setThrottleStatus(data);
    } catch (err) {
      console.error("Failed to fetch throttle status:", err);
    }
  }, []);

  // Fetch all data
  const fetchAll = useCallback(async () => {
    await Promise.all([fetchSummary(), fetchStatuses(), fetchThrottleStatus()]);
  }, [fetchSummary, fetchStatuses, fetchThrottleStatus]);

  // Check before AI operation
  const checkBeforeAiOperation = useCallback(async () => {
    try {
      return await backendApi.usage.checkBeforeAiOperation();
    } catch (err) {
      console.error("Failed to check AI operation:", err);
      return { allowed: true };
    }
  }, []);

  // Set a usage limit
  const setLimit = useCallback(
    async (
      limitType: "tokens" | "cost" | "requests",
      limitPeriod: "daily" | "weekly" | "monthly" | "total",
      limitValue: number,
      options?: {
        warningThreshold?: number;
        actionOnLimit?: "pause" | "notify" | "block";
      }
    ) => {
      try {
        await backendApi.usage.setLimit({
          limitType,
          limitPeriod,
          limitValue,
          warningThreshold: options?.warningThreshold,
          actionOnLimit: options?.actionOnLimit,
        });
        await fetchStatuses();
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Failed to set limit",
        };
      }
    },
    [fetchStatuses]
  );

  // Remove a usage limit
  const removeLimit = useCallback(
    async (limitType: string, limitPeriod: string) => {
      try {
        await backendApi.usage.removeLimit(limitType, limitPeriod);
        await fetchStatuses();
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Failed to remove limit",
        };
      }
    },
    [fetchStatuses]
  );

  // Pause all AI
  const pauseAllAI = useCallback(
    async (reason?: string) => {
      try {
        const result = await backendApi.usage.pauseAll(reason);
        await fetchThrottleStatus();
        return result;
      } catch (err) {
        return {
          success: false,
          pausedCount: 0,
          error: err instanceof Error ? err.message : "Failed to pause all AI",
        };
      }
    },
    [fetchThrottleStatus]
  );

  // Initial fetch
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchStatuses();
      fetchThrottleStatus();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchStatuses, fetchThrottleStatus]);

  // Computed values
  const isThrottled = throttleStatus?.isThrottled ?? false;
  const hasWarnings =
    throttleStatus?.warnings && throttleStatus.warnings.length > 0;
  const nearLimitStatuses = statuses.filter(
    (s) => s.isNearLimit && !s.isAtLimit
  );
  const atLimitStatuses = statuses.filter((s) => s.isAtLimit);

  return {
    summary,
    statuses,
    throttleStatus,
    isLoading,
    error,
    // Actions
    fetchAll,
    fetchSummary,
    fetchStatuses,
    fetchThrottleStatus,
    checkBeforeAiOperation,
    setLimit,
    removeLimit,
    pauseAllAI,
    // Computed
    isThrottled,
    hasWarnings,
    nearLimitStatuses,
    atLimitStatuses,
    warnings: throttleStatus?.warnings || [],
    recommendations: throttleStatus?.recommendations || [],
  };
}
