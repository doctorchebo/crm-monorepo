/**
 * Template Components Validation
 *
 * Client-side validation for template components that mirrors
 * the backend validation logic. Provides immediate feedback
 * in the editor before submission.
 */

import type {
  CarouselCard,
  TemplateButton,
  TemplateComponents,
  TemplateHeader,
} from "@/lib/types/template-components.types";
import {
  isMediaHeader,
  isTextHeader,
} from "@/lib/types/template-components.types";

// ============================================================================
// CONSTANTS - Must match backend TEMPLATE_LIMITS
// ============================================================================

export const TEMPLATE_LIMITS = {
  // Name
  NAME_MAX_LENGTH: 512,

  // Header
  HEADER_TEXT_MAX_LENGTH: 60,
  HEADER_TEXT_MAX_VARIABLES: 1,

  // Body
  BODY_MAX_LENGTH: 1024,
  BODY_MIN_LENGTH: 1,
  BODY_MAX_VARIABLES: 10,

  // Footer
  FOOTER_MAX_LENGTH: 60,

  // Buttons
  MAX_BUTTONS_TOTAL: 10,
  MAX_QUICK_REPLY_BUTTONS: 10,
  MAX_URL_BUTTONS: 2,
  MAX_PHONE_BUTTONS: 1,
  MAX_COPY_CODE_BUTTONS: 1,
  MAX_OTP_BUTTONS: 1,
  BUTTON_TEXT_MAX_LENGTH: 25,
  BUTTON_URL_MAX_LENGTH: 2000,
  PHONE_NUMBER_MAX_LENGTH: 20,
  COPY_CODE_MAX_LENGTH: 15,

  // Authentication
  AUTH_CODE_MAX_LENGTH: 15,
  AUTH_EXPIRATION_MIN_MINUTES: 1,
  AUTH_EXPIRATION_MAX_MINUTES: 90,

  // Carousel
  MAX_CAROUSEL_CARDS: 10,
  MAX_BUTTONS_PER_CARD: 2,

  // Media
  IMAGE_MAX_SIZE_MB: 5,
  VIDEO_MAX_SIZE_MB: 16,
  DOCUMENT_MAX_SIZE_MB: 100,
  SUPPORTED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/webp"] as const,
  SUPPORTED_VIDEO_TYPES: ["video/mp4", "video/3gpp"] as const,
  SUPPORTED_DOCUMENT_TYPES: ["application/pdf"] as const,
} as const;

// ============================================================================
// TYPES
// ============================================================================

export type TemplateCategory = "utility" | "marketing" | "authentication";

export interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
  code?: string;
}

export interface ValidationResult {
  isValid: boolean;
  canSubmit: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  errorCount: number;
  warningCount: number;
}

// ============================================================================
// VARIABLE POSITION UTILITIES
// ============================================================================

/**
 * Pattern string for template variables
 * Matches patterns like {{variable_name}}, {{customer.first_name}}, {{1}}
 *
 * IMPORTANT: We use a pattern string and create fresh RegExp instances
 * to avoid global regex state issues. Never use a global regex with .test()
 * or .exec() on a module-level const, as the lastIndex persists between calls.
 */
const VARIABLE_PATTERN = "\\{\\{[^}]+\\}\\}";

/**
 * Check if text contains any template variables
 */
function containsVariables(text: string): boolean {
  return new RegExp(VARIABLE_PATTERN).test(text);
}

/**
 * Find all variable matches in text
 */
function findAllVariables(text: string): RegExpMatchArray[] {
  return [...text.matchAll(new RegExp(VARIABLE_PATTERN, "g"))];
}

/**
 * Find the first variable match in text
 */
function findFirstVariable(text: string): RegExpMatchArray | null {
  return text.match(new RegExp(VARIABLE_PATTERN));
}

/**
 * Punctuation and symbols that Meta API ignores when checking variable positions.
 * If a variable is only preceded/followed by these characters (and whitespace),
 * Meta still considers it as starting/ending with a variable.
 *
 * Includes: . , ! ? ; : ' " ( ) [ ] { } < > … — – -
 */
