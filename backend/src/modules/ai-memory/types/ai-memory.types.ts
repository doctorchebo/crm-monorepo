/**
 * AI Memory Types and Interfaces
 *
 * Defines all types used throughout the AI memory system
 */

// ==================== Metadata Types ====================

/**
 * Metadata stored with each message memory in the vector store
 */
export interface MessageMemoryMetadata {
  userId: number;
  senderId?: number;
  chatId: string;
  messageId: string;
  timestamp: string; // ISO string
  source: 'message' | 'note' | 'summary';
  contentType: 'text' | 'media_description' | 'document_text' | 'transcription';
  direction: 'inbound' | 'outbound';
  participantPhone?: string;
  importanceScore: number; // 0-1
}

/**
 * Metadata stored with uploaded content embeddings
 */
export interface UploadedContentMetadata {
  userId: number;
  chatId?: string;
  contentType: 'document' | 'image' | 'audio' | 'video';
  processingMethod: 'ocr' | 'transcription' | 'extraction' | 'description';
  fileName?: string;
  mimeType?: string;
  language?: string;
  pageCount?: number;
  duration?: number; // seconds, for audio/video
  imageDescription?: string;
  tags?: string[];
  confidenceScore?: number;
}

// ==================== Embedding Types ====================

/**
 * Content prepared for embedding
 */
export interface EmbeddingContent {
  id: string; // Unique ID for this content (stored in database)
  content: string; // Text to embed
  metadata: MessageMemoryMetadata | UploadedContentMetadata;
}

/**
 * Result from embedding generation
 */
export interface EmbeddingResult {
  id: string;
  vector: number[];
  tokensUsed: number;
}

/**
 * Batch embedding request
 */
export interface BatchEmbeddingRequest {
  contents: EmbeddingContent[];
}

/**
 * Batch embedding response
 */
export interface BatchEmbeddingResponse {
  results: EmbeddingResult[];
  totalTokensUsed: number;
  failedIds: string[];
  errors: Array<{ id: string; error: string }>;
}

// ==================== Storage Types ====================

/**
 * Input for storing a new memory
 */
export interface StoreMemoryInput {
  chatId: string;
  messageId?: string;
  content: string;
  metadata: MessageMemoryMetadata;
}

/**
 * Input for storing uploaded content
 */
export interface StoreUploadedContentInput {
  userId: number;
  chatId?: string;
  type: 'document' | 'image' | 'audio' | 'video';
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  mimeType?: string;
  extractedContent: string;
  metadata: UploadedContentMetadata;
}

/**
 * Result from storing a memory
 */
export interface StoreMemoryResult {
  success: boolean;
  memoryId?: string;
  /** @deprecated Use memoryId instead. Kept for backward compatibility. */
  pineconeId?: string;
  error?: string;
}

// ==================== Retrieval Types ====================

/**
 * Query for retrieving memories
 */
export interface MemoryRetrievalQuery {
  userId: number;
  chatId: string;
  query: string; // The semantic query text
  topK?: number; // Number of results (default from config)
  minScore?: number; // Minimum similarity score
  includeUploadedContent?: boolean;
  filters?: MemoryFilters;
}

/**
 * Filters for memory retrieval
 */
export interface MemoryFilters {
  direction?: 'inbound' | 'outbound' | 'both';
  contentTypes?: string[];
  fromDate?: Date;
  toDate?: Date;
  minImportance?: number;
}

/**
 * A retrieved memory item
 */
export interface RetrievedMemory {
  id: string;
  /** @deprecated Use id instead. Kept for backward compatibility. */
  pineconeId: string;
  content: string;
  score: number; // Similarity score
  metadata: MessageMemoryMetadata | UploadedContentMetadata;
  source: 'message' | 'uploaded_content';
  createdAt: Date;
}

/**
 * Result from memory retrieval
 */
export interface MemoryRetrievalResult {
  memories: RetrievedMemory[];
  query: string;
  totalFound: number;
  latencyMs: number;
}

// ==================== Context Building Types ====================

