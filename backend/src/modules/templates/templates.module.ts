import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ImageProcessingService } from '@shared/services/image-processing.service';
import { LambdaThumbnailService } from '@shared/services/lambda-thumbnail.service';
import { S3Service } from '@shared/services/s3.service';
import { TeamModule } from '../team/team.module';
import {
  MessagingProviderFactory,
  MetaCloudApiProvider,
  TwilioProviderAdapter,
} from './providers';
import {
  ComponentTransformerService,
  MediaUploadService,
  TemplateApprovalService,
  TemplateParserService,
  TemplateRenderService,
  TemplatesService,
  TemplateValidatorService,
  TemplateVersionService,
  VariableResolutionService,
} from './services';
import { TemplateWebhookController } from './template.webhook.controller';
import { TemplateWebhookGateway } from './template.webhook.gateway';
import { TemplatesController } from './templates.controller';
import {
  ButtonValidatorService,
  ComponentsValidatorService,
  HeaderValidatorService,
} from './validators';

@Module({
  imports: [ConfigModule, TeamModule],
  controllers: [TemplatesController, TemplateWebhookController],
  providers: [
    // Shared Services
    S3Service,
    ImageProcessingService,
    LambdaThumbnailService,

    // Core Services
    TemplatesService,
    TemplateParserService,
    TemplateValidatorService,
    TemplateRenderService,
    VariableResolutionService,
    TemplateApprovalService,
    TemplateVersionService,

    // Enhanced Template Services
    ComponentTransformerService,
    MediaUploadService,

    // Component Validators
    HeaderValidatorService,
    ButtonValidatorService,
    ComponentsValidatorService,

    // Providers (for different messaging platforms)
    MetaCloudApiProvider,
    TwilioProviderAdapter,
    MessagingProviderFactory,

    // WebSocket Gateway
    TemplateWebhookGateway,
  ],
  exports: [
    TemplatesService,
    VariableResolutionService,
    TemplateApprovalService,
    TemplateVersionService,
    MessagingProviderFactory,
    TemplateWebhookGateway,
    // Enhanced Template Services
    ComponentTransformerService,
    MediaUploadService,
    ComponentsValidatorService,
  ],
})
export class TemplatesModule {}
