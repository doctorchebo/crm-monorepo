import { JwtAuthGuard } from '@modules/auth/auth.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  BatchStoreMemoryDto,
  BuildContextDto,
  ProcessContentDto,
  RetrieveMemoriesDto,
  StoreMemoryDto,
  StoreUploadedContentDto,
} from './dto';
import { AiMemoryRepository } from './repositories';
import {
  AiMemoryService,
  ContentProcessingService,
  EmbeddingService,
} from './services';
import { PgVectorStore } from './stores';
import { MessageMemoryMetadata, StoreMemoryInput } from './types';

/**
 * AI Memory Controller
 *
 * REST API for AI memory operations.
 * All endpoints require authentication.
 */
@Controller('ai-memory')
@UseGuards(JwtAuthGuard)
export class AiMemoryController {
  private readonly logger = new Logger(AiMemoryController.name);

  constructor(
    private readonly aiMemoryService: AiMemoryService,
    private readonly contentProcessingService: ContentProcessingService,
    private readonly repository: AiMemoryRepository,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStore: PgVectorStore,
  ) {}

  /**
   * Store a message as memory
   */
  @Post('store')
  @HttpCode(HttpStatus.CREATED)
  async storeMemory(@Body() dto: StoreMemoryDto, @Req() req: any) {
    const userId = req.user.userId;

    const input: StoreMemoryInput = {
      chatId: dto.chatId,
      messageId: dto.messageId,
      content: dto.content,
      metadata: {
        userId,
        chatId: dto.chatId,
        messageId: dto.messageId || '',
        timestamp: new Date().toISOString(),
        source: 'message',
        contentType: 'text',
        direction: 'outbound', // API calls are typically outbound context
        importanceScore: dto.importanceScore ?? 0.5,
      },
    };

    const result = await this.aiMemoryService.storeMessageMemory(input);

    return {
      success: result.success,
      memoryId: result.memoryId,
      error: result.error,
    };
  }

  /**
   * Store multiple messages as memories
   */
  @Post('store/batch')
  @HttpCode(HttpStatus.CREATED)
  async storeMemoriesBatch(@Body() dto: BatchStoreMemoryDto, @Req() req: any) {
    const userId = req.user.userId;

    const inputs: StoreMemoryInput[] = dto.memories.map((m) => ({
      chatId: m.chatId,
      messageId: m.messageId,
      content: m.content,
      metadata: {
        userId,
        chatId: m.chatId,
        messageId: m.messageId || '',
        timestamp: new Date().toISOString(),
        source: 'message',
        contentType: 'text',
        direction: 'outbound',
        importanceScore: m.importanceScore ?? 0.5,
      } as MessageMemoryMetadata,
    }));

    const result = await this.aiMemoryService.storeMessageMemoriesBatch(inputs);

    return {
      success: result.success,
      failed: result.failed,
      total: dto.memories.length,
    };
  }

  /**
   * Store uploaded content
   */
  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  async storeUploadedContent(
    @Body() dto: StoreUploadedContentDto,
    @Req() req: any,
  ) {
    const userId = req.user.userId;

    const result = await this.aiMemoryService.storeUploadedContentMemory({
      userId,
      chatId: dto.chatId,
      type: dto.type as 'document' | 'image' | 'audio' | 'video',
      fileName: dto.fileName,
      fileUrl: dto.fileUrl,
      fileSize: dto.fileSize,
      mimeType: dto.mimeType,
      extractedContent: dto.extractedContent,
      metadata: {
        userId,
        chatId: dto.chatId,
        contentType: dto.type as 'document' | 'image' | 'audio' | 'video',
        processingMethod: 'extraction',
        fileName: dto.fileName,
        mimeType: dto.mimeType,
      },
    });

    return {
      success: result.success,
      memoryId: result.memoryId,
      error: result.error,
    };
  }

  /**
   * Process and store content from URL
   */
  @Post('process')
  @HttpCode(HttpStatus.CREATED)
  async processContent(@Body() dto: ProcessContentDto, @Req() req: any) {
    const userId = req.user.userId;

    // First, process the content
    const processResult = await this.contentProcessingService.processContent({
      userId,
      chatId: dto.chatId,
      fileUrl: dto.fileUrl,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      fileSize: dto.fileSize || 0,
    });

    if (!processResult.success) {
      return {
        success: false,
        error: processResult.error,
      };
    }

    // Then store the processed content
    const storeResult = await this.aiMemoryService.storeUploadedContentMemory({
      userId,
      chatId: dto.chatId,
      type: processResult.metadata!.contentType,
      fileName: dto.fileName,
      fileUrl: dto.fileUrl,
      fileSize: dto.fileSize,
      mimeType: dto.mimeType,
      extractedContent: processResult.extractedContent!,
      metadata: processResult.metadata!,
    });

    return {
      success: storeResult.success,
      memoryId: storeResult.memoryId,
      extractedContent: processResult.extractedContent,
      error: storeResult.error,
    };
  }

