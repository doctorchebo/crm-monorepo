/**
 * Conversation Window Utility
 *
 * This module handles WhatsApp Business API's 24-hour conversation window logic.
 *
 * According to Meta's WhatsApp Business Platform rules:
 * - A "conversation window" opens when a user sends a message to your business
 * - This window lasts for 24 hours from the user's last message
 * - Within the window: You can send free-form text, media, and interactive messages
 * - Outside the window: You can ONLY initiate conversations using approved templates
 *
 * IMPORTANT: Templates MUST be approved by Meta regardless of window status.
 * Even within the 24-hour window, only approved templates can be sent.
 *
 * CRITICAL: Interactive messages (buttons/lists) can ONLY be sent within the 24-hour window.
 * Unlike templates, they CANNOT be used to initiate conversations.
 *
 * @see https://developers.facebook.com/docs/whatsapp/conversation-types
 * @see https://developers.facebook.com/docs/whatsapp/guides/interactive-messages/
 */

import {
  CONVERSATION_WINDOW_MS,
  EFFECTIVE_WINDOW_MS,
  WINDOW_SAFETY_MARGIN_MS,
  canSendInteractiveMessage,
} from "@/lib/constants/interactive-message.constants";
import type { Message, Template, TemplateLocale } from "../types";

// ============================================================================
// Constants (re-exported from centralized location)
// ============================================================================

/**
 * Duration of the conversation window in milliseconds (24 hours)
 */
export const CONVERSATION_WINDOW_DURATION_MS = CONVERSATION_WINDOW_MS;

/**
 * Duration in hours for display purposes
 */
export const CONVERSATION_WINDOW_DURATION_HOURS = 24;

/**
 * Safety margin to subtract from the window to avoid edge-case violations (5 minutes)
 * This accounts for:
 * - Clock drift between client and server
 * - Network latency
 * - Processing delays
 * - Database timestamp precision
 *
 * IMPORTANT: The backend has the same safety margin. When in doubt,
 * use the backend's validation endpoints for authoritative status.
 */
export const SAFETY_MARGIN_MS = WINDOW_SAFETY_MARGIN_MS;

// Re-export for convenience
export { EFFECTIVE_WINDOW_MS };

// Re-export the interactive message check function
export { canSendInteractiveMessage };

// ============================================================================
// Types
// ============================================================================

/**
 * Status of the conversation window
 */
export interface ConversationWindowStatus {
  /**
   * Whether we're within the 24-hour window where any message type can be sent
   */
  isWithinWindow: boolean;

  /**
   * The timestamp of the last inbound (customer) message
   * null if no inbound messages exist
   */
  lastInboundMessageTime: Date | null;

  /**
   * When the current window expires (if within window)
   * null if outside window or no inbound messages
   */
  windowExpiresAt: Date | null;

  /**
   * Time remaining in the window in milliseconds
   * 0 if outside window
   */
  timeRemainingMs: number;
}

/**
 * Reasons why a template might be unavailable
 */
export type TemplateUnavailableReason =
  | "not_approved" // The template locale is not approved by Meta
  | "no_matching_locale"; // No locale matches the customer's language

/**
 * Template availability status
 */
export interface TemplateAvailability {
  /**
   * Whether the template can be selected and used
   */
  isAvailable: boolean;

  /**
   * Reason why the template is unavailable (if not available)
   */
  unavailableReason?: TemplateUnavailableReason;

  /**
   * The locale that would be used if this template is selected
   * Based on customer's preferred language
   */
  selectedLocale?: {
    id: string;
    locale: string;
    approvalStatus?: string;
  };

  /**
   * Whether any locale in this template is approved
   */
  hasApprovedLocale: boolean;
}

/**
 * Template with computed availability information
 */
export interface TemplateWithAvailability extends Template {
  availability: TemplateAvailability;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Finds the most recent inbound (customer) message from a list of messages
 *
 * @param messages - Array of messages to search
 * @returns The most recent inbound message, or null if none found
 */
export function getLastInboundMessage(messages: Message[]): Message | null {
  if (!messages || messages.length === 0) {
    return null;
  }

  // Filter to only inbound messages and sort by timestamp descending
  const inboundMessages = messages
    .filter((msg) => msg.direction === "inbound")
    .sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA; // Descending order (most recent first)
    });

  return inboundMessages.length > 0 ? inboundMessages[0] : null;
}

/**
 * Calculates the conversation window status based on messages
 *
 * IMPORTANT: This function includes a safety margin to prevent edge-case violations.
 * The window is considered "expired" 5 minutes before the actual 24-hour mark.
 *
 * @param messages - Array of messages to analyze
 * @param referenceTime - Optional reference time for calculations (defaults to now)
 * @returns ConversationWindowStatus object with window details
 */
export function calculateConversationWindow(
  messages: Message[],
  referenceTime: Date = new Date(),
): ConversationWindowStatus {
  const lastInbound = getLastInboundMessage(messages);

  if (!lastInbound) {
    return {
      isWithinWindow: false,
      lastInboundMessageTime: null,
      windowExpiresAt: null,
      timeRemainingMs: 0,
    };
  }

  const lastInboundTime = new Date(lastInbound.timestamp);

  // Use effective window (with safety margin) for determining if window is open
  const effectiveExpiresAt = new Date(
    lastInboundTime.getTime() + EFFECTIVE_WINDOW_MS,
  );

  // Calculate time remaining with safety margin applied
  const timeRemainingMs = Math.max(
    0,
    effectiveExpiresAt.getTime() - referenceTime.getTime(),
  );
  const isWithinWindow = timeRemainingMs > 0;

  return {
    isWithinWindow,
    lastInboundMessageTime: lastInboundTime,
    // Return the effective expiration time (with safety margin)
    windowExpiresAt: isWithinWindow ? effectiveExpiresAt : null,
    timeRemainingMs,
  };
}

