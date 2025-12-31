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
  /** Whether this is a customer reaction (from WhatsApp user) */
  isCustomerReaction?: boolean;
}

/**
 * Displays a single reaction on a message bubble
 * Features:
 * - Positioned at bottom corner of bubble (via parent container)
 * - Circular background for contrast
 * - Pop animation on new reactions
 * - Click to change/remove reaction
 * - Visual distinction for customer reactions
 */
export const MessageReactionDisplay = memo(function MessageReactionDisplay({
  emoji,
  isOutbound,
  userName,
  onClick,
  isOwnReaction,
  animate = false,
  isCustomerReaction = false,
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
        // Base styles
        "z-10",
        "flex items-center justify-center",
        "w-7 h-7 rounded-full",
        // Background with border for contrast against chat background
        "bg-background border-2 shadow-sm",
        // Customer reactions have a slightly different border color
        isCustomerReaction
          ? "border-green-300 dark:border-green-600"
          : "border-border",
        // Hover state
        "hover:scale-110 transition-transform duration-150",
        // Focus styles
        "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1",
        // Pop animation
        showPop && "animate-reaction-pop"
      )}
      title={
        isCustomerReaction
          ? `${userName || "Customer"} reacted with ${emoji}`
          : userName
          ? `${userName} reacted with ${emoji}`
          : `Reacted with ${emoji}`
      }
      aria-label={
        isOwnReaction
          ? `Your reaction: ${emoji}. Click to change.`
          : isCustomerReaction
          ? `Customer reaction: ${emoji}`
          : `Reaction: ${emoji}`
      }
    >
      <span className="text-base leading-none select-none">{emoji}</span>
    </button>
  );
});

MessageReactionDisplay.displayName = "MessageReactionDisplay";
