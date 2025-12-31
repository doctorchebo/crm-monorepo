"use client";

/**
 * Reaction Trigger Component
 * Shows an emoji icon on message hover that opens the reaction picker
 * Positioned on the opposite side of the message bubble
 */

import { useEmojiPickerContextOptional } from "@/components/emoji-picker/emoji-picker-context";
import { FloatingEmojiPicker } from "@/components/emoji-picker/floating-emoji-picker";
import {
  DEFAULT_QUICK_REACTIONS,
  Emoji,
} from "@/components/emoji-picker/types";
import { cn } from "@/lib/utils";
import { SmilePlus } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

interface ReactionTriggerProps {
  /** Whether this is an outbound message */
  isOutbound: boolean;
  /** Callback when a reaction is selected */
  onReactionSelect: (emoji: string) => void;
  /** Current user's reaction (if any) */
  currentReaction?: string;
  /** Container ref for position calculations */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Additional class names */
  className?: string;
}

interface QuickReactionsPosition {
  top: number;
  left: number;
  placement: "above" | "below";
}

/**
 * The reaction trigger icon that appears on message hover
 * Opens a quick reactions bar first, then full picker on "+" click
 */
export const ReactionTrigger = memo(function ReactionTrigger({
  isOutbound,
  onReactionSelect,
  currentReaction,
  containerRef,
  className,
}: ReactionTriggerProps) {
  const [showQuickReactions, setShowQuickReactions] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const [quickReactionsPosition, setQuickReactionsPosition] =
    useState<QuickReactionsPosition | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const quickReactionsRef = useRef<HTMLDivElement>(null);
  const fullPickerTriggerRef = useRef<HTMLButtonElement>(null);

  const { addRecentEmoji } = useEmojiPickerContextOptional();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Calculate position for quick reactions bar
  const calculateQuickReactionsPosition = useCallback(() => {
    if (!triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    // Quick reactions bar dimensions (approximate)
    const barHeight = 44;
    const barWidth = 280;

    // Determine if we should show above or below
    const spaceAbove = triggerRect.top;
    const spaceBelow = viewportHeight - triggerRect.bottom;
    const placement: "above" | "below" =
      spaceBelow < barHeight + 20 ? "above" : "below";

    let top: number;
    if (placement === "above") {
      top = triggerRect.top - barHeight - 8;
    } else {
      top = triggerRect.bottom + 8;
    }

    // Position horizontally based on message direction
    let left: number;
    if (isOutbound) {
      // For outbound messages, align to the left of the trigger
      left = triggerRect.left - barWidth + triggerRect.width;
    } else {
      // For inbound messages, align to the right of the trigger
      left = triggerRect.left;
    }

    // Ensure it stays within viewport
    const viewportWidth = window.innerWidth;
    if (left < 10) left = 10;
    if (left + barWidth > viewportWidth - 10) {
      left = viewportWidth - barWidth - 10;
    }

    setQuickReactionsPosition({ top, left, placement });
  }, [isOutbound]);

  // Calculate position immediately when showing
  useLayoutEffect(() => {
    if (showQuickReactions) {
      calculateQuickReactionsPosition();
    }
  }, [showQuickReactions, calculateQuickReactionsPosition]);

  // Recalculate on scroll/resize
  useEffect(() => {
    if (!showQuickReactions) return;

    const handleUpdate = () => calculateQuickReactionsPosition();
    window.addEventListener("scroll", handleUpdate, true);
    window.addEventListener("resize", handleUpdate);

    return () => {
      window.removeEventListener("scroll", handleUpdate, true);
      window.removeEventListener("resize", handleUpdate);
    };
  }, [showQuickReactions, calculateQuickReactionsPosition]);

  // Handle click outside to close
  useEffect(() => {
    if (!showQuickReactions && !showFullPicker) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Don't close if clicking on trigger
      if (triggerRef.current?.contains(target)) return;

      // Don't close if clicking on quick reactions
      if (quickReactionsRef.current?.contains(target)) return;

      // Don't close quick reactions if full picker is open and clicking in it
      if (showFullPicker) return;

      setShowQuickReactions(false);
    };

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showQuickReactions, showFullPicker]);

  // Handle escape key
  useEffect(() => {
    if (!showQuickReactions && !showFullPicker) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowQuickReactions(false);
        setShowFullPicker(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showQuickReactions, showFullPicker]);

  const handleTriggerClick = useCallback(() => {
    setShowQuickReactions((prev) => !prev);
    setShowFullPicker(false);
  }, []);

  const handleQuickReaction = useCallback(
    (emoji: string) => {
      addRecentEmoji(emoji);
      onReactionSelect(emoji);
      setShowQuickReactions(false);
    },
    [onReactionSelect, addRecentEmoji]
  );

  const handleMoreClick = useCallback(() => {
    setShowFullPicker(true);
  }, []);

  const handleFullPickerSelect = useCallback(
    (emoji: Emoji) => {
      onReactionSelect(emoji.native);
      setShowQuickReactions(false);
      setShowFullPicker(false);
    },
    [onReactionSelect]
  );

  const handleFullPickerClose = useCallback(() => {
    setShowFullPicker(false);
    setShowQuickReactions(false);
  }, []);

  return (
    <>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        className={cn(
          // Base styles
          "flex items-center justify-center",
          "w-8 h-8 rounded-full",
          // Colors
          "text-muted-foreground hover:text-foreground",
          "hover:bg-muted/80",
          // Transition
          "transition-all duration-150",
          // Focus styles
          "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1",
          // Active state
          showQuickReactions && "bg-muted/80 text-foreground",
          className
        )}
        aria-label={currentReaction ? "Change reaction" : "Add reaction"}
        aria-expanded={showQuickReactions}
        aria-haspopup="true"
      >
        <SmilePlus className="h-5 w-5" />
      </button>

      {/* Quick reactions bar (portal to body) */}
      {showQuickReactions &&
        quickReactionsPosition &&
        isMounted &&
        createPortal(
          <div
            ref={quickReactionsRef}
            className={cn(
              "fixed z-50",
              "flex items-center gap-0.5 p-1.5",
              "bg-popover rounded-full shadow-lg border border-border",
              "animate-in fade-in-0 zoom-in-95 duration-150"
            )}
            style={{
              top: quickReactionsPosition.top,
              left: quickReactionsPosition.left,
              transformOrigin:
                quickReactionsPosition.placement === "above"
                  ? "bottom center"
                  : "top center",
            }}
            role="group"
            aria-label="Quick reactions"
          >
            {DEFAULT_QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleQuickReaction(emoji)}
                className={cn(
                  "flex items-center justify-center w-9 h-9 rounded-full",
                  "text-xl hover:bg-muted hover:scale-125 transition-all duration-150",
                  "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1",
                  // Highlight if this is the current reaction
                  currentReaction === emoji && "bg-muted ring-2 ring-primary/30"
                )}
                title={`React with ${emoji}`}
                aria-label={`React with ${emoji}`}
                aria-pressed={currentReaction === emoji}
              >
                {emoji}
              </button>
            ))}

            {/* More button to open full picker */}
            <button
              ref={fullPickerTriggerRef}
              type="button"
              onClick={handleMoreClick}
              className={cn(
                "flex items-center justify-center w-9 h-9 rounded-full",
                "text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1",
                showFullPicker && "bg-muted text-foreground"
              )}
              title="More reactions"
              aria-label="More reactions"
              aria-expanded={showFullPicker}
            >
              <span className="text-lg">+</span>
            </button>
          </div>,
          document.body
        )}

      {/* Full emoji picker */}
      <FloatingEmojiPicker
        isOpen={showFullPicker}
        onClose={handleFullPickerClose}
        onEmojiSelect={handleFullPickerSelect}
        triggerRef={fullPickerTriggerRef}
        placement={
          quickReactionsPosition?.placement === "above"
            ? "top-end"
            : "bottom-end"
        }
      />
    </>
  );
});

ReactionTrigger.displayName = "ReactionTrigger";
