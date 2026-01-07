import { db } from '@database/db.connection';
import {
  KbBulkImportBatch,
  kbBulkImportBatches,
  KbObject,
  KbObjectChunk,
  kbObjectChunks,
  KbObjectFieldValue,
  kbObjectFieldValues,
  kbObjectMedia,
  KbObjectMedia,
  kbObjects,
  KbObjectTemplate,
  kbObjectTemplates,
  KbRetrievalLog,
  kbRetrievalLogs,
  KbTemplateField,
  kbTemplateFields,
  kbTestQueries,
  KbTestQuery,
  KbUnstructuredUpload,
  kbUnstructuredUploads,
  NewKbBulkImportBatch,
  NewKbObject,
  NewKbObjectChunk,
  NewKbObjectFieldValue,
  NewKbObjectMedia,
  NewKbObjectTemplate,
  NewKbRetrievalLog,
  NewKbTemplateField,
  NewKbTestQuery,
  NewKbUnstructuredUpload,
} from '@database/knowledge-base.schema';
import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from 'drizzle-orm';

export interface VectorSearchResult {
  id: string;
  objectId: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

export interface ListOptions {
  page?: number;
  pageSize?: number;
  orderBy?: 'asc' | 'desc';
}

@Injectable()
export class KnowledgeBaseRepository {
  private readonly logger = new Logger(KnowledgeBaseRepository.name);

  // ============================================================================
  // TEMPLATES
  // ============================================================================

  async createTemplate(data: NewKbObjectTemplate): Promise<KbObjectTemplate> {
    const [template] = await db
      .insert(kbObjectTemplates)
      .values(data)
      .returning();
    return template;
  }

  async getTemplateById(id: string): Promise<KbObjectTemplate | undefined> {
    return db.query.kbObjectTemplates.findFirst({
      where: eq(kbObjectTemplates.id, id),
    });
  }

  async getTemplateBySlug(
    userId: number | null,
    slug: string,
  ): Promise<KbObjectTemplate | undefined> {
    // Check for system template first, then user template
    return db.query.kbObjectTemplates.findFirst({
      where: and(
        eq(kbObjectTemplates.slug, slug),
        userId
          ? or(
              eq(kbObjectTemplates.userId, userId),
              eq(kbObjectTemplates.isSystem, true),
            )
          : eq(kbObjectTemplates.isSystem, true),
      ),
    });
  }

  async getTemplatesByUser(
    userId: number,
    options: {
      category?: string;
      includeSystem?: boolean;
      activeOnly?: boolean;
    } = {},
  ): Promise<KbObjectTemplate[]> {
    const { category, includeSystem = true, activeOnly = true } = options;

    const conditions: (ReturnType<typeof eq> | ReturnType<typeof or>)[] = [];

    if (includeSystem) {
      conditions.push(
        or(
          eq(kbObjectTemplates.userId, userId),
          eq(kbObjectTemplates.isSystem, true),
        )!,
      );
    } else {
      conditions.push(eq(kbObjectTemplates.userId, userId));
    }

    if (category) {
      conditions.push(eq(kbObjectTemplates.category, category));
    }

    if (activeOnly) {
      conditions.push(eq(kbObjectTemplates.isActive, true));
    }

    return db.query.kbObjectTemplates.findMany({
      where: and(...conditions),
      orderBy: [
        desc(kbObjectTemplates.isSystem),
        asc(kbObjectTemplates.displayName),
      ],
    });
  }

  async updateTemplate(
    id: string,
    data: Partial<KbObjectTemplate>,
  ): Promise<KbObjectTemplate | undefined> {
    const [updated] = await db
      .update(kbObjectTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(kbObjectTemplates.id, id))
      .returning();
    return updated;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const result = await db
      .delete(kbObjectTemplates)
      .where(eq(kbObjectTemplates.id, id))
      .returning({ id: kbObjectTemplates.id });
    return result.length > 0;
  }

