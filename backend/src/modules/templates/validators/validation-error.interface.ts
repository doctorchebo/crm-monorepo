/**
 * Standard validation error interface
 * Used across all template validators
 */
export interface ValidationError {
  /** Field that has the error */
  field: string;
  /** Human-readable error message */
  message: string;
  /** Severity level */
  severity: 'error' | 'warning';
  /** Machine-readable error code for programmatic handling */
  code?: string;
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Helper to create a validation result from an array of errors
 */
export function createValidationResult(
  errors: ValidationError[],
): ValidationResult {
  return {
    isValid: !errors.some((e) => e.severity === 'error'),
    errors: errors.filter((e) => e.severity === 'error'),
    warnings: errors.filter((e) => e.severity === 'warning'),
  };
}

// ============================================================================
// VARIABLE POSITION UTILITIES
// ============================================================================

/**
 * Punctuation and symbols that Meta API ignores when checking variable positions.
 * If a variable is only preceded/followed by these characters (and whitespace),
 * Meta still considers it as starting/ending with a variable.
 *
 * Includes: . , ! ? ; : ' " ( ) [ ] { } < > … — – -
 */
const IGNORABLE_CHARS_PATTERN = /^[\s.,!?;:'"()\[\]{}<>…—–-]*$/;

/**
 * Pattern to match a single template variable.
 * Used as a fresh regex literal to avoid global state issues.
 */
const VARIABLE_PATTERN = /\{\{[^}]+\}\}/;

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

  // Find the first variable (use non-global regex to avoid state issues)
  const match = trimmed.match(VARIABLE_PATTERN);
  if (!match || match.index === undefined) return false;

  // Check what comes before the first variable
  const beforeVariable = trimmed.slice(0, match.index);

  // If nothing before, or only ignorable punctuation, it effectively starts with a variable
  return IGNORABLE_CHARS_PATTERN.test(beforeVariable);
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

  // Find all variables using matchAll with a fresh regex instance
  const matches = [...trimmed.matchAll(new RegExp(VARIABLE_PATTERN, 'g'))];
  if (matches.length === 0) return false;

  // Get the last variable match
  const lastMatch = matches[matches.length - 1];
  const matchEnd = (lastMatch.index ?? 0) + lastMatch[0].length;

  // Check what comes after the last variable
  const afterVariable = trimmed.slice(matchEnd);

  // If nothing after, or only ignorable punctuation, it effectively ends with a variable
  return IGNORABLE_CHARS_PATTERN.test(afterVariable);
}

/**
 * Validate variable positions in text
 * Returns validation errors for leading or trailing variables
 *
 * @param text - The text to validate
 * @param field - The field name for error reporting
 * @param componentName - Human-readable component name for error messages
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
      severity: 'error',
      code: `${field.toUpperCase().replace('.', '_')}_STARTS_WITH_VARIABLE`,
    });
  }

  if (endsWithVariable(text)) {
    errors.push({
      field,
      message: `${componentName} cannot end with a variable. Add text after the last variable.`,
      severity: 'error',
      code: `${field.toUpperCase().replace('.', '_')}_ENDS_WITH_VARIABLE`,
    });
  }

  return errors;
}
