"use client";

/**
 * AudioUnlockInitializer
 *
 * A component that imports the notification sound module as early as possible
 * to set up audio unlock listeners before any user interaction.
 *
 * This should be placed high in the component tree (e.g., in the root layout)
 * to ensure audio can be unlocked on the very first click.
 */

// Import the module for its side effects (sets up global listeners)
import "@/hooks/use-notification-sound";

export function AudioUnlockInitializer() {
  // This component doesn't render anything - it just ensures
  // the notification sound module is imported early
  return null;
}