/**
 * Checks if a template locale is approved
 *
 * @param locale - The template locale object
 * @returns true if the locale is approved
 */
export function isLocaleApproved(locale: { approvalStatus?: string }): boolean {
  return locale.approvalStatus === "approved";
}

/**
 * Re-export TemplateLocale from types for backwards compatibility
 */
export type { TemplateLocale };

/**
 * Finds the best matching locale for a customer's preferred language
 *
 * Matching priority:
 * 1. Exact match (e.g., "en" matches "en")
 * 2. Fallback to first approved locale
 * 3. Fallback to first available locale
 *
 * @param template - The template to search
 * @param customerLanguage - The customer's preferred language code
 * @returns The best matching locale or undefined
 */
export function findBestLocale(
  template: Template,
  customerLanguage?: string,
): TemplateLocale | undefined {
  const locales = template.locales;

  if (!locales || locales.length === 0) {
    return undefined;
  }

  // If customer has a language preference, try to find matching locale
  if (customerLanguage) {
    // First, try exact match with customer's language
    const exactMatch = locales.find((l) => l.locale === customerLanguage);
    if (exactMatch) {
      return exactMatch;
    }
  }

  // Fallback: prefer first approved locale
  const approvedLocale = locales.find(isLocaleApproved);
  if (approvedLocale) {
    return approvedLocale;
  }

  // Last resort: return first locale
  return locales[0];
}

/**
 * Determines the availability status of a template
 *
 * IMPORTANT: Meta requires templates to be APPROVED regardless of the 24-hour
 * conversation window status. Unapproved templates cannot be sent even within
 * the window. This is a Meta platform restriction.
 *
 * Rules:
 * - Template must have an approved locale to be available
 * - Customer's preferred language is used to select locale when available
 * - Falls back to first approved locale if customer's language not available
 *
 * @param template - The template to check
 * @param windowStatus - The conversation window status (currently unused but kept for API compatibility)
 * @param customerLanguage - The customer's preferred language (optional)
 * @returns TemplateAvailability with availability status and reason
 */
export function getTemplateAvailability(
  template: Template,
  windowStatus: ConversationWindowStatus,
  customerLanguage?: string,
): TemplateAvailability {
  const locales = template.locales || [];
  const hasApprovedLocale = locales.some(isLocaleApproved);

  // If no locales exist, template is not available
  if (locales.length === 0) {
    return {
      isAvailable: false,
      unavailableReason: "no_matching_locale",
      hasApprovedLocale: false,
    };
  }

  // If customer has a language preference, try to find matching approved locale
  if (customerLanguage) {
    const customerLocale = locales.find((l) => l.locale === customerLanguage);
    if (customerLocale) {
      if (isLocaleApproved(customerLocale)) {
        return {
          isAvailable: true,
          selectedLocale: customerLocale,
          hasApprovedLocale,
        };
      } else {
        // Customer's locale exists but not approved
        return {
          isAvailable: false,
          unavailableReason: "not_approved",
          selectedLocale: customerLocale,
          hasApprovedLocale,
        };
      }
    }
  }

  // No customer language preference or no locale for their language
  // Use first approved locale if available
  if (hasApprovedLocale) {
    const approvedLocale = locales.find(isLocaleApproved);
    return {
      isAvailable: true,
      selectedLocale: approvedLocale,
      hasApprovedLocale,
    };
  }

  // No approved locales - template not available
  const fallbackLocale = findBestLocale(template, customerLanguage);
  return {
    isAvailable: false,
    unavailableReason: "not_approved",
    selectedLocale: fallbackLocale,
    hasApprovedLocale: false,
  };
}

/**
 * Enriches templates with availability information
 *
 * This is the main function to use when preparing templates for display.
 * It adds availability metadata to each template based on the conversation
 * window status and customer's language preference.
 *
 * @param templates - Array of templates to enrich
 * @param windowStatus - The conversation window status
 * @param customerLanguage - The customer's preferred language (optional)
 * @returns Array of templates with availability information
 */
export function enrichTemplatesWithAvailability(
  templates: Template[],
  windowStatus: ConversationWindowStatus,
  customerLanguage?: string,
): TemplateWithAvailability[] {
  return templates.map((template) => ({
    ...template,
    availability: getTemplateAvailability(
      template,
      windowStatus,
      customerLanguage,
    ),
  }));
}

/**
 * Formats the remaining window time for display
 *
 * @param timeRemainingMs - Time remaining in milliseconds
 * @returns Formatted string like "23h 45m" or "45m" or "Less than 1m"
 */
export function formatTimeRemaining(timeRemainingMs: number): string {
  if (timeRemainingMs <= 0) {
    return "Expired";
  }

  const totalMinutes = Math.floor(timeRemainingMs / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return "Less than 1m";
  }
}
