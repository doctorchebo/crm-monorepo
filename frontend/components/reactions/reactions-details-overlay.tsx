"use client";

/**
 * Reactions Details Overlay Component
 *
 * A floating overlay that shows detailed information about reactions on a message.
 * Features:
 * - Tabbed interface: "All" + one tab per unique emoji
 * - List of reactors with avatar, name, and emoji
 * - Current user shown as "You" with "Click to remove" option
 * - Dynamic positioning to stay within viewport
 * - Click outside or press Escape to close
 */

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { UnifiedReaction } from "./types";
import { getUniqueEmojis, groupReactionsByEmoji, isOwnReaction } from "./types";

interface ReactionsDetailsOverlayProps {
  /** All reactions to display */
  reactions: UnifiedReaction[];
  /** Current user's ID (to identify own reaction) */
  currentUserId?: number;
  /** Name to show for customer */
  customerName?: string;
  /** Whether the overlay is open */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** Handler for removing current user's reaction */
  onRemoveReaction?: (emoji: string) => void;
  /** Anchor element for positioning */
  anchorRef: React.RefObject<HTMLElement>;
  /** Message direction for positioning preference */
  isOutbound: boolean;
}

interface ReactorRowProps {
  reaction: UnifiedReaction;
  isCurrentUser: boolean;
  displayName: string;
  onRemove?: () => void;
}

/**
 * Single reactor row in the list
 */
const ReactorRow = memo(function ReactorRow({
  reaction,
  isCurrentUser,
  displayName,
  onRemove,
}: ReactorRowProps) {
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <button
      type="button"
      onClick={isCurrentUser && onRemove ? onRemove : undefined}
      disabled={!isCurrentUser || !onRemove}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
        isCurrentUser && onRemove
          ? "hover:bg-destructive/10 cursor-pointer"
          : "cursor-default"
      )}
    >
      {/* Avatar */}
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarFallback
          className={cn(
            "text-xs font-medium",
            reaction.type === "customer"
              ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
              : "bg-primary/10 text-primary"
          )}
        >
          {initials}
        </AvatarFallback>
      </Avatar>

      {/* Name and action hint */}
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm font-medium truncate">
          {isCurrentUser ? "You" : displayName}
        </p>
        {isCurrentUser && onRemove && (
          <p className="text-xs text-muted-foreground">Click to remove</p>
        )}
      </div>

      {/* Emoji */}
      <span className="text-lg flex-shrink-0">{reaction.emoji}</span>
    </button>
  );
});

/**
 * Tab button component
 */
interface TabButtonProps {
  label: string;
  emoji?: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
}

const TabButton = memo(function TabButton({
  label,
  emoji,
  count,
  isActive,
  onClick,
}: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
        "whitespace-nowrap",
        isActive
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted text-muted-foreground hover:text-foreground"
      )}
    >
      {emoji && <span className="text-base">{emoji}</span>}
      <span>{label}</span>
      <span
        className={cn(
          "text-xs px-1.5 py-0.5 rounded-full",
          isActive ? "bg-primary-foreground/20" : "bg-muted-foreground/20"
        )}
      >
        {count}
      </span>
    </button>
  );
});

