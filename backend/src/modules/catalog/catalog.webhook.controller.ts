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
import { CatalogService } from './catalog.service';
import {
  CatalogStatusUpdateEvent,
  CatalogWebhookGateway,
} from './catalog.webhook.gateway';

/**
 * Meta Catalog Webhook Payload Types
 *
 * Meta sends product catalog updates via webhooks when:
 * - Product review status changes (approved, rejected, etc.)
 * - Product data is updated
 * - Products are deleted
 *
 * @see https://developers.facebook.com/docs/marketing-api/catalog/guides/product-feed-webhooks
 */
export interface MetaCatalogWebhookPayload {
  object: 'product_catalog' | 'whatsapp_business_account';
  entry: Array<{
    id: string; // Catalog ID or WABA ID
    time: number; // Unix timestamp
    changes: Array<{
      value: CatalogProductUpdate;
      field: 'products' | 'product_review_status';
    }>;
  }>;
}

export interface CatalogProductUpdate {
  /** Product ID in Meta's system */
  product_id?: string;

  /** Retailer ID (our reference) */
  retailer_id?: string;

  /** Review status for product */
  review_status?: 'approved' | 'rejected' | 'pending' | 'outdated';

  /** Rejection reasons if rejected */
  review_rejection_reasons?: string[];

  /** Update type */
  update_type?: 'product_created' | 'product_updated' | 'product_deleted';
}

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
 * Catalog Webhook Controller
 *
 * Handles webhooks from Meta Commerce API for product catalog updates:
 * - Webhook verification challenge (GET /webhook/catalog)
 * - Product status change notifications (POST /webhook/catalog)
 *
 * Events handled:
 * - approved: Product was approved for sale
 * - rejected: Product was rejected (includes reasons)
 * - pending: Product is under review
 * - outdated: Product information needs update
 *
 * This eliminates the need for frontend polling by receiving push notifications
 * from Meta when product statuses change.
 *
 * @see https://developers.facebook.com/docs/marketing-api/catalog/guides/product-feed-webhooks
 */
@Controller('webhook/catalog')
@UseGuards(NoAuthGuard)
export class CatalogWebhookController {
  private readonly logger = new Logger(CatalogWebhookController.name);
  private readonly metaVerifyToken: string;
  private readonly metaAppSecret: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly catalogService: CatalogService,
    private readonly webhookGateway: CatalogWebhookGateway,
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
   * GET /webhook/catalog?hub.mode=subscribe&hub.verify_token=xxx&hub.challenge=yyy
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
    this.logger.log('=== CATALOG WEBHOOK VERIFICATION REQUEST ===');
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

    this.logger.log('✅ Catalog webhook verification SUCCESS');

    // Return plain text challenge (not JSON)
    res.set('Content-Type', 'text/plain');
    res.status(200).send(hubChallenge);
  }

  /**
   * Handle catalog product status update webhooks from Meta
   * POST /webhook/catalog
   *
   * Meta sends X-Hub-Signature-256 header with HMAC SHA256 signature.
   * Payload contains product status changes.
   */
  @Post()
  async handleWebhook(
    @Body() payload: MetaCatalogWebhookPayload,
    @Req() req: Request & { rawBody?: string },
    @Res() res: Response,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      this.logger.log('=== INCOMING CATALOG STATUS WEBHOOK ===');
      this.logger.log(`Timestamp: ${new Date().toISOString()}`);
      this.logger.log(`Payload: ${JSON.stringify(payload, null, 2)}`);

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

      // Process each catalog update
      const results = await this.processCatalogUpdates(payload);

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
  private isValidPayload(payload: any): payload is MetaCatalogWebhookPayload {
    return (
      payload &&
      (payload.object === 'product_catalog' ||
        payload.object === 'whatsapp_business_account') &&
      Array.isArray(payload.entry) &&
      payload.entry.length > 0 &&
      payload.entry.every(
        (entry: any) =>
          entry.id && Array.isArray(entry.changes) && entry.changes.length > 0,
      )
    );
  }

  /**
   * Process all catalog product status updates from the webhook
   */
  private async processCatalogUpdates(
    payload: MetaCatalogWebhookPayload,
  ): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        // Handle product review status updates
        if (
          change.field === 'products' ||
          change.field === 'product_review_status'
        ) {
          const value = change.value;
          const retailerId = value.retailer_id;
          const productId = value.product_id;
          const reviewStatus = value.review_status;

          if (!retailerId && !productId) {
            this.logger.warn('Missing retailer_id and product_id in webhook');
            continue;
          }

          this.logger.log(
            `Processing catalog update: retailer=${retailerId}, product=${productId}, status=${reviewStatus}`,
          );

          try {
            // Update the item status in our database
            const result = await this.catalogService.handleStatusWebhook({
              retailerId,
              metaProductId: productId,
              reviewStatus: reviewStatus || 'pending',
              rejectionReasons: value.review_rejection_reasons,
            });

            if (result) {
              // Emit real-time update to connected clients
              const updateEvent: CatalogStatusUpdateEvent = {
                itemId: result.itemId,
                itemName: result.itemName,
                retailerId: result.retailerId,
                metaProductId: result.metaProductId,
                previousStatus: result.previousStatus,
                newStatus: result.newStatus,
                statusMessage: result.statusMessage,
                timestamp: new Date(),
              };

              this.webhookGateway.emitStatusUpdate(result.teamId, updateEvent);
              processed++;
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(
              `Failed to process catalog update for retailer ${retailerId}: ${errorMessage}`,
            );
            failed++;
          }
        }
      }
    }

    return { processed, failed };
  }
}
