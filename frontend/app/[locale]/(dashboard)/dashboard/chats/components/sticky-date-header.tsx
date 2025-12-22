"use client";

import { cn } from "@/lib/utils";
import {
  DateTranslations,
  formatStickyDateWithTranslations,
} from "@/lib/utils/date-formatter";
import { useTranslations } from "next-intl";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// ============================================================
// TYPES
// ============================================================

export interface StickyDateHeaderProps {
  /** Reference to the scroll container */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Locale for date formatting */
  locale?: string;
  /** Additional CSS classes */
  className?: string;
}

// ============================================================
// CONSTANTS
// ============================================================

/**
 * Offset from top of container to detect which date badge is "current".
 * We consider the date badge that is closest to this offset from the top.
 */
const DATE_DETECTION_OFFSET = 50;

/**
 * Throttle delay for scroll event handling (ms).
 * Balances responsiveness with performance.
 */
const SCROLL_THROTTLE_MS = 50;

/**
 * Duration for the fade animation (ms).
 */
const FADE_DURATION_MS = 200;

// ============================================================
// HOOKS
// ============================================================

/**
 * Custom hook to detect the currently visible date based on scroll position.
 *
 * This hook observes the scroll container and finds date separator elements
 * to determine which date should be shown in the sticky header.
 *
 * @param containerRef - Reference to the scroll container
 * @returns The currently visible date, or null if none found
 */
function useVisibleDate(
  containerRef: React.RefObject<HTMLDivElement | null>
): Date | null {
  const [visibleDate, setVisibleDate] = useState<Date | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);

  const updateVisibleDate = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // Find all date separator elements
    const separators = container.querySelectorAll("[data-date-separator]");
    if (separators.length === 0) {
      setVisibleDate(null);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const detectionLine = containerRect.top + DATE_DETECTION_OFFSET;

    // Find the date separator that is at or just above the detection line
    let currentDate: Date | null = null;

    for (let i = separators.length - 1; i >= 0; i--) {
      const separator = separators[i] as HTMLElement;
      const rect = separator.getBoundingClientRect();

      // If this separator is at or above the detection line, use its date
      if (rect.top <= detectionLine) {
        const dateStr = separator.getAttribute("data-date");
        if (dateStr) {
          currentDate = new Date(dateStr);
        }
        break;
      }
    }

    // If no separator is above the line, use the first one (oldest)
    if (!currentDate && separators.length > 0) {
      const firstSeparator = separators[0] as HTMLElement;
      const dateStr = firstSeparator.getAttribute("data-date");
      if (dateStr) {
        currentDate = new Date(dateStr);
      }
    }

    setVisibleDate(currentDate);
  }, [containerRef]);

  // Throttled scroll handler
  const handleScroll = useCallback(() => {
    const now = Date.now();
    if (now - lastUpdateRef.current < SCROLL_THROTTLE_MS) {
      // Schedule update for end of throttle period
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      rafIdRef.current = requestAnimationFrame(() => {
        updateVisibleDate();
        lastUpdateRef.current = Date.now();
      });
      return;
    }

    lastUpdateRef.current = now;
    updateVisibleDate();
  }, [updateVisibleDate]);

  // Set up scroll listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Initial update
    updateVisibleDate();

    // Listen for scroll events
    container.addEventListener("scroll", handleScroll, { passive: true });

    // Also observe DOM changes to detect new date separators
    const observer = new MutationObserver(() => {
      // Debounce mutation updates
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      rafIdRef.current = requestAnimationFrame(updateVisibleDate);
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
    });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      observer.disconnect();
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [containerRef, handleScroll, updateVisibleDate]);

  return visibleDate;
}

// ============================================================
// COMPONENT
// ============================================================

/**
 * StickyDateHeader Component
 *
 * A sticky header that displays the current date based on scroll position.
 * Stays fixed at the top of the chat thread (inside the scroll container)
 * and updates as the user scrolls through messages.
 *
 * Features:
 * - Smooth fade-in/out transitions
 * - Updates based on which date separator is currently visible
 * - Works in both light and dark modes
 * - Non-intrusive, doesn't interfere with scroll behavior
 *
 * Implementation:
 * - Uses CSS `position: sticky` for native sticky behavior
 * - Detects visible date by finding date separators in the viewport
 * - Throttled updates for performance
 *
 * @example
 * ```tsx
 * <div ref={containerRef} className="overflow-y-auto">
 *   <StickyDateHeader containerRef={containerRef} />
 *   {messages.map(...)}
 * </div>
 * ```
 */
export function StickyDateHeader({
  containerRef,
  locale = "en-US",
  className,
}: StickyDateHeaderProps) {
  const t = useTranslations("chats.dates");
  const visibleDate = useVisibleDate(containerRef);
  const [displayedDate, setDisplayedDate] = useState<Date | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Create translations object for the formatter
  const translations: DateTranslations = useMemo(
    () => ({
      today: t("today"),
      yesterday: t("yesterday"),
      monday: t("monday"),
      tuesday: t("tuesday"),
      wednesday: t("wednesday"),
      thursday: t("thursday"),
      friday: t("friday"),
      saturday: t("saturday"),
      sunday: t("sunday"),
    }),
    [t]
  );

  // Format the date for display
  const formattedDate = useMemo(() => {
    if (!displayedDate) return "";
    return formatStickyDateWithTranslations(displayedDate, translations, {
      locale,
    });
  }, [displayedDate, locale, translations]);

  // Handle date changes with fade animation
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (!visibleDate) {
      // Fade out
      setIsVisible(false);
      timeoutRef.current = setTimeout(() => {
        setDisplayedDate(null);
      }, FADE_DURATION_MS);
    } else if (!displayedDate) {
      // First appearance - immediate show
      setDisplayedDate(visibleDate);
      setIsVisible(true);
    } else if (visibleDate.getTime() !== displayedDate.getTime()) {
      // Date changed - cross-fade
      // For smooth experience, just update the date immediately
      setDisplayedDate(visibleDate);
      setIsVisible(true);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [visibleDate, displayedDate]);

  // Don't render if no date
  if (!displayedDate && !isVisible) {
    return null;
  }

  return (
    <div
      className={cn(
        // Sticky positioning - stays at top of scroll container
        "sticky top-0 z-10",
        // Centering container
        "flex justify-center",
        // Padding for spacing from top
        "py-2",
        // Pointer events pass through to content below
        "pointer-events-none",
        className
      )}
    >
      <div
        className={cn(
          // Badge styling - matches DateSeparator for visual consistency
          "inline-flex items-center justify-center",
          "px-3 py-1",
          "rounded-lg",
          "text-[11px] font-medium tracking-wide",
          // Light mode styling
          "bg-background/95 text-muted-foreground",
          // Dark mode styling
          "dark:bg-background/90 dark:text-muted-foreground",
          // Border for definition
          "border border-border/50",
          // Shadow for floating effect
          "shadow-sm",
          // Backdrop blur for modern look
          "backdrop-blur-sm",
          // Transition for fade effect
          "transition-opacity duration-200",
          // Visibility based on state
          isVisible ? "opacity-100" : "opacity-0",
          // Allow pointer events on the badge itself
          "pointer-events-auto"
        )}
      >
        {formattedDate}
      </div>
    </div>
  );
}

export default StickyDateHeader;
