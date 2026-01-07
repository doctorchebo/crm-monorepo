import { db } from '@database/db.connection';
import {
  aiMemories,
  AiMemory,
  AiMemoryLog,
  aiMemoryLogs,
  aiUploadedContent,
  AiUploadedContent,
  NewAiMemory,
  NewAiMemoryLog,
  NewAiUploadedContent,
} from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';

/**
 * Vector search result from pgvector query
 */
export interface VectorSearchResult {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

/**
 * AI Memory Repository
 *
 * Data access layer for AI memory tables. Provides CRUD operations
 * with proper transaction handling and error logging.
 *
 * Now uses pgvector for vector storage and similarity search
 * instead of external vector databases.
 */
@Injectable()
export class AiMemoryRepository {
  private readonly logger = new Logger(AiMemoryRepository.name);

  // ==================== AI Memories ====================

  /**
   * Create a new AI memory record with embedding
   */
  async createMemory(
    data: NewAiMemory & { embedding?: number[] },
  ): Promise<AiMemory> {
    const { embedding, ...recordData } = data;

    // If embedding is provided, use raw SQL to insert with vector
    if (embedding && embedding.length > 0) {
      const vectorString = `[${embedding.join(',')}]`;
      const contentHash = this.generateContentHash(recordData.content);

      const result = await db.execute(sql`
        INSERT INTO ai_memories (
          chat_id, message_id, content, content_hash, metadata,
          embedding_model, embedding_dimensions, embedding
        ) VALUES (
          ${recordData.chatId},
          ${recordData.messageId || null},
          ${recordData.content},
          ${contentHash},
          ${JSON.stringify(recordData.metadata)}::jsonb,
          ${recordData.embeddingModel || 'text-embedding-3-large'},
          ${recordData.embeddingDimensions || 1536},
          ${vectorString}::vector
        )
        RETURNING *
      `);

      return result.rows[0] as AiMemory;
    }

    // Without embedding, use regular insert
    const [memory] = await db
      .insert(aiMemories)
      .values({
        ...recordData,
        contentHash: this.generateContentHash(recordData.content),
      })
      .returning();

    return memory;
  }

  /**
   * Create multiple memory records with embeddings in a transaction
   */
  async createMemoriesBatch(
    records: Array<NewAiMemory & { embedding?: number[] }>,
  ): Promise<AiMemory[]> {
    if (records.length === 0) return [];

    const results: AiMemory[] = [];

    for (const record of records) {
      const memory = await this.createMemory(record);
      results.push(memory);
    }

    return results;
  }

  /**
   * Update memory embedding
   */
  async updateMemoryEmbedding(
    id: string,
    embedding: number[],
  ): Promise<boolean> {
    const vectorString = `[${embedding.join(',')}]`;

    const result = await db.execute(sql`
      UPDATE ai_memories 
      SET embedding = ${vectorString}::vector, updated_at = NOW()
      WHERE id = ${id}::uuid
    `);

    return (result.rowCount || 0) > 0;
  }

  /**
   * Search memories by vector similarity
   */
  async searchMemoriesByVector(
    userId: number,
    queryVector: number[],
    options: {
      chatId?: string;
      topK?: number;
      minScore?: number;
      direction?: string;
      contentTypes?: string[];
    } = {},
  ): Promise<VectorSearchResult[]> {
    const {
      chatId,
      topK = 10,
      minScore = 0.7,
      direction,
      contentTypes,
    } = options;
    const vectorString = `[${queryVector.join(',')}]`;

    // Build dynamic filter conditions
    const conditions: string[] = [
      `embedding IS NOT NULL`,
      `(metadata->>'userId')::integer = ${userId}`,
    ];

    if (chatId) {
      conditions.push(`metadata->>'chatId' = '${chatId}'`);
    }

    if (direction) {
      conditions.push(`metadata->>'direction' = '${direction}'`);
    }

    if (contentTypes && contentTypes.length > 0) {
      const types = contentTypes.map((t) => `'${t}'`).join(',');
      conditions.push(`metadata->>'contentType' IN (${types})`);
    }

    const whereClause = conditions.join(' AND ');

    const result = await db.execute(
      sql.raw(`
      SELECT 
        id::text,
        content,
        metadata,
        1 - (embedding <=> '${vectorString}'::vector) as similarity
      FROM ai_memories
      WHERE ${whereClause}
        AND 1 - (embedding <=> '${vectorString}'::vector) >= ${minScore}
      ORDER BY embedding <=> '${vectorString}'::vector
      LIMIT ${topK}
    `),
    );

    return (result.rows as any[]).map((row) => ({
      id: row.id,
      content: row.content,
      metadata: row.metadata,
      similarity: parseFloat(row.similarity),
    }));
  }

