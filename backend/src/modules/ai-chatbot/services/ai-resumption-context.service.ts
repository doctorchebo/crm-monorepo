/**
 * AI Resumption Context Service
 *
 * Manages conversation context for AI resumption scenarios.
 * When AI is paused and then resumed, this service ensures the AI
 * understands the conversation state without re-reading all messages.
 *
 * Design principles:
 * - Context is updated EFFICIENTLY (not per-message)
 * - Structured data (key facts, sentiment, pending items) for goal-aware responses
 * - Integrates with existing ConversationSummaryService for summaries
 * - Context update triggers:
 *   1. When AI is paused (capture state before handoff)
 *   2. Periodically during long conversations (every N messages)
 *   3. On explicit request (manual refresh)
 */

import { db } from '@database/db.connection';
import { chatAiContext, chats, messages } from '@database/schema';
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { LLMService } from './llm.service';

// ============================================================================
// Types
// ============================================================================

export interface ConversationContextSnapshot {
  contextSummary: string | null;
  keyFacts: string[];
  customerSentiment: 'positive' | 'neutral' | 'negative' | 'frustrated' | null;
  pendingItems: string[];
  lastTopic: string | null;
  messageCountAtSummary: number;
  lastSummarizedAt: Date | null;
}

export interface ContextUpdateResult {
  success: boolean;
  context?: ConversationContextSnapshot;
  tokensUsed?: number;
  error?: string;
}

interface RecentMessage {
  id: string;
  text: string | null;
  direction: 'inbound' | 'outbound';
  timestamp: Date;
}

// ============================================================================
// Constants
// ============================================================================

/** Minimum messages needed before generating context */
const MIN_MESSAGES_FOR_CONTEXT = 3;

/** Maximum messages to analyze for context generation */
const MAX_MESSAGES_FOR_CONTEXT = 30;

