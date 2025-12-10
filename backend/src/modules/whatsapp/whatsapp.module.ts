import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebhookController } from './whatsapp.webhook.controller';

/**
 * WhatsApp Module
 * Handles all WhatsApp Business Cloud API messaging operations
 *
 * Features:
 * - Send WhatsApp text and media messages via Cloud API
 * - Receive inbound messages via webhooks with webhook verification
 * - Track message delivery status (sent, delivered, read, failed)
 * - Store message metadata and media information
 * - Support for multiple phone numbers per user (via senders table)
 * - Foundation for future chat history synchronization
 *
 * Environment Variables Required:
 * - META_WABA_ID: WhatsApp Business Account ID
 * - META_PHONE_NUMBER_ID: Phone Number ID for messaging
 * - META_ACCESS_TOKEN: Bearer token for Cloud API
 * - META_VERIFY_TOKEN: Token for webhook verification
 * - META_APP_SECRET: (Optional) For signature verification
 */
@Module({
  imports: [ConfigModule],
  controllers: [WhatsAppController, WhatsAppWebhookController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
