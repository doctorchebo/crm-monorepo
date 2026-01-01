import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageMemoryMetadata, StoreMemoryInput } from '../types';
import { AiMemoryService } from './ai-memory.service';
import { ContentProcessingService } from './content-processing.service';

/**
 * Message Memory Integration Service
 *
 * Provides easy integration points for automatically storing message memories
 * when messages are sent or received through the messaging system.
 *
 * This service is designed to be injected into WhatsAppService or other
 * messaging services to automatically embed messages.
 */
@Injectable()
export class MessageMemoryIntegration implements OnModuleInit {
  private readonly logger = new Logger(MessageMemoryIntegration.name);
  private readonly autoEmbed: boolean;
  private readonly minMessageLength: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly aiMemoryService: AiMemoryService,
    private readonly contentProcessingService: ContentProcessingService,
  ) {
    this.autoEmbed = this.configService.get<boolean>(
      'aiMemory.processing.autoEmbedMessages',
      true,
    );
    this.minMessageLength = this.configService.get<number>(
      'aiMemory.processing.minMessageLength',
      10,
    );
  }

  async onModuleInit() {
    if (this.autoEmbed && this.aiMemoryService.isReady()) {
      this.logger.log(
        'Message memory integration initialized - auto-embedding enabled',
      );
    } else {
      this.logger.warn(
        'Message memory integration: auto-embedding disabled or service not ready',
      );
    }
  }

  /**
   * Store a message memory (called after message is sent/received)
   *
   * @param params Message parameters
   * @returns Result of storage operation
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
    if (!this.autoEmbed) {
      return { success: true }; // Skip silently if disabled
    }

    if (!this.aiMemoryService.isReady()) {
      this.logger.debug('AI memory service not ready, skipping embedding');
      return { success: false, error: 'Service not ready' };
    }

    // Skip short messages
    if (!params.content || params.content.length < this.minMessageLength) {
      return { success: true }; // Not an error, just skip
    }

    // Calculate importance score
    const importanceScore = this.aiMemoryService.calculateImportanceScore(
      params.content,
      params.direction,
    );

    const input: StoreMemoryInput = {
      chatId: params.chatId,
      messageId: params.messageId,
      content: params.content,
      metadata: {
        userId: params.userId,
        senderId: params.senderId,
        chatId: params.chatId,
        messageId: params.messageId,
        timestamp: (params.timestamp || new Date()).toISOString(),
        source: 'message',
        contentType: params.contentType || 'text',
        direction: params.direction,
        participantPhone: params.participantPhone,
        importanceScore,
      },
    };

    try {
      const result = await this.aiMemoryService.storeMessageMemory(input);
      return { success: result.success, error: result.error };
    } catch (error) {
      this.logger.error(`Failed to store message memory: ${error.message}`);
      // Don't throw - embedding failure shouldn't break message flow
      return { success: false, error: error.message };
    }
  }

  /**
   * Store multiple messages in batch (useful for backfilling)
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
    if (!this.aiMemoryService.isReady()) {
      return { success: 0, failed: messages.length };
    }

    const inputs: StoreMemoryInput[] = messages
      .filter((m) => m.content && m.content.length >= this.minMessageLength)
      .map((m) => ({
        chatId: m.chatId,
        messageId: m.messageId,
        content: m.content,
        metadata: {
          userId: m.userId,
          senderId: m.senderId,
          chatId: m.chatId,
          messageId: m.messageId,
          timestamp: (m.timestamp || new Date()).toISOString(),
          source: 'message',
          contentType: 'text',
          direction: m.direction,
          participantPhone: m.participantPhone,
          importanceScore: this.aiMemoryService.calculateImportanceScore(
            m.content,
            m.direction,
          ),
        } as MessageMemoryMetadata,
      }));

    try {
      const result =
        await this.aiMemoryService.storeMessageMemoriesBatch(inputs);
      return { success: result.success, failed: result.failed };
    } catch (error) {
      this.logger.error(`Batch storage failed: ${error.message}`);
      return { success: 0, failed: messages.length };
    }
  }

  /**
   * Process and store a media attachment
   * Supports both URL-based (legacy) and S3-based media storage
   */
  async storeMediaAttachment(params: {
    userId: number;
    senderId?: number;
    chatId: string;
    messageId?: string;
    // S3-based storage (preferred)
    s3Key?: string;
    // URL-based storage (legacy)
    fileUrl?: string;
    fileName?: string;
    filename?: string; // Alternative field name
    mimeType: string;
    fileSize?: number;
    contentType?: 'document' | 'image' | 'audio' | 'video';
  }): Promise<{ success: boolean; error?: string }> {
    if (!this.aiMemoryService.isReady()) {
      return { success: false, error: 'Service not ready' };
    }

    // Normalize filename
    const fileName = params.fileName || params.filename || 'unnamed';

    // Determine fileUrl - prefer s3Key pattern
    const fileUrl = params.s3Key
      ? `s3://${params.s3Key}`
      : params.fileUrl || '';

    if (!fileUrl) {
      return { success: false, error: 'No file location provided' };
    }

    try {
      // Process the content
      const processResult = await this.contentProcessingService.processContent({
        userId: params.userId,
        chatId: params.chatId,
        fileUrl: fileUrl,
        fileName: fileName,
        mimeType: params.mimeType,
        fileSize: params.fileSize || 0,
      });

      if (!processResult.success || !processResult.extractedContent) {
        return {
          success: false,
          error: processResult.error || 'No content extracted',
        };
      }

      // Store the processed content
      const storeResult = await this.aiMemoryService.storeUploadedContentMemory(
        {
          userId: params.userId,
          chatId: params.chatId,
          type: processResult.metadata!.contentType,
          fileName: fileName,
          fileUrl: fileUrl,
          fileSize: params.fileSize,
          mimeType: params.mimeType,
          extractedContent: processResult.extractedContent,
          metadata: processResult.metadata!,
        },
      );

      return { success: storeResult.success, error: storeResult.error };
    } catch (error) {
      this.logger.error(`Failed to store media attachment: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if auto-embedding is enabled
   */
  isAutoEmbedEnabled(): boolean {
    return this.autoEmbed && this.aiMemoryService.isReady();
  }
}
