/**
 * Mailgun Email Provider
 *
 * Sends emails via Mailgun API.
 * Fetches API key from SSM Parameter Store (cached for 5 minutes).
 * Handles 4xx (permanent) vs 5xx (transient) errors for retry logic.
 */

import Mailgun from "mailgun.js";
import FormData from "form-data";
import { EmailProvider } from "./email-provider.interface";
import { InvitationEmailPayload, SendResult } from "../types";
import { getSSMParameter } from "../ssm";

// SSM parameter name for Mailgun API key
const MAILGUN_API_KEY_PARAM =
  process.env.MAILGUN_API_KEY_PARAM || "/crm/mailgun/api-key";

export class MailgunProvider implements EmailProvider {
  public readonly name = "mailgun";
  private client: ReturnType<Mailgun["client"]> | null = null;
  private readonly domain: string;
  private readonly senderEmail: string;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.domain = process.env.MAILGUN_DOMAIN || "";
    this.senderEmail = process.env.SENDER_EMAIL || `noreply@${this.domain}`;

    if (!this.domain) {
      throw new Error("MAILGUN_DOMAIN environment variable is required");
    }
  }

  /**
   * Lazy initialization - fetches API key from SSM on first use
   */
  private async initialize(): Promise<void> {
    if (this.client) {
      return; // Already initialized
    }

    // Prevent multiple concurrent initializations
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    console.log("[MailgunProvider] Fetching API key from SSM...");

    const apiKey = await getSSMParameter(MAILGUN_API_KEY_PARAM);

    const mailgun = new Mailgun(FormData);
    this.client = mailgun.client({
      username: "api",
      key: apiKey,
    });

    console.log("[MailgunProvider] Initialized successfully");
  }

  async sendInvitationEmail(
    payload: InvitationEmailPayload,
  ): Promise<SendResult> {
    // Ensure initialized before sending
    await this.initialize();

    const subject = `You've been invited to join ${payload.teamName}`;
    const expiresFormatted = payload.expiresAt.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const htmlBody = this.buildInvitationEmailHtml(payload, expiresFormatted);
    const textBody = this.buildInvitationEmailText(payload, expiresFormatted);

    try {
      const result = await this.client!.messages.create(this.domain, {
        from: this.senderEmail,
        to: payload.to,
        subject,
        text: textBody,
        html: htmlBody,
      });

      console.log(`Email sent successfully: ${result.id}`);
      return {
        success: true,
        messageId: result.id,
      };
    } catch (error: any) {
      const statusCode = error.status || error.statusCode || 500;
      const isPermanent = statusCode >= 400 && statusCode < 500;

      console.error(`Mailgun error (${statusCode}): ${error.message}`);

      return {
        success: false,
        error: error.message,
        permanent: isPermanent,
      };
    }
  }

  private buildInvitationEmailHtml(
    payload: InvitationEmailPayload,
    expiresFormatted: string,
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Team Invitation</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">You're Invited!</h1>
    </div>
    
    <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px; margin-bottom: 20px;">
            <strong>${payload.inviterName}</strong> has invited you to join 
            <strong>${payload.teamName}</strong> as a <strong>${payload.role}</strong>.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
            <a href="${payload.invitationUrl}" 
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                      color: white; 
                      padding: 14px 30px; 
                      text-decoration: none; 
                      border-radius: 6px; 
                      font-weight: 600;
                      display: inline-block;">
                Accept Invitation
            </a>
        </div>
        
        <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
            This invitation expires on <strong>${expiresFormatted}</strong>.
        </p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        
        <p style="font-size: 12px; color: #9ca3af;">
            If you didn't expect this invitation, you can safely ignore this email.
        </p>
        
        <p style="font-size: 12px; color: #9ca3af;">
            Can't click the button? Copy and paste this URL into your browser:<br>
            <a href="${payload.invitationUrl}" style="color: #667eea; word-break: break-all;">
                ${payload.invitationUrl}
            </a>
        </p>
    </div>
</body>
</html>
        `.trim();
  }

  private buildInvitationEmailText(
    payload: InvitationEmailPayload,
    expiresFormatted: string,
  ): string {
    return `
You've been invited to join ${payload.teamName}!

${payload.inviterName} has invited you to join ${payload.teamName} as a ${payload.role}.

Click the link below to accept the invitation:
${payload.invitationUrl}

This invitation expires on ${expiresFormatted}.

If you didn't expect this invitation, you can safely ignore this email.
        `.trim();
  }
}