export const ReactionsDetailsOverlay = memo(function ReactionsDetailsOverlay({
  reactions,
  currentUserId,
  customerName = "Customer",
  isOpen,
  onClose,
  onRemoveReaction,
  anchorRef,
  isOutbound,
}: ReactionsDetailsOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [activeTab, setActiveTab] = useState<string>("all");
  const [isMounted, setIsMounted] = useState(false);

  // Group reactions for tabs
  const groups = useMemo(() => groupReactionsByEmoji(reactions), [reactions]);
  const uniqueEmojis = useMemo(() => getUniqueEmojis(reactions), [reactions]);

  // Filter reactions based on active tab
  const filteredReactions = useMemo(() => {
    if (activeTab === "all") return reactions;
    return reactions.filter((r) => r.emoji === activeTab);
  }, [reactions, activeTab]);

  // Get display name for a reaction
  const getDisplayName = useCallback(
    (reaction: UnifiedReaction): string => {
      if (reaction.type === "crm") {
        return reaction.userName || `User ${reaction.userId}`;
      }
      return reaction.senderName || customerName;
    },
    [customerName]
  );

  // Handle client-side mounting for portal
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  // Calculate position based on anchor element
  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current || !overlayRef.current) return;

    const anchor = anchorRef.current;
    const overlay = overlayRef.current;
    const anchorRect = anchor.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const padding = 8;
    const overlayWidth = Math.min(280, viewportWidth - padding * 2);
    const overlayHeight = overlayRect.height || 300;

    // Calculate initial position (above the anchor, aligned based on message direction)
    let top = anchorRect.top - overlayHeight - padding;
    let left = isOutbound ? anchorRect.right - overlayWidth : anchorRect.left;

    // Adjust if goes above viewport
    if (top < padding) {
      top = anchorRect.bottom + padding;
    }

    // Adjust if goes below viewport
    if (top + overlayHeight > viewportHeight - padding) {
      top = viewportHeight - overlayHeight - padding;
    }

    // Adjust horizontal position if goes off screen
    if (left < padding) {
      left = padding;
    }
    if (left + overlayWidth > viewportWidth - padding) {
      left = viewportWidth - overlayWidth - padding;
    }

    setPosition({ top, left });
  }, [isOpen, anchorRef, isOutbound]);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        overlayRef.current &&
        !overlayRef.current.contains(event.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose, anchorRef]);

  // Reset to "all" tab when reactions change
  useEffect(() => {
    if (!uniqueEmojis.includes(activeTab) && activeTab !== "all") {
      setActiveTab("all");
    }
  }, [uniqueEmojis, activeTab]);

  // Handle reaction removal
  const handleRemove = useCallback(
    (reaction: UnifiedReaction) => {
      if (isOwnReaction(reaction, currentUserId) && onRemoveReaction) {
        onRemoveReaction(reaction.emoji);
        onClose();
      }
    },
    [currentUserId, onRemoveReaction, onClose]
  );

  if (!isOpen || !isMounted) return null;

  const overlayContent = (
    <div
      ref={overlayRef}
      className={cn(
        "fixed z-50 w-[280px] max-h-[320px] overflow-hidden",
        "bg-popover border border-border rounded-xl shadow-lg",
        "animate-in fade-in-0 zoom-in-95 duration-150"
      )}
      style={{
        top: position.top,
        left: position.left,
      }}
      role="dialog"
      aria-label="Reaction details"
    >
      {/* Header with close button */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <h3 className="text-sm font-semibold">Reactions</h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-full hover:bg-muted transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-2 py-2 border-b overflow-x-auto scrollbar-thin">
        <TabButton
          label="All"
          count={reactions.length}
          isActive={activeTab === "all"}
          onClick={() => setActiveTab("all")}
        />
        {groups.map((group) => (
          <TabButton
            key={group.emoji}
            label=""
            emoji={group.emoji}
            count={group.count}
            isActive={activeTab === group.emoji}
            onClick={() => setActiveTab(group.emoji)}
          />
        ))}
      </div>

      {/* Reactor list */}
      <div className="overflow-y-auto max-h-[200px] py-1">
        {filteredReactions.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground text-center">
            No reactions
          </p>
        ) : (
          filteredReactions.map((reaction) => {
            const isOwn = isOwnReaction(reaction, currentUserId);
            const key =
              reaction.type === "crm"
                ? `crm-${reaction.userId}`
                : `customer-${reaction.senderPhone}`;

            return (
              <ReactorRow
                key={key}
                reaction={reaction}
                isCurrentUser={isOwn}
                displayName={getDisplayName(reaction)}
                onRemove={isOwn ? () => handleRemove(reaction) : undefined}
              />
            );
          })
        )}
      </div>
    </div>
  );

  // Render in portal to avoid stacking context issues
  return createPortal(overlayContent, document.body);
});

ReactionsDetailsOverlay.displayName = "ReactionsDetailsOverlay";
