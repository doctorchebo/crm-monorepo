/**
 * useComponentValidation Hook
 *
 * Provides real-time validation state for template components
 * in the enhanced template editor. Optimized with debouncing
 * to avoid excessive re-validation on rapid input changes.
 */

import type { TemplateComponents } from "@/lib/types/template-components.types";
import {
  getValidationSummary,
  validateComponents,
  type TemplateCategory,
  type ValidationError,
  type ValidationResult,
} from "@/lib/validation/template-components.validation";
import { useCallback, useEffect, useMemo, useState } from "react";

// ============================================================================
// TYPES
// ============================================================================

export interface UseComponentValidationOptions {
  /** Template category for validation rules */
  category?: TemplateCategory;
  /** Debounce delay in ms (default: 300) */
  debounceMs?: number;
  /** Validate immediately on mount (default: false) */
  validateOnMount?: boolean;
  /** Filter errors to specific fields */
  fieldFilter?: string[];
  /** Only show errors for touched fields (default: true) */
  showOnlyTouched?: boolean;
}

export interface UseComponentValidationResult {
  /** Full validation result (includes all errors regardless of touched state) */
  validation: ValidationResult;
  /** Quick access - are components valid? (checks all fields) */
  isValid: boolean;
  /** Can submit for approval? (no errors in all fields) */
  canSubmit: boolean;
  /** Total error count (all fields) */
  errorCount: number;
  /** Total warning count (all fields) */
  warningCount: number;
  /** Visible error count (touched fields only when showOnlyTouched is true) */
  visibleErrorCount: number;
  /** Visible warning count (touched fields only when showOnlyTouched is true) */
  visibleWarningCount: number;
  /** Get errors for a specific field (respects touched state) */
  getFieldErrors: (field: string) => ValidationError[];
  /** Get warnings for a specific field (respects touched state) */
  getFieldWarnings: (field: string) => ValidationError[];
  /** Check if a specific field has errors (respects touched state) */
  hasFieldError: (field: string) => boolean;
  /** Check if a field has been touched */
  isFieldTouched: (field: string) => boolean;
  /** Mark a field as touched */
  touchField: (field: string) => void;
  /** Mark multiple fields as touched */
  touchFields: (fields: string[]) => void;
  /** Mark all fields as touched (useful before form submission) */
  touchAll: () => void;
  /** Reset all touched state */
  resetTouched: () => void;
  /** Force re-validation */
  revalidate: () => void;
  /** Is currently validating (during debounce) */
  isValidating: boolean;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for real-time template component validation
 *
 * @example
 * ```tsx
 * function MyEditor({ components, category }) {
 *   const { isValid, getFieldErrors, hasFieldError, touchField } = useComponentValidation(
 *     components,
 *     { category, debounceMs: 300 }
 *   );
 *
 *   return (
 *     <div>
 *       <input
 *         className={hasFieldError('body.text') ? 'error' : ''}
 *         onBlur={() => touchField('body.text')}
 *       />
 *       {getFieldErrors('body.text').map(e => (
 *         <span key={e.code}>{e.message}</span>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useComponentValidation(
  components: TemplateComponents | null | undefined,
  options: UseComponentValidationOptions = {},
): UseComponentValidationResult {
  const {
    category = "utility",
    debounceMs = 300,
    validateOnMount = false,
    fieldFilter,
    showOnlyTouched = true,
  } = options;

  // Track which fields have been touched by the user
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());

  // Empty validation result
  const emptyResult: ValidationResult = useMemo(
    () => ({
      isValid: true,
      canSubmit: true,
      errors: [],
      warnings: [],
      errorCount: 0,
      warningCount: 0,
    }),
    [],
  );

  const [validation, setValidation] = useState<ValidationResult>(emptyResult);
  const [isValidating, setIsValidating] = useState(false);

  // Debounced validation effect
  useEffect(() => {
    // No components = empty/valid
    if (!components) {
      setValidation(emptyResult);
      return;
    }

    // Skip initial validation if not validateOnMount
    const shouldValidate =
      validateOnMount || Object.keys(components).length > 0;
    if (!shouldValidate) {
      return;
    }

    setIsValidating(true);

    const timer = setTimeout(() => {
      const result = validateComponents(components, category);

      // Apply field filter if specified
      if (fieldFilter && fieldFilter.length > 0) {
        const filteredErrors = result.errors.filter((e) =>
          fieldFilter.some((f) => e.field.startsWith(f)),
        );
        const filteredWarnings = result.warnings.filter((e) =>
          fieldFilter.some((f) => e.field.startsWith(f)),
        );

        setValidation({
          ...result,
          errors: filteredErrors,
          warnings: filteredWarnings,
          errorCount: filteredErrors.length,
          warningCount: filteredWarnings.length,
          isValid: filteredErrors.length === 0,
          canSubmit: filteredErrors.length === 0,
        });
      } else {
        setValidation(result);
      }

      setIsValidating(false);
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      setIsValidating(false);
    };
  }, [
    components,
    category,
    debounceMs,
    fieldFilter,
    validateOnMount,
    emptyResult,
  ]);

  // Helper to check if a field (or parent field) is touched
  const isFieldTouched = useCallback(
    (field: string): boolean => {
      // Check if the exact field is touched
      if (touchedFields.has(field)) return true;

      // Check if any parent field is touched (e.g., "body" covers "body.text")
      const parts = field.split(".");
      for (let i = 1; i < parts.length; i++) {
        const parentField = parts.slice(0, i).join(".");
        if (touchedFields.has(parentField)) return true;
      }

      // Check if any child field is touched (e.g., "body.text" touched means "body" shows)
      for (const touched of touchedFields) {
        if (touched.startsWith(`${field}.`)) return true;
      }

      return false;
    },
    [touchedFields],
  );

  // Mark a field as touched
  const touchField = useCallback((field: string) => {
    setTouchedFields((prev) => {
      if (prev.has(field)) return prev;
      const next = new Set(prev);
      next.add(field);
      return next;
    });
  }, []);

  // Mark multiple fields as touched
  const touchFields = useCallback((fields: string[]) => {
    setTouchedFields((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const field of fields) {
        if (!next.has(field)) {
          next.add(field);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  // Mark all component fields as touched (for form submission)
  const touchAll = useCallback(() => {
    const allFields = new Set<string>();
    // Add all possible field paths based on validation errors and common fields
    allFields.add("body");
    allFields.add("body.text");
    allFields.add("header");
    allFields.add("header.text");
    allFields.add("header.media");
    allFields.add("footer");
    allFields.add("footer.text");
    allFields.add("buttons");
    allFields.add("carousel");

    // Also add all fields that have errors
    validation.errors.forEach((e) => allFields.add(e.field));
    validation.warnings.forEach((e) => allFields.add(e.field));

    setTouchedFields(allFields);
  }, [validation.errors, validation.warnings]);

  // Reset touched state
  const resetTouched = useCallback(() => {
    setTouchedFields(new Set());
  }, []);

  // Get errors for a specific field (respects touched state)
  const getFieldErrors = useCallback(
    (field: string): ValidationError[] => {
      // If showOnlyTouched is enabled and field is not touched, return empty
      if (showOnlyTouched && !isFieldTouched(field)) {
        return [];
      }
      return validation.errors.filter(
        (e) => e.field === field || e.field.startsWith(`${field}.`),
      );
    },
    [validation.errors, showOnlyTouched, isFieldTouched],
  );

  // Get warnings for a specific field (respects touched state)
  const getFieldWarnings = useCallback(
    (field: string): ValidationError[] => {
      // If showOnlyTouched is enabled and field is not touched, return empty
      if (showOnlyTouched && !isFieldTouched(field)) {
        return [];
      }
      return validation.warnings.filter(
        (e) => e.field === field || e.field.startsWith(`${field}.`),
      );
    },
    [validation.warnings, showOnlyTouched, isFieldTouched],
  );

  // Check if field has errors (respects touched state)
  const hasFieldError = useCallback(
    (field: string): boolean => {
      // If showOnlyTouched is enabled and field is not touched, return false
      if (showOnlyTouched && !isFieldTouched(field)) {
        return false;
      }
      return validation.errors.some(
        (e) => e.field === field || e.field.startsWith(`${field}.`),
      );
    },
    [validation.errors, showOnlyTouched, isFieldTouched],
  );

  // Calculate visible counts (only touched fields)
  const visibleErrorCount = useMemo(() => {
    if (!showOnlyTouched) return validation.errorCount;
    return validation.errors.filter((e) => isFieldTouched(e.field)).length;
  }, [
    validation.errors,
    validation.errorCount,
    showOnlyTouched,
    isFieldTouched,
  ]);

  const visibleWarningCount = useMemo(() => {
    if (!showOnlyTouched) return validation.warningCount;
    return validation.warnings.filter((e) => isFieldTouched(e.field)).length;
  }, [
    validation.warnings,
    validation.warningCount,
    showOnlyTouched,
    isFieldTouched,
  ]);

  // Force revalidation
  const revalidate = useCallback(() => {
    if (!components) {
      setValidation(emptyResult);
      return;
    }

    const result = validateComponents(components, category);
    setValidation(result);
  }, [components, category, emptyResult]);

  return {
    validation,
    isValid: validation.isValid,
    canSubmit: validation.canSubmit,
    errorCount: validation.errorCount,
    warningCount: validation.warningCount,
    visibleErrorCount,
    visibleWarningCount,
    getFieldErrors,
    getFieldWarnings,
    hasFieldError,
    isFieldTouched,
    touchField,
    touchFields,
    touchAll,
    resetTouched,
    revalidate,
    isValidating,
  };
}

// ============================================================================
// QUICK VALIDATION HOOK (no debounce, instant)
// ============================================================================

/**
 * Quick validation without debouncing - use for form submission validation
 *
 * @example
 * ```tsx
 * function SubmitButton({ components, category, onSubmit }) {
 *   const { isValid, errorCount } = useQuickValidation(components, category);
 *
 *   return (
 *     <button disabled={!isValid} onClick={onSubmit}>
 *       Submit {!isValid && `(${errorCount} errors)`}
 *     </button>
 *   );
 * }
 * ```
 */
export function useQuickValidation(
  components: TemplateComponents | null | undefined,
  category: TemplateCategory = "utility",
): { isValid: boolean; errorCount: number; warningCount: number } {
  return useMemo(() => {
    if (!components) {
      return { isValid: true, errorCount: 0, warningCount: 0 };
    }
    return getValidationSummary(components, category);
  }, [components, category]);
}

// ============================================================================
// FIELD VALIDATION HOOK
// ============================================================================

/**
 * Focused validation for a single field - useful for inline error messages
 *
 * @example
 * ```tsx
 * function BodyTextInput({ components, onChange }) {
 *   const { errors, hasError, message } = useFieldValidation(
 *     components,
 *     'body.text',
 *     'utility'
 *   );
 *
 *   return (
 *     <div>
 *       <textarea className={hasError ? 'error-border' : ''} />
 *       {message && <span className="error-text">{message}</span>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useFieldValidation(
  components: TemplateComponents | null | undefined,
  field: string,
  category: TemplateCategory = "utility",
): {
  errors: ValidationError[];
  warnings: ValidationError[];
  hasError: boolean;
  hasWarning: boolean;
  message: string | null;
} {
  return useMemo(() => {
    if (!components) {
      return {
        errors: [],
        warnings: [],
        hasError: false,
        hasWarning: false,
        message: null,
      };
    }

    const result = validateComponents(components, category);

    const fieldErrors = result.errors.filter(
      (e) => e.field === field || e.field.startsWith(`${field}.`),
    );
    const fieldWarnings = result.warnings.filter(
      (e) => e.field === field || e.field.startsWith(`${field}.`),
    );

    return {
      errors: fieldErrors,
      warnings: fieldWarnings,
      hasError: fieldErrors.length > 0,
      hasWarning: fieldWarnings.length > 0,
      message: fieldErrors[0]?.message || fieldWarnings[0]?.message || null,
    };
  }, [components, field, category]);
}
