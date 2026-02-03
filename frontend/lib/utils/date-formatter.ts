/**
 * Date Formatter Utilities
 *
 * WhatsApp-style date formatting for message timestamps.
 * Handles relative dates (Today, Yesterday, day names) and absolute dates.
 *
 * @module lib/utils/date-formatter
 */

// ============================================================
// TYPES
// ============================================================

export interface DateFormatOptions {
  /** Locale for date formatting (default: "en-US") */
  locale?: string;
  /** Whether to include year for old dates (default: true) */
  includeYear?: boolean;
  /** Use uppercase first letter for day names (default: true) */
  capitalize?: boolean;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get the start of day (midnight) for a given date.
 * Used for date comparison without time component.
 */
function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Check if two dates are on the same calendar day.
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Get the number of calendar days between two dates.
 * Positive if date1 is before date2.
 */
function daysDifference(date1: Date, date2: Date): number {
  const d1 = startOfDay(date1);
  const d2 = startOfDay(date2);
  const diffMs = d2.getTime() - d1.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Get the day of week name.
 */
function getDayName(date: Date, locale: string = "en-US"): string {
  return date.toLocaleDateString(locale, { weekday: "long" });
}

/**
 * Get the day of week index (0 = Sunday, 1 = Monday, etc.)
 */
function getDayOfWeekIndex(date: Date): number {
  return date.getDay();
}

// ============================================================
// TYPES FOR TRANSLATIONS
// ============================================================

export interface DateTranslations {
  today: string;
  yesterday: string;
  sunday: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
}

// ============================================================
// MAIN FORMATTING FUNCTIONS
// ============================================================

/**
 * Format a date for WhatsApp-style date separator badges.
 *
 * Behavior:
 * - Today: "Today"
 * - Yesterday: "Yesterday"
 * - Within last 7 days: Day name (e.g., "SUNDAY", "MONDAY")
 * - Older: Full date (e.g., "December 15, 2024" or "12/15/2024")
 *
 * @param date - The date to format
 * @param options - Formatting options
 * @returns Formatted date string
 */
export function formatDateBadge(
  date: Date,
  options: DateFormatOptions = {},
): string {
  const { locale = "en-US", includeYear = true, capitalize = true } = options;

  const now = new Date();
  const diffDays = daysDifference(date, now);

  let result: string;

  if (diffDays === 0) {
    // Today
    result = "Today";
  } else if (diffDays === 1) {
    // Yesterday
    result = "Yesterday";
  } else if (diffDays > 1 && diffDays <= 6) {
    // Within last 7 days - show day name
    result = getDayName(date, locale);
  } else {
    // Older - show full date
    const isSameYear = date.getFullYear() === now.getFullYear();

    if (isSameYear && !includeYear) {
      // Same year, don't show year
      result = date.toLocaleDateString(locale, {
        month: "long",
        day: "numeric",
      });
    } else {
      // Different year or includeYear is true
      result = date.toLocaleDateString(locale, {
        month: "numeric",
        day: "numeric",
        year: "numeric",
      });
    }
  }

  // Return with first letter capitalized (not uppercase)
  return capitalize ? result.charAt(0).toUpperCase() + result.slice(1) : result;
}

/**
 * Day names array indexed by day of week (0 = Sunday)
 */
const DAY_KEYS: (keyof DateTranslations)[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/**
 * Format a date for WhatsApp-style date separator badges with translations.
 *
 * Behavior:
 * - Today: Translated "Today"
 * - Yesterday: Translated "Yesterday"
 * - Within last 7 days: Translated day name (e.g., "Sunday", "Monday")
 * - Older: Full date (e.g., "12/15/2024")
 *
 * @param date - The date to format
 * @param translations - Translated strings for days and relative dates
 * @param options - Formatting options
 * @returns Formatted date string
 */
export function formatDateBadgeWithTranslations(
  date: Date,
  translations: DateTranslations,
  options: DateFormatOptions = {},
): string {
  const { locale = "en-US", includeYear = true } = options;

  const now = new Date();
  const diffDays = daysDifference(date, now);

  if (diffDays === 0) {
    return translations.today;
  } else if (diffDays === 1) {
    return translations.yesterday;
  } else if (diffDays > 1 && diffDays <= 6) {
    // Within last 7 days - show translated day name
    const dayKey = DAY_KEYS[getDayOfWeekIndex(date)];
    return translations[dayKey];
  } else {
    // Older - show full date
    const isSameYear = date.getFullYear() === now.getFullYear();

    if (isSameYear && !includeYear) {
      return date.toLocaleDateString(locale, {
        month: "long",
        day: "numeric",
      });
    } else {
      return date.toLocaleDateString(locale, {
        month: "numeric",
        day: "numeric",
        year: "numeric",
      });
    }
  }
}

/**
 * Format a date for the sticky header (slightly different from badge).
 *
 * Behavior:
 * - Today: "Today"
 * - Yesterday: "Yesterday"
 * - Within last 7 days: Day name (e.g., "Sunday", "Monday")
 * - Older: Numeric date with year (e.g., "12/12/2025")
 *
 * @param date - The date to format
 * @param options - Formatting options
 * @returns Formatted date string
 */
export function formatStickyDate(
  date: Date,
  options: DateFormatOptions = {},
): string {
  const { locale = "en-US" } = options;

  const now = new Date();
  const diffDays = daysDifference(date, now);

  if (diffDays === 0) {
    return "Today";
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays > 1 && diffDays <= 6) {
    // Within last 7 days - show day name
    return getDayName(date, locale);
  } else {
    // Older - always show numeric date with year (e.g., 12/12/2025)
    return date.toLocaleDateString(locale, {
      month: "numeric",
      day: "numeric",
      year: "numeric",
    });
  }
}

/**
 * Format a date for the sticky header with translations.
 *
 * Behavior:
 * - Today: Translated "Today"
 * - Yesterday: Translated "Yesterday"
 * - Within last 7 days: Translated day name (e.g., "Sunday", "Monday")
 * - Older: Numeric date with year (e.g., "12/12/2025")
 *
 * @param date - The date to format
 * @param translations - Translated strings for days and relative dates
 * @param options - Formatting options
 * @returns Formatted date string
 */
export function formatStickyDateWithTranslations(
  date: Date,
  translations: DateTranslations,
  options: DateFormatOptions = {},
): string {
  const { locale = "en-US" } = options;

  const now = new Date();
  const diffDays = daysDifference(date, now);

  if (diffDays === 0) {
    return translations.today;
  } else if (diffDays === 1) {
    return translations.yesterday;
  } else if (diffDays > 1 && diffDays <= 6) {
    // Within last 7 days - show translated day name
    const dayKey = DAY_KEYS[getDayOfWeekIndex(date)];
    return translations[dayKey];
  } else {
    // Older - always show numeric date with year (e.g., 12/12/2025)
    return date.toLocaleDateString(locale, {
      month: "numeric",
      day: "numeric",
      year: "numeric",
    });
  }
}

/**
 * Get a unique date key for grouping messages by day.
 * Uses ISO date format (YYYY-MM-DD) for consistent grouping.
 *
 * @param date - The date to get key for
 * @returns Date key string in YYYY-MM-DD format
 */
export function getDateKey(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Parse a date string or Date object safely.
 *
 * @param input - Date string or Date object
 * @returns Parsed Date object
 */
export function parseDate(input: string | Date): Date {
  if (input instanceof Date) {
    return input;
  }
  return new Date(input);
}

// ============================================================
// CHAT LIST TIME FORMATTING
// ============================================================

/**
 * Translations interface for chat list relative time formatting
 */
export interface ChatListTimeTranslations {
  now: string;
  minutesAgo: (count: number) => string;
  hoursAgo: (count: number) => string;
  yesterday: string;
  daysAgo: (count: number) => string;
}

/**
 * Format a date for chat list timestamps (WhatsApp-style).
 *
 * Behavior:
 * - Just now (< 1 min): "now" / translated
 * - Minutes ago (< 1 hour): "Xm ago" / translated
 * - Hours ago (< 24 hours): "Xh ago" / translated
 * - Yesterday: "Yesterday" / translated
 * - Within last week: "Xd ago" / translated
 * - Older: Locale date (e.g., "Dec 15" or "Dec 15, 2024")
 *
 * @param date - The date to format
 * @param translations - Translation functions for relative times
 * @returns Formatted time string
 */
export function formatChatListTime(
  date: Date,
  translations: ChatListTimeTranslations,
): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return translations.now;
  if (diffMins < 60) return translations.minutesAgo(diffMins);
  if (diffHours < 24) return translations.hoursAgo(diffHours);
  if (diffDays === 1) return translations.yesterday;
  if (diffDays < 7) return translations.daysAgo(diffDays);

  // For older dates, use locale-aware date formatting
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}
