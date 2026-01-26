/**
 * useProfilePicture Hook
 *
 * Centralized hook for managing profile picture data with automatic polling
 * during processing state. Provides immediate feedback when thumbnail
 * generation completes.
 *
 * Features:
 * - SWR-based caching with automatic revalidation
 * - Automatic polling (every 1s) when status is "processing" or "uploading"
 * - Stops polling automatically when status becomes "ready", "error", or "none"
 * - Shared cache key for consistent data across components
 * - Manual revalidation via `mutatePictureInfo`
 *
 * Usage:
 * ```tsx
 * const { pictureInfo, isLoading, isProcessing, isReady } = useProfilePicture();
 *
 * if (isProcessing) {
 *   return <Spinner />;
 * }
 *
 * if (isReady && pictureInfo?.thumbnailUrl) {
 *   return <img src={pictureInfo.thumbnailUrl} />;
 * }
 * ```
 */

import { backendApi, ProfilePictureInfoResponse } from "@/lib/api/endpoints";
import { useEffect, useRef } from "react";
import useSWR, { mutate } from "swr";
import { revalidateUserProfile } from "./use-user";

/**
 * SWR cache key for profile picture info.
 * This key is used across the application for consistent caching.
 */
export const PROFILE_PICTURE_CACHE_KEY = "profile-picture-info";

/**
 * Polling interval when status is "processing" (in milliseconds)
 */
const PROCESSING_POLL_INTERVAL = 1000;

/**
 * Maximum polling duration before giving up (in milliseconds)
 * 2 minutes should be more than enough for any thumbnail processing
 */
const MAX_POLLING_DURATION = 2 * 60 * 1000;

/**
 * Fetcher function for profile picture info.
 */
async function fetchProfilePictureInfo(): Promise<ProfilePictureInfoResponse> {
  return backendApi.profilePicture.getInfo();
}

/**
 * Hook for accessing and managing profile picture data.
 * Automatically polls when status is "processing" or "uploading".
 *
 * @returns Object containing:
 * - `pictureInfo`: The profile picture info or undefined
 * - `isLoading`: Whether the initial fetch is in progress
 * - `isValidating`: Whether a revalidation is in progress
 * - `isProcessing`: Whether the profile picture is being processed
 * - `isReady`: Whether the profile picture is ready to display
 * - `hasProfilePicture`: Whether user has a profile picture
 * - `error`: Any error that occurred during fetching
 * - `mutatePictureInfo`: Function to trigger a revalidation
 */
export function useProfilePicture() {
  const pollingStartTime = useRef<number | null>(null);

  const {
    data: pictureInfo,
    error,
    isLoading,
    isValidating,
    mutate: swrMutate,
  } = useSWR<ProfilePictureInfoResponse>(
    PROFILE_PICTURE_CACHE_KEY,
    fetchProfilePictureInfo,
    {
      // Disable revalidateOnFocus to prevent avatar flash when switching browser tabs
      // Profile picture data is stable and doesn't need constant refreshing
      // Data is still refreshed: on mount, after upload/delete, or via manual refresh
      revalidateOnFocus: false,
      // Retry on error
      shouldRetryOnError: true,
      errorRetryCount: 2,
      // Keep stale data while revalidating
      revalidateOnMount: true,
      // Dedupe requests within 500ms
      dedupingInterval: 500,
    },
  );

  // Derived status helpers
  const status = pictureInfo?.status ?? "none";
  const isProcessing = status === "processing" || status === "uploading";
  const isReady = status === "ready";
  const hasProfilePicture = pictureInfo?.hasProfilePicture ?? false;

  // Track previous status to detect transitions
  const previousStatusRef = useRef<string | null>(null);

  // When processing completes (status transitions to "ready"), update user profile
  // This ensures the header avatar updates with the new profile picture URL
  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = status;

    // Detect transition from processing/uploading to ready
    const wasProcessing =
      previousStatus === "processing" || previousStatus === "uploading";
    const isNowReady = status === "ready";

    if (wasProcessing && isNowReady) {
      // Processing complete - refresh user profile to update header avatar
      revalidateUserProfile();
    }
  }, [status]);

  // Automatic polling when processing
  useEffect(() => {
    if (!isProcessing) {
      // Reset polling start time when not processing
      pollingStartTime.current = null;
      return;
    }

    // Initialize polling start time
    if (pollingStartTime.current === null) {
      pollingStartTime.current = Date.now();
    }

    // Check if we've exceeded max polling duration
    const elapsedTime = Date.now() - pollingStartTime.current;
    if (elapsedTime > MAX_POLLING_DURATION) {
      console.warn(
        `Profile picture processing polling timed out after ${MAX_POLLING_DURATION / 1000}s`,
      );
      pollingStartTime.current = null;
      return;
    }

    // Set up polling interval
    const intervalId = setInterval(() => {
      // Only revalidate if still processing
      if (isProcessing) {
        swrMutate();
      }
    }, PROCESSING_POLL_INTERVAL);

    return () => clearInterval(intervalId);
  }, [isProcessing, swrMutate]);

  return {
    pictureInfo: pictureInfo ?? null,
    isLoading,
    isValidating,
    isProcessing,
    isReady,
    hasProfilePicture,
    error,
    mutatePictureInfo: swrMutate,
  };
}

/**
 * Utility function to globally revalidate profile picture info.
 * Can be called from anywhere (including non-React contexts).
 *
 * @example
 * // After successful profile picture upload
 * await revalidateProfilePicture();
 */
export async function revalidateProfilePicture(): Promise<void> {
  await mutate(PROFILE_PICTURE_CACHE_KEY);
}

/**
 * Utility function to clear profile picture from cache.
 * Should be called on logout or when profile picture is deleted.
 * Sets all fields to indicate no profile picture exists.
 */
export function clearProfilePictureCache(): void {
  mutate(
    PROFILE_PICTURE_CACHE_KEY,
    {
      hasProfilePicture: false,
      status: "none",
      thumbnailUrl: undefined,
      originalUrl: undefined,
      expiresIn: undefined,
    } as ProfilePictureInfoResponse,
    { revalidate: false },
  );
}