const IGNORABLE_PUNCTUATION_REGEX = /^[\s.,!?;:'"()\[\]{}<>…—–-]*$/;

/**
 * Check if text starts with a variable (after trimming whitespace and ignorable punctuation)
 * Meta API doesn't allow variables at the start of template components.
 *
 * Examples:
 * - "{{name}} hello" → true (starts with variable)
 * - "Hi {{name}}" → false (starts with "Hi")
 * - "...{{name}}" → true (only punctuation before variable)
 */
export function startsWithVariable(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!containsVariables(trimmed)) return false;

  // Find the first variable
  const match = findFirstVariable(trimmed);
  if (!match || match.index === undefined) return false;

  // Check what comes before the first variable
  const beforeVariable = trimmed.slice(0, match.index);

  // If nothing before, or only ignorable punctuation, it effectively starts with a variable
  return IGNORABLE_PUNCTUATION_REGEX.test(beforeVariable);
}

/**
 * Check if text ends with a variable (after trimming whitespace and ignorable punctuation)
 * Meta API doesn't allow variables at the end of template components.
 *
 * Examples:
 * - "Hello {{name}}" → true (ends with variable)
 * - "{{name}} hello" → false (ends with "hello")
 * - "{{name}}." → true (only punctuation after variable)
 * - "{{name}}!" → true (only punctuation after variable)
 * - "{{date}}. Thanks!" → false (has "Thanks!" which is actual text)
 */
export function endsWithVariable(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();

  // Find all variables
  const matches = findAllVariables(trimmed);
  if (matches.length === 0) return false;

  // Get the last variable match
  const lastMatch = matches[matches.length - 1];
  const matchEnd = (lastMatch.index ?? 0) + lastMatch[0].length;

  // Check what comes after the last variable
  const afterVariable = trimmed.slice(matchEnd);

  // If nothing after, or only ignorable punctuation, it effectively ends with a variable
  return IGNORABLE_PUNCTUATION_REGEX.test(afterVariable);
}

/**
 * Validate variable positions in text
 * Returns validation errors for leading or trailing variables
 */
export function validateVariablePositions(
  text: string,
  field: string,
  componentName: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (startsWithVariable(text)) {
    errors.push({
      field,
      message: `${componentName} cannot start with a variable. Add text before the first variable.`,
      severity: "error",
      code: `${field.toUpperCase().replace(".", "_")}_STARTS_WITH_VARIABLE`,
    });
  }

  if (endsWithVariable(text)) {
    errors.push({
      field,
      message: `${componentName} cannot end with a variable. Add text after the last variable.`,
      severity: "error",
      code: `${field.toUpperCase().replace(".", "_")}_ENDS_WITH_VARIABLE`,
    });
  }

  return errors;
}

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

/**
 * Validate complete template components
 *
 * @param components - The template components to validate
 * @param category - Template category (affects validation rules)
 * @returns ValidationResult with errors and warnings
 */
export function validateComponents(
  components: TemplateComponents,
  category: TemplateCategory = "utility",
): ValidationResult {
  const allErrors: ValidationError[] = [];

  // Validate header
  if (components.header) {
    allErrors.push(...validateHeader(components.header, category));
  }

  // Validate body (required)
  allErrors.push(...validateBody(components, category));

  // Validate footer
  if (components.footer?.text) {
    allErrors.push(...validateFooter(components.footer.text));
  }

  // Validate buttons
  if (components.buttons && components.buttons.length > 0) {
    allErrors.push(...validateButtons(components.buttons, category));
  }

  // Validate category-specific components
  allErrors.push(...validateCategorySpecific(components, category));

  // Validate carousel
  if (components.carousel && components.carousel.length > 0) {
    allErrors.push(...validateCarousel(components.carousel, category));
  }

  // Separate errors and warnings
  const errors = allErrors.filter((e) => e.severity === "error");
  const warnings = allErrors.filter((e) => e.severity === "warning");

  return {
    isValid: errors.length === 0,
    canSubmit: errors.length === 0,
    errors,
    warnings,
    errorCount: errors.length,
    warningCount: warnings.length,
  };
}

// ============================================================================
// HEADER VALIDATION
// ============================================================================

