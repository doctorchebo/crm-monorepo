import { db } from '@database/db.connection';
import { aiMemories } from '@database/schema';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, inArray, sql } from 'drizzle-orm';
import {
  BatchDeleteResult,
  BatchUpsertResult,
  VectorFilter,
  VectorMatch,
  VectorQueryOptions,
  VectorQueryResult,
  VectorRecord,
  VectorStore,
  VectorStoreStats,
} from './vector-store.types';

/**
 * PostgreSQL pgvector Store Implementation
 *
 * Uses PostgreSQL's pgvector extension for vector similarity search.
 * This provides a cost-effective solution that scales well for most use cases
 * while keeping data in a single database system.
 *
 * Features:
 * - HNSW indexing for fast approximate nearest neighbor search
 * - Cosine similarity for semantic search
 * - Metadata filtering using JSONB
 * - User isolation through metadata filtering
 * - Batch operations for efficiency
 *
 * Performance Considerations:
 * - HNSW index provides O(log n) query time
 * - Batch upserts reduce round trips
 * - Metadata indexes accelerate filtered queries
 * - Consider table partitioning for very large datasets
 */
@Injectable()
export class PgVectorStore implements VectorStore, OnModuleInit {
  readonly name = 'pgvector';
  private readonly logger = new Logger(PgVectorStore.name);
  private readonly dimensions: number;
  private readonly batchSize: number;
  private initialized = false;

  constructor(private readonly configService: ConfigService) {
    this.dimensions = this.configService.get<number>(
      'aiMemory.embedding.dimensions',
      3072,
    );
    this.batchSize = this.configService.get<number>(
      'aiMemory.vectorStore.batchSize',
      100,
    );
  }

