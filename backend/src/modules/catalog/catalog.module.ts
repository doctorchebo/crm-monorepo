import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MetaCloudAPIConfigService } from '@shared/services/meta-cloud-api.config';
import { PermissionService } from '@shared/services/permission.service';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CatalogWebhookController } from './catalog.webhook.controller';
import { CatalogWebhookGateway } from './catalog.webhook.gateway';
import { MetaCommerceApiService } from './services/meta-commerce-api.service';

/**
 * Catalog Module
 *
 * Manages product catalog functionality:
 * - Catalog CRUD operations
 * - Catalog item management
 * - Image upload with S3 pre-signed URLs
 * - Thumbnail generation via SQS + Lambda
 * - Collection management
 * - Bulk import support
 * - Send catalog items to chats via WhatsApp
 * - Meta Commerce API integration for product approval
 * - Real-time status updates via WebSocket
 * - Webhook handling for Meta status notifications
 *
 * Dependencies:
 * - ConfigModule for AWS credentials and S3 bucket config
 * - WhatsAppModule for sending catalog messages
 * - PermissionService for team membership resolution
 * - MetaCloudAPIConfigService for Meta API authentication
 * - MetaCommerceApiService for Commerce Catalog API operations
 * - Database connection via @database/db.connection
 *
 * AWS Infrastructure:
 * - S3 bucket for image storage
 * - SQS queue for thumbnail generation jobs
 * - Lambda function for thumbnail processing
 *
 * Meta Commerce Integration:
 * - items_batch API for submitting products
 * - products API for checking review status
 * - Webhook endpoint for push notifications from Meta
 * - WebSocket gateway for real-time frontend updates
 */
@Module({
  imports: [ConfigModule, forwardRef(() => WhatsAppModule)],
  controllers: [CatalogController, CatalogWebhookController],
  providers: [
    CatalogService,
    PermissionService,
    MetaCloudAPIConfigService,
    MetaCommerceApiService,
    CatalogWebhookGateway,
  ],
  exports: [CatalogService, CatalogWebhookGateway],
})
export class CatalogModule {}
