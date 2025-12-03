import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  Post,
} from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';

/**
 * WhatsApp Webhook Controller
 * Handles webhooks from Twilio for:
 * - Inbound messages from WhatsApp
 * - Message delivery status updates
 *
 * NOTE: Twilio sends webhooks as form data, not JSON
 * Configure ngrok to forward webhooks to: http://localhost:3001/webhook/whatsapp/inbound
 */
@Controller('webhook/whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(private whatsAppService: WhatsAppService) {}

  /**
   * Handle inbound messages from Twilio
   * POST /webhook/whatsapp/inbound
   *
   * Twilio sends this as form data with fields like:
   * - MessageSid
   * - From (e.g., whatsapp:+1234567890)
   * - To (e.g., whatsapp:+14144557966)
   * - Body
   * - NumMedia (number of attachments)
   * - MediaUrl0, MediaContentType0, etc. (for attachments)
   */
  @Post('inbound')
  async handleInbound(@Body() webhookData: any) {
    try {
      this.logger.log('Inbound webhook received from Twilio');
      this.logger.debug('Webhook data:', webhookData);

      // Validate required fields
      if (!webhookData.MessageSid || !webhookData.From) {
        this.logger.error('Invalid webhook data: missing required fields');
        throw new BadRequestException('Missing required webhook fields');
      }

      // Process the inbound message
      const result =
        await this.whatsAppService.handleInboundMessage(webhookData);

      // Twilio expects an empty response
      // Return 200 OK so Twilio knows we received it
      return { success: true };
    } catch (error) {
      this.logger.error(`Error processing inbound webhook: ${error.message}`);
      // Still return 200 so Twilio doesn't retry
      // But log the error for debugging
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle message delivery status updates from Twilio
   * POST /webhook/whatsapp/status
   *
   * Twilio sends this when message status changes:
   * - MessageSid
   * - MessageStatus (sent, delivered, failed, etc)
   */
  @Post('status')
  async handleStatus(@Body() webhookData: any) {
    try {
      this.logger.log('Status webhook received from Twilio');
      this.logger.debug('Status webhook data:', webhookData);

      const { MessageSid, MessageStatus } = webhookData;

      if (!MessageSid || !MessageStatus) {
        this.logger.error('Invalid status webhook: missing required fields');
        throw new BadRequestException('Missing required webhook fields');
      }

      // Process the status update
      const result = await this.whatsAppService.handleMessageStatus(
        MessageSid,
        MessageStatus,
      );

      // Return 200 OK
      return { success: true };
    } catch (error) {
      this.logger.error(`Error processing status webhook: ${error.message}`);
      // Still return 200 so Twilio doesn't retry
      return { success: false, error: error.message };
    }
  }
}
