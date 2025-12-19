import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { Request, Response } from 'express';
import { TemplateApprovalService } from './services/template-approval.service';
import { TemplateWebhookGateway } from './template.webhook.gateway';

/**
 * Meta Template Webhook Payload Types
 * Based on Meta's message_template_status_update webhook structure
 */
export interface MetaTemplateStatusWebhookPayload {
  object: 'whatsapp_business_account';
  entry: Array<{
    id: string; // WABA ID
    time: number; // Unix timestamp
    changes: Array<{
      value: {
        event: 'message_template_status_update';
        message_template_id: number;
        message_template_name: string;
        message_template_language: string;
        message_template_status: TemplateWebhookEvent;
        reason?: string; // Rejection reason
        other_info?: {
          title?: string;
          description?: string;
        };
        disable_info?: {
          disable_date: string; // ISO date
        };
      };
      field: 'message_template_status_update';
    }>;
  }>;
}

export type TemplateWebhookEvent =
  | 'APPROVED'
  | 'REJECTED'
  | 'PENDING'
  | 'PAUSED'
  | 'DISABLED'
  | 'FLAGGED'
  | 'IN_APPEAL'
  | 'REINSTATED'
  | 'PENDING_DELETION';

/**
 * Custom guard to allow public access to webhook endpoints
 * Meta needs to access these endpoints without authentication
 */
@Injectable()
class NoAuthGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}

/**
 * Template Status Webhook Controller
 *
 * Handles webhooks from Meta Cloud API for template status updates:
 * - Webhook verification challenge (GET /webhook/templates)
 * - Template status change notifications (POST /webhook/templates)
 *
 * Events handled:
 * - APPROVED: Template was approved for use
 * - REJECTED: Template was rejected (includes reason)
 * - PENDING: Template is under review
 * - PAUSED: Template was paused due to quality issues
 * - DISABLED: Template was disabled
 * - FLAGGED: Template was flagged for review
 * - IN_APPEAL: Appeal was submitted
 * - REINSTATED: Template was reinstated after appeal
 * - PENDING_DELETION: Template is scheduled for deletion
 *
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components#message-template-status-update
 */