/** Message threshold for automatic context refresh during active conversations */
const MESSAGE_THRESHOLD_FOR_REFRESH = 10;

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class AiResumptionContextService {
  private readonly logger = new Logger(AiResumptionContextService.name);

  constructor(
    @Inject(forwardRef(() => LLMService))
    private readonly llmService: LLMService,
  ) {}

  /**
   * Get existing context for a chat (no AI call)
   */
  async getContext(
    chatId: string,
  ): Promise<ConversationContextSnapshot | null> {
    const result = await db
      .select()
      .from(chatAiContext)
      .where(eq(chatAiContext.chatId, chatId))
      .limit(1);

    if (!result[0]) {
      return null;
    }

    const ctx = result[0];
    return {
      contextSummary: ctx.contextSummary,
      keyFacts: (ctx.keyFacts as string[]) || [],
      customerSentiment:
        ctx.customerSentiment as ConversationContextSnapshot['customerSentiment'],
      pendingItems: (ctx.pendingItems as string[]) || [],
      lastTopic: ctx.lastTopic,
      messageCountAtSummary: ctx.messageCountAtSummary || 0,
      lastSummarizedAt: ctx.lastSummarizedAt,
    };
  }

  /**
   * Check if context needs refresh based on message count
   */
  async needsRefresh(chatId: string): Promise<boolean> {
    const context = await this.getContext(chatId);

    if (!context) {
      // No context yet - check if there are enough messages
      const messageCount = await this.getMessageCount(chatId);
      return messageCount >= MIN_MESSAGES_FOR_CONTEXT;
    }

    // Check if significant messages have occurred since last summary
    const currentCount = await this.getMessageCount(chatId);
    const messagesSinceSummary = currentCount - context.messageCountAtSummary;

    return messagesSinceSummary >= MESSAGE_THRESHOLD_FOR_REFRESH;
  }

  /**
   * Update context for a chat - called on strategic events
   * Triggers:
   * - AI pause (capture state before handoff)
   * - AI resume (if context is stale)
   * - Manual refresh request
   */
  async updateContext(
    chatId: string,
    userId: number,
    force: boolean = false,
  ): Promise<ContextUpdateResult> {
    // Check if update is needed (unless forced)
    if (!force) {
      const needsUpdate = await this.needsRefresh(chatId);
      if (!needsUpdate) {
        const existing = await this.getContext(chatId);
        if (existing) {
          return { success: true, context: existing };
        }
      }
    }

    try {
      // Get recent messages for analysis
      const recentMessages = await this.getRecentMessages(chatId);

      if (recentMessages.length < MIN_MESSAGES_FOR_CONTEXT) {
        this.logger.log(
          `[Context Update] Chat ${chatId}: Not enough messages (${recentMessages.length})`,
        );
        return {
          success: false,
          error: 'Not enough messages for context generation',
        };
      }

      // Get chat info for additional context
      const chatInfo = await this.getChatInfo(chatId);

      // Generate context using LLM
      const generatedContext = await this.generateContextWithLLM(
        recentMessages,
        chatInfo,
        userId,
        chatId,
      );

      if (!generatedContext.success) {
        return { success: false, error: generatedContext.error };
      }

      // Save to database
      const lastMessage = recentMessages[recentMessages.length - 1];
      const messageCount = await this.getMessageCount(chatId);

      await db
        .insert(chatAiContext)
        .values({
          chatId,
          contextSummary: generatedContext.context!.contextSummary,
          keyFacts: generatedContext.context!.keyFacts,
          customerSentiment: generatedContext.context!.customerSentiment,
          pendingItems: generatedContext.context!.pendingItems,
          lastTopic: generatedContext.context!.lastTopic,
          lastSummarizedMessageId: lastMessage?.id || null,
          messageCountAtSummary: messageCount,
          lastSummarizedAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: chatAiContext.chatId,
          set: {
            contextSummary: generatedContext.context!.contextSummary,
            keyFacts: generatedContext.context!.keyFacts,
            customerSentiment: generatedContext.context!.customerSentiment,
            pendingItems: generatedContext.context!.pendingItems,
            lastTopic: generatedContext.context!.lastTopic,
            lastSummarizedMessageId: lastMessage?.id || null,
            messageCountAtSummary: messageCount,
            lastSummarizedAt: new Date(),
            updatedAt: new Date(),
          },
        });

      this.logger.log(
        `[Context Update] Chat ${chatId}: Context updated successfully`,
      );

      return {
        success: true,
        context: {
          ...generatedContext.context!,
          messageCountAtSummary: messageCount,
          lastSummarizedAt: new Date(),
        },
        tokensUsed: generatedContext.tokensUsed,
      };
    } catch (error) {
      this.logger.error(
        `[Context Update] Chat ${chatId}: Failed to update context`,
        error,
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Capture context when AI is paused (handoff scenario)
   * This ensures we have fresh context for when AI resumes
   */
  async captureContextOnPause(chatId: string, userId: number): Promise<void> {
    this.logger.log(
      `[Context Capture] Capturing context on AI pause for chat ${chatId}`,
    );

    // Force update to capture current state
    await this.updateContext(chatId, userId, true);
  }

  /**
   * Get context for AI resumption, refreshing if needed
   */
  async getContextForResumption(
    chatId: string,
    userId: number,
  ): Promise<ConversationContextSnapshot | null> {
    // Check if context needs refresh
    const needsRefresh = await this.needsRefresh(chatId);

    if (needsRefresh) {
      const result = await this.updateContext(chatId, userId, false);
      if (result.success && result.context) {
        return result.context;
      }
    }

    // Return existing context
    return this.getContext(chatId);
  }

  /**
   * Format context for inclusion in AI system prompt
   */
  formatContextForPrompt(context: ConversationContextSnapshot): string {
    const parts: string[] = [];

    if (context.contextSummary) {
      parts.push(`## Conversation Summary\n${context.contextSummary}`);
    }

    if (context.keyFacts.length > 0) {
      parts.push(
        `## Key Facts\n${context.keyFacts.map((f) => `- ${f}`).join('\n')}`,
      );
    }

    if (context.customerSentiment) {
      parts.push(`## Customer Sentiment: ${context.customerSentiment}`);
    }

    if (context.pendingItems.length > 0) {
      parts.push(
        `## Pending Items/Questions\n${context.pendingItems.map((i) => `- ${i}`).join('\n')}`,
      );
    }

    if (context.lastTopic) {
      parts.push(`## Last Topic: ${context.lastTopic}`);
    }

    return parts.join('\n\n');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async getRecentMessages(chatId: string): Promise<RecentMessage[]> {
    const result = await db
      .select({
        id: messages.messageId,
        text: messages.text,
        direction: messages.direction,
        timestamp: messages.timestamp,
      })
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.timestamp))
      .limit(MAX_MESSAGES_FOR_CONTEXT);

    // Reverse to get chronological order
    return result.reverse().map((m) => ({
      id: m.id,
      text: m.text,
      direction: m.direction as 'inbound' | 'outbound',
      timestamp: m.timestamp,
    }));
  }

  private async getMessageCount(chatId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(eq(messages.chatId, chatId));

    return Number(result[0]?.count || 0);
  }

  private async getChatInfo(
    chatId: string,
  ): Promise<{ participantName: string | null; participantPhone: string }> {
    const result = await db
      .select({
        participantName: chats.participantName,
        participantPhone: chats.participantPhone,
      })
      .from(chats)
      .where(eq(chats.chatId, chatId))
      .limit(1);

    return result[0] || { participantName: null, participantPhone: '' };
  }

  private async generateContextWithLLM(
    recentMessages: RecentMessage[],
    chatInfo: { participantName: string | null; participantPhone: string },
    userId: number,
    chatId: string,
  ): Promise<{
    success: boolean;
    context?: ConversationContextSnapshot;
    tokensUsed?: number;
    error?: string;
  }> {
    const conversationText = recentMessages
      .map((m) => {
        const role = m.direction === 'inbound' ? 'Customer' : 'Assistant';
        return `${role}: ${m.text || '[media/attachment]'}`;
      })
      .join('\n');

    const customerName = chatInfo.participantName || 'the customer';

    const systemPrompt = `You are a conversation analyzer. Analyze the following conversation and extract structured context information.

Your response MUST be valid JSON with this exact structure:
{
  "contextSummary": "Brief 2-3 sentence summary of the conversation state and what was discussed",
  "keyFacts": ["fact1", "fact2", ...],  // Important facts learned about the customer or their needs (max 5)
  "customerSentiment": "positive" | "neutral" | "negative" | "frustrated",
  "pendingItems": ["item1", "item2", ...],  // Unanswered questions or unresolved issues (max 3)
  "lastTopic": "The main topic being discussed most recently"
}

Focus on information that would help another assistant continue the conversation naturally.`;

    const userPrompt = `Analyze this conversation with ${customerName}:

${conversationText}

Respond with the JSON analysis only, no additional text.`;

    try {
      const response = await this.llmService.chat({
        userId,
        chatId,
        operationType: 'summary',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        skipConfigEnhancement: true,
        maxTokens: 500,
        temperature: 0.3,
      });

      // Parse the JSON response
      const parsed = JSON.parse(response.content);

      return {
        success: true,
        context: {
          contextSummary: parsed.contextSummary || null,
          keyFacts: Array.isArray(parsed.keyFacts)
            ? parsed.keyFacts.slice(0, 5)
            : [],
          customerSentiment: this.validateSentiment(parsed.customerSentiment),
          pendingItems: Array.isArray(parsed.pendingItems)
            ? parsed.pendingItems.slice(0, 3)
            : [],
          lastTopic: parsed.lastTopic || null,
          messageCountAtSummary: 0,
          lastSummarizedAt: null,
        },
        tokensUsed: response.tokensUsed.total,
      };
    } catch (error) {
      this.logger.error(
        `[Context Generation] Failed to generate context for chat ${chatId}`,
        error,
      );
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to generate context',
      };
    }
  }

  private validateSentiment(
    sentiment: unknown,
  ): ConversationContextSnapshot['customerSentiment'] {
    const validSentiments = ['positive', 'neutral', 'negative', 'frustrated'];
    if (typeof sentiment === 'string' && validSentiments.includes(sentiment)) {
      return sentiment as ConversationContextSnapshot['customerSentiment'];
    }
    return 'neutral';
  }
}
