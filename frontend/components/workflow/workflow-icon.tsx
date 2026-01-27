"use client";

import { cn } from "@/lib/utils";
import {
  Bell,
  Calendar,
  Clock,
  HelpCircle,
  MessageSquare,
  Package,
  RefreshCw,
  ShoppingCart,
  Target,
  ThumbsUp,
  UserPlus,
  Workflow,
  type LucideIcon,
} from "lucide-react";

/**
 * Size presets for the workflow icon component.
 * Each size includes the container dimensions and appropriate text/icon sizes.
 */
const SIZE_PRESETS = {
  sm: {
    container: "w-6 h-6",
    emoji: "text-sm",
    icon: "h-3 w-3",
  },
  md: {
    container: "w-7 h-7",
    emoji: "text-base",
    icon: "h-3.5 w-3.5",
  },
  lg: {
    container: "w-8 h-8",
    emoji: "text-lg",
    icon: "h-4 w-4",
  },
  xl: {
    container: "w-10 h-10",
    emoji: "text-xl",
    icon: "h-5 w-5",
  },
} as const;

type IconSize = keyof typeof SIZE_PRESETS;

/**
 * Mapping of icon names to Lucide icons for workflow templates.
 * Use these names in the database instead of emojis to avoid encoding issues.
 */
const LUCIDE_ICON_MAP: Record<string, LucideIcon> = {
  // Template category icons
  target: Target,
  "message-square": MessageSquare,
  "shopping-cart": ShoppingCart,
  calendar: Calendar,
  bell: Bell,
  "user-plus": UserPlus,
  // Template icons
  "help-circle": HelpCircle,
  package: Package,
  "thumbs-up": ThumbsUp,
  clock: Clock,
  "refresh-cw": RefreshCw,
  workflow: Workflow,
};

/**
 * Default emoji to use when no valid icon is provided or when the icon
 * is a non-emoji string (like "workflow" from the database default).
 */
const DEFAULT_EMOJI = "⚡";

/**
 * List of known non-emoji icon values that should be replaced with the default.
 * The database schema defaults to "workflow" which is not an emoji.
 */
const NON_EMOJI_ICON_VALUES = ["workflow", "default", ""];

/**
 * Checks if a string is likely an emoji.
 * Emojis are typically 1-4 characters (with variation selectors and ZWJ sequences).
 * Non-emoji strings like "workflow" will fail this check.
 */
function isEmoji(str: string): boolean {
  if (!str || NON_EMOJI_ICON_VALUES.includes(str.toLowerCase())) {
    return false;
  }

  // If it's a known Lucide icon name, it's not an emoji
  if (LUCIDE_ICON_MAP[str.toLowerCase()]) {
    return false;
  }

  // Emoji regex pattern - matches most common emojis including:
  // - Basic emojis
  // - Emojis with skin tone modifiers
  // - Emojis with variation selectors
  // - ZWJ sequences (compound emojis like family, flags)
  const emojiRegex =
    /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*$/u;

  // Simple heuristic: if the string is short (1-8 chars) and contains emoji-like characters
  // This handles most emoji cases without being overly complex
  if (str.length <= 8) {
    // Check if it looks like an emoji (contains emoji characters)
    const containsEmoji = /\p{Emoji}/u.test(str);
    // And doesn't look like regular text (no letters/numbers only)
    const isNotPlainText = !/^[a-zA-Z0-9-]+$/.test(str);

    return containsEmoji || (isNotPlainText && str.length <= 4);
  }

  return false;
}

/**
 * Gets the Lucide icon component for a given icon name.
 * Returns null if the icon name is not found in the map.
 */
function getLucideIcon(iconName: string | null | undefined): LucideIcon | null {
  if (!iconName) return null;
  return LUCIDE_ICON_MAP[iconName.toLowerCase()] || null;
}

interface WorkflowIconProps {
  /**
   * The icon to display. Can be an emoji string or a text identifier.
   * If not provided or if it's a non-emoji value, displays the default emoji.
   */
  icon?: string | null;

  /**
   * The background color for the icon container.
   * Defaults to a nice indigo if not provided.
   */
  color?: string | null;

  /**
   * Size preset for the icon.
   * @default "md"
   */
  size?: IconSize;

  /**
   * Additional CSS classes for the container.
   */
  className?: string;

  /**
   * Whether to use the Lucide Workflow icon instead of an emoji
   * when no valid emoji is provided.
   * @default false
   */
  useLucideDefault?: boolean;
}

/**
 * WorkflowIcon - A reusable component for displaying workflow icons.
 *
 * Handles the complexity of workflow icon display:
 * - Displays emojis properly within the container bounds
 * - Falls back to a default emoji or Lucide icon for non-emoji values
 * - Supports multiple size presets
 * - Consistent styling across the application
 *
 * @example
 * // Basic usage with emoji
 * <WorkflowIcon icon="🚀" color="#6366f1" />
 *
 * @example
 * // With size preset
 * <WorkflowIcon icon="⚡" size="lg" />
 *
 * @example
 * // Falls back to default when icon is "workflow" (db default)
 * <WorkflowIcon icon="workflow" />
 */
export function WorkflowIcon({
  icon,
  color,
  size = "md",
  className,
  useLucideDefault = false,
}: WorkflowIconProps) {
  const sizePreset = SIZE_PRESETS[size];
  const backgroundColor = color || "#6366f1";

  // Check if the icon is a known Lucide icon name
  const LucideIconComponent = getLucideIcon(icon);

  // Determine what to display
  const displayEmoji = icon && isEmoji(icon) ? icon : null;
  const showLucideNamedIcon = !!LucideIconComponent;
  const showDefaultEmoji =
    !displayEmoji && !showLucideNamedIcon && !useLucideDefault;
  const showLucideFallback =
    !displayEmoji && !showLucideNamedIcon && useLucideDefault;

  return (
    <div
      className={cn(
        sizePreset.container,
        "rounded-md flex items-center justify-center text-white shrink-0 overflow-hidden",
        className,
      )}
      style={{ backgroundColor }}
      aria-hidden="true"
    >
      {displayEmoji && (
        <span className={cn(sizePreset.emoji, "leading-none select-none")}>
          {displayEmoji}
        </span>
      )}
      {showLucideNamedIcon && LucideIconComponent && (
        <LucideIconComponent className={cn(sizePreset.icon)} />
      )}
      {showDefaultEmoji && (
        <span className={cn(sizePreset.emoji, "leading-none select-none")}>
          {DEFAULT_EMOJI}
        </span>
      )}
      {showLucideFallback && <Workflow className={cn(sizePreset.icon)} />}
    </div>
  );
}

/**
 * Re-export the size type for external use
 */
export type { IconSize as WorkflowIconSize };