function validateHeader(
  header: TemplateHeader,
  category: TemplateCategory,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (isTextHeader(header)) {
    // Validate text length
    if (header.text.length > TEMPLATE_LIMITS.HEADER_TEXT_MAX_LENGTH) {
      errors.push({
        field: "header.text",
        message: `Header text cannot exceed ${TEMPLATE_LIMITS.HEADER_TEXT_MAX_LENGTH} characters`,
        severity: "error",
        code: "HEADER_TEXT_TOO_LONG",
      });
    }

    // Count variables
    const variables = header.text.match(/\{\{[^}]+\}\}/g) || [];
    if (variables.length > TEMPLATE_LIMITS.HEADER_TEXT_MAX_VARIABLES) {
      errors.push({
        field: "header.text",
        message: `Header can only have ${TEMPLATE_LIMITS.HEADER_TEXT_MAX_VARIABLES} variable`,
        severity: "error",
        code: "HEADER_TOO_MANY_VARIABLES",
      });
    }

    // Auth templates: no header text allowed
    if (category === "authentication" && header.text.length > 0) {
      errors.push({
        field: "header.text",
        message: "Authentication templates cannot have header text",
        severity: "error",
        code: "AUTH_NO_HEADER_TEXT",
      });
    }

    // Check for variables at start or end (Meta API restriction)
    if (header.text.trim().length > 0) {
      errors.push(
        ...validateVariablePositions(header.text, "header.text", "Header"),
      );
    }
  }

  if (isMediaHeader(header)) {
    // Media headers require an asset handle for submission
    if (!header.assetHandle && !header.handle && !header.url) {
      errors.push({
        field: "header",
        message: "Media header requires an uploaded file or URL",
        severity: "warning",
        code: "HEADER_MEDIA_REQUIRED",
      });
    }

    // Auth templates: no media headers
    if (category === "authentication") {
      errors.push({
        field: "header",
        message: "Authentication templates cannot have media headers",
        severity: "error",
        code: "AUTH_NO_MEDIA_HEADER",
      });
    }
  }

  return errors;
}

// ============================================================================
// BODY VALIDATION
// ============================================================================

function validateBody(
  components: TemplateComponents,
  category: TemplateCategory,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const bodyText = components.body?.text || "";

  // Body is required
  if (!bodyText || bodyText.trim().length === 0) {
    errors.push({
      field: "body.text",
      message: "Body text is required",
      severity: "error",
      code: "BODY_TEXT_REQUIRED",
    });
    return errors;
  }

  // Check body length
  if (bodyText.length > TEMPLATE_LIMITS.BODY_MAX_LENGTH) {
    errors.push({
      field: "body.text",
      message: `Body text cannot exceed ${TEMPLATE_LIMITS.BODY_MAX_LENGTH} characters`,
      severity: "error",
      code: "BODY_TEXT_TOO_LONG",
    });
  }

  // Count variables
  const variables = bodyText.match(/\{\{[^}]+\}\}/g) || [];
  if (variables.length > TEMPLATE_LIMITS.BODY_MAX_VARIABLES) {
    errors.push({
      field: "body.text",
      message: `Body cannot have more than ${TEMPLATE_LIMITS.BODY_MAX_VARIABLES} variables. Found ${variables.length}.`,
      severity: "error",
      code: "BODY_TOO_MANY_VARIABLES",
    });
  }

  // Authentication templates specific rules
  if (category === "authentication") {
    // Must contain the OTP code placeholder
    if (!bodyText.includes("{{")) {
      errors.push({
        field: "body.text",
        message:
          "Authentication template body must contain a variable for the OTP code",
        severity: "error",
        code: "AUTH_BODY_MISSING_OTP_PLACEHOLDER",
      });
    }

    // Cannot contain URLs
    if (/https?:\/\//.test(bodyText)) {
      errors.push({
        field: "body.text",
        message: "Authentication templates cannot contain URLs",
        severity: "error",
        code: "AUTH_BODY_NO_URLS",
      });
    }

    // Cannot contain emojis
    if (/[\u{1F600}-\u{1F64F}]/u.test(bodyText)) {
      errors.push({
        field: "body.text",
        message: "Authentication templates cannot contain emojis",
        severity: "error",
        code: "AUTH_BODY_NO_EMOJIS",
      });
    }
  }

  // Check for variables at start or end (Meta API restriction)
  // This applies to all template categories
  errors.push(...validateVariablePositions(bodyText, "body.text", "Body"));

  return errors;
}

