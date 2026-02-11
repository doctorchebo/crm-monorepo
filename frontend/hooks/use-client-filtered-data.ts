/**
 * Client-Side Filtered & Paginated Data Hook
 *
 * For datasets that are loaded entirely client-side (e.g. team members,
 * workload, metrics) where API-level pagination isn't available.
 * Provides search filtering, pagination, and optional selection management
 * on top of an existing array.
 *
 * For server-side paginated data, use `usePaginatedData` instead.
 */

"use client";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface UseClientFilteredDataOptions<T> {
  /** The full dataset to filter and paginate */
  data: T[] | undefined;

  /** Function that returns true if the item matches the search query */
  searchFn: (item: T, query: string) => boolean;

  /**
   * Function to extract a unique string ID from each item.
   * Required when selection is enabled. Used for tracking selected items.
   */
  getItemId?: (item: T) => string;

  /** Initial page size @default 10 */
  initialPageSize?: number;

  /** Available page size options @default [10, 25, 50] */
  pageSizeOptions?: number[];

  /** Debounce delay in ms for search @default 200 */
  searchDelay?: number;
}

export interface UseClientFilteredDataReturn<T> {
  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isSearchPending: boolean;

  // Filtered + paginated items
  items: T[];
  filteredTotal: number;
  total: number;

  // Pagination
  page: number;
  pageSize: number;
  totalPages: number;
  pageSizeOptions: number[];
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;

  // Selection (available when getItemId is provided)
  selectedIds: Set<string>;
  selectedCount: number;
  isAllSelected: boolean;
  isPartiallySelected: boolean;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  selectAll: () => void;
  clearSelection: () => void;
  selectOne: (id: string) => void;
}

export function useClientFilteredData<T>({
  data,
  searchFn,
  getItemId,
  initialPageSize = 10,
  pageSizeOptions = [10, 25, 50],
  searchDelay = 200,
}: UseClientFilteredDataOptions<T>): UseClientFilteredDataReturn<T> {
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const {
    value: searchQuery,
    debouncedValue: debouncedSearch,
    setValue: setSearchQuery,
    isPending: isSearchPending,
  } = useDebouncedValue("", { delay: searchDelay });

  // Reset to page 1 and clear selection when search changes
  const prevSearchRef = useRef(debouncedSearch);
  useEffect(() => {
    if (prevSearchRef.current !== debouncedSearch) {
      setPageState(1);
      setSelectedIds(new Set());
      prevSearchRef.current = debouncedSearch;
    }
  }, [debouncedSearch]);

  // Filter data by search query
  const filteredData = useMemo(() => {
    if (!data) return [];
    if (!debouncedSearch.trim()) return data;
    const query = debouncedSearch.toLowerCase().trim();
    return data.filter((item) => searchFn(item, query));
  }, [data, debouncedSearch, searchFn]);

  const filteredTotal = filteredData.length;
  const total = data?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));

  // Clamp page if it goes out of bounds
  useEffect(() => {
    if (page > totalPages) {
      setPageState(totalPages);
    }
  }, [page, totalPages]);

  // Paginate the filtered data
  const items = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, page, pageSize]);

  // Selection computed values
  const selectedCount = selectedIds.size;
  const isAllSelected = items.length > 0 && selectedIds.size === items.length;
  const isPartiallySelected =
    selectedIds.size > 0 && selectedIds.size < items.length;

  const setPage = useCallback((newPage: number) => {
    setPageState(Math.max(1, newPage));
    setSelectedIds(new Set()); // Clear selection when changing pages
  }, []);

  const setPageSize = useCallback((newSize: number) => {
    setPageSizeState(newSize);
    setPageState(1);
    setSelectedIds(new Set()); // Clear selection when changing page size
  }, []);

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
    if (!getItemId) return;
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(getItemId)));
    }
  }, [isAllSelected, items, getItemId]);

  const selectAll = useCallback(() => {
    if (!getItemId) return;
    setSelectedIds(new Set(items.map(getItemId)));
  }, [items, getItemId]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectOne = useCallback((id: string) => {
    setSelectedIds(new Set([id]));
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    isSearchPending,
    items,
    filteredTotal,
    total,
    page,
    pageSize,
    totalPages,
    pageSizeOptions,
    setPage,
    setPageSize,
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
  };
}
