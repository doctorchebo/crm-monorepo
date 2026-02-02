/**
 * Interactive Message Constants
 *
 * Centralized constants for WhatsApp Cloud API interactive message limits and validation.
 * These values are based on Meta's official documentation:
 * @see https://developers.facebook.com/docs/whatsapp/guides/interactive-messages/
 *
 * CRITICAL: Interactive messages (buttons/lists) can ONLY be sent within the 24-hour
 * conversation window. Unlike templates, they CANNOT be used to initiate conversations.
 *
 * This file mirrors the backend constants for frontend validation consistency.
 */

// ============================================================================
// MESSAGE TYPE CONSTRAINTS
// ============================================================================

/**
 * Interactive message types supported by WhatsApp Cloud API
 */
export const INTERACTIVE_MESSAGE_TYPES = [
  "button",
  "list",
  "product",
  "product_list",
  "location_request_message",
  "flow",
] as const;
export type InteractiveMessageType = (typeof INTERACTIVE_MESSAGE_TYPES)[number];

// ============================================================================
// REPLY BUTTON MESSAGE CONSTRAINTS
// ============================================================================

/**
 * Maximum number of buttons in a reply button message
 */
export const MAX_REPLY_BUTTONS = 3;

/**
 * Minimum number of buttons required
 */
export const MIN_REPLY_BUTTONS = 1;

/**
 * Maximum length of button title
 */
export const MAX_BUTTON_TITLE_LENGTH = 20;

/**
 * Maximum length of button ID
 */
export const MAX_BUTTON_ID_LENGTH = 256;

// ============================================================================
// LIST MESSAGE CONSTRAINTS
// ============================================================================

/**
 * Maximum number of sections in a list message
 */
export const MAX_LIST_SECTIONS = 10;

/**
 * Minimum number of sections required
 */
export const MIN_LIST_SECTIONS = 1;

/**
 * Maximum number of rows per section
 */
export const MAX_ROWS_PER_SECTION = 10;

/**
 * Minimum number of rows per section
 */
export const MIN_ROWS_PER_SECTION = 1;

/**
 * Maximum length of the list button text
 */
export const MAX_LIST_BUTTON_TEXT_LENGTH = 20;

/**
 * Maximum length of row title in a list
 */
export const MAX_LIST_ROW_TITLE_LENGTH = 24;

/**
 * Maximum length of row description in a list
 */
export const MAX_LIST_ROW_DESCRIPTION_LENGTH = 72;

/**
 * Maximum length of row ID
 */
export const MAX_LIST_ROW_ID_LENGTH = 200;

/**
 * Maximum length of section title
 */
export const MAX_SECTION_TITLE_LENGTH = 24;

// ============================================================================
// COMMON CONSTRAINTS (Header, Body, Footer)
// ============================================================================

/**
 * Maximum length of header text
 */
export const MAX_HEADER_TEXT_LENGTH = 60;

/**
 * Maximum length of body text
 */
export const MAX_BODY_TEXT_LENGTH = 1024;

/**
 * Minimum length of body text (required field)
 */
export const MIN_BODY_TEXT_LENGTH = 1;

/**
 * Maximum length of footer text
 */
export const MAX_FOOTER_TEXT_LENGTH = 60;

// ============================================================================
// CONVERSATION WINDOW CONSTRAINTS
// ============================================================================

/**
 * Duration of the conversation window in milliseconds (24 hours)
 */
export const CONVERSATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Safety margin to prevent edge-case violations (5 minutes)
 */
export const WINDOW_SAFETY_MARGIN_MS = 5 * 60 * 1000;

/**
 * Effective window duration after safety margin
 */
export const EFFECTIVE_WINDOW_MS =
  CONVERSATION_WINDOW_MS - WINDOW_SAFETY_MARGIN_MS;

// ============================================================================
// VALIDATION ERROR MESSAGES
// ============================================================================

