import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MetaCloudAPIConfigService } from '@shared/services/meta-cloud-api.config';
import { S3Service } from '@shared/services/s3.service';
import { MediaController } from './controllers/media.controller';
import { MediaService } from './services/media.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppGateway, setWhatsAppGateway } from './whatsapp.gateway';
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
 * - Media upload/download with S3 integration
 * - Foundation for future chat history synchronization
 *
 * Environment Variables Required:
 * - META_WABA_ID: WhatsApp Business Account ID
 * - META_PHONE_NUMBER_ID: Phone Number ID for messaging
 * - META_ACCESS_TOKEN: Bearer token for Cloud API
 * - META_VERIFY_TOKEN: Token for webhook verification
 * - META_APP_SECRET: (Optional) For signature verification
 * - AWS_REGION: AWS region for S3
 * - AWS_ACCESS_KEY_ID: AWS access key
 * - AWS_SECRET_ACCESS_KEY: AWS secret key
 * - AWS_S3_BUCKET_NAME: S3 bucket name for media storage
 */
@Module({
  imports: [ConfigModule],
  controllers: [WhatsAppController, WhatsAppWebhookController, MediaController],
  providers: [
    WhatsAppService,
    MediaService,
    S3Service,
    MetaCloudAPIConfigService,
    WhatsAppGateway,
  ],
  exports: [
    WhatsAppService,
    MediaService,
    S3Service,
    MetaCloudAPIConfigService,
    WhatsAppGateway,
  ],
})
export class WhatsAppModule {
  constructor(gateway: WhatsAppGateway) {
    setWhatsAppGateway(gateway);
  }
}
