/**
 * Email Provider Interface
 *
 * Abstraction layer for email sending.
 * Allows switching between Mailgun, SES, or mock provider via config.
 */

import { InvitationEmailPayload, SendResult } from "../types";

export interface EmailProvider {
  /**
   * Send an invitation email
   */
  sendInvitationEmail(payload: InvitationEmailPayload): Promise<SendResult>;

  /**
   * Provider name for logging
   */
  readonly name: string;
}

export type EmailProviderType = "mailgun" | "ses" | "mock";

export function getProviderType(): EmailProviderType {
  const provider = process.env.EMAIL_PROVIDER || "mock";
  if (provider === "mailgun" || provider === "ses" || provider === "mock") {
    return provider;
  }
  console.warn(`Unknown EMAIL_PROVIDER: ${provider}, defaulting to mock`);
  return "mock";
}
