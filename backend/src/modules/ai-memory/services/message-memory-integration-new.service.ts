import { AiContextConfig } from '@config/ai-context.config';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConversationSummaryService } from './conversation-summary.service';

/**
 * Message Memory Integration Service (Refactored)
 *
 * Lightweight integration for tracking message flow without per-message AI calls.
 *
 * This service:
 * - Tracks pending message counts for summary updates
 * - Does NOT call any AI/LLM per message
 * - Does NOT generate embeddings
 * - Does NOT process images/media
 *
 * Design principles:
 * - Zero AI cost per message ingestion
 * - Just increment counters and timestamps
 * - Summaries update separately via event triggers
 */
@Injectable()
export class MessageMemoryIntegrationService implements OnModuleInit {
  private readonly logger = new Logger(MessageMemoryIntegrationService.name);
  private readonly config: AiContextConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly summaryService: ConversationSummaryService,
  ) {
    this.config = this.configService.get<AiContextConfig>('aiContext')!;
  }

  async onModuleInit() {
    if (this.config.aiMemoryEnabled) {
      this.logger.log(
        'Message memory integration initialized - lightweight tracking enabled',
      );
      this.logger.log(
        `Summary updates trigger after ${this.config.summary.messageThreshold} messages`,
      );
    } else {
      this.logger.log('AI Memory is disabled - message tracking skipped');
    }
  }

  /**
   * Track an incoming or outgoing message
   *
   * This does NOT call any AI - it just increments the pending count
   * for the conversation summary.
   *
   * @param params Message parameters
   */
  async trackMessage(params: {
    chatId: string;
    messageId: string;
    direction: 'inbound' | 'outbound';
  }): Promise<void> {
    // Skip if AI memory is disabled
    if (!this.config.aiMemoryEnabled) {
      return;
    }

    // Just increment the pending count - NO AI CALL
    await this.summaryService.incrementPendingCount(params.chatId);

    this.logger.debug(
      `Tracked ${params.direction} message in chat ${params.chatId}`,
    );
  }

  /**
   * Track multiple messages (for batch operations)
   */
  async trackMessagesBatch(
    messages: Array<{
      chatId: string;
      messageId: string;
      direction: 'inbound' | 'outbound';
    }>,
  ): Promise<{ tracked: number }> {
    if (!this.config.aiMemoryEnabled) {
      return { tracked: 0 };
    }

    // Group by chatId to minimize DB calls
    const byChatId = new Map<string, number>();
    for (const msg of messages) {
      byChatId.set(msg.chatId, (byChatId.get(msg.chatId) || 0) + 1);
    }

    // Increment counts per chat
    let tracked = 0;
    for (const [chatId, count] of byChatId) {
      for (let i = 0; i < count; i++) {
        await this.summaryService.incrementPendingCount(chatId);
        tracked++;
      }
    }

    this.logger.debug(
      `Batch tracked ${tracked} messages across ${byChatId.size} chats`,
    );
    return { tracked };
  }

  /**
   * Check if AI memory tracking is enabled
   */
  isEnabled(): boolean {
    return this.config.aiMemoryEnabled;
  }

  /**
   * Get current status for a chat
   */
  async getChatStatus(chatId: string): Promise<{
    enabled: boolean;
    pendingMessages: number;
    hasSummary: boolean;
    needsUpdate: boolean;
  }> {
    if (!this.config.aiMemoryEnabled) {
      return {
        enabled: false,
        pendingMessages: 0,
        hasSummary: false,
        needsUpdate: false,
      };
    }

    const summary = await this.summaryService.getSummary(chatId);
    const check = await this.summaryService.checkSummaryNeeded(chatId);

    return {
      enabled: true,
      pendingMessages: check.pendingCount,
      hasSummary: !!summary?.summaryText,
      needsUpdate: check.needsUpdate,
    };
  }
}

/**
 * Legacy MessageMemoryIntegration Adapter
 *
 * Provides backward compatibility for existing code that uses the old API.
 * All methods delegate to the new lightweight service.
 *
 * @deprecated Use MessageMemoryIntegrationService instead
 */
@Injectable()
export class LegacyMessageMemoryIntegration implements OnModuleInit {
  private readonly logger = new Logger(LegacyMessageMemoryIntegration.name);
  private readonly newService: MessageMemoryIntegrationService;

  constructor(
    private readonly configService: ConfigService,
    private readonly summaryService: ConversationSummaryService,
  ) {
    // Create the new service internally
    this.newService = new MessageMemoryIntegrationService(
      configService,
      summaryService,
    );
  }

  async onModuleInit() {
    this.logger.warn(
      'MessageMemoryIntegration is deprecated. Use MessageMemoryIntegrationService instead.',
    );
    await this.newService.onModuleInit();
  }

  /**
   * @deprecated Use trackMessage() instead. This no longer generates embeddings.
   */
  async storeMessage(params: {
    userId: number;
    senderId?: number;
    chatId: string;
    messageId: string;
    content: string;
    direction: 'inbound' | 'outbound';
    participantPhone?: string;
    timestamp?: Date;
    contentType?:
      | 'text'
      | 'media_description'
      | 'document_text'
      | 'transcription';
  }): Promise<{ success: boolean; error?: string }> {
    // Just track the message - no embeddings
    await this.newService.trackMessage({
      chatId: params.chatId,
      messageId: params.messageId,
      direction: params.direction,
    });

    return { success: true };
  }

  /**
   * @deprecated Use trackMessagesBatch() instead. This no longer generates embeddings.
   */
  async storeMessagesBatch(
    messages: Array<{
      userId: number;
      senderId?: number;
      chatId: string;
      messageId: string;
      content: string;
      direction: 'inbound' | 'outbound';
      participantPhone?: string;
      timestamp?: Date;
    }>,
  ): Promise<{ success: number; failed: number }> {
    const result = await this.newService.trackMessagesBatch(
      messages.map((m) => ({
        chatId: m.chatId,
        messageId: m.messageId,
        direction: m.direction,
      })),
    );

    return { success: result.tracked, failed: 0 };
  }

  /**
   * @deprecated Media processing is disabled. This is now a no-op.
   */
  async storeMediaAttachment(params: {
    userId: number;
    senderId?: number;
    chatId: string;
    messageId?: string;
    s3Key?: string;
    fileUrl?: string;
    fileName?: string;
    filename?: string;
    mimeType: string;
    fileSize?: number;
    contentType?: 'document' | 'image' | 'audio' | 'video';
  }): Promise<{ success: boolean; error?: string }> {
    // Media processing is disabled - just track the message if we have a chatId
    if (params.chatId && params.messageId) {
      await this.newService.trackMessage({
        chatId: params.chatId,
        messageId: params.messageId,
        direction: 'inbound', // Media attachments are typically inbound
      });
    }

    return { success: true };
  }

  /**
   * @deprecated Use isEnabled() on MessageMemoryIntegrationService instead.
   */
  isAutoEmbedEnabled(): boolean {
    return this.newService.isEnabled();
  }
}
