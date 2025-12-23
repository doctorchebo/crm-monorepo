/**
 * Conversation Window Utility
 *
 * This module handles WhatsApp Business API's 24-hour conversation window logic.
 *
 * According to Meta's WhatsApp Business Platform rules:
 * - A "conversation window" opens when a user sends a message to your business
 * - This window lasts for 24 hours from the user's last message
 * - Within the window: You can send any message type (free-form text, media, etc.)
 * - Outside the window: You can ONLY initiate conversations using approved templates
 *
 * @see https://developers.facebook.com/docs/whatsapp/conversation-types
 */

import type { Message, Template } from "../types";

// ============================================================================
// Constants
// ============================================================================

/**
 * Duration of the conversation window in milliseconds (24 hours)
 */
export const CONVERSATION_WINDOW_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * Duration in hours for display purposes
 */
export const CONVERSATION_WINDOW_DURATION_HOURS = 24;

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
  | "no_matching_locale" // No locale matches the customer's language
  | "outside_window_not_approved"; // Outside 24-hour window and no approved locale for customer's language

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
 * @param messages - Array of messages to analyze
 * @param referenceTime - Optional reference time for calculations (defaults to now)
 * @returns ConversationWindowStatus object with window details
 */
export function calculateConversationWindow(
  messages: Message[],
  referenceTime: Date = new Date()
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
  const windowExpiresAt = new Date(
    lastInboundTime.getTime() + CONVERSATION_WINDOW_DURATION_MS
  );
  const timeRemainingMs = Math.max(
    0,
    windowExpiresAt.getTime() - referenceTime.getTime()
  );
  const isWithinWindow = timeRemainingMs > 0;

  return {
    isWithinWindow,
    lastInboundMessageTime: lastInboundTime,
    windowExpiresAt: isWithinWindow ? windowExpiresAt : null,
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
 * Type for a single template locale
 */
export type TemplateLocale = NonNullable<Template["locales"]>[number];

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
  customerLanguage?: string
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
 * Rules:
 * - WITHIN 24-hour window: ALL templates are available (any approval status)
 * - OUTSIDE 24-hour window: Only templates with an approved locale for the
 *   customer's language (or any approved locale) are available
 *
 * @param template - The template to check
 * @param windowStatus - The conversation window status
 * @param customerLanguage - The customer's preferred language (optional)
 * @returns TemplateAvailability with availability status and reason
 */
export function getTemplateAvailability(
  template: Template,
  windowStatus: ConversationWindowStatus,
  customerLanguage?: string
): TemplateAvailability {
  const locales = template.locales || [];
  const hasApprovedLocale = locales.some(isLocaleApproved);
  const selectedLocale = findBestLocale(template, customerLanguage);

  // Within 24-hour window: all templates are available
  if (windowStatus.isWithinWindow) {
    return {
      isAvailable: true,
      selectedLocale,
      hasApprovedLocale,
    };
  }

  // Outside window: need to check approval status
  if (!selectedLocale) {
    return {
      isAvailable: false,
      unavailableReason: "no_matching_locale",
      hasApprovedLocale,
    };
  }

  // Check if the selected locale is approved
  const isSelectedLocaleApproved = isLocaleApproved(selectedLocale);

  // If customer has a preference, check if that specific locale is approved
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
        return {
          isAvailable: false,
          unavailableReason: "outside_window_not_approved",
          selectedLocale: customerLocale,
          hasApprovedLocale,
        };
      }
    }
  }

  // Fallback: use first approved locale if available
  if (hasApprovedLocale) {
    const approvedLocale = locales.find(isLocaleApproved);
    return {
      isAvailable: true,
      selectedLocale: approvedLocale,
      hasApprovedLocale,
    };
  }

  // No approved locales available outside window
  return {
    isAvailable: false,
    unavailableReason: "not_approved",
    selectedLocale,
    hasApprovedLocale,
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
  customerLanguage?: string
): TemplateWithAvailability[] {
  return templates.map((template) => ({
    ...template,
    availability: getTemplateAvailability(
      template,
      windowStatus,
      customerLanguage
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
