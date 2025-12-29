/**
 * Phone Number Utilities
 *
 * Provides robust phone number parsing and formatting with automatic country code detection.
 * Uses the countries-list library which is already a dependency.
 */

import { countries } from "countries-list";

export interface ParsedPhoneNumber {
  countryCode: string; // e.g., "+1", "+591"
  nationalNumber: string; // e.g., "4155552671", "67131914"
  fullNumber: string; // e.g., "+14155552671", "+59167131914"
  countryIso: string | null; // e.g., "US", "BO"
  isValid: boolean;
}

export interface CountryInfo {
  code: string; // ISO code, e.g., "US"
  name: string; // e.g., "United States"
  dialCode: string; // e.g., "+1"
  flag: string; // emoji flag
}

// Build a sorted list of country dial codes for matching
// Sorted by dial code length (longest first) for accurate matching
const DIAL_CODES: { dialCode: string; countryCode: string }[] = Object.entries(
  countries
)
  .flatMap(([code, data]) => {
    // Some countries have multiple dial codes
    const phones = Array.isArray(data.phone) ? data.phone : [data.phone];
    return phones.map((phone) => ({
      dialCode: `+${phone}`,
      countryCode: code,
    }));
  })
  .filter((item) => item.dialCode && item.dialCode !== "+")
  .sort((a, b) => b.dialCode.length - a.dialCode.length);

/**
 * Generate flag emoji from ISO country code
 */
export function getFlagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return "🌍";

  try {
    const codePoints = countryCode
      .toUpperCase()
      .split("")
      .map((char) => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  } catch {
    return "🌍";
  }
}

/**
 * Get country info by ISO code
 */
export function getCountryByIso(iso: string): CountryInfo | null {
  const country = countries[iso as keyof typeof countries];
  if (!country) return null;

  const phone = Array.isArray(country.phone) ? country.phone[0] : country.phone;
  return {
    code: iso,
    name: country.name,
    dialCode: `+${phone}`,
    flag: getFlagEmoji(iso),
  };
}

/**
 * Get country info by dial code
 */
export function getCountryByDialCode(dialCode: string): CountryInfo | null {
  const normalized = dialCode.startsWith("+") ? dialCode : `+${dialCode}`;

  for (const item of DIAL_CODES) {
    if (item.dialCode === normalized) {
      return getCountryByIso(item.countryCode);
    }
  }
  return null;
}

/**
 * Parse a phone number string and extract country code and national number.
 *
 * This function handles various input formats:
 * - E.164 format: +14155552671
 * - With spaces/dashes: +1 415 555-2671
 * - Just digits: 14155552671
 *
 * @param phoneNumber - The phone number to parse
 * @returns Parsed phone number object with country code, national number, etc.
 */
export function parsePhoneNumber(phoneNumber: string): ParsedPhoneNumber {
  // Default invalid result
  const invalid: ParsedPhoneNumber = {
    countryCode: "",
    nationalNumber: "",
    fullNumber: phoneNumber,
    countryIso: null,
    isValid: false,
  };

  if (!phoneNumber) return invalid;

  // Clean the input: remove spaces, dashes, parentheses
  let cleaned = phoneNumber.replace(/[\s\-()]/g, "");

  // Ensure it starts with +
  if (!cleaned.startsWith("+")) {
    cleaned = `+${cleaned}`;
  }

  // Validate: must have at least some digits after potential country code
  const digitCount = cleaned.replace(/\D/g, "").length;
  if (digitCount < 7 || digitCount > 15) {
    // Still return what we can
    return {
      ...invalid,
      fullNumber: cleaned,
    };
  }

  // Try to match country code by checking dial codes (longest first)
  for (const { dialCode, countryCode } of DIAL_CODES) {
    if (cleaned.startsWith(dialCode)) {
      const nationalNumber = cleaned.substring(dialCode.length);

      // Validate national number has reasonable length
      if (nationalNumber.length >= 4 && nationalNumber.length <= 12) {
        return {
          countryCode: dialCode,
          nationalNumber,
          fullNumber: cleaned,
          countryIso: countryCode,
          isValid: true,
        };
      }
    }
  }

  // Could not determine country code - return with full number
  // Try to make a best guess: assume first 1-3 digits could be country code
  const match = cleaned.match(/^\+(\d{1,3})(\d{6,12})$/);
  if (match) {
    return {
      countryCode: `+${match[1]}`,
      nationalNumber: match[2],
      fullNumber: cleaned,
      countryIso: null,
      isValid: true,
    };
  }

  return {
    ...invalid,
    fullNumber: cleaned,
  };
}

/**
 * Format a phone number for display.
 *
 * @param countryCode - Country dial code (e.g., "+1")
 * @param nationalNumber - National number (e.g., "4155552671")
 * @returns Formatted display string
 */
export function formatPhoneForDisplay(
  countryCode: string,
  nationalNumber: string
): string {
  if (!countryCode || !nationalNumber) return "";
  return `${countryCode} ${nationalNumber}`;
}

/**
 * Create E.164 formatted phone number.
 *
 * @param countryCode - Country dial code (e.g., "+1")
 * @param nationalNumber - National number (e.g., "4155552671")
 * @returns E.164 formatted string (e.g., "+14155552671")
 */
export function toE164(countryCode: string, nationalNumber: string): string {
  const code = countryCode.startsWith("+") ? countryCode : `+${countryCode}`;
  return `${code}${nationalNumber.replace(/\D/g, "")}`;
}

/**
 * Validate if a phone number string is in valid E.164 format.
 *
 * @param phoneNumber - Phone number to validate
 * @returns True if valid E.164 format
 */
export function isValidE164(phoneNumber: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phoneNumber);
}

/**
 * Extract phone number parts from a full E.164 number.
 * This is a convenience wrapper around parsePhoneNumber.
 *
 * @param fullPhoneNumber - Full phone number in E.164 format
 * @returns Object with countryCode and phoneNumber (national)
 */
export function extractPhoneNumberParts(fullPhoneNumber: string): {
  countryCode: string;
  phoneNumber: string;
} {
  const parsed = parsePhoneNumber(fullPhoneNumber);
  return {
    countryCode: parsed.countryCode,
    phoneNumber: parsed.nationalNumber,
  };
}
