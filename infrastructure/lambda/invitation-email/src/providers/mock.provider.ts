/**
 * Mock Email Provider
 *
 * For local development and testing.
 * Logs email content instead of sending.
 */

import { EmailProvider } from "./email-provider.interface";
import { InvitationEmailPayload, SendResult } from "../types";

export class MockEmailProvider implements EmailProvider {
  public readonly name = "mock";

  async sendInvitationEmail(
    payload: InvitationEmailPayload,
  ): Promise<SendResult> {
    console.log("=".repeat(60));
    console.log("MOCK EMAIL PROVIDER - Would send invitation email:");
    console.log("=".repeat(60));
    console.log(`To: ${payload.to}`);
    console.log(`Team: ${payload.teamName}`);
    console.log(`Inviter: ${payload.inviterName}`);
    console.log(`Role: ${payload.role}`);
    console.log(`URL: ${payload.invitationUrl}`);
    console.log(`Expires: ${payload.expiresAt.toISOString()}`);
    console.log("=".repeat(60));

    // Simulate successful send
    return {
      success: true,
      messageId: `mock-${Date.now()}`,
    };
  }
}