  get isReady(): boolean {
    return this.initialized;
  }

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  /**
   * Initialize the vector store
   * Verifies pgvector extension is available
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Verify pgvector extension is installed
      const result = await db.execute(sql`
        SELECT EXISTS (
          SELECT 1 FROM pg_extension WHERE extname = 'vector'
        ) as installed
      `);

      const installed = (result.rows[0] as any)?.installed;
      if (!installed) {
        throw new Error(
          'pgvector extension is not installed. Run: CREATE EXTENSION vector;',
        );
      }

      this.initialized = true;
      this.logger.log(
        `PgVectorStore initialized (dimensions: ${this.dimensions})`,
      );
    } catch (error) {
      this.logger.error('Failed to initialize PgVectorStore:', error);
      throw error;
    }
  }

  /**
   * Check if the store is healthy
   */
  async healthCheck(): Promise<boolean> {
    if (!this.initialized) return false;

    try {
      // Simple query to verify connection
      await db.execute(sql`SELECT 1`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Upsert a single vector into ai_memories table
   */
  async upsert(userId: number, record: VectorRecord): Promise<void> {
    await this.upsertBatch(userId, [record]);
  }

  /**
   * Upsert multiple vectors in batch
   */
  async upsertBatch(
    userId: number,
    records: VectorRecord[],
  ): Promise<BatchUpsertResult> {
    if (records.length === 0) {
      return { success: 0, failed: 0, failedIds: [] };
    }

    let success = 0;
    let failed = 0;
    const failedIds: string[] = [];

    // Process in batches to avoid overwhelming the database
    const batches = this.chunkArray(records, this.batchSize);

    for (const batch of batches) {
      try {
        // Use raw SQL for vector insertion since Drizzle doesn't natively support pgvector
        for (const record of batch) {
          await this.upsertSingleRecord(record);
          success++;
        }
      } catch (error) {
        this.logger.error(`Batch upsert failed:`, error);
        // Mark all remaining in batch as failed
        for (const record of batch) {
          failedIds.push(record.id);
          failed++;
        }
      }
    }

    return { success, failed, failedIds };
  }

  /**
   * Upsert a single record (internal)
   */
  private async upsertSingleRecord(record: VectorRecord): Promise<void> {
    const vectorString = `[${record.values.join(',')}]`;

    // Use ON CONFLICT to handle upsert
    await db.execute(sql`
      INSERT INTO ai_memories (id, embedding, content, metadata, content_hash, chat_id, embedding_model, embedding_dimensions)
      VALUES (
        ${record.id}::uuid,
        ${vectorString}::vector,
        ${record.metadata['content'] || ''},
        ${JSON.stringify(record.metadata)}::jsonb,
        ${this.generateHash(record.metadata['content'] || '')},
        ${record.metadata['chatId'] || ''},
        'text-embedding-3-large',
        ${this.dimensions}
      )
      ON CONFLICT (id) DO UPDATE SET
        embedding = ${vectorString}::vector,
        metadata = ${JSON.stringify(record.metadata)}::jsonb,
        updated_at = NOW()
    `);
  }

  /**
   * Query for similar vectors
   */
  async query(
    userId: number,
    queryVector: number[],
    options: VectorQueryOptions = {},
  ): Promise<VectorQueryResult> {
    const {
      topK = 10,
      minScore = 0.7,
      filter = {},
      includeMetadata = true,
    } = options;

    const vectorString = `[${queryVector.join(',')}]`;

    // Build the WHERE conditions
    const conditions: string[] = [
      `embedding IS NOT NULL`,
      `(metadata->>'userId')::integer = ${userId}`,
    ];

    if (filter.chatId) {
      conditions.push(`metadata->>'chatId' = '${filter.chatId}'`);
    }

    if (filter.direction && filter.direction !== 'inbound') {
      conditions.push(`metadata->>'direction' = '${filter.direction}'`);
    }

    if (filter.contentTypes && filter.contentTypes.length > 0) {
      const types = filter.contentTypes.map((t) => `'${t}'`).join(',');
      conditions.push(`metadata->>'contentType' IN (${types})`);
    }

    if (filter.minImportance !== undefined) {
      conditions.push(
        `(metadata->>'importanceScore')::float >= ${filter.minImportance}`,
      );
    }

    if (filter.timestampRange?.from) {
      conditions.push(
        `metadata->>'timestamp' >= '${filter.timestampRange.from.toISOString()}'`,
      );
    }

    if (filter.timestampRange?.to) {
      conditions.push(
        `metadata->>'timestamp' <= '${filter.timestampRange.to.toISOString()}'`,
      );
    }

    const whereClause = conditions.join(' AND ');

    // Execute similarity search query
    // Using cosine distance: 1 - (a <=> b) gives similarity score
    const result = await db.execute(
      sql.raw(`
      SELECT 
        id,
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

    const matches: VectorMatch[] = (result.rows as any[]).map((row) => ({
      id: row.id,
      score: parseFloat(row.similarity),
      metadata: includeMetadata ? row.metadata : undefined,
    }));

    return { matches };
  }

  /**
   * Delete vectors by IDs
   */
  async delete(userId: number, ids: string[]): Promise<BatchDeleteResult> {
    if (ids.length === 0) {
      return { deleted: 0 };
    }

    try {
      // Delete from ai_memories where ID matches and user owns it
      const result = await db
        .delete(aiMemories)
        .where(
          and(
            inArray(aiMemories.id, ids),
            sql`(metadata->>'userId')::integer = ${userId}`,
          ),
        )
        .returning({ id: aiMemories.id });

      return { deleted: result.length };
    } catch (error) {
      this.logger.error('Delete failed:', error);
      return { deleted: 0 };
    }
  }

  /**
   * Delete vectors matching a filter
   */
  async deleteByFilter(
    userId: number,
    filter: VectorFilter,
  ): Promise<BatchDeleteResult> {
    try {
      const conditions: any[] = [
        sql`(metadata->>'userId')::integer = ${userId}`,
      ];

      if (filter.chatId) {
        conditions.push(sql`metadata->>'chatId' = ${filter.chatId}`);
      }

      const result = await db
        .delete(aiMemories)
        .where(and(...conditions))
        .returning({ id: aiMemories.id });

      return { deleted: result.length };
    } catch (error) {
      this.logger.error('Delete by filter failed:', error);
      return { deleted: 0 };
    }
  }

  /**
   * Delete all vectors for a user
   */
  async deleteAll(userId: number): Promise<BatchDeleteResult> {
    try {
      const result = await db
        .delete(aiMemories)
        .where(sql`(metadata->>'userId')::integer = ${userId}`)
        .returning({ id: aiMemories.id });

      return { deleted: result.length };
    } catch (error) {
      this.logger.error('Delete all failed:', error);
      return { deleted: 0 };
    }
  }

  /**
   * Get statistics about the vector store
   */
  async getStats(): Promise<VectorStoreStats> {
    try {
      // Count total vectors
      const countResult = await db.execute(sql`
        SELECT COUNT(*) as total FROM ai_memories WHERE embedding IS NOT NULL
      `);

      const totalVectors = parseInt(
        (countResult.rows[0] as any)?.total || '0',
        10,
      );

      // Check if HNSW index exists
      const indexResult = await db.execute(sql`
        SELECT EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE indexname = 'idx_ai_memories_embedding'
        ) as exists
      `);

      const indexReady = (indexResult.rows[0] as any)?.exists || false;

      return {
        totalVectors,
        indexReady,
      };
    } catch (error) {
      this.logger.error('Failed to get stats:', error);
      return {
        totalVectors: 0,
        indexReady: false,
      };
    }
  }

  /**
   * Generate SHA-256 hash for content deduplication
   */
  private generateHash(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
