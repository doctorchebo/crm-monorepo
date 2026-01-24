import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { MetaCloudAPIConfigService } from '@shared/services/meta-cloud-api.config';
import { S3Service } from '@shared/services/s3.service';
import { AiMemoryModule } from '../ai-memory/ai-memory.module';
import { ChatsModule } from '../chats/chats.module';
import { TeamModule } from '../team/team.module';
import { ThumbnailQueueService } from '../thumbnail/thumbnail-queue.service';
import { ThumbnailModule } from '../thumbnail/thumbnail.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { MediaController } from './controllers/media.controller';
import { AudioConverterService } from './services/audio-converter.service';
import { ConversationWindowService } from './services/conversation-window.service';
import { MediaAnalyzerService } from './services/media-analyzer.service';
import { MediaStagingService } from './services/media-staging.service';
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
  imports: [
    ConfigModule,
    forwardRef(() => ThumbnailModule),
    AiMemoryModule,
    forwardRef(() => WorkflowModule),
    TeamModule,
    forwardRef(() => ChatsModule),
  ],
  controllers: [WhatsAppController, WhatsAppWebhookController, MediaController],
  providers: [
    WhatsAppService,
    ConversationWindowService,
    MediaService,
    MediaStagingService,
    MediaAnalyzerService,
    AudioConverterService,
    S3Service,
    MetaCloudAPIConfigService,
    WhatsAppGateway,
  ],
  exports: [
    WhatsAppService,
    ConversationWindowService,
    MediaService,
    MediaStagingService,
    MediaAnalyzerService,
    AudioConverterService,
    S3Service,
    MetaCloudAPIConfigService,
    WhatsAppGateway,
  ],
})
export class WhatsAppModule implements OnModuleInit {
  constructor(
    private gateway: WhatsAppGateway,
    private moduleRef: ModuleRef,
    private mediaService: MediaService,
    private mediaStagingService: MediaStagingService,
    private mediaAnalyzerService: MediaAnalyzerService,
  ) {
    setWhatsAppGateway(gateway);
  }

  async onModuleInit() {
    // Inject MediaAnalyzerService into MediaService for GIF detection
    this.mediaService.setMediaAnalyzerService(this.mediaAnalyzerService);
    console.log(
      '✅ MediaAnalyzerService injected into MediaService for GIF detection',
    );

    // Inject ThumbnailQueueService into MediaService and MediaStagingService
    // This avoids circular dependency issues
    try {
      const thumbnailQueueService = this.moduleRef.get(ThumbnailQueueService, {
        strict: false,
      });
      if (thumbnailQueueService) {
        this.mediaService.setThumbnailQueueService(thumbnailQueueService);
        this.mediaStagingService.setThumbnailQueueService(
          thumbnailQueueService,
        );
        console.log(
          '✅ ThumbnailQueueService injected into MediaService and MediaStagingService',
        );
      } else {
        console.warn(
          '⚠️ ThumbnailQueueService not available - thumbnails will not be generated',
        );
      }
    } catch (error) {
      console.warn(
        `⚠️ Could not inject ThumbnailQueueService: ${error.message}`,
      );
    }
  }
}
