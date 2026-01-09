/**
 * AI Context Schema
 *
 * Lightweight schema for AI-powered conversation context.
 * Replaces the expensive per-message embedding system with:
 * - Rolling conversation summaries (updated periodically)
 * - AI usage tracking and limits
 *
 * Design principles:
 * - No per-message AI calls
 * - Event-driven summary updates
 * - Cost-controlled with daily limits
 * - Works regardless of AI Reply status
 */

import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './schema';

// ==================== Conversation Summaries ====================

/**
 * Conversation Summaries table
 *
 * Stores rolling summaries of conversations, updated periodically
 * when conditions are met (message threshold, time-based, or on-demand).
 *
 * This replaces per-message embeddings with a single summary per chat,
 * reducing AI costs by 90%+.
 */
export const conversationSummaries = pgTable(
  'conversation_summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Chat reference
    chatId: varchar('chat_id').notNull().unique(),

    // The rolling summary text
    summaryText: text('summary_text').notNull(),

    // Tracking which messages have been summarized
    lastMessageId: varchar('last_message_id'), // Last message included in summary
    lastMessageTimestamp: timestamp('last_message_timestamp'), // Timestamp of last summarized message
    messageCountInSummary: integer('message_count_in_summary')
      .notNull()
      .default(0),

    // Messages pending summarization (since last summary)
    pendingMessageCount: integer('pending_message_count').notNull().default(0),

    // Summary metadata
    summaryVersion: integer('summary_version').notNull().default(1), // Increments on each update
    modelUsed: varchar('model_used', { length: 100 }), // LLM model used for summarization

    // Token counts for context window management
    summaryTokenCount: integer('summary_token_count'), // Estimated tokens in summary

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    chatIdIndex: index('idx_conv_summaries_chat_id').on(table.chatId),
    updatedAtIndex: index('idx_conv_summaries_updated_at').on(table.updatedAt),
    pendingCountIndex: index('idx_conv_summaries_pending_count').on(
      table.pendingMessageCount,
    ),
  }),
);

export type ConversationSummary = typeof conversationSummaries.$inferSelect;
export type NewConversationSummary = typeof conversationSummaries.$inferInsert;

// ==================== AI Usage Tracking ====================

/**
 * AI Usage Daily Limits table
 *
 * Tracks daily AI usage per user for cost control.
 * Enforces hard limits to prevent runaway costs.
 */
export const aiUsageDailyLimits = pgTable(
  'ai_usage_daily_limits',
  {
    id: serial('id').primaryKey(),

    // User reference
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Date (UTC) for this usage record
    usageDate: date('usage_date').notNull(),

    // Usage counters
    summaryCallsCount: integer('summary_calls_count').notNull().default(0),
    aiReplyCallsCount: integer('ai_reply_calls_count').notNull().default(0),
    totalCallsCount: integer('total_calls_count').notNull().default(0),

    // Token usage
    totalInputTokens: integer('total_input_tokens').notNull().default(0),
    totalOutputTokens: integer('total_output_tokens').notNull().default(0),

    // Cost tracking (in cents for precision)
    estimatedCostCents: integer('estimated_cost_cents').notNull().default(0),

    // Limit status
    limitReached: boolean('limit_reached').notNull().default(false),
    limitReachedAt: timestamp('limit_reached_at'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    userDateUnique: unique('uq_ai_usage_user_date').on(
      table.userId,
      table.usageDate,
    ),
    userIdIndex: index('idx_ai_usage_daily_user_id').on(table.userId),
    usageDateIndex: index('idx_ai_usage_daily_date').on(table.usageDate),
    limitReachedIndex: index('idx_ai_usage_daily_limit_reached').on(
      table.limitReached,
    ),
  }),
);

export type AiUsageDailyLimit = typeof aiUsageDailyLimits.$inferSelect;
export type NewAiUsageDailyLimit = typeof aiUsageDailyLimits.$inferInsert;

/**
 * AI Operation Logs table
 *
 * Detailed log of every AI operation for auditing and debugging.
 * Includes trigger reason, token usage, and cost estimates.
 */
export const aiOperationLogs = pgTable(
  'ai_operation_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // User and context references
    userId: integer('user_id').notNull(),
    chatId: varchar('chat_id'),

    // Operation type
    operationType: varchar('operation_type', { length: 50 }).notNull(), // 'summary_update', 'ai_reply', 'context_build'

    // Trigger reason (why this AI call was made)
    triggerReason: varchar('trigger_reason', { length: 100 }).notNull(), // 'message_threshold', 'time_based', 'on_demand', 'ai_reply_request'

    // Operation details
    modelUsed: varchar('model_used', { length: 100 }),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    totalTokens: integer('total_tokens'),

    // Cost estimate (in cents)
    estimatedCostCents: integer('estimated_cost_cents'),

    // Operation result
    status: varchar('status', { length: 20 }).notNull(), // 'success', 'failed', 'rate_limited'
    errorMessage: text('error_message'),

    // Performance
    latencyMs: integer('latency_ms'),

    // Additional metadata
    metadata: jsonb('metadata').default({}),

    // Timestamp
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    userIdIndex: index('idx_ai_op_logs_user_id').on(table.userId),
    chatIdIndex: index('idx_ai_op_logs_chat_id').on(table.chatId),
    operationTypeIndex: index('idx_ai_op_logs_operation_type').on(
      table.operationType,
    ),
    createdAtIndex: index('idx_ai_op_logs_created_at').on(table.createdAt),
    statusIndex: index('idx_ai_op_logs_status').on(table.status),
  }),
);

export type AiOperationLog = typeof aiOperationLogs.$inferSelect;
export type NewAiOperationLog = typeof aiOperationLogs.$inferInsert;

// ==================== Relations ====================

export const conversationSummariesRelations = relations(
  conversationSummaries,
  ({ one }) => ({
    // Note: Can't directly reference chats here as it would create circular dependency
    // The relation is maintained via chatId foreign key
  }),
);

export const aiUsageDailyLimitsRelations = relations(
  aiUsageDailyLimits,
  ({ one }) => ({
    user: one(users, {
      fields: [aiUsageDailyLimits.userId],
      references: [users.id],
    }),
  }),
);

export const aiOperationLogsRelations = relations(
  aiOperationLogs,
  ({ one }) => ({
    user: one(users, {
      fields: [aiOperationLogs.userId],
      references: [users.id],
    }),
  }),
);
