import { aiContextConfig } from '@config/ai-context.config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  AiContextBuilderService,
  AiUsageGuardService,
  ConversationSummaryService,
  LegacyMessageMemoryIntegration,
  MessageMemoryIntegrationService,
} from './services';

/**
 * AI Context Module
 *
 * Lightweight replacement for AI Memory Module.
 *
 * Key differences from the old system:
 * - NO per-message embeddings
 * - NO image/media processing
 * - NO vector storage (pgvector)
 * - Rolling conversation summaries instead
 * - Event-driven AI calls only
 * - Hard cost limits enforced
 *
 * Cost reduction: ~90%+ compared to previous system
 *
 * Services provided:
 * - AiUsageGuardService: Cost control and usage tracking
 * - ConversationSummaryService: Rolling summary management
 * - AiContextBuilderService: Context building for AI replies
 * - MessageMemoryIntegrationService: Lightweight message tracking
 * - MessageMemoryIntegration: Legacy compatibility (deprecated)
 *
 * Configuration:
 * - AI_REPLY_ENABLED: Enable AI reply generation
 * - AI_MEMORY_ENABLED: Enable memory/context building
 * - AI_MEMORY_SUMMARY_ENABLED: Enable rolling summaries
 * - AI_MEMORY_SUMMARY_MESSAGE_THRESHOLD: Messages before summary update
 * - AI_MEMORY_MAX_CALLS_PER_DAY_PER_ACCOUNT: Daily call limit
 *
 * See ai-context.config.ts for full configuration options.
 */
@Module({
  imports: [ConfigModule.forFeature(aiContextConfig)],
  providers: [
    // Core services (order matters for dependency injection)
    AiUsageGuardService,
    ConversationSummaryService,
    AiContextBuilderService,
    MessageMemoryIntegrationService,

    // Legacy compatibility
    LegacyMessageMemoryIntegration,
  ],
  exports: [
    // Export new services
    AiUsageGuardService,
    ConversationSummaryService,
    AiContextBuilderService,
    MessageMemoryIntegrationService,

    // Export legacy service for backward compatibility
    LegacyMessageMemoryIntegration,
  ],
})
export class AiContextModule {}
