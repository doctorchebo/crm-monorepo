"use client";

import { cn } from "@/lib/utils";
import { getContrastTextColor } from "./label-colors";

interface LabelBadgeProps {
  name: string;
  color: string;
  emoji?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  onRemove?: () => void;
  onClick?: () => void;
}

/**
 * A badge component for displaying a label with color, emoji, and optional remove action
 */
export function LabelBadge({
  name,
  color,
  emoji,
  size = "md",
  className,
  onRemove,
  onClick,
}: LabelBadgeProps) {
  const textColor = getContrastTextColor(color);

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5 gap-1",
    md: "text-sm px-2 py-0.5 gap-1.5",
    lg: "text-base px-2.5 py-1 gap-2",
  };

  const emojiSizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium transition-colors",
        sizeClasses[size],
        onClick && "cursor-pointer hover:opacity-80",
        className,
      )}
      style={{ backgroundColor: color, color: textColor }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {emoji && <span className={emojiSizes[size]}>{emoji}</span>}
      <span className="truncate max-w-[120px]">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 p-0.5 -mr-1"
          aria-label={`Remove ${name} label`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size === "sm" ? 12 : size === "md" ? 14 : 16}
            height={size === "sm" ? 12 : size === "md" ? 14 : 16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </span>
  );
}

interface LabelBadgeListProps {
  labels: Array<{
    id: string;
    name: string;
    color: string;
    emoji?: string | null;
  }>;
  size?: "sm" | "md" | "lg";
  maxVisible?: number;
  className?: string;
  onRemove?: (labelId: string) => void;
}

/**
 * A component for displaying a list of label badges with optional overflow indicator
 */
export function LabelBadgeList({
  labels,
  size = "sm",
  maxVisible = 3,
  className,
  onRemove,
}: LabelBadgeListProps) {
  if (labels.length === 0) return null;

  const visibleLabels = labels.slice(0, maxVisible);
  const overflowCount = labels.length - maxVisible;

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {visibleLabels.map((label) => (
        <LabelBadge
          key={label.id}
          name={label.name}
          color={label.color}
          emoji={label.emoji}
          size={size}
          onRemove={onRemove ? () => onRemove(label.id) : undefined}
        />
      ))}
      {overflowCount > 0 && (
        <span
          className={cn(
            "text-muted-foreground font-medium",
            size === "sm" && "text-xs",
            size === "md" && "text-sm",
            size === "lg" && "text-base",
          )}
        >
          +{overflowCount}
        </span>
      )}
    </div>
  );
}
