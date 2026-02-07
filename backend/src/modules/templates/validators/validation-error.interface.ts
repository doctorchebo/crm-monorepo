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
