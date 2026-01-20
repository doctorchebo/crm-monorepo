/**
 * Password Reset Email Types
 */

/**
 * Message format for password reset email SQS queue
 */
export interface PasswordResetEmailMessage {
  /** User ID requesting the reset */
  userId: number;
  /** Recipient email address */
  email: string;
  /** User's display name (for personalization) */
  name?: string;
  /** Password reset token (unhashed) */
  token: string;
  /** When the token expires */
  expiresAt: string;
}

/**
 * Payload for sending password reset email
 */
export interface PasswordResetEmailPayload {
  /** Recipient email */
  to: string;
  /** User's name for personalization */
  name?: string;
  /** Full URL to reset password page */
  resetUrl: string;
  /** Token expiry time */
  expiresAt: Date;
}

/**
 * Email provider result
 */
export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}
