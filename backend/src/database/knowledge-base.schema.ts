import { relations } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './schema';

/**
 * Custom pgvector type for storing vector embeddings
 */
const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .slice(1, -1)
      .split(',')
      .map((v) => parseFloat(v));
  },
});

// ============================================================================
// ENUMS
// ============================================================================

export const fieldTypeEnum = pgEnum('kb_field_type', [
  'short_text',
  'long_text',
  'rich_text',
  'number',
  'price',
  'date',
  'date_range',
  'boolean',
  'tags',
  'location',
  'media',
  'file',
  'select',
  'multi_select',
  'url',
  'email',
  'phone',
  'key_value',
]);

export const aiRelevanceEnum = pgEnum('kb_ai_relevance', [
  'low',
  'medium',
  'high',
  'critical',
]);

export const objectStatusEnum = pgEnum('kb_object_status', [
  'draft',
  'pending',
  'indexing',
  'indexed',
  'error',
  'archived',
]);

export const chunkStatusEnum = pgEnum('kb_chunk_status', [
  'pending',
  'processing',
  'embedded',
  'error',
]);

// ============================================================================
// OBJECT TEMPLATES - Define reusable object structures
// ============================================================================

/**
 * Knowledge Base Object Templates
 *
 * Defines reusable templates for structuring knowledge objects.
 * Templates can be system-provided (Property, Product, FAQ, etc.) or user-defined.
 */
export const kbObjectTemplates = pgTable(
  'kb_object_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    // Template identification
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    displayName: varchar('display_name', { length: 200 }).notNull(),
    description: text('description'),
    icon: varchar('icon', { length: 50 }).default('file-text'),
    color: varchar('color', { length: 20 }).default('#3b82f6'),
    // Template classification
    category: varchar('category', { length: 50 }).notNull().default('custom'),
    isSystem: boolean('is_system').default(false),
    isActive: boolean('is_active').default(true),
    // AI Behavior Metadata
    aiUsageHints: text('ai_usage_hints'),
    aiRetrievalContext: text('ai_retrieval_context'),
    supportedIntents: jsonb('supported_intents').default('[]'),
    fabricationWarnings: jsonb('fabrication_warnings').default('[]'),
    priorityScore: integer('priority_score').default(50),
    // Schema version for migrations
    schemaVersion: integer('schema_version').default(1),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    slugIndex: index('idx_kb_templates_slug').on(table.slug),
    userIdIndex: index('idx_kb_templates_user_id').on(table.userId),
    categoryIndex: index('idx_kb_templates_category').on(table.category),
    isSystemIndex: index('idx_kb_templates_is_system').on(table.isSystem),
    uniqueSlugPerUser: unique().on(table.userId, table.slug),
  }),
);

export type KbObjectTemplate = typeof kbObjectTemplates.$inferSelect;
export type NewKbObjectTemplate = typeof kbObjectTemplates.$inferInsert;

// ============================================================================
// TEMPLATE FIELDS - Define fields within templates
// ============================================================================

/**
 * Knowledge Base Template Fields
 *
 * Defines the schema of fields within a template.
 * Each field has a type, validation rules, and AI-specific metadata.
 */
export const kbTemplateFields = pgTable(
  'kb_template_fields',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => kbObjectTemplates.id, { onDelete: 'cascade' }),
    // Field identification
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    displayName: varchar('display_name', { length: 200 }).notNull(),
    description: text('description'),
    placeholder: varchar('placeholder', { length: 255 }),
    // Field type and validation
    fieldType: fieldTypeEnum('field_type').notNull().default('short_text'),
    isRequired: boolean('is_required').default(false),
    isUnique: boolean('is_unique').default(false),
    defaultValue: text('default_value'),
    // Type-specific configuration
    fieldConfig: jsonb('field_config').default('{}'),
    validation: jsonb('validation').default('{}'),
    // AI-specific settings
    aiRelevance: aiRelevanceEnum('ai_relevance').default('medium'),
    aiIncludeInEmbedding: boolean('ai_include_in_embedding').default(true),
    aiFieldHints: text('ai_field_hints'),
    // Display settings
    sortOrder: integer('sort_order').default(0),
    groupName: varchar('group_name', { length: 100 }),
    isHidden: boolean('is_hidden').default(false),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    templateIdIndex: index('idx_kb_fields_template_id').on(table.templateId),
    sortOrderIndex: index('idx_kb_fields_sort_order').on(table.sortOrder),
    uniqueFieldSlug: unique().on(table.templateId, table.slug),
  }),
);