/**
 * Recent message for context
 */
export interface RecentMessage {
  messageId: string;
  content: string;
  direction: 'inbound' | 'outbound';
  timestamp: Date;
  type: string;
}

/**
 * Complete context for AI generation
 */
export interface AiContext {
  // Recent conversation messages
  recentMessages: RecentMessage[];

  // Semantically retrieved memories
  relevantMemories: RetrievedMemory[];

  // Metadata about the chat
  chatMetadata: {
    chatId: string;
    userId: number;
    participantPhone?: string;
    participantName?: string;
  };

  // Token counts for context management
  tokenCounts: {
    recentMessages: number;
    relevantMemories: number;
    total: number;
  };
}

/**
 * Input for building AI context
 */
export interface BuildContextInput {
  userId: number;
  chatId: string;
  currentMessage: string; // The message to respond to
  recentMessagesCount?: number;
  topK?: number;
}

// ==================== Processing Types ====================

/**
 * Content processing request
 */
export interface ProcessContentRequest {
  userId: number;
  chatId?: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

/**
 * Content processing result
 */
export interface ProcessContentResult {
  success: boolean;
  extractedContent?: string;
  metadata?: UploadedContentMetadata;
  error?: string;
}

// ==================== Logging Types ====================

/**
 * Memory operation types for logging
 */
export type MemoryOperation =
  | 'embed'
  | 'store'
  | 'retrieve'
  | 'update'
  | 'delete'
  | 'process';

/**
 * Memory operation status
 */
export type OperationStatus = 'success' | 'failed' | 'partial';

/**
 * Log entry for memory operations
 */
export interface MemoryLogEntry {
  operation: MemoryOperation;
  status: OperationStatus;
  userId?: number;
  chatId?: string;
  memoryId?: string;
  uploadedContentId?: string;
  requestMetadata?: Record<string, unknown>;
  responseMetadata?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  errorStack?: string;
  latencyMs?: number;
  tokensUsed?: number;
  costUsd?: string;
}

// ==================== Error Types ====================

/**
 * Custom error for AI memory operations
 */
export class AiMemoryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AiMemoryError';
  }
}

/**
 * Error codes for AI memory operations
 */
export enum AiMemoryErrorCode {
  // Embedding errors
  EMBEDDING_FAILED = 'EMBEDDING_FAILED',
  EMBEDDING_RATE_LIMITED = 'EMBEDDING_RATE_LIMITED',
  EMBEDDING_INVALID_INPUT = 'EMBEDDING_INVALID_INPUT',

  // Storage errors
  STORAGE_FAILED = 'STORAGE_FAILED',
  STORAGE_DUPLICATE = 'STORAGE_DUPLICATE',
  STORAGE_NOT_FOUND = 'STORAGE_NOT_FOUND',

  // Retrieval errors
  RETRIEVAL_FAILED = 'RETRIEVAL_FAILED',
  RETRIEVAL_TIMEOUT = 'RETRIEVAL_TIMEOUT',

  // Processing errors
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  PROCESSING_UNSUPPORTED_TYPE = 'PROCESSING_UNSUPPORTED_TYPE',
  PROCESSING_TOO_LARGE = 'PROCESSING_TOO_LARGE',

  // Configuration errors
  CONFIG_MISSING = 'CONFIG_MISSING',
  CONFIG_INVALID = 'CONFIG_INVALID',

  // Connection errors
  VECTOR_STORE_CONNECTION_FAILED = 'VECTOR_STORE_CONNECTION_FAILED',
  PROVIDER_CONNECTION_FAILED = 'PROVIDER_CONNECTION_FAILED',
}

// ==================== Utility Types ====================

/**
 * Chunk information for large documents
 */
export interface ContentChunk {
  id: string;
  content: string;
  index: number;
  totalChunks: number;
  metadata: Record<string, unknown>;
}

/**
 * Token estimation result
 */
export interface TokenEstimate {
  tokens: number;
  truncated: boolean;
  originalLength: number;
  truncatedLength?: number;
}