// ============================================================================
// FOOTER VALIDATION
// ============================================================================

function validateFooter(footerText: string): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check footer length
  if (footerText.length > TEMPLATE_LIMITS.FOOTER_MAX_LENGTH) {
    errors.push({
      field: "footer.text",
      message: `Footer text cannot exceed ${TEMPLATE_LIMITS.FOOTER_MAX_LENGTH} characters`,
      severity: "error",
      code: "FOOTER_TEXT_TOO_LONG",
    });
  }

  // Footer cannot have variables
  if (/\{\{[^}]+\}\}/.test(footerText)) {
    errors.push({
      field: "footer.text",
      message: "Footer cannot contain variables",
      severity: "error",
      code: "FOOTER_NO_VARIABLES",
    });
  }

  return errors;
}

// ============================================================================
// BUTTON VALIDATION
// ============================================================================

function validateButtons(
  buttons: TemplateButton[],
  category: TemplateCategory,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Total button count
  if (buttons.length > TEMPLATE_LIMITS.MAX_BUTTONS_TOTAL) {
    errors.push({
      field: "buttons",
      message: `Cannot have more than ${TEMPLATE_LIMITS.MAX_BUTTONS_TOTAL} buttons`,
      severity: "error",
      code: "BUTTONS_TOO_MANY",
    });
  }

  // Count by type
  const buttonCounts: Record<string, number> = {};
  buttons.forEach((b) => {
    buttonCounts[b.type] = (buttonCounts[b.type] || 0) + 1;
  });

  // URL buttons max 2
  if ((buttonCounts["URL"] || 0) > TEMPLATE_LIMITS.MAX_URL_BUTTONS) {
    errors.push({
      field: "buttons",
      message: `Cannot have more than ${TEMPLATE_LIMITS.MAX_URL_BUTTONS} URL buttons`,
      severity: "error",
      code: "BUTTONS_TOO_MANY_URL",
    });
  }

  // Phone buttons max 1
  if ((buttonCounts["PHONE_NUMBER"] || 0) > TEMPLATE_LIMITS.MAX_PHONE_BUTTONS) {
    errors.push({
      field: "buttons",
      message: `Cannot have more than ${TEMPLATE_LIMITS.MAX_PHONE_BUTTONS} phone number button`,
      severity: "error",
      code: "BUTTONS_TOO_MANY_PHONE",
    });
  }

  // Copy code buttons max 1
  if (
    (buttonCounts["COPY_CODE"] || 0) > TEMPLATE_LIMITS.MAX_COPY_CODE_BUTTONS
  ) {
    errors.push({
      field: "buttons",
      message: `Cannot have more than ${TEMPLATE_LIMITS.MAX_COPY_CODE_BUTTONS} copy code button`,
      severity: "error",
      code: "BUTTONS_TOO_MANY_COPY_CODE",
    });
  }

  // Validate individual buttons
  buttons.forEach((button, index) => {
    const prefix = `buttons[${index}]`;

    // Button text required and length check
    if (button.type !== "OTP") {
      if (!button.text || button.text.trim().length === 0) {
        errors.push({
          field: `${prefix}.text`,
          message: "Button text is required",
          severity: "error",
          code: "BUTTON_TEXT_REQUIRED",
        });
      } else if (button.text.length > TEMPLATE_LIMITS.BUTTON_TEXT_MAX_LENGTH) {
        errors.push({
          field: `${prefix}.text`,
          message: `Button text cannot exceed ${TEMPLATE_LIMITS.BUTTON_TEXT_MAX_LENGTH} characters`,
          severity: "error",
          code: "BUTTON_TEXT_TOO_LONG",
        });
      }
    }

    // URL button validation
    if (button.type === "URL") {
      const urlButton = button as { url?: string };
      if (!urlButton.url || urlButton.url.trim().length === 0) {
        errors.push({
          field: `${prefix}.url`,
          message: "URL is required for URL buttons",
          severity: "error",
          code: "BUTTON_URL_REQUIRED",
        });
      } else if (urlButton.url.length > TEMPLATE_LIMITS.BUTTON_URL_MAX_LENGTH) {
        errors.push({
          field: `${prefix}.url`,
          message: `URL cannot exceed ${TEMPLATE_LIMITS.BUTTON_URL_MAX_LENGTH} characters`,
          severity: "error",
          code: "BUTTON_URL_TOO_LONG",
        });
      }
    }

    // Phone button validation
    if (button.type === "PHONE_NUMBER") {
      const phoneButton = button as { phoneNumber?: string };
      if (
        !phoneButton.phoneNumber ||
        phoneButton.phoneNumber.trim().length === 0
      ) {
        errors.push({
          field: `${prefix}.phoneNumber`,
          message: "Phone number is required",
          severity: "error",
          code: "BUTTON_PHONE_REQUIRED",
        });
      } else if (!/^\+?[0-9]+$/.test(phoneButton.phoneNumber)) {
        errors.push({
          field: `${prefix}.phoneNumber`,
          message:
            "Phone number must contain only digits and optional leading +",
          severity: "error",
          code: "BUTTON_PHONE_INVALID",
        });
      }
    }

    // Flow button validation
    if (button.type === "FLOW") {
      const flowButton = button as { flowId?: string };
      if (!flowButton.flowId || flowButton.flowId.trim().length === 0) {
        errors.push({
          field: `${prefix}.flowId`,
          message: "Flow ID is required for flow buttons",
          severity: "error",
          code: "BUTTON_FLOW_ID_REQUIRED",
        });
      }
    }
  });

  // Authentication templates: only OTP and COPY_CODE buttons allowed
  if (category === "authentication") {
    const hasInvalidButton = buttons.some(
      (b) => b.type !== "OTP" && b.type !== "COPY_CODE",
    );
    if (hasInvalidButton) {
      errors.push({
        field: "buttons",
        message:
          "Authentication templates can only have OTP or Copy Code buttons",
        severity: "error",
        code: "AUTH_INVALID_BUTTON_TYPE",
      });
    }
  }

  return errors;
}

