/**
 * SmartAvatar Component
 *
 * An intelligent avatar component that handles loading states gracefully:
 * - Shows a skeleton placeholder while image is loading (not fallback initials)
 * - Shows fallback initials only when there's no profile picture
 * - Prevents the jarring flash of initials before image loads
 * - Supports various sizes and optional ring indicator
 *
 * This component is designed to be used wherever user avatars are displayed,
 * providing a consistent and polished loading experience.
 *
 * @example
 * // Basic usage - will show skeleton until image loads
 * <SmartAvatar
 *   name="John Doe"
 *   profilePictureUrl="https://..."
 * />
 *
 * // With skeleton while data is loading
 * <SmartAvatar
 *   name="John Doe"
 *   isLoading={true}
 * />
 *
 * // No profile picture - shows initials directly (no flash)
 * <SmartAvatar
 *   name="John Doe"
 *   hasProfilePicture={false}
 * />
 */

"use client";

import { cn } from "@/lib/utils";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Props for SmartAvatar component
 */
export interface SmartAvatarProps {
  /** User's name for generating initials */
  name?: string | null;
  /** User's email (used for initials if name not available) */
  email?: string | null;
  /** URL to the user's profile picture */
  profilePictureUrl?: string | null;
  /** Size variant */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Additional CSS classes */
  className?: string;
  /** Show a colored ring around the avatar */
  showRing?: boolean;
  /** Ring color (Tailwind color class) */
  ringColor?: string;
  /**
   * External loading state (e.g., from API fetch).
   * When true, shows skeleton regardless of image state.
   */
  isLoading?: boolean;
  /**
   * Explicitly indicate if user has a profile picture.
   * When false, skips image loading and shows fallback directly.
   * When undefined, component tries to load the URL if provided.
   */
  hasProfilePicture?: boolean;
  /** Alt text for the image */
  alt?: string;
}

/**
 * Size mappings for avatar dimensions
 */
const sizeClasses = {
  xs: "h-6 w-6 text-xs",
  sm: "h-8 w-8 text-sm",
  md: "h-10 w-10 text-base",
  lg: "h-12 w-12 text-lg",
  xl: "h-16 w-16 text-xl",
};

/**
 * Get initials from user name or email
 */
function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0]?.substring(0, 2).toUpperCase() || "U";
  }
  if (email) {
    return email.split("@")[0].substring(0, 2).toUpperCase();
  }
  return "U";
}

/**
 * Generate a consistent background color based on the user's name/email
 * This ensures the same user always gets the same color
 */
function getAvatarColor(name?: string | null, email?: string | null): string {
  const str = name || email || "default";
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  // List of pleasant background colors
  const colors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-yellow-500",
    "bg-purple-500",
    "bg-pink-500",
    "bg-indigo-500",
    "bg-teal-500",
    "bg-orange-500",
    "bg-cyan-500",
    "bg-rose-500",
  ];

  return colors[Math.abs(hash) % colors.length];
}

/**
 * Image loading status
 */
type ImageStatus = "idle" | "loading" | "loaded" | "error";

/**
 * SmartAvatar component
 *
 * Displays a user avatar with intelligent loading behavior:
 * - Shows skeleton while loading (prevents initials flash)
 * - Shows profile picture when loaded
 * - Shows colored initials fallback only when no picture exists
 */
