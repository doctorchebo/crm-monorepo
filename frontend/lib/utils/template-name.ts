/**
 * Template Name Utilities
 *
 * Utilities for converting between user-friendly display names
 * and Meta-compliant template names.
 *
 * Meta WhatsApp Business API template naming rules:
 * - Must be lowercase
 * - Only letters, numbers, and underscores
 * - Must start with a letter
 * - No spaces or special characters
 * - Maximum 512 characters
 */

/**
 * Convert a user-friendly display name to a Meta-compliant template name.
 *
 * Examples:
 * - "Order Confirmation" → "order_confirmation"
 * - "Invoice #123 Ready!" → "invoice_123_ready"
 * - "¡Bienvenido!" → "bienvenido"
 * - "   Multiple   Spaces   " → "multiple_spaces"
 * - "Special $#@! Characters" → "special_characters"
 * - "123 Starts with number" → "template_123_starts_with_number"
 *
 * @param displayName - The user-friendly display name
 * @returns Meta-compliant template name
 */
export function toMetaTemplateName(displayName: string): string {
  if (!displayName || typeof displayName !== "string") {
    return "";
  }

  let name = displayName
    // Normalize unicode characters (é → e, ñ → n, etc.)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Convert to lowercase
    .toLowerCase()
    // Replace spaces and common separators with underscores
    .replace(/[\s\-\.\/\\]+/g, "_")
    // Remove any character that's not alphanumeric or underscore
    .replace(/[^a-z0-9_]/g, "")
    // Collapse multiple underscores
    .replace(/_+/g, "_")
    // Remove leading/trailing underscores
    .replace(/^_+|_+$/g, "")
    // Ensure maximum length (Meta allows 512, we'll use 256 for safety)
    .substring(0, 256);

  // Ensure it starts with a letter (Meta requirement)
  if (name && !/^[a-z]/.test(name)) {
    name = "template_" + name;
  }

  return name;
}

/**
 * Convert a Meta-compliant template name back to a display-friendly format.
 * This is a best-effort conversion for cases where displayName is not available.
 *
 * Examples:
 * - "order_confirmation" → "Order Confirmation"
 * - "invoice_123_ready" → "Invoice 123 Ready"
 *
 * @param name - The Meta-compliant template name
 * @returns Human-readable display name
 */
export function toDisplayName(name: string): string {
  if (!name || typeof name !== "string") {
    return "";
  }

  return (
    name
      // Replace underscores with spaces
      .replace(/_/g, " ")
      // Capitalize first letter of each word
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim()
  );
}

/**
 * Validate if a string is a valid Meta template name.
 *
 * @param name - The template name to validate
 * @returns Object with isValid flag and optional error message
 */
export function validateMetaTemplateName(name: string): {
  isValid: boolean;
  error?: string;
} {
  if (!name || typeof name !== "string") {
    return { isValid: false, error: "Template name is required" };
  }

  if (name.length > 512) {
    return {
      isValid: false,
      error: "Template name must be 512 characters or less",
    };
  }

  if (!/^[a-z]/.test(name)) {
    return {
      isValid: false,
      error: "Template name must start with a lowercase letter",
    };
  }

  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    return {
      isValid: false,
      error:
        "Template name can only contain lowercase letters, numbers, and underscores",
    };
  }

  if (/__/.test(name)) {
    return {
      isValid: false,
      error: "Template name cannot contain consecutive underscores",
    };
  }

  if (/_$/.test(name)) {
    return {
      isValid: false,
      error: "Template name cannot end with an underscore",
    };
  }

  return { isValid: true };
}