// ============================================================================
// CATEGORY-SPECIFIC VALIDATION
// ============================================================================

function validateCategorySpecific(
  components: TemplateComponents,
  category: TemplateCategory,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Limited time offer only for marketing
  if (components.limitedTimeOffer && category !== "marketing") {
    errors.push({
      field: "limitedTimeOffer",
      message: "Limited time offers are only allowed in marketing templates",
      severity: "error",
      code: "LTO_MARKETING_ONLY",
    });
  }

  // Carousel only for marketing
  if (
    components.carousel &&
    components.carousel.length > 0 &&
    category !== "marketing"
  ) {
    errors.push({
      field: "carousel",
      message: "Carousels are only allowed in marketing templates",
      severity: "error",
      code: "CAROUSEL_MARKETING_ONLY",
    });
  }

  // Authentication config only for authentication
  if (components.authentication && category !== "authentication") {
    errors.push({
      field: "authentication",
      message:
        "Authentication configuration is only allowed in authentication templates",
      severity: "error",
      code: "AUTH_CONFIG_AUTH_ONLY",
    });
  }

  // Validate authentication config
  if (components.authentication && category === "authentication") {
    const authConfig = components.authentication;
    if (authConfig.codeExpirationMinutes !== undefined) {
      if (
        authConfig.codeExpirationMinutes <
        TEMPLATE_LIMITS.AUTH_EXPIRATION_MIN_MINUTES
      ) {
        errors.push({
          field: "authentication.codeExpirationMinutes",
          message: `Code expiration must be at least ${TEMPLATE_LIMITS.AUTH_EXPIRATION_MIN_MINUTES} minute`,
          severity: "error",
          code: "AUTH_EXPIRATION_TOO_SHORT",
        });
      }
      if (
        authConfig.codeExpirationMinutes >
        TEMPLATE_LIMITS.AUTH_EXPIRATION_MAX_MINUTES
      ) {
        errors.push({
          field: "authentication.codeExpirationMinutes",
          message: `Code expiration cannot exceed ${TEMPLATE_LIMITS.AUTH_EXPIRATION_MAX_MINUTES} minutes`,
          severity: "error",
          code: "AUTH_EXPIRATION_TOO_LONG",
        });
      }
    }
  }

  return errors;
}

