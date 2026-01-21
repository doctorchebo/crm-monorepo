"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface UseTabStateOptions {
  /**
   * The default tab value to use if no query parameter is present.
   */
  defaultValue: string;
  /**
   * The name of the query parameter to use for storing the tab state.
   * @default "tab"
   */
  paramName?: string;
}

/**
 * A hook to persist tab state in the URL query parameters.
 * This allows the selected tab to be preserved across page refreshes and language changes.
 */
export function useTabState({
  defaultValue,
  paramName = "tab",
}: UseTabStateOptions) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Get the current tab from the URL, or fallback to the defaultValue
  const selectedTab = searchParams.get(paramName) || defaultValue;

  const setTab = useCallback(
    (value: string) => {
      // Create a new URLSearchParams object to avoid specific read-only issues
      const params = new URLSearchParams(searchParams.toString());

      // Update the query parameter
      if (value === defaultValue) {
        // Optional: Removing it helps keep the URL clean if it's the default
        // params.delete(paramName);
        // However, keeping it makes it explicit. Let's set it.
        params.set(paramName, value);
      } else {
        params.set(paramName, value);
      }

      // Replace the URL without reloading the page
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [defaultValue, paramName, pathname, router, searchParams],
  );

  // Optional: Sync URL if it's missing on mount (to be explicit)?
  // No, that causes unnecessary replacements/renders. implicit default is fine.

  return [selectedTab, setTab] as const;
}
