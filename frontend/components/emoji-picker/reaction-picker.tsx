"use client";

/**
 * Reaction Picker
 * A compact emoji picker designed for message reactions
 * Shows quick reactions with an option to open the full picker
 *
 * This component is designed for future use when implementing
 * the message reactions feature. It provides:
 * - Quick access to common reactions
 * - Full emoji picker expansion
 * - Compact design for message hover state
 */

import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useEmojiPickerContextOptional } from "./emoji-picker-context";
import { FloatingEmojiPicker } from "./floating-emoji-picker";
import { DEFAULT_QUICK_REACTIONS, Emoji } from "./types";

interface ReactionPickerProps {
  onReactionSelect: (emoji: string) => void;
  quickReactions?: string[];
  className?: string;
  /** Whether to show the picker in a horizontal or vertical layout */
  layout?: "horizontal" | "vertical";
}

/**
 * Compact reaction picker with quick reactions and full picker option
 */
export function ReactionPicker({
  onReactionSelect,
  quickReactions = DEFAULT_QUICK_REACTIONS,
  className,
  layout = "horizontal",
}: ReactionPickerProps) {
  const [showFullPicker, setShowFullPicker] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const { addRecentEmoji } = useEmojiPickerContextOptional();

  const handleQuickReaction = useCallback(
    (emoji: string) => {
      addRecentEmoji(emoji);
      onReactionSelect(emoji);
    },
    [onReactionSelect, addRecentEmoji]
  );

  const handleFullPickerSelect = useCallback(
    (emoji: Emoji) => {
      onReactionSelect(emoji.native);
      setShowFullPicker(false);
    },
    [onReactionSelect]
  );

  const handleMoreClick = useCallback(() => {
    setShowFullPicker(true);
  }, []);

  const handleClosePicker = useCallback(() => {
    setShowFullPicker(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, emoji: string) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleQuickReaction(emoji);
      }
    },
    [handleQuickReaction]
  );

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 p-1 bg-popover rounded-full shadow-lg border border-border",
        layout === "vertical" && "flex-col",
        className
      )}
      role="group"
      aria-label="Reactions"
    >
      {/* Quick reactions */}
      {quickReactions.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => handleQuickReaction(emoji)}
          onKeyDown={(e) => handleKeyDown(e, emoji)}
          className={cn(
            "flex items-center justify-center w-8 h-8 rounded-full",
            "text-xl hover:bg-muted hover:scale-125 transition-all",
            "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
          )}
          title={`React with ${emoji}`}
          aria-label={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}

      {/* More button to open full picker */}
      <button
        ref={moreButtonRef}
        type="button"
        onClick={handleMoreClick}
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded-full",
          "text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1",
          showFullPicker && "bg-muted text-foreground"
        )}
        title="More reactions"
        aria-label="More reactions"
        aria-expanded={showFullPicker}
        aria-haspopup="dialog"
      >
        <Plus className="h-4 w-4" />
      </button>

      {/* Full emoji picker */}
      <FloatingEmojiPicker
        isOpen={showFullPicker}
        onClose={handleClosePicker}
        onEmojiSelect={handleFullPickerSelect}
        triggerRef={moreButtonRef}
        placement="top-end"
      />
    </div>
  );
}
