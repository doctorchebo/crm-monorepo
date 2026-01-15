/**
 * Knowledge Base Module Types
 *
 * Type definitions for the knowledge base system
 */

// Export media types
export * from './media.types';

// ============================================================================
// Field Configuration Types
// ============================================================================

export type FieldType =
  | 'short_text'
  | 'long_text'
  | 'rich_text'
  | 'number'
  | 'price'
  | 'date'
  | 'date_range'
  | 'boolean'
  | 'tags'
  | 'location'
  | 'media'
  | 'file'
  | 'select'
  | 'multi_select'
  | 'url'
  | 'email'
  | 'phone'
  | 'key_value';

export type AiRelevance = 'low' | 'medium' | 'high' | 'critical';

export type ObjectStatus =
  | 'draft'
  | 'pending'
  | 'indexing'
  | 'indexed'
  | 'error'
  | 'archived';

export type ChunkStatus = 'pending' | 'processing' | 'embedded' | 'error';

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'error';

// ============================================================================
// Field Configuration Interfaces
// ============================================================================

export interface BaseFieldConfig {
  minLength?: number;
  maxLength?: number;
}

export interface NumberFieldConfig extends BaseFieldConfig {
  min?: number;
  max?: number;
  step?: number;
  format?: 'integer' | 'decimal' | 'percentage';
}

export interface PriceFieldConfig extends BaseFieldConfig {
  currency?: string;
  currencyPosition?: 'before' | 'after';
  allowNegative?: boolean;
}

export interface DateFieldConfig {
  format?: string;
  minDate?: string;
  maxDate?: string;
  includeTime?: boolean;
}

export interface DateRangeFieldConfig extends DateFieldConfig {
  allowOpenEnded?: boolean;
}

export interface SelectFieldConfig {
  options: Array<{ value: string; label: string; color?: string }>;
  allowCustom?: boolean;
}

export interface LocationFieldConfig {
  requireCoordinates?: boolean;
  defaultCountry?: string;
  includePostalCode?: boolean;
}

export interface MediaFieldConfig {
  acceptedTypes?: string[];
  maxFiles?: number;
  maxFileSize?: number;
  requireAltText?: boolean;
}

export interface FileFieldConfig {
  acceptedTypes?: string[];
  maxFiles?: number;
  maxFileSize?: number;
}

export interface KeyValueFieldConfig {
  predefinedKeys?: string[];
  allowCustomKeys?: boolean;
  valueType?: 'string' | 'number' | 'boolean';
}

export type FieldConfig =
  | BaseFieldConfig
  | NumberFieldConfig
  | PriceFieldConfig
  | DateFieldConfig
  | DateRangeFieldConfig
  | SelectFieldConfig
  | LocationFieldConfig
  | MediaFieldConfig
  | FileFieldConfig
  | KeyValueFieldConfig;

// ============================================================================
// Field Value Interfaces
// ============================================================================

export interface PriceValue {
  amount: number;
  currency: string;
}

export interface DateRangeValue {
  start: string | null;
  end: string | null;
}

export interface LocationValue {
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
}

export interface MediaValue {
  id: string;
  fileName: string;
  url: string;
  mimeType: string;
  fileSize: number;
  altText?: string;
  caption?: string;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
}

export interface FileValue {
  id: string;
  fileName: string;
  url: string;
  mimeType: string;
  fileSize: number;
}

export interface KeyValueEntry {
  key: string;
  value: string | number | boolean;
}

export type FieldValue =
  | string
  | number
  | boolean
  | string[]
  | PriceValue
  | DateRangeValue
  | LocationValue
  | MediaValue[]
  | FileValue[]
  | KeyValueEntry[]
  | null;

// ============================================================================
// Template Interfaces
// ============================================================================

export interface TemplateFieldDefinition {
  name: string;
  slug: string;
  displayName: string;
  description?: string;
  placeholder?: string;
  fieldType: FieldType;
  isRequired?: boolean;
  isUnique?: boolean;
  defaultValue?: FieldValue;
  fieldConfig?: FieldConfig;
  validation?: Record<string, unknown>;
  aiRelevance?: AiRelevance;
  aiIncludeInEmbedding?: boolean;
  aiFieldHints?: string;
  sortOrder?: number;
  groupName?: string;
  isHidden?: boolean;
}

export interface TemplateDefinition {
  name: string;
  slug: string;
  displayName: string;
  description?: string;
  icon?: string;
  color?: string;
  category: string;
  isSystem?: boolean;
  aiUsageHints?: string;
  aiRetrievalContext?: string;
  supportedIntents?: string[];
  fabricationWarnings?: string[];
  priorityScore?: number;
  fields: TemplateFieldDefinition[];
}

// ============================================================================
// AI Metadata Interfaces
// ============================================================================

