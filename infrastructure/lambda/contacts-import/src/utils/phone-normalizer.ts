/**
 * Phone number normalization utilities
 * Handles E.164 format conversion
 */

/**
 * Normalize a phone number to E.164-like format
 * Removes spaces, dashes, and other formatting
 */
export function normalizePhoneNumber(
    phone: string,
    defaultCountryCode: string = "+1"
): string {
    if (!phone) return "";

    // Remove all non-digit characters except leading +
    let normalized = phone.replace(/[^\d+]/g, "");

    // If starts with +, keep it
    if (normalized.startsWith("+")) {
        return normalized;
    }

    // If starts with 00, replace with +
    if (normalized.startsWith("00")) {
        return "+" + normalized.slice(2);
    }

    // If it's a full international number without +
    if (normalized.length >= 11) {
        return "+" + normalized;
    }

    // Otherwise, prepend default country code
    return defaultCountryCode + normalized;
}

/**
 * Validate phone number format
 * Returns true if the phone appears to be valid
 */
export function isValidPhoneNumber(phone: string): boolean {
    if (!phone) return false;

    const normalized = normalizePhoneNumber(phone);

    // Must start with +
    if (!normalized.startsWith("+")) return false;

    // Must have at least 8 digits (minimum for international)
    const digits = normalized.replace(/\D/g, "");
    if (digits.length < 8) return false;

    // Must not exceed 15 digits (E.164 max)
    if (digits.length > 15) return false;

    return true;
}

/**
 * Extract country code from a phone number
 * Returns null if cannot determine
 */
export function extractCountryCode(phone: string): string | null {
    const normalized = normalizePhoneNumber(phone);
    if (!normalized.startsWith("+")) return null;

    // Common country code patterns (1-3 digits)
    // This is a simplified approach - production should use libphonenumber
    const match = normalized.match(/^\+(\d{1,3})/);
    if (match) {
        return "+" + match[1];
    }
    return null;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
    if (!email) return false;

    // Basic email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
}

/**
 * Parse a full name into first and last name
 * Used when only a "name" or "full_name" column is present
 */
export function parseName(fullName: string): {
    firstName: string;
    lastName: string | null;
} {
    if (!fullName || !fullName.trim()) {
        return { firstName: "", lastName: null };
    }

    const parts = fullName.trim().split(/\s+/);

    if (parts.length === 1) {
        return { firstName: parts[0], lastName: null };
    }

    return {
        firstName: parts[0],
        lastName: parts.slice(1).join(" "),
    };
}