export type KbTemplateField = typeof kbTemplateFields.$inferSelect;
export type NewKbTemplateField = typeof kbTemplateFields.$inferInsert;

// ============================================================================
// KNOWLEDGE OBJECTS - Actual instances of templates
// ============================================================================

/**
 * Knowledge Base Objects
 *
 * Stores actual knowledge objects created from templates.
 * Each object contains structured data that the AI can retrieve and use.
 */
export const kbObjects = pgTable(
  'kb_objects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id')
      .notNull()
      .references(() => kbObjectTemplates.id, { onDelete: 'restrict' }),
    // Object identification
    name: varchar('name', { length: 500 }).notNull(),
    slug: varchar('slug', { length: 500 }),
    externalId: varchar('external_id', { length: 255 }),
    // Status and indexing
    status: objectStatusEnum('status').default('draft'),
    lastIndexedAt: timestamp('last_indexed_at'),
    indexingError: text('indexing_error'),
    chunkCount: integer('chunk_count').default(0),
    // Version control
    version: integer('version').default(1),
    publishedAt: timestamp('published_at'),
    // Media tracking
    mediaCount: integer('media_count').default(0),
    fileCount: integer('file_count').default(0),
    // AI metadata
    aiSummary: text('ai_summary'),
    aiTags: jsonb('ai_tags').default('[]'),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    archivedAt: timestamp('archived_at'),
  },
  (table) => ({
    userIdIndex: index('idx_kb_objects_user_id').on(table.userId),
    templateIdIndex: index('idx_kb_objects_template_id').on(table.templateId),
    statusIndex: index('idx_kb_objects_status').on(table.status),
    externalIdIndex: index('idx_kb_objects_external_id').on(table.externalId),
    createdAtIndex: index('idx_kb_objects_created_at').on(table.createdAt),
  }),
);

export type KbObject = typeof kbObjects.$inferSelect;
export type NewKbObject = typeof kbObjects.$inferInsert;

// ============================================================================
// OBJECT FIELD VALUES - Actual field data for objects
// ============================================================================

/**
 * Knowledge Base Object Field Values
 *
 * Stores the actual field values for each object.
 * Uses JSONB for flexible value storage across different field types.
 */
export const kbObjectFieldValues = pgTable(
  'kb_object_field_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    objectId: uuid('object_id')
      .notNull()
      .references(() => kbObjects.id, { onDelete: 'cascade' }),
    fieldId: uuid('field_id')
      .notNull()
      .references(() => kbTemplateFields.id, { onDelete: 'cascade' }),
    // Value storage (JSONB for flexibility)
    value: jsonb('value'),
    // For text fields, also store as plain text for full-text search
    textValue: text('text_value'),
    // For numeric fields
    numericValue: integer('numeric_value'),
    // For date fields
    dateValue: timestamp('date_value'),
    // For boolean fields
    booleanValue: boolean('boolean_value'),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    objectIdIndex: index('idx_kb_field_values_object_id').on(table.objectId),
    fieldIdIndex: index('idx_kb_field_values_field_id').on(table.fieldId),
    uniqueObjectField: unique().on(table.objectId, table.fieldId),
    textValueIndex: index('idx_kb_field_values_text').on(table.textValue),
  }),
);

