import { AiContextConfig } from '@config/ai-context.config';
import {
  conversationSummaries,
  ConversationSummary,
} from '@database/ai-context.schema';
import { db } from '@database/db.connection';
import { messages } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, sql } from 'drizzle-orm';
import OpenAI from 'openai';
import {
  AiOperationType,
  AiTriggerReason,
  AiUsageGuardService,
} from './ai-usage-guard.service';

/**
 * Result of summary check
 */
export interface SummaryCheckResult {
  needsUpdate: boolean;
  reason?: AiTriggerReason;
  pendingCount: number;
  lastSummaryAge?: number; // hours since last update
}

/**
 * Summary update result
 */
export interface SummaryUpdateResult {
  success: boolean;
  summary?: string;
  tokensUsed?: number;
  costCents?: number;
  error?: string;
}

/**
 * Conversation Summary Service
 *
 * Manages rolling conversation summaries for AI context.
 *
 * Design principles:
 * - One summary per chat (not per message!)
 * - Update only when threshold conditions are met
 * - Merge new messages into existing summary
 * - Keep summaries concise for cost control
 *
 * Flow:
 * 1. New message arrives → increment pending count (NO AI call)
 * 2. AI reply requested OR threshold met → check if update needed
 * 3. If update needed: fetch summary + pending messages → call LLM once → save
 * 4. Return summary for context building
 */
