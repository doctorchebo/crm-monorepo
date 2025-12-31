"use client";

/**
 * Message Reaction Display Component
 * Shows the reaction emoji on a message bubble with a pop animation
 * Positioned at bottom-left (inbound) or bottom-right (outbound)
 */

import { cn } from "@/lib/utils";
import { memo, useEffect, useState } from "react";

interface MessageReactionDisplayProps {
  /** The emoji to display */
  emoji: string;
  /** Whether this is an outbound message */
  isOutbound: boolean;
  /** User who reacted (for tooltip) */
  userName?: string;
  /** Click handler to change/remove reaction */
  onClick?: () => void;
  /** Whether this is the current user's reaction */
  isOwnReaction?: boolean;
  /** Whether to animate the pop effect */
  animate?: boolean;
}

/**
 * Displays a single reaction on a message bubble
 * Features:
 * - Positioned at bottom corner of bubble
 * - Circular background for contrast
 * - Pop animation on new reactions
 * - Click to change/remove reaction
 */
export const MessageReactionDisplay = memo(function MessageReactionDisplay({
  emoji,
  isOutbound,
  userName,
  onClick,
  isOwnReaction,
  animate = false,
}: MessageReactionDisplayProps) {
  const [showPop, setShowPop] = useState(false);

  // Trigger pop animation when animate prop changes to true
  useEffect(() => {
    if (animate) {
      setShowPop(true);
      const timer = setTimeout(() => setShowPop(false), 300);
      return () => clearTimeout(timer);
    }
  }, [animate, emoji]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // Base styles - positioned further down to not overlap timestamp/status
        "absolute -bottom-5 z-10",
        "flex items-center justify-center",
        "w-7 h-7 rounded-full",
        // Background with border for contrast against chat background
        "bg-background border-2 border-border shadow-sm",
        // Hover state
        "hover:scale-110 transition-transform duration-150",
        // Focus styles
        "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1",
        // Position based on message direction
        isOutbound ? "-right-1" : "-left-1",
        // Pop animation
        showPop && "animate-reaction-pop"
      )}
      title={
        userName ? `${userName} reacted with ${emoji}` : `Reacted with ${emoji}`
      }
      aria-label={
        isOwnReaction
          ? `Your reaction: ${emoji}. Click to change.`
          : `Reaction: ${emoji}`
      }
    >
      <span className="text-base leading-none select-none">{emoji}</span>
    </button>
  );
});

MessageReactionDisplay.displayName = "MessageReactionDisplay";
