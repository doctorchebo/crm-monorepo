/**
 * Mailgun Email Provider for Password Reset
 *
 * Sends password reset emails via Mailgun API.
 * Fetches API key from SSM Parameter Store (cached for 5 minutes).
 */

import Mailgun from "mailgun.js";
import FormData from "form-data";
import { PasswordResetEmailPayload, EmailSendResult } from "../types";
import { getSSMParameter } from "../ssm";

const MAILGUN_API_KEY_PARAM =
  process.env.MAILGUN_API_KEY_PARAM || "/crm/mailgun/api-key";

export class MailgunProvider {
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

  private async initialize(): Promise<void> {
    if (this.client) {
      return;
    }

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

  async sendPasswordResetEmail(
    payload: PasswordResetEmailPayload,
  ): Promise<EmailSendResult> {
    await this.initialize();

    const subject = "Reset Your Password";
    const expiresFormatted = payload.expiresAt.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });

    const htmlBody = this.buildPasswordResetEmailHtml(
      payload,
      expiresFormatted,
    );
    const textBody = this.buildPasswordResetEmailText(
      payload,
      expiresFormatted,
    );

    try {
      const result = await this.client!.messages.create(this.domain, {
        from: this.senderEmail,
        to: payload.to,
        subject,
        text: textBody,
        html: htmlBody,
      });

      console.log(`Password reset email sent successfully: ${result.id}`);
      return {
        success: true,
        messageId: result.id,
      };
    } catch (error: any) {
      const statusCode = error.status || error.statusCode || 500;

      console.error(`Mailgun error (${statusCode}): ${error.message}`);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  private buildPasswordResetEmailHtml(
    payload: PasswordResetEmailPayload,
    expiresFormatted: string,
  ): string {
    const greeting = payload.name ? `Hi ${payload.name},` : "Hi,";

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Reset Your Password</h1>
    </div>
    
    <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px; margin-bottom: 20px;">
            ${greeting}
        </p>
        
        <p style="font-size: 16px; margin-bottom: 20px;">
            We received a request to reset your password. Click the button below to create a new password.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
            <a href="${payload.resetUrl}" 
               style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); 
                      color: white; 
                      padding: 14px 30px; 
                      text-decoration: none; 
                      border-radius: 6px; 
                      font-weight: 600;
                      display: inline-block;">
                Reset Password
            </a>
        </div>
        
        <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
            This link expires on <strong>${expiresFormatted}</strong>.
        </p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        
        <p style="font-size: 12px; color: #9ca3af;">
            If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
        </p>
        
        <p style="font-size: 12px; color: #9ca3af;">
            Can't click the button? Copy and paste this URL into your browser:<br>
            <a href="${payload.resetUrl}" style="color: #f97316; word-break: break-all;">
                ${payload.resetUrl}
            </a>
        </p>
    </div>
</body>
</html>
    `.trim();
  }

  private buildPasswordResetEmailText(
    payload: PasswordResetEmailPayload,
    expiresFormatted: string,
  ): string {
    const greeting = payload.name ? `Hi ${payload.name},` : "Hi,";

    return `
${greeting}

We received a request to reset your password.

Click the link below to create a new password:
${payload.resetUrl}

This link expires on ${expiresFormatted}.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
    `.trim();
  }
}