  /**
   * Get memory by ID
   */
  async getMemoryById(id: string): Promise<AiMemory | undefined> {
    const memory = await db.query.aiMemories.findFirst({
      where: eq(aiMemories.id, id),
    });

    return memory;
  }

  /**
   * Get memories by IDs
   */
  async getMemoriesByIds(ids: string[]): Promise<AiMemory[]> {
    if (ids.length === 0) return [];

    const memories = await db.query.aiMemories.findMany({
      where: inArray(aiMemories.id, ids),
    });

    return memories;
  }

  /**
   * Get memories by message ID
   */
  async getMemoriesByMessageId(messageId: string): Promise<AiMemory[]> {
    const memories = await db.query.aiMemories.findMany({
      where: eq(aiMemories.messageId, messageId),
    });

    return memories;
  }

  /**
   * Get memories for a chat
   */
  async getMemoriesByChatId(
    chatId: string,
    options: {
      limit?: number;
      offset?: number;
      orderBy?: 'asc' | 'desc';
    } = {},
  ): Promise<AiMemory[]> {
    const { limit = 100, offset = 0, orderBy = 'desc' } = options;

    const memories = await db.query.aiMemories.findMany({
      where: eq(aiMemories.chatId, chatId),
      limit,
      offset,
      orderBy:
        orderBy === 'desc'
          ? [desc(aiMemories.createdAt)]
          : [aiMemories.createdAt],
    });

    return memories;
  }

  /**
   * Check if content already exists (by hash)
   */
  async memoryExistsByHash(
    chatId: string,
    contentHash: string,
  ): Promise<boolean> {
    const existing = await db.query.aiMemories.findFirst({
      where: and(
        eq(aiMemories.chatId, chatId),
        eq(aiMemories.contentHash, contentHash),
      ),
    });

    return !!existing;
  }

  /**
   * Update memory metadata
   */
  async updateMemory(
    id: string,
    data: Partial<Pick<AiMemory, 'metadata' | 'content'>>,
  ): Promise<AiMemory | undefined> {
    const updateData: Partial<AiMemory> = { ...data };

    if (data.content) {
      updateData.contentHash = this.generateContentHash(data.content);
    }

    const [updated] = await db
      .update(aiMemories)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(aiMemories.id, id))
      .returning();

    return updated;
  }

  /**
   * Delete memory by ID
   */
  async deleteMemory(id: string): Promise<boolean> {
    const result = await db
      .delete(aiMemories)
      .where(eq(aiMemories.id, id))
      .returning({ id: aiMemories.id });

    return result.length > 0;
  }

  /**
   * Delete memories by chat ID
   */
  async deleteMemoriesByChatId(chatId: string): Promise<number> {
    const result = await db
      .delete(aiMemories)
      .where(eq(aiMemories.chatId, chatId))
      .returning({ id: aiMemories.id });

    return result.length;
  }

  /**
   * Delete memories by user ID (from metadata)
   */
  async deleteMemoriesByUserId(userId: number): Promise<number> {
    const result = await db
      .delete(aiMemories)
      .where(sql`(metadata->>'userId')::integer = ${userId}`)
      .returning({ id: aiMemories.id });

    return result.length;
  }

  // ==================== AI Uploaded Content ====================

  /**
   * Create uploaded content record with embedding
   */
  async createUploadedContent(
    data: NewAiUploadedContent & { embedding?: number[] },
  ): Promise<AiUploadedContent> {
    const { embedding, ...recordData } = data;

    if (embedding && embedding.length > 0) {
      const vectorString = `[${embedding.join(',')}]`;
      const contentHash = this.generateContentHash(recordData.extractedContent);

      const result = await db.execute(sql`
        INSERT INTO ai_uploaded_content (
          user_id, chat_id, type, file_name, file_url, file_size, mime_type,
          extracted_content, content_hash, metadata, status,
          embedding_model, embedding_dimensions, embedding
        ) VALUES (
          ${recordData.userId},
          ${recordData.chatId || null},
          ${recordData.type},
          ${recordData.fileName || null},
          ${recordData.fileUrl || null},
          ${recordData.fileSize || null},
          ${recordData.mimeType || null},
          ${recordData.extractedContent},
          ${contentHash},
          ${JSON.stringify(recordData.metadata)}::jsonb,
          ${recordData.status || 'completed'},
          ${recordData.embeddingModel || 'text-embedding-3-large'},
          ${recordData.embeddingDimensions || 1536},
          ${vectorString}::vector
        )
        RETURNING *
      `);

      return result.rows[0] as AiUploadedContent;
    }

    const [content] = await db
      .insert(aiUploadedContent)
      .values({
        ...recordData,
        contentHash: this.generateContentHash(recordData.extractedContent),
      })
      .returning();

    return content;
  }

