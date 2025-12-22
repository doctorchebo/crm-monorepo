"use client";

// ============================================================
// SHARED SCROLL UTILITIES
// ============================================================
// Common scroll-related functions used across scroll hooks.
// Extracted to avoid duplication and ensure consistent behavior.

/**
 * Debug mode flag. Set to true during development for verbose logging.
 * In production, this should be false to reduce console noise.
 */
export const SCROLL_DEBUG = false;

/**
 * Conditional debug logger for scroll-related operations.
 * Only logs when SCROLL_DEBUG is true.
 */
export function scrollDebug(prefix: string, ...args: unknown[]): void {
  if (SCROLL_DEBUG) {
    console.log(prefix, ...args);
  }
}

/**
 * Check if a scroll container is within a threshold distance from the bottom.
 *
 * @param container - The scrollable container element
 * @param threshold - Distance from bottom in pixels (default: 100)
 * @returns true if within threshold of bottom, false otherwise
 */
export function isNearBottom(
  container: HTMLElement | null,
  threshold = 100
): boolean {
  if (!container) return true;
  const { scrollTop, scrollHeight, clientHeight } = container;
  return scrollHeight - scrollTop - clientHeight < threshold;
}

/**
 * Check if a scroll container is scrolled exactly to the bottom.
 * Uses a small tolerance for floating point precision.
 *
 * @param container - The scrollable container element
 * @returns true if at bottom, false otherwise
 */
export function isAtBottom(container: HTMLElement | null): boolean {
  return isNearBottom(container, 5);
}

/**
 * Calculate the maximum valid scroll position for a container.
 *
 * @param container - The scrollable container element
 * @returns Maximum scrollTop value
 */
export function getMaxScrollTop(container: HTMLElement | null): number {
  if (!container) return 0;
  return Math.max(0, container.scrollHeight - container.clientHeight);
}

/**
 * Clamp a scroll position to valid bounds for a container.
 *
 * @param scrollTop - The desired scroll position
 * @param container - The scrollable container element
 * @returns Clamped scroll position
 */
export function clampScrollPosition(
  scrollTop: number,
  container: HTMLElement | null
): number {
  if (!container) return scrollTop;
  const maxScroll = getMaxScrollTop(container);
  return Math.max(0, Math.min(scrollTop, maxScroll));
}

/**
 * Scroll a container to the bottom.
 *
 * @param container - The scrollable container element
 * @param smooth - Whether to use smooth scrolling
 * @returns true if scroll was performed, false if container is null
 */
export function scrollContainerToBottom(
  container: HTMLElement | null,
  smooth = false
): boolean {
  if (!container) return false;

  if (smooth) {
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  } else {
    container.scrollTop = container.scrollHeight;
  }
  return true;
}

/**
 * Execute a function after multiple animation frames.
 * This ensures React has committed state changes and browser has painted.
 *
 * @param callback - Function to execute
 * @param frameCount - Number of animation frames to wait (default: 2)
 */
export function afterAnimationFrames(
  callback: () => void,
  frameCount = 2
): void {
  if (frameCount <= 0) {
    callback();
    return;
  }

  requestAnimationFrame(() => {
    afterAnimationFrames(callback, frameCount - 1);
  });
}