@Controller('webhook/templates')
@UseGuards(NoAuthGuard)
export class TemplateWebhookController {
  private readonly logger = new Logger(TemplateWebhookController.name);
  private readonly metaVerifyToken: string;
  private readonly metaAppSecret: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly approvalService: TemplateApprovalService,
    private readonly webhookGateway: TemplateWebhookGateway,
  ) {
    this.metaVerifyToken = this.configService.get<string>(
      'META_VERIFY_TOKEN',
      '',
    );
    this.metaAppSecret = this.configService.get<string>('META_APP_SECRET');

    if (!this.metaVerifyToken) {
      this.logger.warn(
        'META_VERIFY_TOKEN not configured - webhook verification will fail',
      );
    }
  }

  /**
   * Webhook verification challenge from Meta
   * GET /webhook/templates?hub.mode=subscribe&hub.verify_token=xxx&hub.challenge=yyy
   *
   * Meta sends this to verify we control the endpoint before enabling webhooks.
   * We must echo back the challenge value.
   */
  @Get()
  verifyWebhook(
    @Query('hub.mode') hubMode: string,
    @Query('hub.verify_token') hubVerifyToken: string,
    @Query('hub.challenge') hubChallenge: string,
    @Res() res: Response,
  ): void {
    this.logger.log('=== TEMPLATE WEBHOOK VERIFICATION REQUEST ===');
    this.logger.log(`hub.mode: ${hubMode}`);
    this.logger.log(
      `hub.verify_token: ${hubVerifyToken ? '[REDACTED]' : 'missing'}`,
    );
    this.logger.log(`hub.challenge: ${hubChallenge ? '[PRESENT]' : 'missing'}`);

    // Validate the verification request
    if (hubMode !== 'subscribe') {
      this.logger.warn(`Invalid hub.mode: ${hubMode}`);
      res.status(403).json({ error: 'Invalid mode' });
      return;
    }

    if (!hubVerifyToken || hubVerifyToken !== this.metaVerifyToken) {
      this.logger.warn('Invalid or missing verify token');
      res.status(403).json({ error: 'Invalid verification token' });
      return;
    }

    if (!hubChallenge) {
      this.logger.warn('Missing hub.challenge');
      res.status(400).json({ error: 'Missing challenge' });
      return;
    }

    this.logger.log('✅ Template webhook verification SUCCESS');

    // Return plain text challenge (not JSON)
    res.set('Content-Type', 'text/plain');
    res.status(200).send(hubChallenge);
  }

  /**
   * Handle template status update webhooks from Meta
   * POST /webhook/templates
   *
   * Meta sends X-Hub-Signature-256 header with HMAC SHA256 signature.
   * Payload contains template status changes (approved, rejected, etc.)
   */
  @Post()
  async handleWebhook(
    @Body() payload: MetaTemplateStatusWebhookPayload,
    @Req() req: Request & { rawBody?: string },
    @Res() res: Response,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      this.logger.log('=== INCOMING TEMPLATE STATUS WEBHOOK ===');
      this.logger.log(`Timestamp: ${new Date().toISOString()}`);

      // Get signature from headers for verification
      const signature = (req.headers['x-hub-signature-256'] as string) || '';

      // Verify webhook signature if app secret is configured
      if (this.metaAppSecret) {
        const rawBody = req.rawBody || JSON.stringify(payload);
        const isValid = this.verifyWebhookSignature(rawBody, signature);

        if (!isValid) {
          this.logger.warn('Invalid webhook signature - rejecting');
          // Still return 200 to prevent Meta from retrying
          res.status(200).json({ received: true, error: 'Invalid signature' });
          return;
        }
        this.logger.log('✅ Webhook signature verified');
      } else {
        this.logger.warn(
          '⚠️ META_APP_SECRET not configured - skipping signature verification',
        );
      }

      // Validate payload structure
      if (!this.isValidPayload(payload)) {
        this.logger.warn('Invalid webhook payload structure');
        res.status(200).json({ received: true, error: 'Invalid payload' });
        return;
      }

      // Process each template status update
      const results = await this.processTemplateUpdates(payload);

      const processingTime = Date.now() - startTime;
      this.logger.log(`✅ Webhook processed in ${processingTime}ms`);
      this.logger.log(
        `   Processed ${results.processed} updates, ${results.failed} failed`,
      );

      res.status(200).json({
        received: true,
        processed: results.processed,
        failed: results.failed,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Webhook processing error: ${errorMessage}`, error);

      // Always return 200 to prevent Meta from retrying indefinitely
      res.status(200).json({ received: true, error: errorMessage });
    }
  }

  /**
   * Verify webhook signature using HMAC SHA256
   */
  private verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.metaAppSecret || !signature) {
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.metaAppSecret)
        .update(payload)
        .digest('hex');

      const receivedSignature = signature.replace('sha256=', '');

      // Use timing-safe comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'utf-8'),
        Buffer.from(receivedSignature, 'utf-8'),
      );
    } catch (error) {
      this.logger.error('Signature verification failed', error);
      return false;
    }
  }

  /**
   * Validate the webhook payload structure
   */
  private isValidPayload(
    payload: any,
  ): payload is MetaTemplateStatusWebhookPayload {
    return (
      payload &&
      payload.object === 'whatsapp_business_account' &&
      Array.isArray(payload.entry) &&
      payload.entry.length > 0 &&
      payload.entry.every(
        (entry: any) =>
          entry.id && Array.isArray(entry.changes) && entry.changes.length > 0,
      )
    );
  }

  /**
   * Process all template status updates from the webhook
   */
  private async processTemplateUpdates(
    payload: MetaTemplateStatusWebhookPayload,
  ): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.field !== 'message_template_status_update') {
          continue;
        }

        const value = change.value;
        this.logger.log(
          `Processing template update: ${value.message_template_name} (${value.message_template_id}) → ${value.message_template_status}`,
        );

        try {
          // Process the status update
          await this.approvalService.handleStatusWebhook({
            event: value.message_template_status,
            messageTemplateId: String(value.message_template_id),
            messageTemplateName: value.message_template_name,
            messageTemplateLanguage: value.message_template_language,
            reason: value.reason,
            disableInfo: value.disable_info
              ? { disableDate: value.disable_info.disable_date }
              : undefined,
          });

          // Emit real-time update to connected clients
          this.webhookGateway.emitTemplateStatusUpdate({
            templateId: String(value.message_template_id),
            templateName: value.message_template_name,
            language: value.message_template_language,
            status: value.message_template_status,
            reason: value.reason,
            timestamp: new Date(entry.time * 1000),
          });

          processed++;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Failed to process update for template ${value.message_template_id}: ${errorMessage}`,
          );
          failed++;
        }
      }
    }

    return { processed, failed };
  }
}
