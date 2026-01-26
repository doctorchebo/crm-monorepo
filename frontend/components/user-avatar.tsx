"use client";

import { SmartAvatar, SmartAvatarProps } from "@/components/smart-avatar";

/**
 * Props for UserAvatar component
 * Extends SmartAvatarProps to maintain full compatibility
 */
export interface UserAvatarProps extends Omit<
  SmartAvatarProps,
  "hasProfilePicture"
> {
  /** URL to the user's profile picture */
  profilePictureUrl?: string | null;
}

/**
 * UserAvatar component
 *
 * A thin wrapper around SmartAvatar that provides a simpler API
 * for common avatar use cases. Automatically determines hasProfilePicture
 * from the profilePictureUrl prop.
 *
 * For cases where you need explicit loading state control,
 * use SmartAvatar directly.
 *
 * @example
 * // Basic usage - automatically handles loading and fallback
 * <UserAvatar name="John Doe" profilePictureUrl="https://..." />
 *
 * // With custom size
 * <UserAvatar name="Jane" size="lg" />
 *
 * // With ring indicator (e.g., for online status)
 * <UserAvatar name="Bob" showRing ringColor="ring-green-500" />
 *
 * // With loading state
 * <UserAvatar name="Bob" isLoading={isLoading} />
 */
export function UserAvatar({ profilePictureUrl, ...props }: UserAvatarProps) {
  return (
    <SmartAvatar
      {...props}
      profilePictureUrl={profilePictureUrl}
      hasProfilePicture={!!profilePictureUrl}
    />
  );
}

/**
 * Get initials from user name or email
 * Re-exported from SmartAvatar for backward compatibility
 */
export { getInitials } from "@/components/smart-avatar";
