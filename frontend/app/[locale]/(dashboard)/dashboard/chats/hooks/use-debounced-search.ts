"use client";

import { useCallback, useRef, useState, useTransition } from "react";

interface UseDebouncedSearchOptions {
  /**
   * Debounce delay in milliseconds
   * @default 150
   */
  delay?: number;
  /**
   * Minimum characters before triggering search
   * @default 0
   */
  minChars?: number;
}

interface UseDebouncedSearchReturn {
  /**
   * The current input value (updates immediately for responsive UI)
   */
  inputValue: string;
  /**
   * The debounced search query (updates after delay for filtering)
   */
  debouncedQuery: string;
  /**
   * Whether a search update is pending
   */
  isPending: boolean;
  /**
   * Handler for input changes
   */
  handleInputChange: (value: string) => void;
  /**
   * Clear the search
   */
  clearSearch: () => void;
}

/**
 * Custom hook for debounced search with optimized performance.
 *
 * Uses a dual-state approach:
 * - `inputValue`: Updates immediately for responsive typing experience
 * - `debouncedQuery`: Updates after debounce delay for expensive filtering operations
 *
 * This prevents UI stuttering by separating the input display from the search execution.
 *
 * @example
 * ```tsx
 * const { inputValue, debouncedQuery, handleInputChange, isPending } = useDebouncedSearch({ delay: 200 });
 *
 * // Use inputValue for the input field (immediate updates)
 * <input value={inputValue} onChange={(e) => handleInputChange(e.target.value)} />
 *
 * // Use debouncedQuery for filtering (debounced updates)
 * const filtered = useMemo(() =>
 *   items.filter(item => item.name.includes(debouncedQuery)),
 *   [items, debouncedQuery]
 * );
 * ```
 */
export function useDebouncedSearch(
  options: UseDebouncedSearchOptions = {}
): UseDebouncedSearchReturn {
  const { delay = 150, minChars = 0 } = options;

  // Immediate input value for responsive UI
  const [inputValue, setInputValue] = useState("");

  // Debounced query value for filtering
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // React 18 transition for non-blocking updates
  const [isPending, startTransition] = useTransition();

  // Ref to track the debounce timeout
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable handler using useCallback to prevent unnecessary re-renders
  const handleInputChange = useCallback(
    (value: string) => {
      // Update input immediately for responsive typing
      setInputValue(value);

      // Clear any pending timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Debounce the search query update
      timeoutRef.current = setTimeout(() => {
        startTransition(() => {
          // Only apply search if meets minimum character requirement
          setDebouncedQuery(value.length >= minChars ? value : "");
        });
      }, delay);
    },
    [delay, minChars]
  );

  const clearSearch = useCallback(() => {
    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setInputValue("");
    startTransition(() => {
      setDebouncedQuery("");
    });
  }, []);

  return {
    inputValue,
    debouncedQuery,
    isPending,
    handleInputChange,
    clearSearch,
  };
}