export interface AiMetadata {
  usageHints?: string;
  retrievalContext?: string;
  supportedIntents?: string[];
  fabricationWarnings?: string[];
  priorityScore?: number;
}

export interface ChunkMetadata {
  objectId: string;
  objectName: string;
  templateId: string;
  templateName: string;
  fieldIds?: string[];
  mediaId?: string;
  chunkType: string;
  chunkIndex: number;
}

// ============================================================================
// Retrieval Interfaces
// ============================================================================

export interface RetrievalOptions {
  topK?: number;
  minSimilarity?: number;
  templateIds?: string[];
  objectIds?: string[];
  excludeObjectIds?: string[];
  chunkTypes?: string[];
  /** Conversation context to enhance retrieval - helps find relevant KB items when the query is generic */
  conversationContext?: string;
}

export interface RetrievalResult {
  objectId: string;
  objectName: string;
  templateId: string;
  templateName: string;
  chunkId: string;
  content: string;
  similarity: number;
  metadata: ChunkMetadata;
  fieldValues?: Record<string, unknown>;
  media?: MediaValue[];
}

export interface RetrievalResponse {
  query: string;
  results: RetrievalResult[];
  totalResults: number;
  latencyMs: number;
  timing?: {
    embeddingMs: number;
    searchMs: number;
    totalMs: number;
  };
}

// ============================================================================
// Upload & Import Interfaces
// ============================================================================

export interface FieldMapping {
  sourceColumn: string;
  targetFieldId: string;
  transformation?: 'none' | 'trim' | 'lowercase' | 'uppercase' | 'parse_json';
}

export interface BulkImportOptions {
  templateId: string;
  fieldMappings: FieldMapping[];
  skipDuplicates?: boolean;
  updateExisting?: boolean;
  dryRun?: boolean;
}

export interface BulkImportResult {
  batchId: string;
  totalRows: number;
  processedRows: number;
  successCount: number;
  errorCount: number;
  errors: Array<{
    row: number;
    field?: string;
    message: string;
  }>;
}

export interface ExtractedContent {
  text: string;
  structure?: {
    title?: string;
    headings?: string[];
    paragraphs?: string[];
    tables?: Array<{
      headers: string[];
      rows: string[][];
    }>;
    metadata?: Record<string, string>;
  };
}

// ============================================================================
// S3 Path Interfaces
// ============================================================================

export interface S3PathConfig {
  userId: number;
  objectId?: string;
  mediaType: 'image' | 'video' | 'audio' | 'document' | 'other';
  fileName: string;
}

export interface S3UploadResult {
  bucket: string;
  key: string;
  url: string;
}

// ============================================================================
// API Response Interfaces
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface ObjectSummary {
  id: string;
  name: string;
  templateId: string;
  templateName: string;
  status: ObjectStatus;
  chunkCount: number;
  mediaCount: number;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
  lastIndexedAt?: string;
}

export interface ObjectDetail extends ObjectSummary {
  fieldValues: Array<{
    fieldId: string;
    fieldName: string;
    fieldSlug: string;
    fieldType: FieldType;
    value: FieldValue;
  }>;
  media: MediaValue[];
  files: FileValue[];
  aiSummary?: string;
  aiTags?: string[];
  indexingError?: string;
}

export interface TemplateSummary {
  id: string;
  name: string;
  slug: string;
  displayName: string;
  description?: string;
  icon: string;
  color: string;
  category: string;
  isSystem: boolean;
  isActive: boolean;
  hasMedia: boolean;
  objectCount?: number;
  objectsWithMediaCount?: number;
  fieldCount?: number;
}

export interface TemplateDetail extends TemplateSummary {
  fields: Array<{
    id: string;
    name: string;
    slug: string;
    displayName: string;
    description?: string;
    placeholder?: string;
    fieldType: FieldType;
    isRequired: boolean;
    isUnique: boolean;
    defaultValue?: FieldValue;
    fieldConfig?: FieldConfig;
    validation?: Record<string, unknown>;
    aiRelevance: AiRelevance;
    aiIncludeInEmbedding: boolean;
    aiFieldHints?: string;
    sortOrder: number;
    groupName?: string;
    isHidden: boolean;
  }>;
  aiUsageHints?: string;
  aiRetrievalContext?: string;
  supportedIntents?: string[];
  fabricationWarnings?: string[];
  priorityScore?: number;
}

// ============================================================================
// Test Interface Types
// ============================================================================

export interface TestQueryRequest {
  query: string;
  options?: RetrievalOptions;
}

export interface TestQueryResponse {
  query: string;
  results: RetrievalResult[];
  generatedContext: string;
  timing: {
    embeddingMs: number;
    searchMs: number;
    totalMs: number;
  };
}
