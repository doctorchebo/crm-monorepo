"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Navigation guard state for unsaved changes protection.
 * Provides a declarative way to manage unsaved changes warnings.
 */
export interface UnsavedChangesGuardState {
  /**
   * Whether there are unsaved changes that need protection
   */
  hasUnsavedChanges: boolean;
  /**
   * Set the unsaved changes state
   */
  setHasUnsavedChanges: (value: boolean) => void;
  /**
   * Whether the confirmation dialog should be shown
   */
  isDialogOpen: boolean;
  /**
   * The destination URL when user tries to navigate away
   */
  pendingNavigation: string | null;
  /**
   * Call this when user confirms they want to leave (discard changes)
   */
  confirmNavigation: () => void;
  /**
   * Call this when user cancels navigation (stay on page)
   */
  cancelNavigation: () => void;
  /**
   * Request navigation - will show dialog if there are unsaved changes
   * @param href - The destination URL
   * @returns true if navigation can proceed, false if blocked
   */
  requestNavigation: (href: string) => boolean;
}

/**
 * Hook to guard against losing unsaved changes when navigating away.
 *
 * Features:
 * - Browser beforeunload event handling (refresh, close tab)
 * - In-app navigation interception via requestNavigation
 * - Confirmation dialog state management
 *
 * Usage:
 * ```tsx
 * const guard = useUnsavedChangesGuard();
 *
 * // Mark as having unsaved changes
 * guard.setHasUnsavedChanges(true);
 *
 * // Before navigation (e.g., back button click):
 * const handleBack = () => {
 *   if (guard.requestNavigation('/dashboard')) {
 *     router.push('/dashboard');
 *   }
 * };
 *
 * // In your render:
 * <UnsavedChangesDialog
 *   isOpen={guard.isDialogOpen}
 *   onConfirm={guard.confirmNavigation}
 *   onCancel={guard.cancelNavigation}
 * />
 * ```
 */
export function useUnsavedChangesGuard(): UnsavedChangesGuardState {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null,
  );

  // Use ref to track the router for navigation after confirmation
  const navigationCallbackRef = useRef<(() => void) | null>(null);

  // Handle browser beforeunload event (refresh, close tab, external navigation)
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        // Modern browsers require returnValue to be set
        event.returnValue = "";
        return "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  /**
   * Request navigation to a new URL.
   * If there are unsaved changes, shows the confirmation dialog.
   * @returns true if navigation can proceed immediately, false if blocked
   */
  const requestNavigation = useCallback(
    (href: string, callback?: () => void): boolean => {
      if (!hasUnsavedChanges) {
        return true; // No unsaved changes, allow navigation
      }

      // Store the pending navigation
      setPendingNavigation(href);
      if (callback) {
        navigationCallbackRef.current = callback;
      }
      setIsDialogOpen(true);
      return false; // Block navigation, show dialog
    },
    [hasUnsavedChanges],
  );

  /**
   * User confirmed they want to leave - discard changes and navigate
   */
  const confirmNavigation = useCallback(() => {
    setHasUnsavedChanges(false);
    setIsDialogOpen(false);

    // Execute the stored navigation callback if provided
    if (navigationCallbackRef.current) {
      navigationCallbackRef.current();
      navigationCallbackRef.current = null;
    }

    setPendingNavigation(null);
  }, []);

  /**
   * User cancelled navigation - stay on page
   */
  const cancelNavigation = useCallback(() => {
    setIsDialogOpen(false);
    setPendingNavigation(null);
    navigationCallbackRef.current = null;
  }, []);

  return {
    hasUnsavedChanges,
    setHasUnsavedChanges,
    isDialogOpen,
    pendingNavigation,
    confirmNavigation,
    cancelNavigation,
    requestNavigation,
  };
}

/**
 * Type for the navigation callback ref
 */
export type NavigationCallback = () => void;