  async getSystemTemplates(): Promise<KbObjectTemplate[]> {
    return db.query.kbObjectTemplates.findMany({
      where: eq(kbObjectTemplates.isSystem, true),
      orderBy: [
        asc(kbObjectTemplates.category),
        asc(kbObjectTemplates.displayName),
      ],
    });
  }

  // ============================================================================
  // TEMPLATE FIELDS
  // ============================================================================

  async createTemplateField(
    data: NewKbTemplateField,
  ): Promise<KbTemplateField> {
    const [field] = await db.insert(kbTemplateFields).values(data).returning();
    return field;
  }

  async createTemplateFieldsBatch(
    fields: NewKbTemplateField[],
  ): Promise<KbTemplateField[]> {
    if (fields.length === 0) return [];
    return db.insert(kbTemplateFields).values(fields).returning();
  }

  async getTemplateFields(templateId: string): Promise<KbTemplateField[]> {
    return db.query.kbTemplateFields.findMany({
      where: eq(kbTemplateFields.templateId, templateId),
      orderBy: [
        asc(kbTemplateFields.sortOrder),
        asc(kbTemplateFields.createdAt),
      ],
    });
  }

  async updateTemplateField(
    id: string,
    data: Partial<KbTemplateField>,
  ): Promise<KbTemplateField | undefined> {
    const [updated] = await db
      .update(kbTemplateFields)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(kbTemplateFields.id, id))
      .returning();
    return updated;
  }

  async deleteTemplateField(id: string): Promise<boolean> {
    const result = await db
      .delete(kbTemplateFields)
      .where(eq(kbTemplateFields.id, id))
      .returning({ id: kbTemplateFields.id });
    return result.length > 0;
  }

  async deleteTemplateFieldsByTemplateId(templateId: string): Promise<number> {
    const result = await db
      .delete(kbTemplateFields)
      .where(eq(kbTemplateFields.templateId, templateId))
      .returning({ id: kbTemplateFields.id });
    return result.length;
  }

  // ============================================================================
  // OBJECTS
  // ============================================================================

  async createObject(data: NewKbObject): Promise<KbObject> {
    const [object] = await db.insert(kbObjects).values(data).returning();
    return object;
  }

  async getObjectById(id: string): Promise<KbObject | undefined> {
    return db.query.kbObjects.findFirst({
      where: eq(kbObjects.id, id),
    });
  }

