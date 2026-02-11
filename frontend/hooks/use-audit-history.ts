/**
 * useAuditHistory Hook
 *
 * Reusable hook for fetching paginated unified audit history with:
 * - Category and action filtering
 * - Date range filtering
 * - Team member filtering (admin/owner only)
 * - Text search
 * - Efficient pagination
 *
 * This hook powers the global audit log page and can be used for
 * filtered views across the app (e.g., per-category audit panels).
 */

"use client";

import type {
  AuditAction,
  AuditCategory,
  AuditEntityType,
  AuditEntry,
  AuditHistoryParams,
  AuditTeamMember,
  PaginatedAuditResponse,
} from "@/lib/api/endpoints";
import { backendApi } from "@/lib/api/endpoints";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

// ==================== Types ====================

export interface AuditDateRange {
  startDate: Date | null;
  endDate: Date | null;
}

export interface AuditHistoryFilters {
  categories?: AuditCategory[];
  actions?: AuditAction[];
  entityType?: AuditEntityType;
  entityId?: string;
  userId?: number;
  chatId?: string;
  dateRange?: AuditDateRange;
  search?: string;
}

export interface UseAuditHistoryOptions {
  /** Initial page number (1-indexed). @default 1 */
  initialPage?: number;
  /** Initial page size. @default 20 */
  initialPageSize?: number;
  /** Available page size options. @default [10, 20, 50] */
  pageSizeOptions?: number[];
  /** Initial filters */
  initialFilters?: AuditHistoryFilters;
  /** Enable automatic refresh. @default false */
  autoRefresh?: boolean;
  /** Auto refresh interval in ms. @default 30000 */
  autoRefreshInterval?: number;
  /** Disable fetching entirely (e.g., when a dependency is not yet available) */
  enabled?: boolean;
}

export interface UseAuditHistoryReturn {
  // Data
  items: AuditEntry[];
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
  filters: AuditHistoryFilters;
  setFilters: (filters: AuditHistoryFilters) => void;
  setDateRange: (range: AuditDateRange) => void;
  clearDateRange: () => void;
  setCategories: (categories: AuditCategory[]) => void;
  setActions: (actions: AuditAction[]) => void;
  setUserId: (userId: number | undefined) => void;
  setSearch: (search: string) => void;
  clearFilters: () => void;

  // Actions
  refresh: () => Promise<void>;
}

// ==================== Helpers ====================

function formatDateForApi(date: Date | null): string | undefined {
  if (!date) return undefined;
  return date.toISOString();
}

// ==================== Main Hook ====================

/**
 * Hook for fetching paginated audit history with comprehensive filtering.
 */
