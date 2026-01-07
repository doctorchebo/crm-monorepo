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
import { KnowledgeBaseModule } from '@modules/knowledge-base/knowledge-base.module';
import { Module, forwardRef } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import {
  AiActionLoggerService,
  AiConfigurationService,
  AntiBanSafeguardService,
  GuardrailAlertGateway,
  GuardrailAlertService,
  HandoffNotificationGateway,
  HandoffService,
  LLMService,
  PolicySimulationService,
  RateLimiterService,
  RuleEngineService,
  StageService,
  UsageThrottleService,
  UsageTrackingService,
  WorkflowEngineService,
} from './services';
import { WorkflowController } from './workflow.controller';

@Module({
  imports: [
    AiMemoryModule,
    forwardRef(() => AIReplyModule),
    forwardRef(() => KnowledgeBaseModule),
    EventEmitterModule.forRoot(),
  ],
  controllers: [WorkflowController],
  providers: [
    // Core services
    LLMService,
    StageService,
    RuleEngineService,
    HandoffService,
    PolicySimulationService,

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

    // Main orchestrator
    WorkflowEngineService,
  ],
  exports: [
    // Export services for use in other modules
    WorkflowEngineService,
    StageService,
    RuleEngineService,
    HandoffService,
    LLMService,
    PolicySimulationService,

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
