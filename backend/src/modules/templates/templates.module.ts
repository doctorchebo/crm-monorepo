import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  MessagingProviderFactory,
  MetaCloudApiProvider,
  TwilioProviderAdapter,
} from './providers';
import {
  TemplateApprovalService,
  TemplateParserService,
  TemplateRenderService,
  TemplatesService,
  TemplateValidatorService,
  VariableResolutionService,
} from './services';
import { TemplateVersionService } from './services/template-version.service';
import { TemplateWebhookController } from './template.webhook.controller';
import { TemplateWebhookGateway } from './template.webhook.gateway';
import { TemplatesController } from './templates.controller';
import { TeamModule } from '../team/team.module';

@Module({
  imports: [ConfigModule, TeamModule],
  controllers: [TemplatesController, TemplateWebhookController],
  providers: [
    // Services
    TemplatesService,
    TemplateParserService,
    TemplateValidatorService,
    TemplateRenderService,
    VariableResolutionService,
    TemplateApprovalService,
    TemplateVersionService,
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
  ],
})
export class TemplatesModule {}