export const INTERACTIVE_MESSAGE_ERRORS = {
  // General
  OUTSIDE_CONVERSATION_WINDOW:
    "Interactive messages can only be sent within 24 hours of the customer's last message. Use a template message to re-engage.",
  NO_CUSTOMER_MESSAGES:
    "Cannot send interactive message: Customer has never sent a message. Use a template to initiate the conversation.",

  // Button message errors
  TOO_MANY_BUTTONS: `Maximum ${MAX_REPLY_BUTTONS} buttons allowed per message.`,
  TOO_FEW_BUTTONS: `At least ${MIN_REPLY_BUTTONS} button is required.`,
  BUTTON_TITLE_TOO_LONG: `Button title must not exceed ${MAX_BUTTON_TITLE_LENGTH} characters.`,
  BUTTON_MISSING_ID: "Each button must have a unique ID.",
  BUTTON_MISSING_TITLE: "Each button must have a title.",
  BUTTON_ID_TOO_LONG: `Button ID must not exceed ${MAX_BUTTON_ID_LENGTH} characters.`,
  DUPLICATE_BUTTON_ID: "Button IDs must be unique within the message.",

  // List message errors
  TOO_MANY_SECTIONS: `Maximum ${MAX_LIST_SECTIONS} sections allowed per list message.`,
  TOO_FEW_SECTIONS: `At least ${MIN_LIST_SECTIONS} section is required.`,
  TOO_MANY_ROWS: `Maximum ${MAX_ROWS_PER_SECTION} rows allowed per section.`,
  TOO_FEW_ROWS: `At least ${MIN_ROWS_PER_SECTION} row is required per section.`,
  LIST_BUTTON_TEXT_TOO_LONG: `List button text must not exceed ${MAX_LIST_BUTTON_TEXT_LENGTH} characters.`,
  ROW_TITLE_TOO_LONG: `Row title must not exceed ${MAX_LIST_ROW_TITLE_LENGTH} characters.`,
  ROW_DESCRIPTION_TOO_LONG: `Row description must not exceed ${MAX_LIST_ROW_DESCRIPTION_LENGTH} characters.`,
  ROW_MISSING_ID: "Each row must have a unique ID.",
  ROW_MISSING_TITLE: "Each row must have a title.",
  ROW_ID_TOO_LONG: `Row ID must not exceed ${MAX_LIST_ROW_ID_LENGTH} characters.`,
  SECTION_TITLE_TOO_LONG: `Section title must not exceed ${MAX_SECTION_TITLE_LENGTH} characters.`,
  DUPLICATE_ROW_ID: "Row IDs must be unique within the entire message.",

  // Common errors
  BODY_TEXT_TOO_LONG: `Body text must not exceed ${MAX_BODY_TEXT_LENGTH} characters.`,
  BODY_TEXT_REQUIRED: "Body text is required.",
  HEADER_TEXT_TOO_LONG: `Header text must not exceed ${MAX_HEADER_TEXT_LENGTH} characters.`,
  FOOTER_TEXT_TOO_LONG: `Footer text must not exceed ${MAX_FOOTER_TEXT_LENGTH} characters.`,
} as const;

// ============================================================================
// VALIDATION HELPER TYPES
// ============================================================================

export interface InteractiveMessageValidationError {
  code: keyof typeof INTERACTIVE_MESSAGE_ERRORS;
  message: string;
  field?: string;
  details?: Record<string, unknown>;
}