  /**
   * Retrieve relevant memories for a query
   */
  @Post('retrieve')
  @HttpCode(HttpStatus.OK)
  async retrieveMemories(@Body() dto: RetrieveMemoriesDto, @Req() req: any) {
    const userId = req.user.userId;

    const result = await this.aiMemoryService.retrieveMemories({
      userId,
      chatId: dto.chatId,
      query: dto.query,
      topK: dto.topK,
      minScore: dto.minScore,
      filters: {
        direction: dto.direction,
        contentTypes: dto.contentTypes,
      },
    });

    return {
      memories: result.memories.map((m) => ({
        id: m.id,
        content: m.content,
        score: m.score,
        source: m.source,
        createdAt: m.createdAt,
      })),
      totalFound: result.totalFound,
      latencyMs: result.latencyMs,
    };
  }

  /**
   * Build complete AI context for a chat
   */
  @Post('context')
  @HttpCode(HttpStatus.OK)
  async buildContext(@Body() dto: BuildContextDto, @Req() req: any) {
    const userId = req.user.userId;

    const context = await this.aiMemoryService.buildContext({
      userId,
      chatId: dto.chatId,
      currentMessage: dto.currentMessage,
      recentMessagesCount: dto.recentMessagesCount,
      topK: dto.topK,
    });

    return {
      recentMessages: context.recentMessages,
      relevantMemories: context.relevantMemories.map((m) => ({
        content: m.content,
        score: m.score,
        source: m.source,
      })),
      chatMetadata: context.chatMetadata,
      tokenCounts: context.tokenCounts,
    };
  }

  /**
   * Get memories for a chat
   */
  @Get('chat/:chatId')
  async getMemoriesForChat(
    @Param('chatId') chatId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Req() req?: any,
  ) {
    const memories = await this.repository.getMemoriesByChatId(chatId, {
      limit: limit ? parseInt(limit, 10) : 100,
      offset: offset ? parseInt(offset, 10) : 0,
    });

    return {
      memories: memories.map((m) => ({
        id: m.id,
        content: m.content,
        messageId: m.messageId,
        createdAt: m.createdAt,
      })),
      total: memories.length,
    };
  }

  /**
   * Get uploaded content for user
   */
  @Get('uploads')
  async getUploadedContent(
    @Query('chatId') chatId?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Req() req?: any,
  ) {
    const userId = req?.user?.userId;

    const content = await this.repository.getUploadedContentByUserId(userId, {
      chatId,
      type,
      limit: limit ? parseInt(limit, 10) : 100,
    });

    return {
      content: content.map((c) => ({
        id: c.id,
        type: c.type,
        fileName: c.fileName,
        status: c.status,
        createdAt: c.createdAt,
      })),
      total: content.length,
    };
  }

  /**
   * Delete memories for a chat
   */
  @Delete('chat/:chatId')
  @HttpCode(HttpStatus.OK)
  async deleteMemoriesForChat(
    @Param('chatId') chatId: string,
    @Req() req: any,
  ) {
    const userId = req.user.userId;

    await this.aiMemoryService.deleteMemoriesForChat(userId, chatId);

    return { success: true };
  }

  /**
   * Get usage statistics
   */
  @Get('stats')
  async getUsageStats(
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
    @Req() req: any,
  ) {
    const userId = req.user.userId;

    const stats = await this.repository.getUsageStats(
      userId,
      new Date(fromDate),
      new Date(toDate),
    );

    return stats;
  }

  /**
   * Check service health
   */
  @Get('health')
  async checkHealth() {
    return {
      embedding: this.embeddingService.isReady(),
      vectorStore: this.vectorStore.isReady,
      overall: this.aiMemoryService.isReady(),
    };
  }

  /**
   * Get vector store statistics
   */
  @Get('stats/vectors')
  async getVectorStats() {
    const stats = await this.vectorStore.getStats();
    return stats;
  }
}
