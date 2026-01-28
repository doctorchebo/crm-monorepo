/**
 * Workflow Module
 * Manages AI-powered chat categorization, stage pipelines, and human-AI handoff
 *
 * Features:
 * - Custom workflow stages (kanban-style pipeline)
 * - AI message classification and categorization
 * - Rule-based automatic stage transitions
 * - Human-AI handoff management with real-time notifications
 * - Multi-LLM provider support with usage tracking
 * - Policy simulation and violation logging
 * - Anti-ban safeguards with rate limiting
 * - Usage tracking, billing, and throttling
 * - Real-time alerts via WebSocket
 *
 * Architecture:
 * ┌────────────────────────────────────────────────────────────────┐
 * │                      WorkflowModule                            │
 * ├────────────────────────────────────────────────────────────────┤
 * │  WorkflowController                                            │
 * │    └── REST API endpoints for all workflow operations          │
 * ├────────────────────────────────────────────────────────────────┤
 * │  Services:                                                     │
 * │    ├── WorkflowEngineService (main orchestrator)               │
 * │    ├── StageService (pipeline stage CRUD)                      │
 * │    ├── RuleEngineService (rule evaluation)                     │
 * │    ├── HandoffService (human-AI coordination)                  │
 * │    ├── LLMService (AI abstraction with usage tracking)         │
 * │    ├── PolicySimulationService (ban/violation simulation)      │
 * │    ├── AntiBanSafeguardService (main anti-ban orchestrator)    │
 * │    ├── RateLimiterService (rate limiting)                      │
 * │    ├── AiActionLoggerService (AI action logging)               │
 * │    ├── GuardrailAlertService (alert management)                │
 * │    ├── GuardrailAlertGateway (WebSocket notifications)         │
 * │    ├── UsageTrackingService (token/cost tracking)              │
 * │    ├── UsageThrottleService (throttling orchestration)         │
 * │    └── HandoffNotificationGateway (handoff WebSocket)          │
 * └────────────────────────────────────────────────────────────────┘
 */

import { AiMemoryModule } from '@modules/ai-memory/ai-memory.module';
import { AIReplyModule } from '@modules/ai-reply/ai-reply.module';
import { ChatsModule } from '@modules/chats/chats.module';
import { KnowledgeBaseModule } from '@modules/knowledge-base/knowledge-base.module';
import { WhatsAppModule } from '@modules/whatsapp/whatsapp.module';
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ProfilePictureUrlService } from '@shared/services/profile-picture-url.service';
import { WorkflowBuilderController } from './controllers/workflow-builder.controller';
import {
  AiActionLoggerService,
  AiConfigurationService,
  AiResponseGenerator,
  AntiBanSafeguardService,
  GuardrailAlertGateway,
  GuardrailAlertService,
  HandoffNotificationGateway,
  HandoffService,
  InteractiveResponseHandler,
  LLMService,
  PolicySimulationService,
  RateLimiterService,
  RuleEngineService,
  StageService,
  UsageThrottleService,
  UsageTrackingService,
  WorkflowBuilderService,
  WorkflowEngineService,
  WorkflowExecutionEngine,
  WorkflowStatusService,
  WorkflowAssignmentService,
} from './services';
import { WorkflowController } from './workflow.controller';

@Module({
  imports: [
    ConfigModule,
    AiMemoryModule,
    ScheduleModule.forRoot(),
    forwardRef(() => AIReplyModule),
    forwardRef(() => ChatsModule),
    forwardRef(() => KnowledgeBaseModule),
    forwardRef(() => WhatsAppModule), // Fix circular dependency
    EventEmitterModule.forRoot(),
  ],
  controllers: [WorkflowController, WorkflowBuilderController],
  providers: [
    // Core services
    LLMService,
    StageService,
    RuleEngineService,
    HandoffService,
    PolicySimulationService,

    // Visual Workflow Builder
    WorkflowBuilderService,
    // Visual Workflow Builder
    WorkflowBuilderService,
    WorkflowExecutionEngine,
    WorkflowAssignmentService,

    // AI configuration
    AiConfigurationService,

    // Anti-ban safeguards
    RateLimiterService,
    AiActionLoggerService,
    GuardrailAlertService,
    GuardrailAlertGateway,
    AntiBanSafeguardService,

    // Usage tracking and throttling
    UsageTrackingService,
    UsageThrottleService,
    HandoffNotificationGateway,

    // Workflow Engine components
    InteractiveResponseHandler,
    AiResponseGenerator,
    WorkflowStatusService,

    // Main orchestrator
    WorkflowEngineService,

    // Shared utilities
    ProfilePictureUrlService,
  ],
  exports: [
    // Export services for use in other modules
    WorkflowEngineService,
    StageService,
    RuleEngineService,
    HandoffService,
    LLMService,
    PolicySimulationService,

    // Visual Workflow Builder
    WorkflowBuilderService,
    // Visual Workflow Builder
    WorkflowBuilderService,
    WorkflowExecutionEngine,
    WorkflowAssignmentService,

    // AI configuration
    AiConfigurationService,

    // Anti-ban safeguards
    AntiBanSafeguardService,
    RateLimiterService,
    AiActionLoggerService,
    GuardrailAlertService,

    // Usage tracking
    UsageTrackingService,
    UsageThrottleService,
  ],
})
export class WorkflowModule {}