export type KbObjectFieldValue = typeof kbObjectFieldValues.$inferSelect;
export type NewKbObjectFieldValue = typeof kbObjectFieldValues.$inferInsert;

// ============================================================================
// OBJECT MEDIA - Files and media attached to objects
// ============================================================================

/**
 * Knowledge Base Object Media
 *
 * Stores media files (images, videos, documents) attached to objects.
 * Uses S3 for storage with structured paths.
 */
export const kbObjectMedia = pgTable(
  'kb_object_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    objectId: uuid('object_id')
      .notNull()
      .references(() => kbObjects.id, { onDelete: 'cascade' }),
    fieldId: uuid('field_id').references(() => kbTemplateFields.id, {
      onDelete: 'set null',
    }),
    // File information
    fileName: varchar('file_name', { length: 500 }).notNull(),
    originalFileName: varchar('original_file_name', { length: 500 }),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: integer('file_size').notNull(),
    // S3 storage
    s3Bucket: varchar('s3_bucket', { length: 100 }).notNull(),
    s3Key: varchar('s3_key', { length: 1000 }).notNull(),
    s3Url: text('s3_url'),
    // Media type classification
    mediaType: varchar('media_type', { length: 50 }).notNull(),
    // For images: dimensions
    width: integer('width'),
    height: integer('height'),
    // For videos/audio: duration in seconds
    duration: integer('duration'),
    // Thumbnail for images/videos
    thumbnailS3Key: varchar('thumbnail_s3_key', { length: 1000 }),
    thumbnailUrl: text('thumbnail_url'),
    // Video compression
    compressionStatus: varchar('compression_status', { length: 20 }).default(
      'none',
    ), // none, pending, processing, completed, failed
    compressedS3Key: varchar('compressed_s3_key', { length: 1000 }),
    compressedFileSize: integer('compressed_file_size'),
    originalFileSize: integer('original_file_size'),
    compressionError: text('compression_error'),
    // Content extraction for AI
    extractedContent: text('extracted_content'),
    extractionStatus: varchar('extraction_status', { length: 20 }).default(
      'pending',
    ),
    extractionError: text('extraction_error'),
    // Display order
    sortOrder: integer('sort_order').default(0),
    // Alt text for accessibility
    altText: varchar('alt_text', { length: 500 }),
    caption: text('caption'),
    // AI instructions - custom instructions for AI about when to use this media
    aiInstructions: text('ai_instructions'),
    // AI eligibility flag
    aiEnabled: boolean('ai_enabled').default(true),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    objectIdIndex: index('idx_kb_media_object_id').on(table.objectId),
    fieldIdIndex: index('idx_kb_media_field_id').on(table.fieldId),
    mediaTypeIndex: index('idx_kb_media_type').on(table.mediaType),
    sortOrderIndex: index('idx_kb_media_sort_order').on(table.sortOrder),
  }),
);

export type KbObjectMedia = typeof kbObjectMedia.$inferSelect;
export type NewKbObjectMedia = typeof kbObjectMedia.$inferInsert;

// ============================================================================
// OBJECT CHUNKS - Chunked content for embedding
// ============================================================================

/**
 * Knowledge Base Object Chunks
 *
 * Stores chunked content from objects for vector embedding.
 * Each object can have multiple chunks, each embedded separately.
 */
