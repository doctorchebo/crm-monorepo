import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TwilioProviderAdapter } from './providers/twilio.provider';
import {
  TemplateParserService,
  TemplateRenderService,
  TemplatesService,
  TemplateValidatorService,
} from './services';
import { TemplatesController } from './templates.controller';

@Module({
  imports: [ConfigModule],
  controllers: [TemplatesController],
  providers: [
    TemplatesService,
    TemplateParserService,
    TemplateValidatorService,
    TemplateRenderService,
    TwilioProviderAdapter,
  ],
  exports: [TemplatesService],
})
export class TemplatesModule {}
