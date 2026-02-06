/**
 * useActivityLogs Hook
 *
 * Reusable hook for fetching paginated activity logs with:
 * - Date range filtering
 * - Activity type filtering
 * - Entity filtering
 * - Efficient pagination
 *
 * This hook can be used across different activity views:
 * - Global activity panel (Kanban page)
 * - Chat activity panel
 * - Stage activity history
 */

"use client";

import type {
  ActivityLogEntry,
  ActivityType,
  PaginatedActivityResponse,
} from "@/lib/api/endpoints";
import { backendApi } from "@/lib/api/endpoints";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

export interface DateRange {
  startDate: Date | null;
  endDate: Date | null;
}

export interface ActivityLogsFilters {
  activityTypes?: ActivityType[];
  entityType?: string;
  entityId?: string;
  chatId?: string;
  dateRange?: DateRange;
}

export interface UseActivityLogsOptions {
  /**
   * Initial page number (1-indexed)
   * @default 1
   */
  initialPage?: number;

  /**
   * Initial page size
   * @default 20
   */
  initialPageSize?: number;

  /**
   * Available page size options
   * @default [10, 20, 50]
   */
  pageSizeOptions?: number[];

  /**
   * Initial filters
   */
  initialFilters?: ActivityLogsFilters;

  /**
   * Whether to enable automatic refresh
   * @default false
   */
  autoRefresh?: boolean;

  /**
   * Auto refresh interval in milliseconds
   * @default 30000 (30 seconds)
   */
  autoRefreshInterval?: number;
}

export interface UseActivityLogsReturn {
  // Data
  items: ActivityLogEntry[];
  total: number;
  isLoading: boolean;
  error: Error | undefined;

  // Pagination
  page: number;
  pageSize: number;
  totalPages: number;
  pageSizeOptions: number[];
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  goToFirstPage: () => void;
  goToLastPage: () => void;
  goToNextPage: () => void;
  goToPreviousPage: () => void;
  hasNextPage: boolean;
  hasPreviousPage: boolean;

  // Filters
  filters: ActivityLogsFilters;
  setFilters: (filters: ActivityLogsFilters) => void;
  setDateRange: (range: DateRange) => void;
  clearDateRange: () => void;
  setActivityTypes: (types: ActivityType[]) => void;
  clearFilters: () => void;

  // Actions
  refresh: () => Promise<void>;
}

/**
 * Format date to ISO string for API
 */
function formatDateForApi(date: Date | null): string | undefined {
  if (!date) return undefined;
  return date.toISOString();
}

/**
 * Hook for fetching paginated activity logs with filtering
 */
export function useActivityLogs(
  options: UseActivityLogsOptions = {},
): UseActivityLogsReturn {
  const {
    initialPage = 1,
    initialPageSize = 20,
    pageSizeOptions = [10, 20, 50],
    initialFilters = {},
    autoRefresh = false,
    autoRefreshInterval = 30000,
  } = options;

  // State
  const [page, setPageState] = useState(initialPage);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [filters, setFiltersState] =
    useState<ActivityLogsFilters>(initialFilters);

  // Track previous filters for comparison
  const previousFiltersRef = useRef<ActivityLogsFilters>(filters);

  // Reset page when filters change
  useEffect(() => {
    const filtersChanged =
      JSON.stringify(previousFiltersRef.current) !== JSON.stringify(filters);

    if (filtersChanged) {
      setPageState(1);
      previousFiltersRef.current = filters;
    }
  }, [filters]);

  // Build SWR key
  const swrKey = useMemo(
    () => [
      "activity-logs",
      page,
      pageSize,
      filters.dateRange?.startDate?.toISOString(),
      filters.dateRange?.endDate?.toISOString(),
      filters.activityTypes?.join(","),
      filters.entityType,
      filters.chatId,
    ],
    [page, pageSize, filters],
  );

  // Fetcher function
  const fetcher = useCallback(async (): Promise<PaginatedActivityResponse> => {
    return backendApi.stages.getActivityLogs({
      page,
      pageSize,
      startDate: formatDateForApi(filters.dateRange?.startDate ?? null),
      endDate: formatDateForApi(filters.dateRange?.endDate ?? null),
      activityTypes: filters.activityTypes,
      entityType: filters.entityType,
      chatId: filters.chatId,
    });
  }, [page, pageSize, filters]);

  // Fetch data with SWR
  const { data, isLoading, error, mutate } = useSWR<PaginatedActivityResponse>(
    swrKey,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      refreshInterval: autoRefresh ? autoRefreshInterval : 0,
    },
  );

  // Derived values
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const hasNextPage = page < totalPages;
  const hasPreviousPage = page > 1;

  // Pagination handlers
  const setPage = useCallback((newPage: number) => {
    setPageState(Math.max(1, newPage));
  }, []);

  const setPageSize = useCallback((newSize: number) => {
    setPageSizeState(newSize);
    setPageState(1); // Reset to first page
  }, []);

  const goToFirstPage = useCallback(() => setPage(1), [setPage]);
  const goToLastPage = useCallback(
    () => setPage(totalPages),
    [setPage, totalPages],
  );
  const goToNextPage = useCallback(
    () => setPage(Math.min(page + 1, totalPages)),
    [setPage, page, totalPages],
  );
  const goToPreviousPage = useCallback(
    () => setPage(Math.max(page - 1, 1)),
    [setPage, page],
  );

  // Filter handlers
  const setFilters = useCallback((newFilters: ActivityLogsFilters) => {
    setFiltersState(newFilters);
  }, []);

  const setDateRange = useCallback((range: DateRange) => {
    setFiltersState((prev) => ({
      ...prev,
      dateRange: range,
    }));
  }, []);

  const clearDateRange = useCallback(() => {
    setFiltersState((prev) => ({
      ...prev,
      dateRange: undefined,
    }));
  }, []);

  const setActivityTypes = useCallback((types: ActivityType[]) => {
    setFiltersState((prev) => ({
      ...prev,
      activityTypes: types.length > 0 ? types : undefined,
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setFiltersState({});
  }, []);

  // Refresh handler
  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    // Data
    items,
    total,
    isLoading,
    error,

    // Pagination
    page,
    pageSize,
    totalPages,
    pageSizeOptions,
    setPage,
    setPageSize,
    goToFirstPage,
    goToLastPage,
    goToNextPage,
    goToPreviousPage,
    hasNextPage,
    hasPreviousPage,

    // Filters
    filters,
    setFilters,
    setDateRange,
    clearDateRange,
    setActivityTypes,
    clearFilters,

    // Actions
    refresh,
  };
}

export default useActivityLogs;
