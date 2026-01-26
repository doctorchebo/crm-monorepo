/**
 * useUser Hook
 *
 * Centralized hook for managing user profile data across the application.
 * Uses SWR for caching and automatic revalidation, ensuring that user data
 * (including profile picture) stays in sync across all components.
 *
 * Features:
 * - SWR-based caching with automatic revalidation
 * - Token-based authentication check before fetching
 * - Shared cache key for consistent data across components
 * - Manual revalidation via `mutateUser` for immediate updates
 *
 * Usage:
 * ```tsx
 * const { user, isLoading, mutateUser } = useUser();
 *
 * // Access user data
 * if (user) {
 *   console.log(user.name, user.profilePictureUrl);
 * }
 *
 * // Trigger a refresh after profile update
 * await mutateUser();
 * ```
 */

import { backendApi, UserProfileDto } from "@/lib/api/endpoints";
import { TokenManager } from "@/lib/auth/token-manager";
import useSWR, { mutate } from "swr";

/**
 * SWR cache key for user profile data.
 * This key is used across the application for consistent caching.
 */
export const USER_PROFILE_CACHE_KEY = "user-profile";

/**
 * Fetcher function for user profile.
 * Returns null if not authenticated.
 */
async function fetchUserProfile(): Promise<UserProfileDto | null> {
  // Check if we have valid tokens before making the request
  if (!TokenManager.isAccessTokenValid()) {
    return null;
  }

  try {
    const userData = await backendApi.user.getProfile();
    return userData;
  } catch (error) {
    console.error("Failed to fetch user profile:", error);
    return null;
  }
}

/**
 * Hook for accessing and managing user profile data.
 *
 * @returns Object containing:
 * - `user`: The current user profile or null if not authenticated
 * - `isLoading`: Whether the initial fetch is in progress
 * - `isValidating`: Whether a revalidation is in progress
 * - `error`: Any error that occurred during fetching
 * - `mutateUser`: Function to trigger a revalidation
 */
export function useUser() {
  const {
    data: user,
    error,
    isLoading,
    isValidating,
    mutate: swrMutate,
  } = useSWR<UserProfileDto | null>(USER_PROFILE_CACHE_KEY, fetchUserProfile, {
    // Disable revalidateOnFocus to prevent avatar flash when switching browser tabs
    // User data is stable and doesn't need constant refreshing
    // Data is still refreshed: on mount, after profile updates, or via manual refresh
    revalidateOnFocus: false,
    // Don't retry on error (user might not be authenticated)
    shouldRetryOnError: false,
    // Keep stale data while revalidating for smoother UX
    revalidateOnMount: true,
    // Dedupe requests within 2 seconds
    dedupingInterval: 2000,
  });

  return {
    user: user ?? null,
    isLoading,
    isValidating,
    error,
    mutateUser: swrMutate,
  };
}

/**
 * Utility function to globally revalidate user profile.
 * Can be called from anywhere (including non-React contexts).
 *
 * @example
 * // After successful profile picture upload
 * await revalidateUserProfile();
 */
export async function revalidateUserProfile(): Promise<void> {
  await mutate(USER_PROFILE_CACHE_KEY);
}

/**
 * Utility function to optimistically clear the profile picture URL from user cache.
 * This provides immediate UI feedback when deleting a profile picture,
 * without waiting for the server response.
 *
 * @example
 * // Before deleting profile picture
 * clearUserProfilePicture();
 * await backendApi.profilePicture.delete();
 * await revalidateUserProfile();
 */
export function clearUserProfilePicture(): void {
  mutate(
    USER_PROFILE_CACHE_KEY,
    (currentData: UserProfileDto | null | undefined) => {
      if (!currentData) return currentData;
      return {
        ...currentData,
        profilePictureUrl: null,
      };
    },
    { revalidate: false },
  );
}

/**
 * Utility function to clear user profile from cache.
 * Should be called on logout.
 */
export function clearUserProfile(): void {
  mutate(USER_PROFILE_CACHE_KEY, null, { revalidate: false });
}
