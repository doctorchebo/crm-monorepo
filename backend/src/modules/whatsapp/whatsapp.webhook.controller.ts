import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { verifyWebhookSignature } from './utils/cloud-api.utils';
import { WhatsAppService } from './whatsapp.service';

/**
 * WhatsApp Cloud API Webhook Controller
 * Handles webhooks from Meta Cloud API for:
 * - Webhook challenge verification (GET /webhook/whatsapp)
 * - Inbound messages from WhatsApp (POST /webhook/whatsapp)
 * - Message delivery status updates (POST /webhook/whatsapp)
 *
 * Meta sends a GET request with:
 * - hub.mode: 'subscribe'
 * - hub.verify_token: token we provided
 * - hub.challenge: random string to echo back
 *
 * Meta sends POST requests with JSON webhook payload containing:
 * - messages: array of inbound messages
 * - statuses: array of delivery status updates
 * - contacts: array of contact updates
 */

// Custom guard that does nothing - allows public access
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class NoAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}

@Controller('webhook/whatsapp')
@UseGuards(NoAuthGuard)
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);
  private readonly metaAppSecret: string;

  constructor(private whatsAppService: WhatsAppService) {
    this.metaAppSecret = process.env.META_APP_SECRET || '';
  }

  /**
   * Webhook verification challenge from Meta
   * GET /webhook/whatsapp?hub.mode=subscribe&hub.verify_token=xxx&hub.challenge=yyy
   *
   * Meta needs us to echo back the challenge to verify we control this endpoint
   */
  @Get()
  verifyWebhook(
    @Query('hub.mode') hubMode: string,
    @Query('hub.verify_token') hubVerifyToken: string,
    @Query('hub.challenge') hubChallenge: string,
    @Res() res: Response,
  ): void {
    console.log('=== WEBHOOK VERIFICATION REQUEST ===');
    console.log('hub.mode:', hubMode);
    console.log('hub.verify_token:', hubVerifyToken);
    console.log('hub.challenge:', hubChallenge);

    this.logger.log('Webhook verification request received');

    const challenge = this.whatsAppService.verifyWebhookChallenge(
      hubMode,
      hubVerifyToken,
      hubChallenge,
    );

    console.log('Challenge response:', challenge ? 'SUCCESS' : 'FAILED');

    if (challenge) {
      // Return plain text challenge (not JSON)
      res.set('Content-Type', 'text/plain');
      res.send(challenge);
    } else {
      console.log('❌ Webhook verification FAILED - Invalid verify token');
      res.status(403).json({ error: 'Invalid verification token' });
    }
  }

  /**
   * Handle inbound messages and status updates from Meta
   * POST /webhook/whatsapp
   *
   * Meta sends X-Hub-Signature-256 header with HMAC SHA256 signature
   * Payload contains:
   * - messages: new inbound messages
   * - statuses: delivery status updates
   * - contacts: contact information
   * - errors: any errors from previous API calls
   */
  @Post()
  async handleWebhook(
    @Body() payload: any,
    @Req() req: any,
    @Res() res: Response,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      console.log('=== INCOMING WEBHOOK POST ===');
      console.log('Timestamp:', new Date().toISOString());
      console.log('Request URL:', req.originalUrl);
      console.log('Remote IP:', req.ip);

      this.logger.log('Webhook event received from Meta');

      // Get signature from headers for verification
      const signature = req.headers['x-hub-signature-256'] || '';
      const rawBody = req.rawBody || JSON.stringify(payload);

      // Verify signature BEFORE queueing (security check)
      if (this.metaAppSecret) {
        const isValid = verifyWebhookSignature(
          rawBody,
          signature,
          this.metaAppSecret,
        );

        if (!isValid) {
          this.logger.warn('Invalid webhook signature - rejecting');
          // Still return 200 to not leak info about signature validation
          res.status(200).json({ received: true });
          return;
        }
        console.log('✅ Webhook signature verified');
      } else {
        console.log('⚠️ No META_APP_SECRET - skipping signature verification');
      }

      // Process webhook synchronously
      const result = await this.whatsAppService.handleWebhookCallback(
        rawBody,
        signature,
      );

      const processingTime = Date.now() - startTime;
      console.log(
        `Webhook processed in ${processingTime}ms: ${result.success}`,
      );

      res.status(200).json({
        received: true,
        success: result.success,
        processingTime,
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.log(
        `❌ Exception in webhook handler after ${processingTime}ms:`,
        error.message,
      );
      this.logger.error(`Error handling webhook: ${error.message}`, error);

      // Always return 200 so Meta stops retrying
      res.status(200).json({ received: true, error: error.message });
    }
  }
}