export function useAuditHistory(
  options: UseAuditHistoryOptions = {},
): UseAuditHistoryReturn {
  const {
    initialPage = 1,
    initialPageSize = 20,
    pageSizeOptions = [10, 20, 50],
    initialFilters = {},
    autoRefresh = false,
    autoRefreshInterval = 30000,
    enabled = true,
  } = options;

  // State
  const [page, setPageState] = useState(initialPage);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [filters, setFiltersState] =
    useState<AuditHistoryFilters>(initialFilters);

  // Track previous filters for page reset
  const previousFiltersRef = useRef<AuditHistoryFilters>(filters);

  // Reset page when filters change
  useEffect(() => {
    const filtersChanged =
      JSON.stringify(previousFiltersRef.current) !== JSON.stringify(filters);

    if (filtersChanged) {
      setPageState(1);
      previousFiltersRef.current = filters;
    }
  }, [filters]);

  // Build SWR key — null disables fetching
  const swrKey = useMemo(
    () =>
      enabled
        ? [
            "audit-history",
            page,
            pageSize,
            filters.categories?.join(","),
            filters.actions?.join(","),
            filters.entityType,
            filters.entityId,
            filters.userId,
            filters.chatId,
            filters.dateRange?.startDate?.toISOString(),
            filters.dateRange?.endDate?.toISOString(),
            filters.search,
          ]
        : null,
    [page, pageSize, filters, enabled],
  );

  // Build API params from state
  const buildParams = useCallback((): AuditHistoryParams => {
    const params: AuditHistoryParams = {
      page,
      pageSize,
    };

    if (filters.categories?.length) params.categories = filters.categories;
    if (filters.actions?.length) params.actions = filters.actions;
    if (filters.entityType) params.entityType = filters.entityType;
    if (filters.entityId) params.entityId = filters.entityId;
    if (filters.userId !== undefined) params.userId = filters.userId;
    if (filters.chatId) params.chatId = filters.chatId;
    if (filters.dateRange?.startDate)
      params.startDate = formatDateForApi(filters.dateRange.startDate);
    if (filters.dateRange?.endDate)
      params.endDate = formatDateForApi(filters.dateRange.endDate);
    if (filters.search) params.search = filters.search;

    return params;
  }, [page, pageSize, filters]);

  // Fetcher
  const fetcher = useCallback(async (): Promise<PaginatedAuditResponse> => {
    return backendApi.audit.getHistory(buildParams());
  }, [buildParams]);

  // SWR
  const { data, isLoading, error, mutate } = useSWR<PaginatedAuditResponse>(
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

  // ==================== Pagination Handlers ====================

  const setPage = useCallback((newPage: number) => {
    setPageState(Math.max(1, newPage));
  }, []);

  const setPageSize = useCallback((newSize: number) => {
    setPageSizeState(newSize);
    setPageState(1);
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

  // ==================== Filter Handlers ====================

  const setFilters = useCallback((newFilters: AuditHistoryFilters) => {
    setFiltersState(newFilters);
  }, []);

  const setDateRange = useCallback((range: AuditDateRange) => {
    setFiltersState((prev) => ({ ...prev, dateRange: range }));
  }, []);

  const clearDateRange = useCallback(() => {
    setFiltersState((prev) => ({ ...prev, dateRange: undefined }));
  }, []);

  const setCategories = useCallback((categories: AuditCategory[]) => {
    setFiltersState((prev) => ({
      ...prev,
      categories: categories.length > 0 ? categories : undefined,
    }));
  }, []);

  const setActions = useCallback((actions: AuditAction[]) => {
    setFiltersState((prev) => ({
      ...prev,
      actions: actions.length > 0 ? actions : undefined,
    }));
  }, []);

  const setUserId = useCallback((userId: number | undefined) => {
    setFiltersState((prev) => ({ ...prev, userId }));
  }, []);

  const setSearch = useCallback((search: string) => {
    setFiltersState((prev) => ({
      ...prev,
      search: search.trim() || undefined,
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setFiltersState({});
  }, []);

  // ==================== Actions ====================

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
    setCategories,
    setActions,
    setUserId,
    setSearch,
    clearFilters,

    // Actions
    refresh,
  };
}

// ==================== Entity Audit History Hook ====================

export interface UseEntityAuditHistoryOptions {
  entityType: AuditEntityType;
  entityId: string;
  /** Disable fetching until dependencies are ready */
  enabled?: boolean;
}

export interface UseEntityAuditHistoryReturn {
  items: AuditEntry[];
  isLoading: boolean;
  error: Error | undefined;
  refresh: () => Promise<void>;
}

/**
 * Hook for fetching audit history of a specific entity (e.g., a contact, template).
 * Returns up to 100 most recent entries.
 */
export function useEntityAuditHistory(
  options: UseEntityAuditHistoryOptions,
): UseEntityAuditHistoryReturn {
  const { entityType, entityId, enabled = true } = options;

  const swrKey = useMemo(
    () =>
      enabled && entityType && entityId
        ? ["audit-entity-history", entityType, entityId]
        : null,
    [entityType, entityId, enabled],
  );

  const fetcher = useCallback(async (): Promise<AuditEntry[]> => {
    return backendApi.audit.getEntityHistory(entityType, entityId);
  }, [entityType, entityId]);

  const { data, isLoading, error, mutate } = useSWR<AuditEntry[]>(
    swrKey,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    },
  );

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    items: data ?? [],
    isLoading,
    error,
    refresh,
  };
}

// ==================== Team Members Hook ====================

export interface UseAuditTeamMembersReturn {
  members: AuditTeamMember[];
  isLoading: boolean;
  error: Error | undefined;
}

/**
 * Hook for fetching team members for the audit filter dropdown.
 * Only returns data for admin/owner users.
 */
export function useAuditTeamMembers(enabled = true): UseAuditTeamMembersReturn {
  const swrKey = useMemo(
    () => (enabled ? ["audit-team-members"] : null),
    [enabled],
  );

  const { data, isLoading, error } = useSWR<AuditTeamMember[]>(
    swrKey,
    () => backendApi.audit.getTeamMembers(),
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000,
    },
  );

  return {
    members: data ?? [],
    isLoading,
    error,
  };
}

export default useAuditHistory;