  async getObjectsByUser(
    userId: number,
    options: {
      templateId?: string;
      status?: string;
      search?: string;
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {},
  ): Promise<{ objects: KbObject[]; total: number }> {
    const {
      templateId,
      status,
      search,
      page = 1,
      pageSize = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = options;

    const conditions = [eq(kbObjects.userId, userId)];

    if (templateId) {
      conditions.push(eq(kbObjects.templateId, templateId));
    }

    if (status) {
      conditions.push(eq(kbObjects.status, status as any));
    }

    if (search) {
      conditions.push(ilike(kbObjects.name, `%${search}%`));
    }

    const whereClause = and(...conditions);

    const [objects, totalResult] = await Promise.all([
      db.query.kbObjects.findMany({
        where: whereClause,
        limit: pageSize,
        offset: (page - 1) * pageSize,
        orderBy:
          sortOrder === 'desc'
            ? [desc(kbObjects[sortBy as keyof typeof kbObjects] as any)]
            : [asc(kbObjects[sortBy as keyof typeof kbObjects] as any)],
      }),
      db.select({ count: count() }).from(kbObjects).where(whereClause),
    ]);

    return { objects, total: totalResult[0]?.count || 0 };
  }

  async updateObject(
    id: string,
    data: Partial<KbObject>,
  ): Promise<KbObject | undefined> {
    const [updated] = await db
      .update(kbObjects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(kbObjects.id, id))
      .returning();
    return updated;
  }

  async updateObjectStatus(
    id: string,
    status: string,
    error?: string,
  ): Promise<void> {
    await db
      .update(kbObjects)
      .set({
        status: status as any,
        indexingError: error || null,
        lastIndexedAt: status === 'indexed' ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(kbObjects.id, id));
  }

  async bulkUpdateObjectStatus(
    objectIds: string[],
    status: string,
  ): Promise<number> {
    const result = await db
      .update(kbObjects)
      .set({ status: status as any, updatedAt: new Date() })
      .where(inArray(kbObjects.id, objectIds))
      .returning({ id: kbObjects.id });
    return result.length;
  }

  async deleteObject(id: string): Promise<boolean> {
    const result = await db
      .delete(kbObjects)
      .where(eq(kbObjects.id, id))
      .returning({ id: kbObjects.id });
    return result.length > 0;
  }

  async getObjectsCountByTemplate(templateId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(kbObjects)
      .where(eq(kbObjects.templateId, templateId));
    return result[0]?.count || 0;
  }

  // ============================================================================
  // OBJECT FIELD VALUES
  // ============================================================================

  async createFieldValue(
    data: NewKbObjectFieldValue,
  ): Promise<KbObjectFieldValue> {
    const [value] = await db
      .insert(kbObjectFieldValues)
      .values(data)
      .returning();
    return value;
  }

  async createFieldValuesBatch(
    values: NewKbObjectFieldValue[],
  ): Promise<KbObjectFieldValue[]> {
    if (values.length === 0) return [];
    return db.insert(kbObjectFieldValues).values(values).returning();
  }

  async getFieldValuesByObject(
    objectId: string,
  ): Promise<KbObjectFieldValue[]> {
    return db.query.kbObjectFieldValues.findMany({
      where: eq(kbObjectFieldValues.objectId, objectId),
    });
  }

  async updateFieldValue(
    objectId: string,
    fieldId: string,
    value: any,
    textValue?: string,
    numericValue?: number,
    dateValue?: Date,
    booleanValue?: boolean,
  ): Promise<KbObjectFieldValue | undefined> {
    const [updated] = await db
      .update(kbObjectFieldValues)
      .set({
        value,
        textValue,
        numericValue,
        dateValue,
        booleanValue,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(kbObjectFieldValues.objectId, objectId),
          eq(kbObjectFieldValues.fieldId, fieldId),
        ),
      )
      .returning();
    return updated;
  }

  async upsertFieldValue(
    data: NewKbObjectFieldValue,
  ): Promise<KbObjectFieldValue> {
    const [result] = await db
      .insert(kbObjectFieldValues)
      .values(data)
      .onConflictDoUpdate({
        target: [kbObjectFieldValues.objectId, kbObjectFieldValues.fieldId],
        set: {
          value: data.value,
          textValue: data.textValue,
          numericValue: data.numericValue,
          dateValue: data.dateValue,
          booleanValue: data.booleanValue,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  async deleteFieldValuesByObject(objectId: string): Promise<number> {
    const result = await db
      .delete(kbObjectFieldValues)
      .where(eq(kbObjectFieldValues.objectId, objectId))
      .returning({ id: kbObjectFieldValues.id });
    return result.length;
  }

  // ============================================================================
  // OBJECT MEDIA
  // ============================================================================

  async createMedia(data: NewKbObjectMedia): Promise<KbObjectMedia> {
    const [media] = await db.insert(kbObjectMedia).values(data).returning();
    return media;
  }

  async getMediaByObject(objectId: string): Promise<KbObjectMedia[]> {
    return db.query.kbObjectMedia.findMany({
      where: eq(kbObjectMedia.objectId, objectId),
      orderBy: [asc(kbObjectMedia.sortOrder), asc(kbObjectMedia.createdAt)],
    });
  }

  async getMediaById(id: string): Promise<KbObjectMedia | undefined> {
    return db.query.kbObjectMedia.findFirst({
      where: eq(kbObjectMedia.id, id),
    });
  }

  async updateMedia(
    id: string,
    data: Partial<KbObjectMedia>,
  ): Promise<KbObjectMedia | undefined> {
    const [updated] = await db
      .update(kbObjectMedia)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(kbObjectMedia.id, id))
      .returning();
    return updated;
  }

  async deleteMedia(id: string): Promise<boolean> {
    const result = await db
      .delete(kbObjectMedia)
      .where(eq(kbObjectMedia.id, id))
      .returning({ id: kbObjectMedia.id });
    return result.length > 0;
  }

  async updateMediaExtractionStatus(
    id: string,
    status: string,
    content?: string,
    error?: string,
  ): Promise<void> {
    await db
      .update(kbObjectMedia)
      .set({
        extractionStatus: status,
        extractedContent: content || null,
        extractionError: error || null,
        updatedAt: new Date(),
      })
      .where(eq(kbObjectMedia.id, id));
  }

  // ============================================================================
  // OBJECT CHUNKS
  // ============================================================================

  async createChunk(
    data: NewKbObjectChunk & { embedding?: number[] },
  ): Promise<KbObjectChunk> {
    const { embedding, ...recordData } = data;

    if (embedding && embedding.length > 0) {
      const vectorString = `[${embedding.join(',')}]`;
      const contentHash = this.generateContentHash(recordData.content);

      const result = await db.execute(sql`
        INSERT INTO kb_object_chunks (
          object_id, chunk_index, chunk_type, content, content_hash,
          token_count, source_field_ids, source_media_id, status,
          embedding_model, embedding_dimensions, embedding, embedded_at
        ) VALUES (
          ${recordData.objectId}::uuid,
          ${recordData.chunkIndex},
          ${recordData.chunkType || 'content'},
          ${recordData.content},
          ${contentHash},
          ${recordData.tokenCount || null},
          ${JSON.stringify(recordData.sourceFieldIds || [])}::jsonb,
          ${recordData.sourceMediaId || null}::uuid,
          'embedded',
          ${recordData.embeddingModel || 'text-embedding-3-large'},
          ${recordData.embeddingDimensions || 1536},
          ${vectorString}::vector,
          NOW()
        )
        RETURNING *
      `);

      return result.rows[0] as KbObjectChunk;
    }

    const [chunk] = await db
      .insert(kbObjectChunks)
      .values({
        ...recordData,
        contentHash: this.generateContentHash(recordData.content),
      })
      .returning();

    return chunk;
  }

  async createChunksBatch(
    chunks: Array<NewKbObjectChunk & { embedding?: number[] }>,
  ): Promise<KbObjectChunk[]> {
    const results: KbObjectChunk[] = [];
    for (const chunk of chunks) {
      const created = await this.createChunk(chunk);
      results.push(created);
    }
    return results;
  }

  async getChunksByObject(objectId: string): Promise<KbObjectChunk[]> {
    return db.query.kbObjectChunks.findMany({
      where: eq(kbObjectChunks.objectId, objectId),
      orderBy: [asc(kbObjectChunks.chunkIndex)],
    });
  }

  async getPendingChunks(limit: number = 100): Promise<KbObjectChunk[]> {
    return db.query.kbObjectChunks.findMany({
      where: eq(kbObjectChunks.status, 'pending'),
      limit,
      orderBy: [asc(kbObjectChunks.createdAt)],
    });
  }

  async updateChunkEmbedding(
    id: string,
    embedding: number[],
  ): Promise<boolean> {
    const vectorString = `[${embedding.join(',')}]`;

    const result = await db.execute(sql`
      UPDATE kb_object_chunks 
      SET embedding = ${vectorString}::vector, 
          status = 'embedded',
          embedded_at = NOW(),
          updated_at = NOW()
      WHERE id = ${id}::uuid
    `);

    return (result.rowCount || 0) > 0;
  }

  async updateChunkStatus(
    id: string,
    status: string,
    error?: string,
  ): Promise<void> {
    await db
      .update(kbObjectChunks)
      .set({
        status: status as any,
        errorMessage: error || null,
        updatedAt: new Date(),
      })
      .where(eq(kbObjectChunks.id, id));
  }

  async deleteChunksByObject(objectId: string): Promise<number> {
    const result = await db
      .delete(kbObjectChunks)
      .where(eq(kbObjectChunks.objectId, objectId))
      .returning({ id: kbObjectChunks.id });
    return result.length;
  }

  /**
   * Debug method to check KB status for a user
   * Returns info about objects and chunks to diagnose retrieval issues
   */
  async getKBStatusForUser(userId: number): Promise<{
    totalObjects: number;
    indexedObjects: number;
    objectsByStatus: Record<string, number>;
    totalChunks: number;
    embeddedChunks: number;
    chunksByStatus: Record<string, number>;
  }> {
    // Get object stats
    const objectStats = await db.execute(
      sql.raw(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'indexed') as indexed,
          status,
          COUNT(*) as count
        FROM kb_objects
        WHERE user_id = ${userId}
        GROUP BY status
      `),
    );

    const objectsByStatus: Record<string, number> = {};
    let totalObjects = 0;
    let indexedObjects = 0;

    for (const row of objectStats.rows as any[]) {
      objectsByStatus[row.status] = parseInt(row.count);
      totalObjects += parseInt(row.count);
      if (row.status === 'indexed') {
        indexedObjects = parseInt(row.count);
      }
    }

    // Get chunk stats for this user's objects
    const chunkStats = await db.execute(
      sql.raw(`
        SELECT 
          c.status,
          COUNT(*) as count,
          COUNT(*) FILTER (WHERE c.embedding IS NOT NULL) as with_embedding
        FROM kb_object_chunks c
        INNER JOIN kb_objects o ON o.id = c.object_id
        WHERE o.user_id = ${userId}
        GROUP BY c.status
      `),
    );

    const chunksByStatus: Record<string, number> = {};
    let totalChunks = 0;
    let embeddedChunks = 0;

    for (const row of chunkStats.rows as any[]) {
      chunksByStatus[row.status] = parseInt(row.count);
      totalChunks += parseInt(row.count);
      if (row.status === 'embedded') {
        embeddedChunks = parseInt(row.with_embedding);
      }
    }

    return {
      totalObjects,
      indexedObjects,
      objectsByStatus,
      totalChunks,
      embeddedChunks,
      chunksByStatus,
    };
  }

  async searchChunksByVector(
    userId: number,
    queryVector: number[],
    options: {
      topK?: number;
      minScore?: number;
      templateIds?: string[];
      objectIds?: string[];
      excludeObjectIds?: string[];
      chunkTypes?: string[];
    } = {},
  ): Promise<VectorSearchResult[]> {
    const {
      topK = 10,
      // Lower default for text-embedding-3-large with 1536-dim reduction
      minScore = 0.15,
      templateIds,
      objectIds,
      excludeObjectIds,
      chunkTypes,
    } = options;

    const vectorString = `[${queryVector.join(',')}]`;

    // Build filter conditions
    const conditions: string[] = [
      `c.embedding IS NOT NULL`,
      `c.status = 'embedded'`,
      `o.user_id = ${userId}`,
      `o.status = 'indexed'`,
    ];

    if (templateIds && templateIds.length > 0) {
      const ids = templateIds.map((id) => `'${id}'`).join(',');
      conditions.push(`o.template_id IN (${ids})`);
    }

    if (objectIds && objectIds.length > 0) {
      const ids = objectIds.map((id) => `'${id}'`).join(',');
      conditions.push(`o.id IN (${ids})`);
    }

    if (excludeObjectIds && excludeObjectIds.length > 0) {
      const ids = excludeObjectIds.map((id) => `'${id}'`).join(',');
      conditions.push(`o.id NOT IN (${ids})`);
    }

    if (chunkTypes && chunkTypes.length > 0) {
      const types = chunkTypes.map((t) => `'${t}'`).join(',');
      conditions.push(`c.chunk_type IN (${types})`);
    }

    const whereClause = conditions.join(' AND ');

    // First, run a debug query WITHOUT the minScore filter to see actual similarity scores
    const debugResult = await db.execute(
      sql.raw(`
        SELECT 
          c.id::text,
          o.name as object_name,
          c.chunk_type,
          1 - (c.embedding <=> '${vectorString}'::vector) as similarity
        FROM kb_object_chunks c
        INNER JOIN kb_objects o ON o.id = c.object_id
        WHERE ${whereClause}
        ORDER BY c.embedding <=> '${vectorString}'::vector
        LIMIT ${topK}
      `),
    );

    // Log all similarity scores for debugging
    if (debugResult.rows && debugResult.rows.length > 0) {
      this.logger.debug(
        `[Vector Search Debug] Top ${debugResult.rows.length} similarity scores (threshold: ${minScore}):`,
      );
      for (const row of debugResult.rows as any[]) {
        const sim = parseFloat(row.similarity).toFixed(4);
        const status = parseFloat(row.similarity) >= minScore ? '✓' : '✗';
        this.logger.debug(
          `  ${status} ${row.object_name} [${row.chunk_type}]: ${sim}`,
        );
      }
    } else {
      this.logger.warn(
        `[Vector Search Debug] No chunks found matching base conditions for userId=${userId}`,
      );
    }

    const result = await db.execute(
      sql.raw(`
        SELECT 
          c.id::text,
          c.object_id::text as "objectId",
          c.content,
          jsonb_build_object(
            'objectId', o.id::text,
            'objectName', o.name,
            'templateId', o.template_id::text,
            'chunkType', c.chunk_type,
            'chunkIndex', c.chunk_index
          ) as metadata,
          1 - (c.embedding <=> '${vectorString}'::vector) as similarity
        FROM kb_object_chunks c
        INNER JOIN kb_objects o ON o.id = c.object_id
        WHERE ${whereClause}
          AND 1 - (c.embedding <=> '${vectorString}'::vector) >= ${minScore}
        ORDER BY c.embedding <=> '${vectorString}'::vector
        LIMIT ${topK}
      `),
    );

    return (result.rows as any[]).map((row) => ({
      id: row.id,
      objectId: row.objectId,
      content: row.content,
      metadata: row.metadata,
      similarity: parseFloat(row.similarity),
    }));
  }

  // ============================================================================
  // UNSTRUCTURED UPLOADS
  // ============================================================================

  async createUnstructuredUpload(
    data: NewKbUnstructuredUpload,
  ): Promise<KbUnstructuredUpload> {
    const [upload] = await db
      .insert(kbUnstructuredUploads)
      .values(data)
      .returning();
    return upload;
  }

  async getUnstructuredUploadById(
    id: string,
  ): Promise<KbUnstructuredUpload | undefined> {
    return db.query.kbUnstructuredUploads.findFirst({
      where: eq(kbUnstructuredUploads.id, id),
    });
  }

  async getUnstructuredUploadsByUser(
    userId: number,
    options: ListOptions = {},
  ): Promise<KbUnstructuredUpload[]> {
    const { page = 1, pageSize = 20, orderBy = 'desc' } = options;

    return db.query.kbUnstructuredUploads.findMany({
      where: eq(kbUnstructuredUploads.userId, userId),
      limit: pageSize,
      offset: (page - 1) * pageSize,
      orderBy:
        orderBy === 'desc'
          ? [desc(kbUnstructuredUploads.createdAt)]
          : [asc(kbUnstructuredUploads.createdAt)],
    });
  }

  async getPendingUploads(limit: number = 50): Promise<KbUnstructuredUpload[]> {
    return db.query.kbUnstructuredUploads.findMany({
      where: eq(kbUnstructuredUploads.processingStatus, 'pending'),
      limit,
      orderBy: [asc(kbUnstructuredUploads.createdAt)],
    });
  }

  async updateUnstructuredUpload(
    id: string,
    data: Partial<KbUnstructuredUpload>,
  ): Promise<KbUnstructuredUpload | undefined> {
    const [updated] = await db
      .update(kbUnstructuredUploads)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(kbUnstructuredUploads.id, id))
      .returning();
    return updated;
  }

  async deleteUnstructuredUpload(id: string): Promise<boolean> {
    const result = await db
      .delete(kbUnstructuredUploads)
      .where(eq(kbUnstructuredUploads.id, id))
      .returning({ id: kbUnstructuredUploads.id });
    return result.length > 0;
  }

  // ============================================================================
  // BULK IMPORT BATCHES
  // ============================================================================

  async createBulkImportBatch(
    data: NewKbBulkImportBatch,
  ): Promise<KbBulkImportBatch> {
    const [batch] = await db
      .insert(kbBulkImportBatches)
      .values(data)
      .returning();
    return batch;
  }

  async getBulkImportBatchById(
    id: string,
  ): Promise<KbBulkImportBatch | undefined> {
    return db.query.kbBulkImportBatches.findFirst({
      where: eq(kbBulkImportBatches.id, id),
    });
  }

  async getBulkImportBatchesByUser(
    userId: number,
    options: ListOptions = {},
  ): Promise<KbBulkImportBatch[]> {
    const { page = 1, pageSize = 20, orderBy = 'desc' } = options;

    return db.query.kbBulkImportBatches.findMany({
      where: eq(kbBulkImportBatches.userId, userId),
      limit: pageSize,
      offset: (page - 1) * pageSize,
      orderBy:
        orderBy === 'desc'
          ? [desc(kbBulkImportBatches.createdAt)]
          : [asc(kbBulkImportBatches.createdAt)],
    });
  }

  async updateBulkImportBatch(
    id: string,
    data: Partial<KbBulkImportBatch>,
  ): Promise<KbBulkImportBatch | undefined> {
    const [updated] = await db
      .update(kbBulkImportBatches)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(kbBulkImportBatches.id, id))
      .returning();
    return updated;
  }

  // ============================================================================
  // RETRIEVAL LOGS
  // ============================================================================

  async createRetrievalLog(data: NewKbRetrievalLog): Promise<KbRetrievalLog> {
    const [log] = await db.insert(kbRetrievalLogs).values(data).returning();
    return log;
  }

  async getRetrievalLogsByUser(
    userId: number,
    options: ListOptions = {},
  ): Promise<KbRetrievalLog[]> {
    const { page = 1, pageSize = 50, orderBy = 'desc' } = options;

    return db.query.kbRetrievalLogs.findMany({
      where: eq(kbRetrievalLogs.userId, userId),
      limit: pageSize,
      offset: (page - 1) * pageSize,
      orderBy:
        orderBy === 'desc'
          ? [desc(kbRetrievalLogs.createdAt)]
          : [asc(kbRetrievalLogs.createdAt)],
    });
  }

  async updateRetrievalLogFeedback(
    id: string,
    wasHelpful: boolean,
  ): Promise<void> {
    await db
      .update(kbRetrievalLogs)
      .set({ wasHelpful, feedbackAt: new Date() })
      .where(eq(kbRetrievalLogs.id, id));
  }

  // ============================================================================
  // TEST QUERIES
  // ============================================================================

  async createTestQuery(data: NewKbTestQuery): Promise<KbTestQuery> {
    const [query] = await db.insert(kbTestQueries).values(data).returning();
    return query;
  }

  async getTestQueriesByUser(userId: number): Promise<KbTestQuery[]> {
    return db.query.kbTestQueries.findMany({
      where: eq(kbTestQueries.userId, userId),
      orderBy: [desc(kbTestQueries.updatedAt)],
    });
  }

  async updateTestQuery(
    id: string,
    data: Partial<KbTestQuery>,
  ): Promise<KbTestQuery | undefined> {
    const [updated] = await db
      .update(kbTestQueries)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(kbTestQueries.id, id))
      .returning();
    return updated;
  }

  async deleteTestQuery(id: string): Promise<boolean> {
    const result = await db
      .delete(kbTestQueries)
      .where(eq(kbTestQueries.id, id))
      .returning({ id: kbTestQueries.id });
    return result.length > 0;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
