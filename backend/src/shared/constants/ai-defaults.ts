/**
 * AI Configuration Defaults
 *
 * Centralized default values for AI-related settings throughout the application.
 * These defaults serve as SYSTEM FALLBACKS when user-specific settings are not available.
 *
 * Key Concepts:
 * - aiEnabled (AI Replies): Master switch for AI capability (can the AI respond at all?)
 * - aiPaused: Runtime pause switch (is AI actively responding right now?)
 *
 * Configuration Hierarchy (highest to lowest priority):
 * 1. Chat-level override (per-chat settings)
 * 2. User-level defaults (from AI settings page)
 * 3. System defaults (this file - used as fallback)
 *
 * Default Behavior for New Chats:
 * - Uses user's configured defaults from AI settings page
 * - Falls back to system defaults if user hasn't configured settings
 *
 * System Default State (conservative):
 * - AI_ENABLED = false: AI replies OFF by default (user must explicitly enable)
 * - AI_PAUSED = true: Even when enabled, AI starts paused (for extra safety)
 *
 * This design allows users to:
 * 1. Configure their preferred defaults in AI settings
 * 2. Have control over when AI starts responding
 * 3. Override defaults per-chat when needed
 */

/**
 * System-level default AI configuration (fallback values)
 * These are used when user hasn't configured their own defaults
 */
export const AI_DEFAULTS = {
  /**
   * System default for AI replies enabled.
   * When false, AI is completely disabled for new chats.
   * When true, AI capability is available (but may be paused).
   *
   * SYSTEM DEFAULT: false (conservative - AI off until explicitly enabled)
   * Users can change their default in AI Settings page.
   */
  AI_ENABLED: false,

  /**
   * System default for AI paused state.
   * When true, AI won't auto-respond even if enabled (user must unpause).
   * When false, AI will automatically respond to incoming messages.
   *
   * SYSTEM DEFAULT: true (AI starts paused for extra safety)
   * Only matters when AI_ENABLED is true.
   * Users can change their default in AI Settings page.
   */
  AI_PAUSED: true,

  /**
   * Whether chat is awaiting handoff by default.
   * Should always be false for new chats.
   */
  AWAITING_HANDOFF: false,
} as const;

/**
 * Type for AI defaults to ensure type safety
 */
export type AiDefaults = typeof AI_DEFAULTS;

/**
 * User-configurable AI defaults interface
 * Matches the columns in ai_configurations table
 */
export interface UserAiDefaults {
  /** Whether AI replies are enabled by default for new chats */
  defaultAiRepliesEnabled: boolean;
  /** Whether AI is paused by default when AI replies are enabled */
  defaultAiPaused: boolean;
}

/**
 * Get resolved AI defaults, merging user preferences with system defaults
 * @param userDefaults - User's configured defaults from their AI settings
 * @returns Resolved defaults for use in new chats
 */
export function resolveAiDefaults(
  userDefaults?: Partial<UserAiDefaults> | null,
): {
  aiEnabled: boolean;
  aiPaused: boolean;
} {
  // Use user defaults if provided, otherwise fall back to system defaults
  const aiEnabled =
    userDefaults?.defaultAiRepliesEnabled ?? AI_DEFAULTS.AI_ENABLED;

  // If AI is not enabled, aiPaused doesn't matter - but we still default to true for consistency
  const aiPaused = userDefaults?.defaultAiPaused ?? AI_DEFAULTS.AI_PAUSED;

  return {
    aiEnabled,
    aiPaused,
  };
}

/**
 * Helper function to get chat stage assignment defaults
 * Use this when inserting new chat_stage_assignments records
 * @param userDefaults - Optional user defaults from their AI configuration
 */
export function getDefaultChatStageAssignmentValues(
  userDefaults?: Partial<UserAiDefaults> | null,
) {
  const resolved = resolveAiDefaults(userDefaults);
  return {
    aiPaused: resolved.aiPaused,
    awaitingHandoff: AI_DEFAULTS.AWAITING_HANDOFF,
  };
}

/**
 * Helper function to get AI override defaults
 * Use this when inserting new chat_ai_overrides records
 * @param userDefaults - Optional user defaults from their AI configuration
 */
export function getDefaultAiOverrideValues(
  userDefaults?: Partial<UserAiDefaults> | null,
) {
  const resolved = resolveAiDefaults(userDefaults);
  return {
    aiEnabled: resolved.aiEnabled,
  };
}
