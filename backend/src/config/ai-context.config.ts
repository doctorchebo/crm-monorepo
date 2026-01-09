import { registerAs } from '@nestjs/config';

/**
 * AI Context Configuration
 *
 * Lightweight AI configuration focused on cost control and scalability.
 * Replaces the expensive per-message embedding system with:
 * - Rolling conversation summaries
 * - Event-driven updates
 * - Hard cost limits
 *
 * Design principles:
 * - No per-message AI calls
 * - AI calls only when ALL conditions are met
 * - Deterministic behavior based on flags
 * - Scalable to hundreds of chats per user
 */
export const aiContextConfig = registerAs('aiContext', () => ({
  // ==================== Feature Flags ====================

  /**
   * Master switch for AI reply functionality
   * When false: No AI-generated replies
   * When true: AI can generate replies using context
   */
  aiReplyEnabled: process.env.AI_REPLY_ENABLED === 'true',

  /**
   * Master switch for AI memory/context building
   * When false: No conversation summaries, no AI context
   * When true: Summaries are updated based on triggers
   */
  aiMemoryEnabled: process.env.AI_MEMORY_ENABLED === 'true',

  /**
   * Enable rolling conversation summaries
   * Requires aiMemoryEnabled to be true
   * When false: Only recent messages are used for context
   * When true: Summaries provide long-term context
   */
  summaryEnabled: process.env.AI_MEMORY_SUMMARY_ENABLED !== 'false',

  // ==================== LLM Provider ====================

  provider: {
    type: process.env.AI_CONTEXT_PROVIDER_TYPE || 'openai',
    apiKey:
      process.env.AI_CONTEXT_PROVIDER_API_KEY || process.env.OPENAI_API_KEY,
    baseUrl: process.env.AI_CONTEXT_PROVIDER_BASE_URL,

    // Model for summarization (should be cheap and fast)
    summaryModel: process.env.AI_CONTEXT_SUMMARY_MODEL || 'gpt-4o-mini',

    // Model for AI replies (can be more capable)
    replyModel: process.env.AI_CONTEXT_REPLY_MODEL || 'gpt-4o-mini',
  },

  // ==================== Summary Configuration ====================

  summary: {
    /**
     * Minimum new messages before triggering summary update
     * Summary only updates when pending messages >= this threshold
     * Higher = fewer AI calls, less fresh context
     * Lower = more AI calls, fresher context
     */
    messageThreshold: parseInt(
      process.env.AI_MEMORY_SUMMARY_MESSAGE_THRESHOLD || '10',
      10,
    ),

    /**
     * Maximum time (hours) before summary is considered stale
     * Summary updates if: lastUpdated > staleness hours AND pending > 0
     */
    stalenessHours: parseInt(
      process.env.AI_MEMORY_SUMMARY_STALENESS_HOURS || '24',
      10,
    ),

    /**
     * Maximum messages to include in a single summary update
     * Limits context window usage per call
     */
    batchSize: parseInt(process.env.AI_MEMORY_SUMMARY_BATCH_SIZE || '50', 10),

    /**
     * Maximum tokens for the summary itself
     * Keeps summaries concise and cost-effective
     */
    maxSummaryTokens: parseInt(
      process.env.AI_MEMORY_SUMMARY_MAX_TOKENS || '500',
      10,
    ),

    /**
     * System prompt for summary generation
     * Instructs the LLM how to create/update summaries
     */
    systemPrompt:
      process.env.AI_MEMORY_SUMMARY_SYSTEM_PROMPT ||
      `You are a conversation summarizer. Your task is to create or update a concise summary of a WhatsApp conversation.

Rules:
- Be factual and neutral - do not add opinions or interpretations
- Focus on: key topics discussed, decisions made, action items, important facts shared
- Preserve names, dates, numbers, and specific details mentioned
- Keep the summary concise (under 500 words)
- If updating an existing summary, merge new information seamlessly
- Use present tense for ongoing topics, past tense for completed items

Output format:
- Start with a one-line overview
- Use bullet points for key information
- Group related topics together`,
  },

  // ==================== Context Building ====================

  context: {
    /**
     * Number of recent messages to include in AI reply context
     * These are always included regardless of summary
     */
    recentMessagesCount: parseInt(
      process.env.AI_CONTEXT_RECENT_MESSAGES || '10',
      10,
    ),

    /**
     * Maximum total tokens for context (summary + recent messages)
     * Prevents context overflow
     */
    maxContextTokens: parseInt(process.env.AI_CONTEXT_MAX_TOKENS || '4000', 10),

    /**
     * Include user/contact name in context
     */
    includeParticipantInfo:
      process.env.AI_CONTEXT_INCLUDE_PARTICIPANT !== 'false',
  },

  // ==================== Cost Guardrails ====================

  limits: {
    /**
     * Maximum AI calls per day per user account
     * Hard stop when limit is reached
     */
    maxCallsPerDayPerAccount: parseInt(
      process.env.AI_MEMORY_MAX_CALLS_PER_DAY_PER_ACCOUNT || '100',
      10,
    ),

    /**
     * Maximum tokens per day per user account
     * Prevents runaway costs even with many small calls
     */
    maxTokensPerDayPerAccount: parseInt(
      process.env.AI_MEMORY_MAX_TOKENS_PER_DAY_PER_ACCOUNT || '100000',
      10,
    ),

    /**
     * Maximum estimated cost per day per user (in cents)
     * Final safety net for cost control
     */
    maxCostCentsPerDayPerAccount: parseInt(
      process.env.AI_MEMORY_MAX_COST_CENTS_PER_DAY_PER_ACCOUNT || '100',
      10,
    ),

    /**
     * Warn when usage reaches this percentage of limit
     */
    warningThresholdPercent: parseInt(
      process.env.AI_MEMORY_WARNING_THRESHOLD_PERCENT || '80',
      10,
    ),
  },

  // ==================== Logging ====================

  logging: {
    /**
     * Log every AI operation with reason and result
     */
    enabled: process.env.AI_CONTEXT_LOGGING !== 'false',

    /**
     * Log detailed token usage for cost analysis
     */
    trackTokens: process.env.AI_CONTEXT_TRACK_TOKENS !== 'false',

    /**
     * Retention period for operation logs (days)
     */
    retentionDays: parseInt(
      process.env.AI_CONTEXT_LOG_RETENTION_DAYS || '30',
      10,
    ),
  },
}));

export type AiContextConfig = ReturnType<typeof aiContextConfig>;

/**
 * Type guard to check if AI features are enabled
 */
export function isAiEnabled(config: AiContextConfig): boolean {
  return config.aiReplyEnabled || config.aiMemoryEnabled;
}

/**
 * Type guard to check if summaries should be updated
 */
export function shouldUpdateSummaries(config: AiContextConfig): boolean {
  return config.aiMemoryEnabled && config.summaryEnabled;
}

/**
 * Type guard to check if AI replies are available
 */
export function canGenerateAiReply(config: AiContextConfig): boolean {
  return config.aiReplyEnabled && config.aiMemoryEnabled;
}