export interface InteractiveMessageValidationResult {
  isValid: boolean;
  errors: InteractiveMessageValidationError[];
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validates a reply button message according to Meta's constraints
 */
export function validateReplyButtonMessage(
  bodyText: string,
  buttons: Array<{ id: string; title: string }>,
  options?: {
    headerText?: string;
    footerText?: string;
  },
): InteractiveMessageValidationResult {
  const errors: InteractiveMessageValidationError[] = [];

  // Validate body text
  if (!bodyText || bodyText.trim().length === 0) {
    errors.push({
      code: "BODY_TEXT_REQUIRED",
      message: INTERACTIVE_MESSAGE_ERRORS.BODY_TEXT_REQUIRED,
      field: "bodyText",
    });
  } else if (bodyText.length > MAX_BODY_TEXT_LENGTH) {
    errors.push({
      code: "BODY_TEXT_TOO_LONG",
      message: INTERACTIVE_MESSAGE_ERRORS.BODY_TEXT_TOO_LONG,
      field: "bodyText",
      details: { length: bodyText.length, maxLength: MAX_BODY_TEXT_LENGTH },
    });
  }

  // Validate button count
  if (!buttons || buttons.length < MIN_REPLY_BUTTONS) {
    errors.push({
      code: "TOO_FEW_BUTTONS",
      message: INTERACTIVE_MESSAGE_ERRORS.TOO_FEW_BUTTONS,
      field: "buttons",
    });
  } else if (buttons.length > MAX_REPLY_BUTTONS) {
    errors.push({
      code: "TOO_MANY_BUTTONS",
      message: INTERACTIVE_MESSAGE_ERRORS.TOO_MANY_BUTTONS,
      field: "buttons",
      details: { count: buttons.length, maxCount: MAX_REPLY_BUTTONS },
    });
  }

  // Validate each button
  const seenIds = new Set<string>();
  buttons?.forEach((button, index) => {
    if (!button.id) {
      errors.push({
        code: "BUTTON_MISSING_ID",
        message: INTERACTIVE_MESSAGE_ERRORS.BUTTON_MISSING_ID,
        field: `buttons[${index}].id`,
      });
    } else {
      if (seenIds.has(button.id)) {
        errors.push({
          code: "DUPLICATE_BUTTON_ID",
          message: INTERACTIVE_MESSAGE_ERRORS.DUPLICATE_BUTTON_ID,
          field: `buttons[${index}].id`,
          details: { duplicateId: button.id },
        });
      }
      seenIds.add(button.id);

      if (button.id.length > MAX_BUTTON_ID_LENGTH) {
        errors.push({
          code: "BUTTON_ID_TOO_LONG",
          message: INTERACTIVE_MESSAGE_ERRORS.BUTTON_ID_TOO_LONG,
          field: `buttons[${index}].id`,
          details: {
            length: button.id.length,
            maxLength: MAX_BUTTON_ID_LENGTH,
          },
        });
      }
    }

    if (!button.title) {
      errors.push({
        code: "BUTTON_MISSING_TITLE",
        message: INTERACTIVE_MESSAGE_ERRORS.BUTTON_MISSING_TITLE,
        field: `buttons[${index}].title`,
      });
    } else if (button.title.length > MAX_BUTTON_TITLE_LENGTH) {
      errors.push({
        code: "BUTTON_TITLE_TOO_LONG",
        message: INTERACTIVE_MESSAGE_ERRORS.BUTTON_TITLE_TOO_LONG,
        field: `buttons[${index}].title`,
        details: {
          title: button.title,
          length: button.title.length,
          maxLength: MAX_BUTTON_TITLE_LENGTH,
        },
      });
    }
  });

  // Validate optional header
  if (
    options?.headerText &&
    options.headerText.length > MAX_HEADER_TEXT_LENGTH
  ) {
    errors.push({
      code: "HEADER_TEXT_TOO_LONG",
      message: INTERACTIVE_MESSAGE_ERRORS.HEADER_TEXT_TOO_LONG,
      field: "headerText",
      details: {
        length: options.headerText.length,
        maxLength: MAX_HEADER_TEXT_LENGTH,
      },
    });
  }

  // Validate optional footer
  if (
    options?.footerText &&
    options.footerText.length > MAX_FOOTER_TEXT_LENGTH
  ) {
    errors.push({
      code: "FOOTER_TEXT_TOO_LONG",
      message: INTERACTIVE_MESSAGE_ERRORS.FOOTER_TEXT_TOO_LONG,
      field: "footerText",
      details: {
        length: options.footerText.length,
        maxLength: MAX_FOOTER_TEXT_LENGTH,
      },
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a list message according to Meta's constraints
 */
export function validateListMessage(
  bodyText: string,
  buttonText: string,
  sections: Array<{
    title?: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>,
  options?: {
    headerText?: string;
    footerText?: string;
  },
): InteractiveMessageValidationResult {
  const errors: InteractiveMessageValidationError[] = [];

  // Validate body text
  if (!bodyText || bodyText.trim().length === 0) {
    errors.push({
      code: "BODY_TEXT_REQUIRED",
      message: INTERACTIVE_MESSAGE_ERRORS.BODY_TEXT_REQUIRED,
      field: "bodyText",
    });
  } else if (bodyText.length > MAX_BODY_TEXT_LENGTH) {
    errors.push({
      code: "BODY_TEXT_TOO_LONG",
      message: INTERACTIVE_MESSAGE_ERRORS.BODY_TEXT_TOO_LONG,
      field: "bodyText",
      details: { length: bodyText.length, maxLength: MAX_BODY_TEXT_LENGTH },
    });
  }

  // Validate button text
  if (!buttonText || buttonText.trim().length === 0) {
    errors.push({
      code: "BODY_TEXT_REQUIRED",
      message: "List button text is required.",
      field: "buttonText",
    });
  } else if (buttonText.length > MAX_LIST_BUTTON_TEXT_LENGTH) {
    errors.push({
      code: "LIST_BUTTON_TEXT_TOO_LONG",
      message: INTERACTIVE_MESSAGE_ERRORS.LIST_BUTTON_TEXT_TOO_LONG,
      field: "buttonText",
      details: {
        length: buttonText.length,
        maxLength: MAX_LIST_BUTTON_TEXT_LENGTH,
      },
    });
  }

  // Validate section count
  if (!sections || sections.length < MIN_LIST_SECTIONS) {
    errors.push({
      code: "TOO_FEW_SECTIONS",
      message: INTERACTIVE_MESSAGE_ERRORS.TOO_FEW_SECTIONS,
      field: "sections",
    });
  } else if (sections.length > MAX_LIST_SECTIONS) {
    errors.push({
      code: "TOO_MANY_SECTIONS",
      message: INTERACTIVE_MESSAGE_ERRORS.TOO_MANY_SECTIONS,
      field: "sections",
      details: { count: sections.length, maxCount: MAX_LIST_SECTIONS },
    });
  }

  // Track all row IDs across sections for uniqueness
  const allRowIds = new Set<string>();

  // Validate each section
  sections?.forEach((section, sectionIndex) => {
    if (section.title && section.title.length > MAX_SECTION_TITLE_LENGTH) {
      errors.push({
        code: "SECTION_TITLE_TOO_LONG",
        message: INTERACTIVE_MESSAGE_ERRORS.SECTION_TITLE_TOO_LONG,
        field: `sections[${sectionIndex}].title`,
        details: {
          length: section.title.length,
          maxLength: MAX_SECTION_TITLE_LENGTH,
        },
      });
    }

    if (!section.rows || section.rows.length < MIN_ROWS_PER_SECTION) {
      errors.push({
        code: "TOO_FEW_ROWS",
        message: INTERACTIVE_MESSAGE_ERRORS.TOO_FEW_ROWS,
        field: `sections[${sectionIndex}].rows`,
      });
    } else if (section.rows.length > MAX_ROWS_PER_SECTION) {
      errors.push({
        code: "TOO_MANY_ROWS",
        message: INTERACTIVE_MESSAGE_ERRORS.TOO_MANY_ROWS,
        field: `sections[${sectionIndex}].rows`,
        details: { count: section.rows.length, maxCount: MAX_ROWS_PER_SECTION },
      });
    }

    section.rows?.forEach((row, rowIndex) => {
      if (!row.id) {
        errors.push({
          code: "ROW_MISSING_ID",
          message: INTERACTIVE_MESSAGE_ERRORS.ROW_MISSING_ID,
          field: `sections[${sectionIndex}].rows[${rowIndex}].id`,
        });
      } else {
        if (allRowIds.has(row.id)) {
          errors.push({
            code: "DUPLICATE_ROW_ID",
            message: INTERACTIVE_MESSAGE_ERRORS.DUPLICATE_ROW_ID,
            field: `sections[${sectionIndex}].rows[${rowIndex}].id`,
            details: { duplicateId: row.id },
          });
        }
        allRowIds.add(row.id);

        if (row.id.length > MAX_LIST_ROW_ID_LENGTH) {
          errors.push({
            code: "ROW_ID_TOO_LONG",
            message: INTERACTIVE_MESSAGE_ERRORS.ROW_ID_TOO_LONG,
            field: `sections[${sectionIndex}].rows[${rowIndex}].id`,
            details: {
              length: row.id.length,
              maxLength: MAX_LIST_ROW_ID_LENGTH,
            },
          });
        }
      }

      if (!row.title) {
        errors.push({
          code: "ROW_MISSING_TITLE",
          message: INTERACTIVE_MESSAGE_ERRORS.ROW_MISSING_TITLE,
          field: `sections[${sectionIndex}].rows[${rowIndex}].title`,
        });
      } else if (row.title.length > MAX_LIST_ROW_TITLE_LENGTH) {
        errors.push({
          code: "ROW_TITLE_TOO_LONG",
          message: INTERACTIVE_MESSAGE_ERRORS.ROW_TITLE_TOO_LONG,
          field: `sections[${sectionIndex}].rows[${rowIndex}].title`,
          details: {
            title: row.title,
            length: row.title.length,
            maxLength: MAX_LIST_ROW_TITLE_LENGTH,
          },
        });
      }

      if (
        row.description &&
        row.description.length > MAX_LIST_ROW_DESCRIPTION_LENGTH
      ) {
        errors.push({
          code: "ROW_DESCRIPTION_TOO_LONG",
          message: INTERACTIVE_MESSAGE_ERRORS.ROW_DESCRIPTION_TOO_LONG,
          field: `sections[${sectionIndex}].rows[${rowIndex}].description`,
          details: {
            length: row.description.length,
            maxLength: MAX_LIST_ROW_DESCRIPTION_LENGTH,
          },
        });
      }
    });
  });

  // Validate optional header
  if (
    options?.headerText &&
    options.headerText.length > MAX_HEADER_TEXT_LENGTH
  ) {
    errors.push({
      code: "HEADER_TEXT_TOO_LONG",
      message: INTERACTIVE_MESSAGE_ERRORS.HEADER_TEXT_TOO_LONG,
      field: "headerText",
      details: {
        length: options.headerText.length,
        maxLength: MAX_HEADER_TEXT_LENGTH,
      },
    });
  }

  // Validate optional footer
  if (
    options?.footerText &&
    options.footerText.length > MAX_FOOTER_TEXT_LENGTH
  ) {
    errors.push({
      code: "FOOTER_TEXT_TOO_LONG",
      message: INTERACTIVE_MESSAGE_ERRORS.FOOTER_TEXT_TOO_LONG,
      field: "footerText",
      details: {
        length: options.footerText.length,
        maxLength: MAX_FOOTER_TEXT_LENGTH,
      },
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Truncates a string to the specified maximum length, respecting word boundaries.
 * This ensures button text doesn't cut words mid-way, providing a better user experience.
 *
 * Strategy:
 * 1. If text fits within limit, return as-is
 * 2. Find the last complete word that fits within the limit
 * 3. If no word boundary found, fall back to character truncation with ellipsis
 *
 * @param text - The text to truncate
 * @param maxLength - Maximum allowed length
 * @returns Truncated text that respects word boundaries when possible
 */
export function truncateToLimit(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) {
    return text;
  }

  // Try to find a word boundary to truncate at
  // Look for the last space within the limit (leaving room for potential ellipsis)
  const truncateAt = maxLength - 1; // Reserve space for ellipsis character
  const lastSpaceIndex = text.lastIndexOf(" ", truncateAt);

  // If we found a reasonable word boundary (at least 3 chars before it),
  // use it. Otherwise, just truncate with ellipsis.
  if (lastSpaceIndex > 3) {
    // Check if we can fit the word without ellipsis
    const wordBoundaryText = text.substring(0, lastSpaceIndex).trim();
    if (wordBoundaryText.length <= maxLength) {
      return wordBoundaryText;
    }
  }

  // Fallback: truncate at character boundary with ellipsis
  return text.substring(0, truncateAt) + "…";
}

/**
 * Sanitizes button title to meet Meta's requirements
 */
export function sanitizeButtonTitle(title: string): string {
  return truncateToLimit(title.trim(), MAX_BUTTON_TITLE_LENGTH);
}

/**
 * Sanitizes list row title to meet Meta's requirements
 */
export function sanitizeRowTitle(title: string): string {
  return truncateToLimit(title.trim(), MAX_LIST_ROW_TITLE_LENGTH);
}

/**
 * Sanitizes list row description to meet Meta's requirements
 */
export function sanitizeRowDescription(description: string): string {
  return truncateToLimit(description.trim(), MAX_LIST_ROW_DESCRIPTION_LENGTH);
}

/**
 * Sanitizes footer text to meet Meta's requirements
 */
export function sanitizeFooterText(text: string): string {
  return truncateToLimit(text.trim(), MAX_FOOTER_TEXT_LENGTH);
}

/**
 * Checks if interactive messages can be sent based on the conversation window
 */
export function canSendInteractiveMessage(
  lastInboundMessageTime: Date | null,
  referenceTime: Date = new Date(),
): { canSend: boolean; reason?: string; timeRemainingMs: number } {
  if (!lastInboundMessageTime) {
    return {
      canSend: false,
      reason: INTERACTIVE_MESSAGE_ERRORS.NO_CUSTOMER_MESSAGES,
      timeRemainingMs: 0,
    };
  }

  const lastInboundTime = new Date(lastInboundMessageTime).getTime();
  const now = referenceTime.getTime();
  const timeSinceLastInbound = now - lastInboundTime;
  const timeRemainingMs = Math.max(
    0,
    EFFECTIVE_WINDOW_MS - timeSinceLastInbound,
  );

  if (timeSinceLastInbound >= EFFECTIVE_WINDOW_MS) {
    return {
      canSend: false,
      reason: INTERACTIVE_MESSAGE_ERRORS.OUTSIDE_CONVERSATION_WINDOW,
      timeRemainingMs: 0,
    };
  }

  return {
    canSend: true,
    timeRemainingMs,
  };
}