export const kbObjectChunks = pgTable(
  'kb_object_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    objectId: uuid('object_id')
      .notNull()
      .references(() => kbObjects.id, { onDelete: 'cascade' }),
    // Chunk identification
    chunkIndex: integer('chunk_index').notNull(),
    chunkType: varchar('chunk_type', { length: 50 })
      .notNull()
      .default('content'),
    // Content
    content: text('content').notNull(),
    contentHash: varchar('content_hash', { length: 64 }),
    tokenCount: integer('token_count'),
    // Vector embedding using pgvector (1536 dims for HNSW indexing)
    embedding: vector('embedding', { dimensions: 1536 }),
    // Source tracking
    sourceFieldIds: jsonb('source_field_ids').default('[]'),
    sourceMediaId: uuid('source_media_id').references(() => kbObjectMedia.id, {
      onDelete: 'set null',
    }),
    // Status
    status: chunkStatusEnum('status').default('pending'),
    errorMessage: text('error_message'),
    // Embedding metadata
    embeddingModel: varchar('embedding_model', { length: 100 }).default(
      'text-embedding-3-large',
    ),
    embeddingDimensions: integer('embedding_dimensions').default(1536),
    embeddedAt: timestamp('embedded_at'),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    objectIdIndex: index('idx_kb_chunks_object_id').on(table.objectId),
    chunkTypeIndex: index('idx_kb_chunks_type').on(table.chunkType),
    statusIndex: index('idx_kb_chunks_status').on(table.status),
    contentHashIndex: index('idx_kb_chunks_content_hash').on(table.contentHash),
    uniqueObjectChunk: unique().on(table.objectId, table.chunkIndex),
  }),
);

export type KbObjectChunk = typeof kbObjectChunks.$inferSelect;
export type NewKbObjectChunk = typeof kbObjectChunks.$inferInsert;

// ============================================================================
// UNSTRUCTURED UPLOADS - Raw file uploads not yet assigned to objects
// ============================================================================

/**
 * Knowledge Base Unstructured Uploads
 *
 * Stores raw file uploads (PDFs, docs, spreadsheets) that are:
 * - Pending processing
 * - Optionally linked to objects
 * - Used for bulk import/extraction
 */
export const kbUnstructuredUploads = pgTable(
  'kb_unstructured_uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Optional link to object (if assigned)
    objectId: uuid('object_id').references(() => kbObjects.id, {
      onDelete: 'set null',
    }),
    // File information
    fileName: varchar('file_name', { length: 500 }).notNull(),
    originalFileName: varchar('original_file_name', { length: 500 }),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: integer('file_size').notNull(),
    // S3 storage
    s3Bucket: varchar('s3_bucket', { length: 100 }).notNull(),
    s3Key: varchar('s3_key', { length: 1000 }).notNull(),
    s3Url: text('s3_url'),
    // Content extraction
    extractedContent: text('extracted_content'),
    extractedStructure: jsonb('extracted_structure'),
    contentHash: varchar('content_hash', { length: 64 }),
    // Processing status
    processingStatus: varchar('processing_status', { length: 20 }).default(
      'pending',
    ),
    processingError: text('processing_error'),
    processedAt: timestamp('processed_at'),
    // Suggested template/object mapping
    suggestedTemplateId: uuid('suggested_template_id').references(
      () => kbObjectTemplates.id,
    ),
    suggestedFieldMappings: jsonb('suggested_field_mappings'),
    // For bulk uploads, track the batch
    batchId: uuid('batch_id'),
    batchFileName: varchar('batch_file_name', { length: 500 }),
    rowIndex: integer('row_index'),
    // Vector embedding for standalone retrieval (1536 dims for HNSW indexing)
    embedding: vector('embedding', { dimensions: 1536 }),
    embeddingStatus: varchar('embedding_status', { length: 20 }).default(
      'pending',
    ),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    userIdIndex: index('idx_kb_uploads_user_id').on(table.userId),
    objectIdIndex: index('idx_kb_uploads_object_id').on(table.objectId),
    processingStatusIndex: index('idx_kb_uploads_status').on(
      table.processingStatus,
    ),
    batchIdIndex: index('idx_kb_uploads_batch_id').on(table.batchId),
    contentHashIndex: index('idx_kb_uploads_content_hash').on(
      table.contentHash,
    ),
  }),
);

export type KbUnstructuredUpload = typeof kbUnstructuredUploads.$inferSelect;
export type NewKbUnstructuredUpload = typeof kbUnstructuredUploads.$inferInsert;

// ============================================================================
// BULK IMPORT BATCHES - Track bulk import operations
// ============================================================================