  /**
   * Search uploaded content by vector similarity
   */
  async searchUploadedContentByVector(
    userId: number,
    queryVector: number[],
    options: {
      chatId?: string;
      topK?: number;
      minScore?: number;
      types?: string[];
    } = {},
  ): Promise<VectorSearchResult[]> {
    const { chatId, topK = 10, minScore = 0.7, types } = options;
    const vectorString = `[${queryVector.join(',')}]`;

    const conditions: string[] = [
      `embedding IS NOT NULL`,
      `user_id = ${userId}`,
      `status = 'completed'`,
    ];

    if (chatId) {
      conditions.push(`chat_id = '${chatId}'`);
    }

    if (types && types.length > 0) {
      const typeList = types.map((t) => `'${t}'`).join(',');
      conditions.push(`type IN (${typeList})`);
    }

    const whereClause = conditions.join(' AND ');

    const result = await db.execute(
      sql.raw(`
      SELECT 
        id::text,
        extracted_content as content,
        metadata,
        1 - (embedding <=> '${vectorString}'::vector) as similarity
      FROM ai_uploaded_content
      WHERE ${whereClause}
        AND 1 - (embedding <=> '${vectorString}'::vector) >= ${minScore}
      ORDER BY embedding <=> '${vectorString}'::vector
      LIMIT ${topK}
    `),
    );

    return (result.rows as any[]).map((row) => ({
      id: row.id,
      content: row.content,
      metadata: row.metadata,
      similarity: parseFloat(row.similarity),
    }));
  }

  /**
   * Get uploaded content by ID
   */
  async getUploadedContentById(
    id: string,
  ): Promise<AiUploadedContent | undefined> {
    const content = await db.query.aiUploadedContent.findFirst({
      where: eq(aiUploadedContent.id, id),
    });

    return content;
  }

  /**
   * Get uploaded content by IDs
   */
  async getUploadedContentByIds(ids: string[]): Promise<AiUploadedContent[]> {
    if (ids.length === 0) return [];

    const content = await db.query.aiUploadedContent.findMany({
      where: inArray(aiUploadedContent.id, ids),
    });

    return content;
  }

