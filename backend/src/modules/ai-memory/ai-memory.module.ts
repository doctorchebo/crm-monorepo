import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiMemoryController } from './ai-memory.controller';
import { ProviderRegistry } from './providers';
import { AiMemoryRepository } from './repositories';
import {
  AiMemoryService,
  ContentProcessingService,
  EmbeddingService,
  MessageMemoryIntegration,
} from './services';
import { PgVectorStore } from './stores';

/**
 * AI Memory Module
 *
 * Provides long-term memory capabilities for AI-powered conversations.
 *
 * Features:
 * - Provider-agnostic LLM integration (OpenAI, Anthropic, Cohere, etc.)
 * - Vector embedding generation via configured provider
 * - Vector storage using PostgreSQL pgvector (cost-effective local storage)
 * - Semantic search across conversation history
 * - Support for uploaded documents, images, and media
 * - Automatic message embedding on send/receive
 * - Context building for AI response generation
 * - Operation logging for auditing and billing
 *
 * Architecture:
 * - Uses pgvector for vector storage (no external vector DB costs)
 * - VectorStore abstraction allows future migration to dedicated vector DBs
 * - Provider pattern for LLM flexibility
 *
 * Configuration:
 * - AI_MEMORY_PROVIDER_TYPE: LLM provider type (default: 'openai')
 * - AI_MEMORY_PROVIDER_API_KEY: API key for the provider
 * - AI_MEMORY_EMBEDDING_DIMENSIONS: Vector dimensions (default: 3072)
 * - See ai-memory.config.ts for full configuration options
 *
 * Services:
 * - ProviderRegistry: Manages LLM provider instances
 * - EmbeddingService: Generate vector embeddings (provider-agnostic)
 * - PgVectorStore: Store/retrieve vectors in PostgreSQL pgvector
 * - AiMemoryService: Main orchestration service
 * - ContentProcessingService: Process uploaded files
 * - MessageMemoryIntegration: Integration with messaging services
 * - AiMemoryRepository: Database operations
 */
@Module({
  imports: [ConfigModule],
  controllers: [AiMemoryController],
  providers: [
    // Provider registry (initializes first)
    ProviderRegistry,

    // Vector store (pgvector implementation)
    PgVectorStore,

    // Core services
    EmbeddingService,
    AiMemoryService,
    ContentProcessingService,
    MessageMemoryIntegration,

    // Repository
    AiMemoryRepository,
  ],
  exports: [
    // Export services for use in other modules
    ProviderRegistry,
    AiMemoryService,
    EmbeddingService,
    PgVectorStore,
    ContentProcessingService,
    MessageMemoryIntegration,
    AiMemoryRepository,
  ],
})
export class AiMemoryModule {}
