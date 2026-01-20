/**
 * Password validation utility
 * Provides comprehensive password strength checking with detailed error messages
 */

export interface PasswordValidationResult {
  isValid: boolean;
  errors: PasswordError[];
  strength: PasswordStrength;
  score: number; // 0-5 based on requirements met
}

export type PasswordStrength = "weak" | "fair" | "good" | "strong";

export interface PasswordError {
  key: string;
  message: string;
}

export interface PasswordRequirement {
  key: string;
  test: (password: string) => boolean;
  messageKey: string;
}

/**
 * Password requirements for validation
 * Each requirement has a unique key for translation lookup
 */
export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  {
    key: "minLength",
    test: (password) => password.length >= 8,
    messageKey: "security.passwordRequirements.minLength",
  },
  {
    key: "uppercase",
    test: (password) => /[A-Z]/.test(password),
    messageKey: "security.passwordRequirements.uppercase",
  },
  {
    key: "lowercase",
    test: (password) => /[a-z]/.test(password),
    messageKey: "security.passwordRequirements.lowercase",
  },
  {
    key: "number",
    test: (password) => /[0-9]/.test(password),
    messageKey: "security.passwordRequirements.number",
  },
  {
    key: "special",
    test: (password) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
    messageKey: "security.passwordRequirements.special",
  },
];

/**
 * Validates a password against all requirements
 * Returns detailed validation result with errors and strength rating
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: PasswordError[] = [];
  let score = 0;

  for (const requirement of PASSWORD_REQUIREMENTS) {
    if (requirement.test(password)) {
      score++;
    } else {
      errors.push({
        key: requirement.key,
        message: requirement.messageKey,
      });
    }
  }

  const strength = getPasswordStrength(score);
  const isValid = errors.length === 0;

  return {
    isValid,
    errors,
    strength,
    score,
  };
}

/**
 * Determines password strength based on requirements score
 */
function getPasswordStrength(score: number): PasswordStrength {
  if (score <= 2) return "weak";
  if (score === 3) return "fair";
  if (score === 4) return "good";
  return "strong";
}

/**
 * Get color class for password strength indicator
 */
export function getStrengthColor(strength: PasswordStrength): string {
  switch (strength) {
    case "weak":
      return "bg-red-500";
    case "fair":
      return "bg-orange-500";
    case "good":
      return "bg-yellow-500";
    case "strong":
      return "bg-green-500";
    default:
      return "bg-gray-300";
  }
}

/**
 * Get text color class for password strength
 */
export function getStrengthTextColor(strength: PasswordStrength): string {
  switch (strength) {
    case "weak":
      return "text-red-500";
    case "fair":
      return "text-orange-500";
    case "good":
      return "text-yellow-600";
    case "strong":
      return "text-green-500";
    default:
      return "text-gray-500";
  }
}
