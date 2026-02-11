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
 * - Workflow-aware AI response generation
 * - Workflow AI testing and validation
 *
 * Architecture:
 * ┌────────────────────────────────────────────────────────────────┐
 * │                      WorkflowModule                            │
 * ├────────────────────────────────────────────────────────────────┤
 * │  Controllers:                                                  │
 * │    ├── WorkflowController (REST API for workflow operations)   │
 * │    ├── WorkflowBuilderController (Visual builder API)          │
 * │    └── WorkflowAITestingController (AI testing & validation)   │
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
 * │    ├── HandoffNotificationGateway (handoff WebSocket)          │
 * │    ├── WorkflowAIInstructionResolverService (AI instructions)  │
 * │    ├── WorkflowContextProviderService (workflow context)       │
 * │    ├── WorkflowAwareAIResponseGenerator (enhanced AI gen)      │
 * │    └── WorkflowAITestingService (AI behavior testing)          │
 * └────────────────────────────────────────────────────────────────┘
 */

import { AiMemoryModule } from '@modules/ai-memory/ai-memory.module';
import { AIReplyModule } from '@modules/ai-reply/ai-reply.module';
import { ChatsModule } from '@modules/chats/chats.module';
import { KnowledgeBaseModule } from '@modules/knowledge-base/knowledge-base.module';
import { WhatsAppModule } from '@modules/whatsapp/whatsapp.module';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ProfilePictureUrlService } from '@shared/services/profile-picture-url.service';
import { WorkflowAITestingController } from './controllers/workflow-ai-testing.controller';
import { WorkflowBuilderController } from './controllers/workflow-builder.controller';
import {
  AiActionLoggerService,
  AiConfigurationService,
  AiResponseGenerator,
  AntiBanSafeguardService,
  ChatWorkflowCleanupService,
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
  WorkflowAIInstructionResolver,
  WorkflowAITestingService,
  WorkflowAssignmentService,
  WorkflowAwareAIResponseGenerator,
  WorkflowBuilderService,
  WorkflowContextProviderService,
  WorkflowEngineService,
  WorkflowExecutionEngine,
  WorkflowStatusService,
} from './services';
// Import WorkflowActionHandlerService directly to avoid circular dependency through index
import { PermissionService } from '../../shared/services/permission.service';
import { AuditQueryService } from '../audit/audit-query.service';
import { AuditWriteService } from '../audit/audit-write.service';
import { WorkflowActionHandlerService } from './services/workflow-action-handler.service';
import { WorkflowController } from './workflow.controller';

@Module({
  imports: [
    ConfigModule,
    AiMemoryModule,
    ScheduleModule.forRoot(),
    forwardRef(() => AIReplyModule),
    forwardRef(() => ChatsModule),
    forwardRef(() => KnowledgeBaseModule),
    forwardRef(() => WhatsAppModule),
    EventEmitterModule.forRoot(),
  ],
  controllers: [
    WorkflowController,
    WorkflowBuilderController,
    WorkflowAITestingController,
  ],
  providers: [
    // Core services
    AuditWriteService,
    AuditQueryService,
    PermissionService,
    LLMService,
    StageService,
    RuleEngineService,
    HandoffService,
    PolicySimulationService,

    // Visual Workflow Builder
    WorkflowBuilderService,
    WorkflowExecutionEngine,
    WorkflowAssignmentService,
    WorkflowActionHandlerService,

    // AI configuration
    AiConfigurationService,

    // Workflow AI Context & Instructions
    WorkflowAIInstructionResolver,
    WorkflowContextProviderService,
    WorkflowAwareAIResponseGenerator,
    WorkflowAITestingService,

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

    // Chat lifecycle cleanup
    ChatWorkflowCleanupService,

    // Shared utilities
    ProfilePictureUrlService,
  ],
  exports: [
    // Export services for use in other modules
    AuditWriteService,
    AuditQueryService,
    WorkflowEngineService,
    StageService,
    RuleEngineService,
    HandoffService,
    LLMService,
    PolicySimulationService,

    // Visual Workflow Builder
    WorkflowBuilderService,
    WorkflowExecutionEngine,
    WorkflowAssignmentService,

    // AI configuration
    AiConfigurationService,

    // Workflow AI Context & Instructions
    WorkflowAIInstructionResolver,
    WorkflowContextProviderService,
    WorkflowAwareAIResponseGenerator,
    WorkflowAITestingService,

    // Anti-ban safeguards
    AntiBanSafeguardService,
    RateLimiterService,
    AiActionLoggerService,
    GuardrailAlertService,

    // Usage tracking
    UsageTrackingService,
    UsageThrottleService,

    // Chat lifecycle cleanup
    ChatWorkflowCleanupService,
  ],
})
export class WorkflowModule {}
