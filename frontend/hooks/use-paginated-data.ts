/**
 * Paginated Data Hook
 *
 * Provides robust pagination handling with automatic page adjustment when
 * items are deleted from the last page. This prevents showing empty states
 * when previous pages still have data.
 *
 * Features:
 * - Automatic page adjustment after deletions
 * - Selection state management with automatic cleanup
 * - Filter change detection with page reset
 * - TypeScript generics for type safety
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR, { type SWRConfiguration, type SWRResponse } from "swr";

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

export interface UsePaginatedDataOptions<T, TFilters> {
  /**
   * Unique key prefix for the SWR cache
   */
  cacheKeyPrefix: string;

  /**
   * Initial page number (1-indexed)
   * @default 1
   */
  initialPage?: number;

  /**
   * Initial page size
   * @default 12
   */
  initialPageSize?: number;

  /**
   * Available page size options
   * @default [12, 24, 48]
   */
  pageSizeOptions?: number[];

  /**
   * Current filters to apply
   */
  filters: TFilters;

  /**
   * Fetcher function that returns paginated data
   */
  fetcher: (params: {
    page: number;
    pageSize: number;
    filters: TFilters;
  }) => Promise<PaginatedResponse<T>>;

  /**
   * Function to extract unique ID from an item
   */
  getItemId: (item: T) => string;

  /**
   * SWR configuration options
   */
  swrOptions?: SWRConfiguration;
}

export interface UsePaginatedDataReturn<T> {
  // Data
  items: T[];
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

  // Selection
  selectedIds: Set<string>;
  selectedCount: number;
  isAllSelected: boolean;
  isPartiallySelected: boolean;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  selectAll: () => void;
  clearSelection: () => void;
  selectOne: (id: string) => void;

  // Mutations
  /**
   * Refresh data from server. Automatically adjusts page if current page becomes empty.
   * @param deletedCount - Optional number of items that were just deleted
   */
  refresh: (deletedCount?: number) => Promise<void>;

  /**
   * Refresh data after a bulk delete operation. Handles page adjustment and selection clearing.
   * @param deletedCount - Number of items that were deleted
   */
  refreshAfterDelete: (deletedCount: number) => Promise<void>;

  // Raw SWR response for advanced usage
  swrResponse: SWRResponse<PaginatedResponse<T>>;
}

/**
 * Hook for managing paginated data with automatic page adjustment after deletions.
 *
 * @example
 * ```tsx
 * const {
 *   items,
 *   page,
 *   totalPages,
 *   selectedIds,
 *   toggleSelect,
 *   refreshAfterDelete,
 * } = usePaginatedData({
 *   cacheKeyPrefix: 'workflows',
 *   filters: { status: 'all', search: '' },
 *   fetcher: async ({ page, pageSize, filters }) => {
 *     const result = await api.list({ page, limit: pageSize, ...filters });
 *     return { items: result.workflows, total: result.total };
 *   },
 *   getItemId: (workflow) => workflow.id,
 * });
 *
 * const handleBulkDelete = async () => {
 *   const result = await api.bulkDelete(Array.from(selectedIds));
 *   await refreshAfterDelete(result.deletedCount);
 * };
 * ```
 */
export function usePaginatedData<T, TFilters = Record<string, unknown>>({
  cacheKeyPrefix,
  initialPage = 1,
  initialPageSize = 12,
  pageSizeOptions = [12, 24, 48],
  filters,
  fetcher,
  getItemId,
  swrOptions,
}: UsePaginatedDataOptions<T, TFilters>): UsePaginatedDataReturn<T> {
  // Pagination state
  const [page, setPageState] = useState(initialPage);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Track previous filters for comparison
  const previousFiltersRef = useRef<TFilters>(filters);

  // Reset page and selection when filters change
  useEffect(() => {
    const filtersChanged =
      JSON.stringify(previousFiltersRef.current) !== JSON.stringify(filters);

    if (filtersChanged) {
      setPageState(1);
      setSelectedIds(new Set());
      previousFiltersRef.current = filters;
    }
  }, [filters]);

  // SWR cache key - include all pagination and filter params
  const swrKey = useMemo(
    () => [cacheKeyPrefix, page, pageSize, JSON.stringify(filters)],
    [cacheKeyPrefix, page, pageSize, filters],
  );

  // Fetch data with SWR
  const swrResponse = useSWR<PaginatedResponse<T>>(
    swrKey,
    () => fetcher({ page, pageSize, filters }),
    {
      revalidateOnFocus: false,
      dedupingInterval: 0,
      ...swrOptions,
    },
  );

  const { data, isLoading, error, mutate } = swrResponse;

  // Derived values
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Selection computed values
  const selectedCount = selectedIds.size;
  const isAllSelected = items.length > 0 && selectedIds.size === items.length;
  const isPartiallySelected =
    selectedIds.size > 0 && selectedIds.size < items.length;
  const hasNextPage = page < totalPages;
  const hasPreviousPage = page > 1;

  // Pagination handlers
  const setPage = useCallback((newPage: number) => {
    setPageState(Math.max(1, newPage));
    setSelectedIds(new Set()); // Clear selection when changing pages
  }, []);

  const setPageSize = useCallback((newSize: number) => {
    setPageSizeState(newSize);
    setPageState(1); // Reset to first page
    setSelectedIds(new Set()); // Clear selection
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

  // Selection handlers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(getItemId)));
    }
  }, [isAllSelected, items, getItemId]);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map(getItemId)));
  }, [items, getItemId]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectOne = useCallback((id: string) => {
    setSelectedIds(new Set([id]));
  }, []);

  // Refresh with automatic page adjustment
  const refresh = useCallback(
    async (deletedCount?: number) => {
      // Calculate what the new total will be after deletion
      const newTotal =
        deletedCount !== undefined ? total - deletedCount : total;
      const newTotalPages = Math.max(1, Math.ceil(newTotal / pageSize));

      // If current page would be beyond the new total pages, adjust
      if (page > newTotalPages && newTotalPages > 0) {
        // Navigate to the last valid page first, then refresh
        setPageState(newTotalPages);
        // The page change will trigger a new SWR fetch automatically
      } else {
        // Same page, just refresh
        await mutate(undefined, { revalidate: true });
      }
    },
    [total, pageSize, page, mutate],
  );

  // Specialized refresh for bulk delete operations
  const refreshAfterDelete = useCallback(
    async (deletedCount: number) => {
      // Clear selection first
      setSelectedIds(new Set());

      // Calculate new pagination state
      const newTotal = total - deletedCount;
      const newTotalPages = Math.max(1, Math.ceil(newTotal / pageSize));

      if (page > newTotalPages && newTotalPages >= 1) {
        // Current page is now invalid, go to last valid page
        setPageState(newTotalPages);
        // SWR will automatically fetch data for the new page
      } else {
        // Current page is still valid, just refresh
        await mutate(undefined, { revalidate: true });
      }
    },
    [total, pageSize, page, mutate],
  );

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

    // Selection
    selectedIds,
    selectedCount,
    isAllSelected,
    isPartiallySelected,
    toggleSelect,
    toggleSelectAll,
    selectAll,
    clearSelection,
    selectOne,

    // Mutations
    refresh,
    refreshAfterDelete,

    // Raw SWR response
    swrResponse,
  };
}

export default usePaginatedData;
