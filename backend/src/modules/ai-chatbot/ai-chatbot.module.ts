/**
 * AI Chatbot Module
 *
 * Goal-based AI chatbot system.
 * Provides intelligent, configurable AI responses powered by Knowledge Base retrieval.
 *
 * Architecture:
 * ┌────────────────────────────────────────────────────────────────┐
 * │                      AiChatbotModule                           │
 * ├────────────────────────────────────────────────────────────────┤
 * │  Controller:                                                   │
 * │    └── AiChatbotController (/ai/*)                             │
 * ├────────────────────────────────────────────────────────────────┤
 * │  Core Services:                                                │
 * │    ├── AiChatbotService (main orchestrator)                    │
 * │    └── GoalPromptBuilderService (goal-based prompt building)   │
 * ├────────────────────────────────────────────────────────────────┤
 * │  AI Infrastructure Services:                                  │
 * │    ├── AiConfigurationService, LLMService                      │
 * │    ├── HandoffService, RateLimiterService                      │
 * │    ├── AntiBanSafeguardService, AiActionLoggerService          │
 * │    ├── GuardrailAlertService, GuardrailAlertGateway            │
 * │    ├── UsageTrackingService, UsageThrottleService              │
 * │    └── HandoffNotificationGateway                              │
 * └────────────────────────────────────────────────────────────────┘
 */

import { AiMemoryModule } from '@modules/ai-memory/ai-memory.module';
import { AIReplyModule } from '@modules/ai-reply/ai-reply.module';
import { AuditModule } from '@modules/audit/audit.module';
import { ChatsModule } from '@modules/chats/chats.module';
import { KnowledgeBaseModule } from '@modules/knowledge-base/knowledge-base.module';
import { WhatsAppModule } from '@modules/whatsapp/whatsapp.module';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ProfilePictureUrlService } from '@shared/services/profile-picture-url.service';

import { AiChatbotController } from './ai-chatbot.controller';
import { AiChatbotService } from './services/ai-chatbot.service';
import { GoalPromptBuilderService } from './services/goal-prompt-builder.service';

// AI infrastructure services
import { AiActionLoggerService } from './services/ai-action-logger.service';
import { AiConfigurationService } from './services/ai-configuration.service';
import { AntiBanSafeguardService } from './services/anti-ban-safeguard.service';
import { GuardrailAlertGateway } from './services/guardrail-alert.gateway';
import { GuardrailAlertService } from './services/guardrail-alert.service';
import { HandoffNotificationGateway } from './services/handoff-notification.gateway';
import { HandoffService } from './services/handoff.service';
import { LLMService } from './services/llm.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { UsageThrottleService } from './services/usage-throttle.service';
import { UsageTrackingService } from './services/usage-tracking.service';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    forwardRef(() => AiMemoryModule),
    forwardRef(() => AIReplyModule),
    forwardRef(() => ChatsModule),
    forwardRef(() => KnowledgeBaseModule),
    forwardRef(() => WhatsAppModule),
    EventEmitterModule.forRoot(),
    AuditModule,
  ],
  controllers: [AiChatbotController],
  providers: [
    // Core services
    AiChatbotService,
    GoalPromptBuilderService,

    // AI infrastructure services
    AiConfigurationService,
    LLMService,
    HandoffService,
    RateLimiterService,
    AiActionLoggerService,
    AntiBanSafeguardService,
    GuardrailAlertService,
    GuardrailAlertGateway,
    UsageTrackingService,
    UsageThrottleService,
    HandoffNotificationGateway,

    // Shared dependencies needed by moved services
    ProfilePictureUrlService,
  ],
  exports: [
    // Core
    AiChatbotService,
    GoalPromptBuilderService,

    // AI infrastructure (needed by WhatsAppModule, AIReplyModule)
    AiConfigurationService,
    LLMService,
    HandoffService,
    RateLimiterService,
    AiActionLoggerService,
    AntiBanSafeguardService,
    GuardrailAlertService,
    UsageTrackingService,
    UsageThrottleService,
  ],
})
export class AiChatbotModule {}