export function SmartAvatar({
  name,
  email,
  profilePictureUrl,
  size = "md",
  className,
  showRing = false,
  ringColor = "ring-primary",
  isLoading = false,
  hasProfilePicture,
  alt,
}: SmartAvatarProps) {
  const [imageStatus, setImageStatus] = useState<ImageStatus>("idle");
  const imgRef = useRef<HTMLImageElement>(null);
  const initials = getInitials(name, email);
  const bgColor = getAvatarColor(name, email);

  // Track which URL was successfully loaded to prevent flashing during re-renders
  const loadedUrlRef = useRef<string | null>(null);

  // Determine if we should try to load the image
  // If hasProfilePicture is explicitly false, don't try to load
  // If hasProfilePicture is undefined, check if URL exists
  const shouldLoadImage =
    hasProfilePicture === false ? false : Boolean(profilePictureUrl);

  // Check if we already have the current URL loaded (handles re-renders without state changes)
  const isCurrentUrlLoaded =
    shouldLoadImage &&
    profilePictureUrl &&
    loadedUrlRef.current === profilePictureUrl;

  // Handle URL changes - only reset state when URL actually changes to a different value
  useEffect(() => {
    if (!shouldLoadImage) {
      // When hasProfilePicture becomes false or URL is removed, reset
      setImageStatus("idle");
      loadedUrlRef.current = null;
    } else if (
      profilePictureUrl &&
      loadedUrlRef.current !== profilePictureUrl
    ) {
      // URL changed to a different value, start loading
      setImageStatus("loading");
    }
    // Note: If URL is the same, we don't change state at all
  }, [profilePictureUrl, shouldLoadImage]);

  // Check if image is already loaded (cached) on mount or when URL changes
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current?.naturalHeight > 0) {
      setImageStatus("loaded");
    }
  }, [profilePictureUrl]);

  // Image load handler - memoized with no dependencies to remain stable
  const handleImageLoad = useCallback(() => {
    setImageStatus("loaded");
  }, []);

  // Update loadedUrlRef when image loads - use effect to sync ref with current URL
  useEffect(() => {
    if (imageStatus === "loaded" && profilePictureUrl) {
      loadedUrlRef.current = profilePictureUrl;
    }
  }, [imageStatus, profilePictureUrl]);

  // Image error handler
  const handleImageError = useCallback(() => {
    setImageStatus("error");
    loadedUrlRef.current = null;
  }, []);

  // Determine what to show
  // Key insight: when hasProfilePicture is explicitly false, ALWAYS show fallback
  // This ensures proper display after profile picture deletion
  const explicitlyNoProfilePicture = hasProfilePicture === false;

  const showSkeleton =
    isLoading ||
    (!explicitlyNoProfilePicture &&
      shouldLoadImage &&
      imageStatus === "loading" &&
      !isCurrentUrlLoaded);

  const showImage =
    !isLoading &&
    !explicitlyNoProfilePicture &&
    shouldLoadImage &&
    profilePictureUrl &&
    (imageStatus === "loaded" || isCurrentUrlLoaded);

  // Show fallback when: not loading, not showing skeleton, not showing image
  // OR when explicitly told there's no profile picture
  const showFallback =
    explicitlyNoProfilePicture || (!isLoading && !showSkeleton && !showImage);

  return (
    <AvatarPrimitive.Root
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full",
        sizeClasses[size],
        showRing && `ring-2 ring-offset-2 ${ringColor}`,
        className,
      )}
    >
      {/* Skeleton loader */}
      {showSkeleton && (
        <div
          className={cn(
            "absolute inset-0 rounded-full",
            "bg-muted animate-pulse",
          )}
          aria-hidden="true"
        />
      )}

      {/* Image - always render when we should load, but control visibility */}
      {/* This ensures onLoad fires even for cached images */}
      {shouldLoadImage && profilePictureUrl && (
        <img
          ref={imgRef}
          src={profilePictureUrl}
          alt={alt || name || email || "User avatar"}
          className={cn(
            "aspect-square h-full w-full object-cover",
            // Hide while loading, show when loaded
            !showImage && "invisible",
          )}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      )}

      {/* Fallback with initials */}
      {showFallback && (
        <div
          className={cn(
            "flex h-full w-full items-center justify-center rounded-full",
            bgColor,
            "text-white font-medium",
          )}
        >
          {initials}
        </div>
      )}
    </AvatarPrimitive.Root>
  );
}

/**
 * Export helpers for external use
 */
export { getAvatarColor, getInitials };
