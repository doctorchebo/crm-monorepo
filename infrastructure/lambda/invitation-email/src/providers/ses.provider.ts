/**
 * SES Email Provider (Stub)
 *
 * Placeholder for AWS SES integration.
 * To be implemented when migrating from Mailgun.
 */

import { EmailProvider } from "./email-provider.interface";
import { InvitationEmailPayload, SendResult } from "../types";

export class SESProvider implements EmailProvider {
  public readonly name = "ses";

  async sendInvitationEmail(
    payload: InvitationEmailPayload,
  ): Promise<SendResult> {
    // TODO: Implement SES integration
    // - Use @aws-sdk/client-ses
    // - Handle bounce/complaint topics
    // - Support configuration sets

    console.warn("SES provider is not yet implemented");
    console.log(`Would send email to: ${payload.to}`);
    console.log(`Team: ${payload.teamName}`);
    console.log(`URL: ${payload.invitationUrl}`);

    return {
      success: false,
      error: "SES provider not yet implemented",
      permanent: true,
    };
  }
}
