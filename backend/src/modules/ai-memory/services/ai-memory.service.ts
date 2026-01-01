import { db } from '@database/db.connection';
import { chats, messages } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { desc, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import {
  AiMemoryRepository,
  VectorSearchResult,
} from '../repositories/ai-memory.repository';
import {
  AiContext,
  AiMemoryError,
  AiMemoryErrorCode,
  BuildContextInput,
  EmbeddingContent,
  MemoryLogEntry,
  MemoryRetrievalQuery,
  MemoryRetrievalResult,
  MessageMemoryMetadata,
  RecentMessage,
  RetrievedMemory,
  StoreMemoryInput,
  StoreMemoryResult,
  StoreUploadedContentInput,
  UploadedContentMetadata,
} from '../types';
import { EmbeddingService } from './embedding.service';

/**
 * AI Memory Service
 *
 * Main orchestration service for AI memory operations.
 * Coordinates between embedding generation and PostgreSQL pgvector storage.
 *
 * This implementation uses PostgreSQL pgvector for vector storage,
 * providing a cost-effective solution that keeps all data in a single database.
 * The architecture supports future migration to dedicated vector databases
 * through the VectorStore abstraction layer.
 */
@Injectable()
export class AiMemoryService {
  private readonly logger = new Logger(AiMemoryService.name);

  // Configuration values
  private readonly recentMessagesCount: number;
  private readonly topK: number;
  private readonly minSimilarityScore: number;
  private readonly includeUploadedContent: boolean;
  private readonly maxContextTokens: number;
  private readonly autoEmbedMessages: boolean;
  private readonly minMessageLength: number;
  private readonly loggingEnabled: boolean;
  private readonly trackCosts: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly embeddingService: EmbeddingService,
    private readonly repository: AiMemoryRepository,
  ) {
    // Load configuration
    this.recentMessagesCount = this.configService.get<number>(
      'aiMemory.retrieval.recentMessagesCount',
      10,
    );
    this.topK = this.configService.get<number>('aiMemory.retrieval.topK', 5);
    this.minSimilarityScore = this.configService.get<number>(
      'aiMemory.retrieval.minSimilarityScore',
      0.7,
    );
    this.includeUploadedContent = this.configService.get<boolean>(
      'aiMemory.retrieval.includeUploadedContent',
      true,
    );
    this.maxContextTokens = this.configService.get<number>(
      'aiMemory.retrieval.maxContextTokens',
      4000,
    );
    this.autoEmbedMessages = this.configService.get<boolean>(
      'aiMemory.processing.autoEmbedMessages',
      true,
    );
    this.minMessageLength = this.configService.get<number>(
      'aiMemory.processing.minMessageLength',
      10,
    );
    this.loggingEnabled = this.configService.get<boolean>(
      'aiMemory.logging.enabled',
      true,
    );
    this.trackCosts = this.configService.get<boolean>(
      'aiMemory.logging.trackCosts',
      true,
    );
  }

  // ==================== Memory Storage ====================

  /**
   * Store a message as a memory with vector embedding
   */
  async storeMessageMemory(
    input: StoreMemoryInput,
  ): Promise<StoreMemoryResult> {
    const startTime = Date.now();

    try {
      // Validate input
      if (!input.content || input.content.length < this.minMessageLength) {
        return {
          success: false,
          error: 'Content too short for embedding',
        };
      }

      // Check for duplicate
      const contentHash = this.repository.generateHash(input.content);
      const exists = await this.repository.memoryExistsByHash(
        input.chatId,
        contentHash,
      );

      if (exists) {
        return {
          success: true,
          error: 'Memory already exists',
        };
      }

      // Generate unique ID
      const memoryId = uuidv4();

      // Create embedding content
      const embeddingContent: EmbeddingContent = {
        id: memoryId,
        content: input.content,
        metadata: input.metadata,
      };

      // Generate embedding
      const embeddingResult =
        await this.embeddingService.embed(embeddingContent);

      // Store in PostgreSQL with vector embedding
      const memory = await this.repository.createMemory({
        chatId: input.chatId,
        messageId: input.messageId,
        content: input.content,
        metadata: input.metadata,
        embeddingModel: this.embeddingService.getModelName(),
        embeddingDimensions: this.embeddingService.getDimensions(),
        embedding: embeddingResult.vector,
      });

      // Log operation
      await this.logOperation({
        operation: 'store',
        status: 'success',
        userId: input.metadata.userId,
        chatId: input.chatId,
        memoryId: memory.id,
        requestMetadata: {
          contentLength: input.content.length,
          messageId: input.messageId,
        },
        responseMetadata: {
          memoryId: memory.id,
        },
        latencyMs: Date.now() - startTime,
        tokensUsed: embeddingResult.tokensUsed,
        costUsd: this.calculateEmbeddingCost(embeddingResult.tokensUsed),
      });

      return {
        success: true,
        memoryId: memory.id,
      };
    } catch (error) {
      this.logger.error('Failed to store memory:', error);

      await this.logOperation({
        operation: 'store',
        status: 'failed',
        userId: input.metadata.userId,
        chatId: input.chatId,
        errorCode: error.code || 'UNKNOWN',
        errorMessage: error.message,
        errorStack: error.stack,
        latencyMs: Date.now() - startTime,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Store multiple messages as memories in batch
   */
  async storeMessageMemoriesBatch(inputs: StoreMemoryInput[]): Promise<{
    success: number;
    failed: number;
    results: StoreMemoryResult[];
  }> {
    const startTime = Date.now();
    const results: StoreMemoryResult[] = [];
    let success = 0;
    let failed = 0;

    // Filter valid inputs and check for duplicates
    const validInputs: Array<{
      input: StoreMemoryInput;
      memoryId: string;
    }> = [];

    for (const input of inputs) {
      if (!input.content || input.content.length < this.minMessageLength) {
        results.push({ success: false, error: 'Content too short' });
        failed++;
        continue;
      }

      const contentHash = this.repository.generateHash(input.content);
      const exists = await this.repository.memoryExistsByHash(
        input.chatId,
        contentHash,
      );

      if (exists) {
        results.push({ success: true, error: 'Already exists' });
        success++;
        continue;
      }

      validInputs.push({
        input,
        memoryId: uuidv4(),
      });
    }

    if (validInputs.length === 0) {
      return { success, failed, results };
    }

    // Batch embed
    const embeddingContents: EmbeddingContent[] = validInputs.map((v) => ({
      id: v.memoryId,
      content: v.input.content,
      metadata: v.input.metadata,
    }));

    const embeddingResponse = await this.embeddingService.embedBatch({
      contents: embeddingContents,
    });

    // Create a map of successful embeddings
    const successfulEmbeddings = new Map<string, number[]>();
    for (const result of embeddingResponse.results) {
      successfulEmbeddings.set(result.id, result.vector);
    }

    // Store memories with embeddings
    const memoryRecords = validInputs
      .filter(({ memoryId }) => successfulEmbeddings.has(memoryId))
      .map(({ input, memoryId }) => ({
        chatId: input.chatId,
        messageId: input.messageId,
        content: input.content,
        metadata: input.metadata,
        embeddingModel: this.embeddingService.getModelName(),
        embeddingDimensions: this.embeddingService.getDimensions(),
        embedding: successfulEmbeddings.get(memoryId)!,
      }));

    if (memoryRecords.length > 0) {
      await this.repository.createMemoriesBatch(memoryRecords);
      success += memoryRecords.length;
    }

    failed += embeddingResponse.failedIds.length;

    // Log batch operation
    const userId = inputs[0]?.metadata.userId;
    await this.logOperation({
      operation: 'store',
      status: failed > 0 ? 'partial' : 'success',
      userId,
      requestMetadata: {
        batchSize: inputs.length,
      },
      responseMetadata: {
        success,
        failed,
      },
      latencyMs: Date.now() - startTime,
      tokensUsed: embeddingResponse.totalTokensUsed,
      costUsd: this.calculateEmbeddingCost(embeddingResponse.totalTokensUsed),
    });

    return { success, failed, results };
  }

  /**
   * Store uploaded content memory with vector embedding
   */
  async storeUploadedContentMemory(
    input: StoreUploadedContentInput,
  ): Promise<StoreMemoryResult> {
    const startTime = Date.now();

    try {
      const contentId = uuidv4();

      // Create embedding
      const embeddingContent: EmbeddingContent = {
        id: contentId,
        content: input.extractedContent,
        metadata: input.metadata,
      };

      const embeddingResult =
        await this.embeddingService.embed(embeddingContent);

      // Store in PostgreSQL with vector embedding
      const content = await this.repository.createUploadedContent({
        userId: input.userId,
        chatId: input.chatId,
        type: input.type,
        fileName: input.fileName,
        fileUrl: input.fileUrl,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        extractedContent: input.extractedContent,
        metadata: input.metadata,
        status: 'completed',
        embeddingModel: this.embeddingService.getModelName(),
        embeddingDimensions: this.embeddingService.getDimensions(),
        embedding: embeddingResult.vector,
      });

      await this.logOperation({
        operation: 'store',
        status: 'success',
        userId: input.userId,
        chatId: input.chatId,
        uploadedContentId: content.id,
        requestMetadata: {
          type: input.type,
          fileName: input.fileName,
          contentLength: input.extractedContent.length,
        },
        latencyMs: Date.now() - startTime,
        tokensUsed: embeddingResult.tokensUsed,
        costUsd: this.calculateEmbeddingCost(embeddingResult.tokensUsed),
      });

      return {
        success: true,
        memoryId: content.id,
      };
    } catch (error) {
      this.logger.error('Failed to store uploaded content:', error);

      await this.logOperation({
        operation: 'store',
        status: 'failed',
        userId: input.userId,
        chatId: input.chatId,
        errorCode: error.code || 'UNKNOWN',
        errorMessage: error.message,
        latencyMs: Date.now() - startTime,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ==================== Memory Retrieval ====================

  /**
   * Retrieve semantically relevant memories for a query
   * Uses PostgreSQL pgvector for similarity search
   */
  async retrieveMemories(
    query: MemoryRetrievalQuery,
  ): Promise<MemoryRetrievalResult> {
    const startTime = Date.now();

    try {
      const topK = query.topK || this.topK;
      const minScore = query.minScore || this.minSimilarityScore;

      // Generate query embedding
      const embeddingContent: EmbeddingContent = {
        id: 'query',
        content: query.query,
        metadata: {} as MessageMemoryMetadata,
      };

      const embeddingResult =
        await this.embeddingService.embed(embeddingContent);

      // Build filter options
      const filterOptions = {
        chatId: query.chatId,
        topK: topK * 2, // Fetch more to filter later
        minScore,
        direction: query.filters?.direction,
        contentTypes: query.filters?.contentTypes,
      };

      // Search memories using pgvector
      const memoryResults = await this.repository.searchMemoriesByVector(
        query.userId,
        embeddingResult.vector,
        filterOptions,
      );

      // Optionally search uploaded content
      let uploadedResults: VectorSearchResult[] = [];
      if (
        this.includeUploadedContent &&
        query.includeUploadedContent !== false
      ) {
        uploadedResults = await this.repository.searchUploadedContentByVector(
          query.userId,
          embeddingResult.vector,
          {
            chatId: query.chatId,
            topK: topK,
            minScore,
          },
        );
      }

      // Combine and sort all results by similarity
      const allResults = [
        ...memoryResults.map((r) => ({ ...r, source: 'message' as const })),
        ...uploadedResults.map((r) => ({
          ...r,
          source: 'uploaded_content' as const,
        })),
      ].sort((a, b) => b.similarity - a.similarity);

      // Take top K results
      const topResults = allResults.slice(0, topK);

      // Build retrieved memories
      const memories: RetrievedMemory[] = topResults.map((result) => ({
        id: result.id,
        pineconeId: result.id, // Using id as legacy pineconeId for compatibility
        content: result.content,
        score: result.similarity,
        metadata: result.metadata as unknown as
          | MessageMemoryMetadata
          | UploadedContentMetadata,
        source: result.source,
        createdAt: new Date(), // Would need to fetch from DB for exact date
      }));

      const latencyMs = Date.now() - startTime;

      await this.logOperation({
        operation: 'retrieve',
        status: 'success',
        userId: query.userId,
        chatId: query.chatId,
        requestMetadata: {
          query: query.query.substring(0, 100),
          topK,
          filters: query.filters,
        },
        responseMetadata: {
          resultsCount: memories.length,
          topScores: memories.slice(0, 5).map((m) => m.score),
        },
        latencyMs,
        tokensUsed: embeddingResult.tokensUsed,
        costUsd: this.calculateEmbeddingCost(embeddingResult.tokensUsed),
      });

      return {
        memories,
        query: query.query,
        totalFound: memories.length,
        latencyMs,
      };
    } catch (error) {
      this.logger.error('Failed to retrieve memories:', error);

      await this.logOperation({
        operation: 'retrieve',
        status: 'failed',
        userId: query.userId,
        chatId: query.chatId,
        errorCode: error.code || 'UNKNOWN',
        errorMessage: error.message,
        latencyMs: Date.now() - startTime,
      });

      throw new AiMemoryError(
        `Failed to retrieve memories: ${error.message}`,
        AiMemoryErrorCode.RETRIEVAL_FAILED,
        { query: query.query },
      );
    }
  }

  // ==================== Context Building ====================

  /**
   * Build complete AI context for response generation
   */
  async buildContext(input: BuildContextInput): Promise<AiContext> {
    // Fetch recent messages
    const recentMessagesCount =
      input.recentMessagesCount || this.recentMessagesCount;

    const recentDbMessages = await db.query.messages.findMany({
      where: eq(messages.chatId, input.chatId),
      orderBy: [desc(messages.timestamp)],
      limit: recentMessagesCount,
    });

    const recentMessages: RecentMessage[] = recentDbMessages
      .reverse()
      .map((m) => ({
        messageId: m.messageId,
        content: m.text || '',
        direction: m.direction as 'inbound' | 'outbound',
        timestamp: m.timestamp,
        type: m.type,
      }));

    // Fetch chat metadata
    const chat = await db.query.chats.findFirst({
      where: eq(chats.chatId, input.chatId),
    });

    // Retrieve semantically relevant memories
    const retrievalResult = await this.retrieveMemories({
      userId: input.userId,
      chatId: input.chatId,
      query: input.currentMessage,
      topK: input.topK || this.topK,
      includeUploadedContent: this.includeUploadedContent,
    });

    // Filter out memories that are already in recent messages
    const recentMessageIds = new Set(recentMessages.map((m) => m.messageId));
    const relevantMemories = retrievalResult.memories.filter(
      (m) =>
        m.source === 'uploaded_content' ||
        !recentMessageIds.has((m.metadata as MessageMemoryMetadata).messageId),
    );

    // Estimate tokens (rough estimate)
    const recentMessagesTokens = this.estimateTokens(
      recentMessages.map((m) => m.content).join(' '),
    );
    const memoriesTokens = this.estimateTokens(
      relevantMemories.map((m) => m.content).join(' '),
    );

    return {
      recentMessages,
      relevantMemories,
      chatMetadata: {
        chatId: input.chatId,
        userId: input.userId,
        participantPhone: chat?.participantPhone,
        participantName: chat?.participantName || undefined,
      },
      tokenCounts: {
        recentMessages: recentMessagesTokens,
        relevantMemories: memoriesTokens,
        total: recentMessagesTokens + memoriesTokens,
      },
    };
  }

  // ==================== Memory Management ====================

  /**
   * Delete memories for a chat
   */
  async deleteMemoriesForChat(userId: number, chatId: string): Promise<void> {
    const startTime = Date.now();

    try {
      // Delete from PostgreSQL (vectors are deleted automatically with the rows)
      const deletedCount = await this.repository.deleteMemoriesByChatId(chatId);

      await this.logOperation({
        operation: 'delete',
        status: 'success',
        userId,
        chatId,
        responseMetadata: {
          deletedCount,
        },
        latencyMs: Date.now() - startTime,
      });
    } catch (error) {
      this.logger.error('Failed to delete memories for chat:', error);
      throw error;
    }
  }

  /**
   * Delete all memories for a user
   */
  async deleteAllMemoriesForUser(userId: number): Promise<void> {
    const startTime = Date.now();

    try {
      // Delete memories (vectors are in the same table)
      await this.repository.deleteMemoriesByUserId(userId);

      // Delete uploaded content
      await this.repository.deleteUploadedContentByUserId(userId);

      await this.logOperation({
        operation: 'delete',
        status: 'success',
        userId,
        latencyMs: Date.now() - startTime,
      });
    } catch (error) {
      this.logger.error('Failed to delete all memories for user:', error);
      throw error;
    }
  }

  // ==================== Helper Methods ====================

  /**
   * Log a memory operation
   */
  private async logOperation(entry: MemoryLogEntry): Promise<void> {
    if (!this.loggingEnabled) return;

    try {
      await this.repository.createLog({
        operation: entry.operation,
        status: entry.status,
        userId: entry.userId,
        chatId: entry.chatId,
        memoryId: entry.memoryId,
        uploadedContentId: entry.uploadedContentId,
        requestMetadata: entry.requestMetadata,
        responseMetadata: entry.responseMetadata,
        errorCode: entry.errorCode,
        errorMessage: entry.errorMessage,
        errorStack: entry.errorStack,
        latencyMs: entry.latencyMs,
        tokensUsed: entry.tokensUsed,
        costUsd: this.trackCosts ? entry.costUsd : undefined,
      });
    } catch (error) {
      this.logger.error('Failed to log operation:', error);
    }
  }

  /**
   * Calculate embedding cost (approximate)
   * text-embedding-3-large: $0.00013 / 1K tokens
   */
  private calculateEmbeddingCost(tokens: number): string {
    const costPer1KTokens = 0.00013;
    const cost = (tokens / 1000) * costPer1KTokens;
    return cost.toFixed(6);
  }

  /**
   * Estimate tokens for text (rough estimate)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate importance score for a message
   */
  calculateImportanceScore(
    content: string,
    direction: 'inbound' | 'outbound',
  ): number {
    let score = direction === 'inbound' ? 1.0 : 0.8;

    // Boost for questions
    if (content.includes('?')) {
      score += 0.2;
    }

    // Boost for action words
    const actionWords = [
      'need',
      'want',
      'help',
      'please',
      'urgent',
      'important',
      'confirm',
      'schedule',
      'book',
      'order',
    ];
    const lowerContent = content.toLowerCase();
    for (const word of actionWords) {
      if (lowerContent.includes(word)) {
        score += 0.15;
        break;
      }
    }

    // Cap at 1.0
    return Math.min(score, 1.0);
  }

  /**
   * Check if services are ready
   */
  isReady(): boolean {
    return this.embeddingService.isReady();
  }
}
