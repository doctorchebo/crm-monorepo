/**
 * Sidebar configuration constants
 *
 * Centralized configuration for sidebar widths across the application.
 * This ensures consistency and makes it easy to adjust sidebar behavior.
 */

/**
 * Chat sidebar (right panel) configuration
 * Used in the chats page for the profile/notes/pipeline/activity panel
 */
export const CHAT_SIDEBAR = {
  /** Default width in pixels */
  DEFAULT_WIDTH: 380,

  /** Minimum width when resizing (ensures all tabs remain visible) */
  MIN_WIDTH: 320,

  /** Maximum width as a fraction of container width (0.6 = 60%) */
  MAX_WIDTH_RATIO: 0.6,

  /** Fallback maximum width in pixels when container size is unknown */
  FALLBACK_MAX_WIDTH: 800,
} as const;

/**
 * Kanban activity sidebar configuration
 * Used in the kanban page for the global activity panel
 */
export const KANBAN_SIDEBAR = {
  /** Fixed width for the activity panel */
  WIDTH: 320,
} as const;

/**
 * Chat list sidebar (left panel) configuration
 * Used in the chats page for the chat list
 */
export const CHAT_LIST_SIDEBAR = {
  /** Width classes for responsive design */
  WIDTH_CLASSES: "w-full md:w-80 lg:w-96",
} as const;