@Injectable()
export class ConversationSummaryService {
  private readonly logger = new Logger(ConversationSummaryService.name);
  private readonly config: AiContextConfig;
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly usageGuard: AiUsageGuardService,
  ) {
    this.config = this.configService.get<AiContextConfig>('aiContext')!;

    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: this.config.provider.apiKey,
      baseURL: this.config.provider.baseUrl,
    });
  }

  /**
   * Increment pending message count for a chat
   * Called when a new message arrives - NO AI CALL
   */
  async incrementPendingCount(chatId: string): Promise<void> {
    // Upsert: create if not exists, increment if exists
    await db
      .insert(conversationSummaries)
      .values({
        chatId,
        summaryText: '',
        lastMessageId: null,
        pendingMessageCount: 1,
        summaryVersion: 0,
      })
      .onConflictDoUpdate({
        target: conversationSummaries.chatId,
        set: {
          pendingMessageCount: sql`${conversationSummaries.pendingMessageCount} + 1`,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Check if a summary needs to be updated
   * Does NOT make any AI calls
   */
  async checkSummaryNeeded(chatId: string): Promise<SummaryCheckResult> {
    const summary = await this.getSummary(chatId);
    const config = this.config.summary;

    if (!summary) {
      return { needsUpdate: false, pendingCount: 0 };
    }

    const pendingCount = summary.pendingMessageCount;

    // Check message threshold
    if (pendingCount >= config.messageThreshold) {
      return {
        needsUpdate: true,
        reason: AiTriggerReason.MESSAGE_THRESHOLD,
        pendingCount,
      };
    }

    // Check staleness (only if there are pending messages)
    if (pendingCount > 0 && summary.updatedAt) {
      const hoursSinceUpdate =
        (Date.now() - new Date(summary.updatedAt).getTime()) / (1000 * 60 * 60);

      if (hoursSinceUpdate >= config.stalenessHours) {
        return {
          needsUpdate: true,
          reason: AiTriggerReason.STALENESS_TIMEOUT,
          pendingCount,
          lastSummaryAge: hoursSinceUpdate,
        };
      }
    }

    return { needsUpdate: false, pendingCount };
  }

  /**
   * Update summary for a chat if conditions are met
   * This is the ONLY place where AI is called for summaries
   */
  async updateSummaryIfNeeded(
    chatId: string,
    userId: number,
    forceReason?: AiTriggerReason,
  ): Promise<SummaryUpdateResult> {
    // Check if summaries are enabled
    if (!this.config.aiMemoryEnabled || !this.config.summaryEnabled) {
      return { success: false, error: 'Summaries are disabled' };
    }

    // Check if update is needed (unless forced)
    let triggerReason = forceReason;
    if (!forceReason) {
      const check = await this.checkSummaryNeeded(chatId);
      if (!check.needsUpdate) {
        return { success: true, summary: undefined }; // No update needed
      }
      triggerReason = check.reason;
    }

    // Check usage limits
    const usageCheck = await this.usageGuard.checkUsage(userId);
    if (!usageCheck.allowed) {
      this.logger.warn(
        `Summary update blocked for user ${userId}: ${usageCheck.reason}`,
      );
      return { success: false, error: usageCheck.reason };
    }

    try {
      // Get existing summary and pending messages
      const summary = await this.getSummary(chatId);
      const pendingMessages = await this.getPendingMessages(
        chatId,
        summary?.lastMessageId,
        this.config.summary.batchSize,
      );

      if (pendingMessages.length === 0) {
        // No new messages, just reset pending count
        await this.resetPendingCount(chatId);
        return { success: true, summary: summary?.summaryText || undefined };
      }

      // Build prompt
      const prompt = this.buildSummaryPrompt(
        summary?.summaryText,
        pendingMessages,
      );

      // Call LLM
      const startTime = Date.now();
      const response = await this.openai.chat.completions.create({
        model: this.config.provider.summaryModel,
        messages: [
          { role: 'system', content: this.config.summary.systemPrompt },
          { role: 'user', content: prompt },
        ],
        max_tokens: this.config.summary.maxSummaryTokens,
        temperature: 0.3, // Low temperature for factual summaries
      });

      const newSummary = response.choices[0]?.message?.content || '';
      const promptTokens = response.usage?.prompt_tokens || 0;
      const completionTokens = response.usage?.completion_tokens || 0;
      const totalTokens = response.usage?.total_tokens || 0;

      // Estimate cost
      const costCents = this.usageGuard.estimateCost({
        model: this.config.provider.summaryModel,
        promptTokens,
        completionTokens,
      });

      // Save updated summary
      const lastMessageId =
        pendingMessages[pendingMessages.length - 1]?.messageId ||
        summary?.lastMessageId;

      await this.saveSummary(
        chatId,
        newSummary,
        lastMessageId,
        this.config.provider.summaryModel,
      );

      // Record usage
      await this.usageGuard.recordOperation({
        userId,
        chatId,
        operationType: summary?.summaryText
          ? AiOperationType.SUMMARY_UPDATE
          : AiOperationType.SUMMARY_INITIAL,
        triggerReason: triggerReason!,
        model: this.config.provider.summaryModel,
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        totalTokens,
        estimatedCostCents: costCents,
        latencyMs: Date.now() - startTime,
        metadata: {
          messagesProcessed: pendingMessages.length,
          previousSummaryLength: summary?.summaryText?.length || 0,
          newSummaryLength: newSummary.length,
        },
      });

      this.logger.log(
        `Updated summary for chat ${chatId}: processed ${pendingMessages.length} messages, ` +
          `${totalTokens} tokens, $${(costCents / 100).toFixed(4)}`,
      );

      return {
        success: true,
        summary: newSummary,
        tokensUsed: totalTokens,
        costCents,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      await this.usageGuard.recordFailure({
        userId,
        chatId,
        operationType: AiOperationType.SUMMARY_UPDATE,
        triggerReason: triggerReason!,
        model: this.config.provider.summaryModel,
        errorMessage,
      });

      this.logger.error(`Failed to update summary for chat ${chatId}:`, error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get current summary for a chat
   */
  async getSummary(chatId: string): Promise<ConversationSummary | null> {
    const results = await db
      .select()
      .from(conversationSummaries)
      .where(eq(conversationSummaries.chatId, chatId))
      .limit(1);

    return results[0] || null;
  }

  /**
   * Get summary text for context building
   * Does NOT trigger updates - just returns current state
   */
  async getSummaryText(chatId: string): Promise<string | null> {
    const summary = await this.getSummary(chatId);
    return summary?.summaryText || null;
  }

  /**
   * Delete summary for a chat (e.g., when chat is deleted)
   */
  async deleteSummary(chatId: string): Promise<void> {
    await db
      .delete(conversationSummaries)
      .where(eq(conversationSummaries.chatId, chatId));
  }

  // ==================== Private Methods ====================

  private async getPendingMessages(
    chatId: string,
    afterMessageId: string | null | undefined,
    limit: number,
  ): Promise<
    Array<{
      messageId: string;
      text: string | null;
      direction: string;
      timestamp: Date;
    }>
  > {
    // Build query based on whether we have a last message ID
    if (afterMessageId) {
      // Get the timestamp of the last processed message
      const lastMessage = await db
        .select({ timestamp: messages.timestamp })
        .from(messages)
        .where(eq(messages.messageId, afterMessageId))
        .limit(1);

      if (lastMessage[0]) {
        return db
          .select({
            messageId: messages.messageId,
            text: messages.text,
            direction: messages.direction,
            timestamp: messages.timestamp,
          })
          .from(messages)
          .where(
            and(
              eq(messages.chatId, chatId),
              gt(messages.timestamp, lastMessage[0].timestamp),
            ),
          )
          .orderBy(messages.timestamp)
          .limit(limit);
      }
    }

    // No last message, get all messages for the chat
    return db
      .select({
        messageId: messages.messageId,
        text: messages.text,
        direction: messages.direction,
        timestamp: messages.timestamp,
      })
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(messages.timestamp)
      .limit(limit);
  }

  private buildSummaryPrompt(
    existingSummary: string | null | undefined,
    newMessages: Array<{
      text: string | null;
      direction: string;
      timestamp: Date;
    }>,
  ): string {
    const messagesText = newMessages
      .map((m) => {
        const sender = m.direction === 'outbound' ? 'Me' : 'Contact';
        const time = m.timestamp.toISOString();
        return `[${time}] ${sender}: ${m.text || '[media/attachment]'}`;
      })
      .join('\n');

    if (existingSummary) {
      return `EXISTING SUMMARY:
${existingSummary}

NEW MESSAGES TO INCORPORATE:
${messagesText}

Please update the summary to include the new information. Merge seamlessly, keep concise.`;
    }

    return `Create a summary of this conversation:

${messagesText}

Provide a concise summary following the format guidelines.`;
  }

  private async saveSummary(
    chatId: string,
    summaryText: string,
    lastMessageId: string | null | undefined,
    modelUsed: string,
  ): Promise<void> {
    await db
      .update(conversationSummaries)
      .set({
        summaryText,
        lastMessageId: lastMessageId || null,
        pendingMessageCount: 0,
        summaryVersion: sql`${conversationSummaries.summaryVersion} + 1`,
        modelUsed,
        updatedAt: new Date(),
      })
      .where(eq(conversationSummaries.chatId, chatId));
  }

  private async resetPendingCount(chatId: string): Promise<void> {
    await db
      .update(conversationSummaries)
      .set({
        pendingMessageCount: 0,
        updatedAt: new Date(),
      })
      .where(eq(conversationSummaries.chatId, chatId));
  }
}
