/**
 * useSidebarExpanded - Hook for persisting chat sidebar expanded/collapsed state
 *
 * Persists to localStorage (survives refresh and browser sessions):
 * - Sidebar expanded state - restored on page reload and new browser sessions
 *
 * Key behavior:
 * - Default is expanded (true)
 * - User's preference is persisted across sessions
 * - SSR-safe with proper hydration handling
 */

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "chats-page:sidebarExpanded";
const DEFAULT_EXPANDED = true;

interface UseSidebarExpandedReturn {
  /** Whether the sidebar is currently expanded */
  isExpanded: boolean;
  /** Toggle the sidebar expanded state */
  toggle: () => void;
  /** Set the sidebar expanded state directly */
  setExpanded: (expanded: boolean) => void;
  /** Whether the initial state has been loaded from storage */
  isHydrated: boolean;
}

/**
 * Safe localStorage access (handles SSR and quota errors)
 */
function getStoredValue(): boolean | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) {
      return null;
    }
    return stored === "true";
  } catch {
    return null;
  }
}

/**
 * Persist expanded state to localStorage
 */
function persistValue(expanded: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, String(expanded));
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
  }
}

/**
 * Hook for managing sidebar expanded/collapsed state with persistence
 *
 * @returns Object with isExpanded state, toggle function, setExpanded function, and isHydrated flag
 *
 * @example
 * ```tsx
 * const { isExpanded, toggle, isHydrated } = useSidebarExpanded();
 *
 * // Only render sidebar when hydrated to prevent flash
 * {isHydrated && isExpanded && <Sidebar />}
 *
 * // Toggle button
 * <Button onClick={toggle}>
 *   {isExpanded ? 'Collapse' : 'Expand'}
 * </Button>
 * ```
 */
export function useSidebarExpanded(): UseSidebarExpandedReturn {
  // Start with default value for SSR
  const [isExpanded, setIsExpanded] = useState(DEFAULT_EXPANDED);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const storedValue = getStoredValue();
    if (storedValue !== null) {
      setIsExpanded(storedValue);
    }
    setIsHydrated(true);
  }, []);

  // Toggle callback that persists the new state
  const toggle = useCallback(() => {
    setIsExpanded((prev) => {
      const newValue = !prev;
      persistValue(newValue);
      return newValue;
    });
  }, []);

  // Set callback that persists the new state
  const setExpanded = useCallback((expanded: boolean) => {
    setIsExpanded(expanded);
    persistValue(expanded);
  }, []);

  return {
    isExpanded,
    toggle,
    setExpanded,
    isHydrated,
  };
}