/**
 * Knowledge Base Bulk Import Batches
 *
 * Tracks bulk import operations (CSV, JSON uploads)
 */
export const kbBulkImportBatches = pgTable(
  'kb_bulk_import_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id')
      .notNull()
      .references(() => kbObjectTemplates.id, { onDelete: 'restrict' }),
    // File information
    fileName: varchar('file_name', { length: 500 }).notNull(),
    fileType: varchar('file_type', { length: 20 }).notNull(),
    s3Key: varchar('s3_key', { length: 1000 }),
    // Field mappings (column -> field)
    fieldMappings: jsonb('field_mappings').notNull(),
    // Processing stats
    totalRows: integer('total_rows').default(0),
    processedRows: integer('processed_rows').default(0),
    successCount: integer('success_count').default(0),
    errorCount: integer('error_count').default(0),
    // Status
    status: varchar('status', { length: 20 }).default('pending'),
    errorLog: jsonb('error_log').default('[]'),
    // Timestamps
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    userIdIndex: index('idx_kb_batches_user_id').on(table.userId),
    templateIdIndex: index('idx_kb_batches_template_id').on(table.templateId),
    statusIndex: index('idx_kb_batches_status').on(table.status),
  }),
);

export type KbBulkImportBatch = typeof kbBulkImportBatches.$inferSelect;
export type NewKbBulkImportBatch = typeof kbBulkImportBatches.$inferInsert;

// ============================================================================
// AI RETRIEVAL LOGS - Track AI retrieval operations
// ============================================================================

/**
 * Knowledge Base AI Retrieval Logs
 *
 * Tracks which objects were retrieved for AI responses.
 * Used for analytics, debugging, and improving relevance.
 */
export const kbRetrievalLogs = pgTable(
  'kb_retrieval_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('user_id').references(() => users.id),
    chatId: varchar('chat_id', { length: 255 }),
    messageId: varchar('message_id', { length: 255 }),
    // Query information
    queryText: text('query_text').notNull(),
    queryVector: vector('query_vector', { dimensions: 1536 }),
    // Retrieval results
    retrievedObjectIds: jsonb('retrieved_object_ids').default('[]'),
    retrievedChunkIds: jsonb('retrieved_chunk_ids').default('[]'),
    similarityScores: jsonb('similarity_scores').default('[]'),
    // Retrieval settings used
    topK: integer('top_k'),
    minSimilarity: integer('min_similarity'),
    filterTemplateIds: jsonb('filter_template_ids'),
    // Performance
    latencyMs: integer('latency_ms'),
    totalResults: integer('total_results'),
    // Feedback (for learning)
    wasHelpful: boolean('was_helpful'),
    feedbackAt: timestamp('feedback_at'),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    userIdIndex: index('idx_kb_retrieval_user_id').on(table.userId),
    chatIdIndex: index('idx_kb_retrieval_chat_id').on(table.chatId),
    createdAtIndex: index('idx_kb_retrieval_created_at').on(table.createdAt),
  }),
);

export type KbRetrievalLog = typeof kbRetrievalLogs.$inferSelect;
export type NewKbRetrievalLog = typeof kbRetrievalLogs.$inferInsert;

// ============================================================================
// TEST QUERIES - Saved test queries for the preview interface
// ============================================================================

/**
 * Knowledge Base Test Queries
 *
 * Stores saved test queries for the preview/testing interface.
 */
export const kbTestQueries = pgTable(
  'kb_test_queries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Query information
    name: varchar('name', { length: 200 }),
    query: text('query').notNull(),
    // Expected results (for testing)
    expectedObjectIds: jsonb('expected_object_ids').default('[]'),
    // Last execution
    lastResponse: text('last_response'),
    lastRetrievedObjects: jsonb('last_retrieved_objects'),
    lastExecutedAt: timestamp('last_executed_at'),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    userIdIndex: index('idx_kb_test_queries_user_id').on(table.userId),
  }),
);

