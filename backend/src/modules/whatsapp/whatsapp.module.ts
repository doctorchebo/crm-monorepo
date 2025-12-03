import { Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebhookController } from './whatsapp.webhook.controller';

/**
 * WhatsApp Module
 * Handles all WhatsApp messaging operations via Twilio
 *
 * Features:
 * - Send WhatsApp messages
 * - Receive inbound messages via webhooks
 * - Track message delivery status
 * - Store message metadata and notes
 * - Support for multiple phone numbers per user
 */
@Module({
  controllers: [WhatsAppController, WhatsAppWebhookController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
