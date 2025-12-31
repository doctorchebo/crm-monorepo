"use client";

/**
 * Reactions Summary Component
 *
 * Displays aggregated reactions on a message bubble.
 * Shows emoji(s) with count, clickable to open details overlay.
 *
 * Features:
 * - Shows up to 3 unique emojis
 * - Displays total count if > 1
 * - Pop animation on new reactions
 * - Click to open details overlay
 */

import { cn } from "@/lib/utils";
import { memo, useEffect, useState } from "react";
import type { UnifiedReaction } from "./types";
import { groupReactionsByEmoji } from "./types";

interface ReactionsSummaryProps {
  /** All reactions on this message */
  reactions: UnifiedReaction[];
  /** Whether this is an outbound message (affects positioning) */
  isOutbound: boolean;
  /** Whether to animate (new reaction added) */
  animate?: boolean;
  /** Click handler to open details */
  onClick: () => void;
}

/**
 * Maximum number of unique emojis to display inline
 */
const MAX_VISIBLE_EMOJIS = 3;

export const ReactionsSummary = memo(function ReactionsSummary({
  reactions,
  isOutbound,
  animate = false,
  onClick,
}: ReactionsSummaryProps) {
  const [showPop, setShowPop] = useState(false);

  // Group reactions by emoji
  const groups = groupReactionsByEmoji(reactions);
  const totalCount = reactions.length;
  const visibleGroups = groups.slice(0, MAX_VISIBLE_EMOJIS);
  const hasMore = groups.length > MAX_VISIBLE_EMOJIS;

  // Trigger pop animation
  useEffect(() => {
    if (animate) {
      setShowPop(true);
      const timer = setTimeout(() => setShowPop(false), 300);
      return () => clearTimeout(timer);
    }
  }, [animate, reactions.length]);

  if (reactions.length === 0) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // Base styles
        "z-10",
        "inline-flex items-center gap-0.5",
        "px-1.5 py-0.5 rounded-full",
        // Background with border for contrast
        "bg-background border shadow-sm",
        "border-border",
        // Hover state
        "hover:scale-105 hover:shadow-md transition-all duration-150",
        // Focus styles
        "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1",
        // Pop animation
        showPop && "animate-reaction-pop"
      )}
      aria-label={`${totalCount} reaction${
        totalCount !== 1 ? "s" : ""
      }. Click to see details.`}
    >
      {/* Emoji stack */}
      <span className="flex items-center -space-x-0.5">
        {visibleGroups.map((group, index) => (
          <span
            key={group.emoji}
            className="text-sm leading-none select-none"
            style={{ zIndex: MAX_VISIBLE_EMOJIS - index }}
          >
            {group.emoji}
          </span>
        ))}
        {hasMore && (
          <span className="text-xs text-muted-foreground ml-0.5">
            +{groups.length - MAX_VISIBLE_EMOJIS}
          </span>
        )}
      </span>

      {/* Count badge - only show if more than 1 reaction */}
      {totalCount > 1 && (
        <span className="text-xs font-medium text-muted-foreground ml-0.5">
          {totalCount}
        </span>
      )}
    </button>
  );
});

ReactionsSummary.displayName = "ReactionsSummary";
