/**
 * AI Reply Module
 * Provides AI-powered reply generation with template integration
 * and WhatsApp compliance guardrails
 */

import { AiMemoryModule } from '@modules/ai-memory/ai-memory.module';
import { CalendarModule } from '@modules/calendar/calendar.module';
import { KnowledgeBaseModule } from '@modules/knowledge-base/knowledge-base.module';
import { TemplatesModule } from '@modules/templates/templates.module';
import { WhatsAppModule } from '@modules/whatsapp/whatsapp.module';
import { WorkflowModule } from '@modules/workflow/workflow.module';
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AIReplyController } from './ai-reply.controller';
import {
  AIReplyService,
  AIReplySettingsService,
  CalendarChatPluginService,
  DynamicCTAGeneratorService,
  InteractiveMessageService,
  RateLimiterService,
  TemplateSelectorService,
} from './services';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => WhatsAppModule),
    forwardRef(() => TemplatesModule),
    forwardRef(() => AiMemoryModule),
    forwardRef(() => KnowledgeBaseModule),
    forwardRef(() => WorkflowModule), // For RateLimiterService dependency
    forwardRef(() => CalendarModule), // For calendar AI integration
  ],
  controllers: [AIReplyController],
  providers: [
    AIReplyService,
    AIReplySettingsService,
    CalendarChatPluginService,
    DynamicCTAGeneratorService,
    InteractiveMessageService,
    RateLimiterService,
    TemplateSelectorService,
  ],
  exports: [
    AIReplyService,
    AIReplySettingsService,
    CalendarChatPluginService,
    DynamicCTAGeneratorService,
    InteractiveMessageService,
    RateLimiterService,
    TemplateSelectorService,
  ],
})
export class AIReplyModule {}
