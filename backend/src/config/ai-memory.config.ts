import { registerAs } from '@nestjs/config';

/**
 * AI Memory Configuration
 *
 * Centralizes all AI memory settings including LLM provider, embedding, retrieval,
 * and processing options.
 *
 * Supports multiple LLM providers through a provider-agnostic configuration.
 */
export const aiMemoryConfig = registerAs('aiMemory', () => ({
  // LLM Provider configuration (provider-agnostic)
  provider: {
    // Provider type: 'openai' | 'anthropic' | 'cohere' | 'huggingface'
    type: process.env.AI_MEMORY_PROVIDER_TYPE || 'openai',

    // API key for the provider (falls back to provider-specific env vars)
    apiKey:
      process.env.AI_MEMORY_PROVIDER_API_KEY || process.env.OPENAI_API_KEY,

    // Optional base URL for provider API (useful for proxies or local instances)
    baseUrl: process.env.AI_MEMORY_PROVIDER_BASE_URL,

    // Model overrides (provider-specific model names)
    embeddingModel:
      process.env.AI_MEMORY_EMBEDDING_MODEL || 'text-embedding-3-large',
    chatModel: process.env.AI_MEMORY_CHAT_MODEL || 'gpt-4o-mini',
    visionModel: process.env.AI_MEMORY_VISION_MODEL || 'gpt-4o-mini',
    transcriptionModel:
      process.env.AI_MEMORY_TRANSCRIPTION_MODEL || 'whisper-1',
  },

  // Embedding configuration
  embedding: {
    // Using 1536 dimensions (text-embedding-3-large with dimension reduction)
    // This enables pgvector HNSW indexing (max 2000 dims) while maintaining quality
    dimensions: parseInt(
      process.env.AI_MEMORY_EMBEDDING_DIMENSIONS || '1536',
      10,
    ),
    maxInputTokens: 8191, // Max tokens for most embedding models
    batchSize: parseInt(
      process.env.AI_MEMORY_EMBEDDING_BATCH_SIZE || '100',
      10,
    ),
  },

  // Memory retrieval configuration
  retrieval: {
    // Number of recent messages to always include in context
    recentMessagesCount: parseInt(
      process.env.AI_MEMORY_RECENT_MESSAGES || '10',
      10,
    ),

    // Number of semantically relevant memories to retrieve
    topK: parseInt(process.env.AI_MEMORY_TOP_K || '5', 10),

    // Minimum similarity score threshold (0-1)
    // Lower threshold for text-embedding-3-large with 1536-dim reduction
    minSimilarityScore: parseFloat(
      process.env.AI_MEMORY_MIN_SIMILARITY || '0.3',
    ),

    // Include memories from uploaded content
    includeUploadedContent: process.env.AI_MEMORY_INCLUDE_UPLOADS !== 'false',

    // Maximum context tokens to use for memory
    maxContextTokens: parseInt(
      process.env.AI_MEMORY_MAX_CONTEXT_TOKENS || '4000',
      10,
    ),
  },

  // Content processing configuration
  processing: {
    // Auto-embed new messages
    autoEmbedMessages: process.env.AI_MEMORY_AUTO_EMBED !== 'false',

    // Minimum message length to embed (skip very short messages)
    minMessageLength: parseInt(
      process.env.AI_MEMORY_MIN_MESSAGE_LENGTH || '10',
      10,
    ),

    // Skip embedding system messages
    skipSystemMessages: process.env.AI_MEMORY_SKIP_SYSTEM !== 'false',

    // Document processing
    maxDocumentPages: parseInt(process.env.AI_MEMORY_MAX_DOC_PAGES || '50', 10),
    maxDocumentChars: parseInt(
      process.env.AI_MEMORY_MAX_DOC_CHARS || '100000',
      10,
    ),

    // Image processing
    enableOcr: process.env.AI_MEMORY_ENABLE_OCR !== 'false',
    enableImageDescription: process.env.AI_MEMORY_ENABLE_IMG_DESC !== 'false',

    // Audio/video transcription
    enableTranscription: process.env.AI_MEMORY_ENABLE_TRANSCRIPTION !== 'false',
    maxAudioDurationSeconds: parseInt(
      process.env.AI_MEMORY_MAX_AUDIO_DURATION || '600',
      10,
    ),
  },

  // Importance scoring configuration
  importance: {
    // Weight for message direction (1 = inbound, 0.8 = outbound)
    inboundWeight: 1.0,
    outboundWeight: 0.8,

    // Boost for messages with certain characteristics
    questionBoost: 0.2, // Messages containing questions
    actionBoost: 0.15, // Messages with action items
    entityBoost: 0.1, // Messages mentioning names, dates, etc.
  },

  // Logging and monitoring
  logging: {
    // Log all memory operations
    enabled: process.env.AI_MEMORY_LOGGING !== 'false',

    // Log operation costs for billing
    trackCosts: process.env.AI_MEMORY_TRACK_COSTS !== 'false',

    // Retention period for logs (days)
    retentionDays: parseInt(process.env.AI_MEMORY_LOG_RETENTION || '90', 10),
  },

  // Rate limiting
  rateLimit: {
    // Maximum embeddings per minute per user
    embeddingsPerMinute: parseInt(
      process.env.AI_MEMORY_RATE_LIMIT || '100',
      10,
    ),

    // Maximum retrievals per minute per user
    retrievalsPerMinute: parseInt(
      process.env.AI_MEMORY_RETRIEVAL_RATE || '60',
      10,
    ),
  },
}));

export type AiMemoryConfig = ReturnType<typeof aiMemoryConfig>;