// ============================================================================
// CAROUSEL VALIDATION
// ============================================================================

function validateCarousel(
  carousel: CarouselCard[],
  category: TemplateCategory,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Max cards
  if (carousel.length > TEMPLATE_LIMITS.MAX_CAROUSEL_CARDS) {
    errors.push({
      field: "carousel",
      message: `Cannot have more than ${TEMPLATE_LIMITS.MAX_CAROUSEL_CARDS} carousel cards`,
      severity: "error",
      code: "CAROUSEL_TOO_MANY_CARDS",
    });
  }

  // Min cards for carousel
  if (carousel.length > 0 && carousel.length < 2) {
    errors.push({
      field: "carousel",
      message: "Carousel must have at least 2 cards",
      severity: "error",
      code: "CAROUSEL_MIN_CARDS",
    });
  }

  // Validate each card
  carousel.forEach((card, index) => {
    const prefix = `carousel[${index}]`;

    // Card header required (must be media)
    if (!card.header) {
      errors.push({
        field: `${prefix}.header`,
        message: "Carousel card header is required",
        severity: "error",
        code: "CAROUSEL_CARD_HEADER_REQUIRED",
      });
    } else {
      // Header must be IMAGE or VIDEO for carousel
      if (card.header.format !== "IMAGE" && card.header.format !== "VIDEO") {
        errors.push({
          field: `${prefix}.header`,
          message: "Carousel card header must be IMAGE or VIDEO",
          severity: "error",
          code: "CAROUSEL_CARD_HEADER_MEDIA_ONLY",
        });
      }

      // Media must be uploaded
      if (!card.header.assetHandle && !card.header.handle && !card.header.url) {
        errors.push({
          field: `${prefix}.header`,
          message: "Carousel card requires an uploaded media file",
          severity: "warning",
          code: "CAROUSEL_CARD_MEDIA_REQUIRED",
        });
      }
    }

    // Card body required
    if (!card.body?.text || card.body.text.trim().length === 0) {
      errors.push({
        field: `${prefix}.body`,
        message: "Carousel card body text is required",
        severity: "error",
        code: "CAROUSEL_CARD_BODY_REQUIRED",
      });
    }

    // Card buttons limit
    if (
      card.buttons &&
      card.buttons.length > TEMPLATE_LIMITS.MAX_BUTTONS_PER_CARD
    ) {
      errors.push({
        field: `${prefix}.buttons`,
        message: `Carousel cards can have at most ${TEMPLATE_LIMITS.MAX_BUTTONS_PER_CARD} buttons`,
        severity: "error",
        code: "CAROUSEL_CARD_TOO_MANY_BUTTONS",
      });
    }

    // Validate card buttons
    if (card.buttons && card.buttons.length > 0) {
      const buttonErrors = validateButtons(card.buttons, category);
      errors.push(
        ...buttonErrors.map((e) => ({
          ...e,
          field: `${prefix}.${e.field}`,
        })),
      );
    }
  });

  return errors;
}

// ============================================================================
// QUICK VALIDATION HELPERS
// ============================================================================

/**
 * Quick check if components are valid
 */
export function isComponentsValid(
  components: TemplateComponents,
  category: TemplateCategory = "utility",
): boolean {
  return validateComponents(components, category).isValid;
}

/**
 * Get validation summary for display
 */
export function getValidationSummary(
  components: TemplateComponents,
  category: TemplateCategory = "utility",
): { isValid: boolean; errorCount: number; warningCount: number } {
  const result = validateComponents(components, category);
  return {
    isValid: result.isValid,
    errorCount: result.errorCount,
    warningCount: result.warningCount,
  };
}