export type KbTestQuery = typeof kbTestQueries.$inferSelect;
export type NewKbTestQuery = typeof kbTestQueries.$inferInsert;

// ============================================================================
// RELATIONS
// ============================================================================

export const kbObjectTemplatesRelations = relations(
  kbObjectTemplates,
  ({ one, many }) => ({
    user: one(users, {
      fields: [kbObjectTemplates.userId],
      references: [users.id],
    }),
    fields: many(kbTemplateFields),
    objects: many(kbObjects),
    bulkImports: many(kbBulkImportBatches),
  }),
);

export const kbTemplateFieldsRelations = relations(
  kbTemplateFields,
  ({ one, many }) => ({
    template: one(kbObjectTemplates, {
      fields: [kbTemplateFields.templateId],
      references: [kbObjectTemplates.id],
    }),
    values: many(kbObjectFieldValues),
    media: many(kbObjectMedia),
  }),
);

export const kbObjectsRelations = relations(kbObjects, ({ one, many }) => ({
  user: one(users, {
    fields: [kbObjects.userId],
    references: [users.id],
  }),
  template: one(kbObjectTemplates, {
    fields: [kbObjects.templateId],
    references: [kbObjectTemplates.id],
  }),
  fieldValues: many(kbObjectFieldValues),
  media: many(kbObjectMedia),
  chunks: many(kbObjectChunks),
  uploads: many(kbUnstructuredUploads),
}));

export const kbObjectFieldValuesRelations = relations(
  kbObjectFieldValues,
  ({ one }) => ({
    object: one(kbObjects, {
      fields: [kbObjectFieldValues.objectId],
      references: [kbObjects.id],
    }),
    field: one(kbTemplateFields, {
      fields: [kbObjectFieldValues.fieldId],
      references: [kbTemplateFields.id],
    }),
  }),
);

export const kbObjectMediaRelations = relations(kbObjectMedia, ({ one }) => ({
  object: one(kbObjects, {
    fields: [kbObjectMedia.objectId],
    references: [kbObjects.id],
  }),
  field: one(kbTemplateFields, {
    fields: [kbObjectMedia.fieldId],
    references: [kbTemplateFields.id],
  }),
}));

export const kbObjectChunksRelations = relations(kbObjectChunks, ({ one }) => ({
  object: one(kbObjects, {
    fields: [kbObjectChunks.objectId],
    references: [kbObjects.id],
  }),
  sourceMedia: one(kbObjectMedia, {
    fields: [kbObjectChunks.sourceMediaId],
    references: [kbObjectMedia.id],
  }),
}));

export const kbUnstructuredUploadsRelations = relations(
  kbUnstructuredUploads,
  ({ one }) => ({
    user: one(users, {
      fields: [kbUnstructuredUploads.userId],
      references: [users.id],
    }),
    object: one(kbObjects, {
      fields: [kbUnstructuredUploads.objectId],
      references: [kbObjects.id],
    }),
    suggestedTemplate: one(kbObjectTemplates, {
      fields: [kbUnstructuredUploads.suggestedTemplateId],
      references: [kbObjectTemplates.id],
    }),
  }),
);

export const kbBulkImportBatchesRelations = relations(
  kbBulkImportBatches,
  ({ one }) => ({
    user: one(users, {
      fields: [kbBulkImportBatches.userId],
      references: [users.id],
    }),
    template: one(kbObjectTemplates, {
      fields: [kbBulkImportBatches.templateId],
      references: [kbObjectTemplates.id],
    }),
  }),
);

export const kbRetrievalLogsRelations = relations(
  kbRetrievalLogs,
  ({ one }) => ({
    user: one(users, {
      fields: [kbRetrievalLogs.userId],
      references: [users.id],
    }),
  }),
);

export const kbTestQueriesRelations = relations(kbTestQueries, ({ one }) => ({
  user: one(users, {
    fields: [kbTestQueries.userId],
    references: [users.id],
  }),
}));
