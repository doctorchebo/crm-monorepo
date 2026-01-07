/**
 * Debounced Value Hook
 *
 * Provides efficient debouncing for form inputs to prevent excessive re-renders.
 * Separates display value from debounced value for smooth UX.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseDebouncedValueOptions {
  /**
   * Debounce delay in milliseconds
   * @default 150
   */
  delay?: number;
}

interface UseDebouncedValueReturn<T> {
  /**
   * The current value (updates immediately)
   */
  value: T;
  /**
   * The debounced value (updates after delay)
   */
  debouncedValue: T;
  /**
   * Update the value
   */
  setValue: (value: T) => void;
  /**
   * Whether an update is pending
   */
  isPending: boolean;
}

/**
 * Hook for debouncing any value with immediate display updates.
 *
 * @example
 * ```tsx
 * const { value, debouncedValue, setValue } = useDebouncedValue('', { delay: 200 });
 *
 * // Use value for controlled input display
 * // Use debouncedValue for expensive operations
 * <input value={value} onChange={(e) => setValue(e.target.value)} />
 * ```
 */
export function useDebouncedValue<T>(
  initialValue: T,
  options: UseDebouncedValueOptions = {}
): UseDebouncedValueReturn<T> {
  const { delay = 150 } = options;

  const [value, setValueState] = useState<T>(initialValue);
  const [debouncedValue, setDebouncedValue] = useState<T>(initialValue);
  const [isPending, setIsPending] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const setValue = useCallback(
    (newValue: T) => {
      // Update display value immediately
      setValueState(newValue);
      setIsPending(true);

      // Clear existing timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      // Set new timer for debounced update
      timerRef.current = setTimeout(() => {
        setDebouncedValue(newValue);
        setIsPending(false);
      }, delay);
    },
    [delay]
  );

  return {
    value,
    debouncedValue,
    setValue,
    isPending,
  };
}

/**
 * Hook for debouncing a callback function.
 *
 * @example
 * ```tsx
 * const debouncedSave = useDebouncedCallback((data) => {
 *   saveToServer(data);
 * }, 300);
 * ```
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number = 150
): T {
  const callbackRef = useRef(callback);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  ) as T;

  return debouncedFn;
}

export default useDebouncedValue;