  /**
   * Get uploaded content for a user
   */
  async getUploadedContentByUserId(
    userId: number,
    options: {
      chatId?: string;
      type?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<AiUploadedContent[]> {
    const { chatId, type, status, limit = 100, offset = 0 } = options;

    const conditions = [eq(aiUploadedContent.userId, userId)];

    if (chatId) {
      conditions.push(eq(aiUploadedContent.chatId, chatId));
    }
    if (type) {
      conditions.push(eq(aiUploadedContent.type, type));
    }
    if (status) {
      conditions.push(eq(aiUploadedContent.status, status));
    }

    const content = await db.query.aiUploadedContent.findMany({
      where: and(...conditions),
      limit,
      offset,
      orderBy: [desc(aiUploadedContent.createdAt)],
    });

    return content;
  }

  /**
   * Update uploaded content embedding
   */
  async updateUploadedContentEmbedding(
    id: string,
    embedding: number[],
  ): Promise<boolean> {
    const vectorString = `[${embedding.join(',')}]`;

    const result = await db.execute(sql`
      UPDATE ai_uploaded_content 
      SET embedding = ${vectorString}::vector, updated_at = NOW()
      WHERE id = ${id}::uuid
    `);

    return (result.rowCount || 0) > 0;
  }

  /**
   * Update uploaded content status
   */
  async updateUploadedContentStatus(
    id: string,
    status: string,
    errorMessage?: string,
  ): Promise<AiUploadedContent | undefined> {
    const [updated] = await db
      .update(aiUploadedContent)
      .set({
        status,
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(aiUploadedContent.id, id))
      .returning();

    return updated;
  }

  /**
   * Delete uploaded content by ID
   */
  async deleteUploadedContent(id: string): Promise<boolean> {
    const result = await db
      .delete(aiUploadedContent)
      .where(eq(aiUploadedContent.id, id))
      .returning({ id: aiUploadedContent.id });

    return result.length > 0;
  }

  /**
   * Delete uploaded content by user ID
   */
  async deleteUploadedContentByUserId(userId: number): Promise<number> {
    const result = await db
      .delete(aiUploadedContent)
      .where(eq(aiUploadedContent.userId, userId))
      .returning({ id: aiUploadedContent.id });

    return result.length;
  }

  /**
   * Delete uploaded content by chat ID
   * Used when a chat is deleted to clean up associated AI content
   */
  async deleteUploadedContentByChatId(chatId: string): Promise<number> {
    const result = await db
      .delete(aiUploadedContent)
      .where(eq(aiUploadedContent.chatId, chatId))
      .returning({ id: aiUploadedContent.id });

    return result.length;
  }

  // ==================== AI Memory Logs ====================

  /**
   * Create a log entry
   */
  async createLog(data: NewAiMemoryLog): Promise<AiMemoryLog> {
    const [log] = await db.insert(aiMemoryLogs).values(data).returning();
    return log;
  }

  /**
   * Get logs for a user
   */
  async getLogsByUserId(
    userId: number,
    options: {
      operation?: string;
      status?: string;
      fromDate?: Date;
      toDate?: Date;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<AiMemoryLog[]> {
    const {
      operation,
      status,
      fromDate,
      toDate,
      limit = 100,
      offset = 0,
    } = options;

    const conditions = [eq(aiMemoryLogs.userId, userId)];

    if (operation) {
      conditions.push(eq(aiMemoryLogs.operation, operation));
    }
    if (status) {
      conditions.push(eq(aiMemoryLogs.status, status));
    }
    if (fromDate) {
      conditions.push(gte(aiMemoryLogs.createdAt, fromDate));
    }
    if (toDate) {
      conditions.push(lte(aiMemoryLogs.createdAt, toDate));
    }

    const logs = await db.query.aiMemoryLogs.findMany({
      where: and(...conditions),
      limit,
      offset,
      orderBy: [desc(aiMemoryLogs.createdAt)],
    });

    return logs;
  }

  /**
   * Get usage statistics for billing
   */
  async getUsageStats(
    userId: number,
    fromDate: Date,
    toDate: Date,
  ): Promise<{
    totalOperations: number;
    totalTokens: number;
    totalCost: string;
    byOperation: Record<string, { count: number; tokens: number }>;
  }> {
    const logs = await db
      .select({
        operation: aiMemoryLogs.operation,
        count: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${aiMemoryLogs.tokensUsed}), 0)::int`,
        cost: sql<string>`coalesce(sum(${aiMemoryLogs.costUsd}::decimal), 0)::text`,
      })
      .from(aiMemoryLogs)
      .where(
        and(
          eq(aiMemoryLogs.userId, userId),
          gte(aiMemoryLogs.createdAt, fromDate),
          lte(aiMemoryLogs.createdAt, toDate),
        ),
      )
      .groupBy(aiMemoryLogs.operation);

    const byOperation: Record<string, { count: number; tokens: number }> = {};
    let totalOperations = 0;
    let totalTokens = 0;
    let totalCost = 0;

    for (const log of logs) {
      byOperation[log.operation] = {
        count: log.count,
        tokens: log.tokens,
      };
      totalOperations += log.count;
      totalTokens += log.tokens;
      totalCost += parseFloat(log.cost);
    }

    return {
      totalOperations,
      totalTokens,
      totalCost: totalCost.toFixed(6),
      byOperation,
    };
  }

  /**
   * Delete old logs (for cleanup/retention)
   */
  async deleteOldLogs(beforeDate: Date): Promise<number> {
    const result = await db
      .delete(aiMemoryLogs)
      .where(lte(aiMemoryLogs.createdAt, beforeDate))
      .returning({ id: aiMemoryLogs.id });

    return result.length;
  }

  // ==================== Utility Methods ====================

  /**
   * Generate SHA-256 hash of content
   */
  private generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Check content hash without storing
   */
  generateHash(content: string): string {
    return this.generateContentHash(content);
  }
}
