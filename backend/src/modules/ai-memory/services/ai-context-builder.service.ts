import { AiContextConfig } from '@config/ai-context.config';
import { db } from '@database/db.connection';
import { chats, messages } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { desc, eq } from 'drizzle-orm';
import { AiTriggerReason } from './ai-usage-guard.service';
import { ConversationSummaryService } from './conversation-summary.service';

/**
 * Built context for AI reply generation
 */
export interface BuiltAiContext {
  systemPrompt: string;
  conversationSummary: string | null;
  recentMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  participantInfo?: {
    contactName?: string;
    contactPhone?: string;
  };
  totalTokensEstimate: number;
}

/**
 * Message format for LLM
 */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * AI Context Builder Service
 *
 * Builds context for AI reply generation WITHOUT making AI calls.
 *
 * Responsibilities:
 * - Fetch conversation summary (if available)
 * - Fetch recent messages
 * - Build LLM-ready context
 * - Optionally trigger summary update before building context
 *
 * Design principles:
 * - This service does NOT call any LLM
 * - It assembles existing data into a format suitable for AI
 * - Summary updates are triggered separately and explicitly
 */
@Injectable()
export class AiContextBuilderService {
  private readonly logger = new Logger(AiContextBuilderService.name);
  private readonly config: AiContextConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly summaryService: ConversationSummaryService,
  ) {
    this.config = this.configService.get<AiContextConfig>('aiContext')!;
  }

  /**
   * Build context for AI reply generation
   *
   * @param chatId - The chat to build context for
   * @param userId - User ID for usage tracking
   * @param systemPrompt - Custom system prompt for the AI
   * @param updateSummaryIfNeeded - Whether to update summary before building (default: true)
   */
  async buildContext(params: {
    chatId: string;
    userId: number;
    systemPrompt?: string;
    updateSummaryIfNeeded?: boolean;
  }): Promise<BuiltAiContext> {
    const { chatId, userId, updateSummaryIfNeeded = true } = params;

    // Optionally update summary before building context
    if (updateSummaryIfNeeded && this.config.summaryEnabled) {
      await this.summaryService.updateSummaryIfNeeded(
        chatId,
        userId,
        AiTriggerReason.AI_REPLY_NEEDED,
      );
    }

    // Fetch components in parallel
    const [summary, recentMessages, participantInfo] = await Promise.all([
      this.summaryService.getSummaryText(chatId),
      this.getRecentMessages(chatId),
      this.config.context.includeParticipantInfo
        ? this.getParticipantInfo(chatId)
        : Promise.resolve(undefined),
    ]);

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(
      params.systemPrompt,
      participantInfo,
    );

    // Estimate tokens
    const totalTokensEstimate = this.estimateTokens(
      systemPrompt,
      summary,
      recentMessages,
    );

    return {
      systemPrompt,
      conversationSummary: summary,
      recentMessages,
      participantInfo,
      totalTokensEstimate,
    };
  }

  /**
   * Convert context to LLM message format
   * Ready to send to OpenAI/Anthropic/etc
   */
  formatForLlm(context: BuiltAiContext): LlmMessage[] {
    const llmMessages: LlmMessage[] = [];

    // System prompt
    llmMessages.push({
      role: 'system',
      content: context.systemPrompt,
    });

    // Add summary as context if available
    if (context.conversationSummary) {
      llmMessages.push({
        role: 'system',
        content: `Previous conversation summary:\n${context.conversationSummary}`,
      });
    }

    // Add recent messages
    for (const msg of context.recentMessages) {
      llmMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    return llmMessages;
  }

  /**
   * Get only recent messages (no summary, no AI calls)
   * Useful for simple contexts or when summaries are disabled
   */
  async getRecentMessagesOnly(chatId: string): Promise<
    Array<{
      role: 'user' | 'assistant';
      content: string;
      timestamp: Date;
    }>
  > {
    return this.getRecentMessages(chatId);
  }

  // ==================== Private Methods ====================

  private async getRecentMessages(chatId: string): Promise<
    Array<{
      role: 'user' | 'assistant';
      content: string;
      timestamp: Date;
    }>
  > {
    const limit = this.config.context.recentMessagesCount;

    const recentMessages = await db
      .select({
        text: messages.text,
        direction: messages.direction,
        timestamp: messages.timestamp,
      })
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.timestamp))
      .limit(limit);

    // Reverse to get chronological order
    return recentMessages.reverse().map((msg) => ({
      role: msg.direction === 'outbound' ? 'assistant' : 'user',
      content: msg.text || '[media/attachment]',
      timestamp: msg.timestamp,
    }));
  }

  private async getParticipantInfo(chatId: string): Promise<
    | {
        contactName?: string;
        contactPhone?: string;
      }
    | undefined
  > {
    // Get chat info directly (chats table has participantPhone and participantName)
    const chat = await db
      .select({
        participantPhone: chats.participantPhone,
        participantName: chats.participantName,
      })
      .from(chats)
      .where(eq(chats.chatId, chatId))
      .limit(1);

    if (!chat[0]) {
      return undefined;
    }

    return {
      contactName: chat[0].participantName || undefined,
      contactPhone: chat[0].participantPhone,
    };
  }

  private buildSystemPrompt(
    customPrompt?: string,
    participantInfo?: { contactName?: string; contactPhone?: string },
  ): string {
    const base =
      customPrompt ||
      `You are a helpful WhatsApp assistant. You respond naturally and helpfully to messages.`;

    let prompt = base;

    // Add participant context if available
    if (participantInfo) {
      const parts: string[] = [];
      if (participantInfo.contactName) {
        parts.push(`You are chatting with ${participantInfo.contactName}`);
      }
      if (parts.length > 0) {
        prompt += `\n\n${parts.join('. ')}.`;
      }
    }

    return prompt;
  }

  private estimateTokens(
    systemPrompt: string,
    summary: string | null,
    recentMessages: Array<{ content: string }>,
  ): number {
    // Rough estimation: ~4 characters per token
    const systemTokens = Math.ceil(systemPrompt.length / 4);
    const summaryTokens = summary ? Math.ceil(summary.length / 4) : 0;
    const messageTokens = recentMessages.reduce(
      (acc, msg) => acc + Math.ceil((msg.content?.length || 0) / 4),
      0,
    );

    return systemTokens + summaryTokens + messageTokens;
  }
}
