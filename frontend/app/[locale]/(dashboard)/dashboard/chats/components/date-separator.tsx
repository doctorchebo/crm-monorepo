"use client";

import { cn } from "@/lib/utils";
import {
  formatDateBadgeWithTranslations,
  parseDate,
} from "@/lib/utils/date-formatter";
import { useTranslations } from "next-intl";

// ============================================================
// TYPES
// ============================================================

export interface DateSeparatorProps {
  /** The date to display */
  date: Date | string;
  /** Additional CSS classes */
  className?: string;
  /** Locale for date formatting */
  locale?: string;
}

// ============================================================
// COMPONENT
// ============================================================

/**
 * DateSeparator Component
 *
 * Renders a centered date badge between message groups, similar to WhatsApp Web.
 * Shows:
 * - "Today" for today's messages
 * - "Yesterday" for yesterday's messages
 * - Day name (e.g., "Sunday") for messages within the last 7 days
 * - Full date (e.g., "12/15/2024") for older messages
 *
 * Styling:
 * - Centered horizontally in the chat thread
 * - Semi-transparent background that works in both light and dark modes
 * - Small, non-intrusive text styling matching WhatsApp's aesthetic
 *
 * @example
 * ```tsx
 * <DateSeparator date={new Date()} />
 * <DateSeparator date="2024-12-20T10:30:00Z" />
 * ```
 */
export function DateSeparator({
  date,
  className,
  locale = "en-US",
}: DateSeparatorProps) {
  const t = useTranslations("chats.dates");
  const parsedDate = parseDate(date);

  // Create translations object for the formatter
  const translations = {
    today: t("today"),
    yesterday: t("yesterday"),
    monday: t("monday"),
    tuesday: t("tuesday"),
    wednesday: t("wednesday"),
    thursday: t("thursday"),
    friday: t("friday"),
    saturday: t("saturday"),
    sunday: t("sunday"),
  };

  const formattedDate = formatDateBadgeWithTranslations(
    parsedDate,
    translations,
    { locale }
  );

  return (
    <div
      className={cn(
        // Container - centers the badge
        "flex justify-center my-3",
        className
      )}
      // Mark as date separator for scroll calculations
      data-date-separator="true"
      data-date={parsedDate.toISOString()}
    >
      <div
        className={cn(
          // Badge styling - mimics WhatsApp's date badges
          "inline-flex items-center justify-center",
          "px-3 py-1",
          "rounded-lg",
          "text-[11px] font-medium tracking-wide",
          // Light mode: subtle gray background
          "bg-muted/80 text-muted-foreground",
          // Dark mode: slightly different shade for visibility
          "dark:bg-muted/60 dark:text-muted-foreground",
          // Subtle shadow for depth
          "shadow-sm"
        )}
      >
        {formattedDate}
      </div>
    </div>
  );
}

export default DateSeparator;
