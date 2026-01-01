/**
 * Vector Store Types and Interfaces
 *
 * Defines the abstraction layer for vector storage backends.
 * This allows swapping between different vector databases
 * (PostgreSQL pgvector, Pinecone, Weaviate, Milvus, etc.)
 * without changing application code.
 */

import { MessageMemoryMetadata, UploadedContentMetadata } from '../types';

// ==================== Core Vector Types ====================

/**
 * Metadata types that can be stored with vectors
 */
export type VectorMetadata = MessageMemoryMetadata | UploadedContentMetadata;

/**
 * A vector record to be stored
 */
export interface VectorRecord {
  /** Unique identifier for the vector */
  id: string;
  /** The embedding vector values */
  values: number[];
  /** Associated metadata for filtering and context */
  metadata: VectorMetadata;
}

/**
 * A match from a similarity query
 */
export interface VectorMatch {
  /** The ID of the matched vector */
  id: string;
  /** Similarity score (0-1, higher is more similar) */
  score: number;
  /** The metadata associated with the vector */
  metadata?: VectorMetadata;
  /** The vector values (optional, depends on includeValues) */
  values?: number[];
}

// ==================== Query Types ====================

/**
 * Filter operations supported by vector stores
 */
export interface VectorFilter {
  /** Filter by user ID */
  userId?: number;
  /** Filter by chat ID */
  chatId?: string;
  /** Filter by message direction */
  direction?: 'inbound' | 'outbound';
  /** Filter by content types (any of these) */
  contentTypes?: string[];
  /** Filter by timestamp range */
  timestampRange?: {
    from?: Date;
    to?: Date;
  };
  /** Filter by minimum importance score */
  minImportance?: number;
}

/**
 * Options for similarity queries
 */
export interface VectorQueryOptions {
  /** Number of results to return */
  topK?: number;
  /** Minimum similarity score threshold (0-1) */
  minScore?: number;
  /** Filters to apply */
  filter?: VectorFilter;
  /** Whether to include metadata in results */
  includeMetadata?: boolean;
  /** Whether to include vector values in results */
  includeValues?: boolean;
}

/**
 * Result from a similarity query
 */
export interface VectorQueryResult {
  /** Array of matches sorted by similarity */
  matches: VectorMatch[];
  /** Total number of vectors that matched before topK limit */
  totalMatched?: number;
}

// ==================== Batch Operation Types ====================

/**
 * Result from a batch upsert operation
 */
export interface BatchUpsertResult {
  /** Number of successfully upserted vectors */
  success: number;
  /** Number of failed upserts */
  failed: number;
  /** IDs of failed vectors */
  failedIds: string[];
}

/**
 * Result from a batch delete operation
 */
export interface BatchDeleteResult {
  /** Number of deleted vectors */
  deleted: number;
}

// ==================== Store Configuration ====================

/**
 * Common configuration for all vector stores
 */
export interface VectorStoreConfig {
  /** Vector dimensions (must match embedding model) */
  dimensions: number;
  /** Distance metric for similarity */
  metric: 'cosine' | 'euclidean' | 'dotProduct';
  /** Optional namespace/collection prefix */
  namespace?: string;
}

/**
 * Configuration specific to PostgreSQL pgvector
 */
export interface PgVectorStoreConfig extends VectorStoreConfig {
  type: 'pgvector';
  /** Use HNSW index for faster queries (default: true) */
  useHnswIndex?: boolean;
  /** HNSW m parameter (default: 16) */
  hnswM?: number;
  /** HNSW ef_construction parameter (default: 64) */
  hnswEfConstruction?: number;
}

/**
 * Configuration for a dedicated vector database (future use)
 */
export interface DedicatedVectorStoreConfig extends VectorStoreConfig {
  type: 'pinecone' | 'weaviate' | 'milvus' | 'qdrant';
  /** API key for the service */
  apiKey: string;
  /** Host URL */
  host?: string;
  /** Index/collection name */
  indexName: string;
}

/**
 * Union of all vector store configurations
 */
export type AnyVectorStoreConfig =
  | PgVectorStoreConfig
  | DedicatedVectorStoreConfig;

// ==================== Vector Store Interface ====================

/**
 * Vector Store Interface
 *
 * Abstract interface for all vector storage backends.
 * Implementations must provide consistent behavior for:
 * - Storing and updating vectors (upsert)
 * - Similarity search (query)
 * - Deletion (by ID or filter)
 *
 * This abstraction enables:
 * - Starting with pgvector for cost efficiency
 * - Migrating to dedicated vector DBs as scale demands
 * - Testing with in-memory implementations
 */
export interface VectorStore {
  /** Name of the vector store implementation */
  readonly name: string;

  /** Whether the store is ready for operations */
  readonly isReady: boolean;

  /**
   * Initialize the vector store connection
   * Must be called before any other operations
   */
  initialize(): Promise<void>;

  /**
   * Check if the store is healthy and can accept operations
   */
  healthCheck(): Promise<boolean>;

  /**
   * Upsert a single vector
   * @param userId - User ID for namespace isolation
   * @param record - Vector record to upsert
   */
  upsert(userId: number, record: VectorRecord): Promise<void>;

  /**
   * Upsert multiple vectors in batch
   * @param userId - User ID for namespace isolation
   * @param records - Array of vector records to upsert
   */
  upsertBatch(
    userId: number,
    records: VectorRecord[],
  ): Promise<BatchUpsertResult>;

  /**
   * Query for similar vectors
   * @param userId - User ID for namespace isolation
   * @param queryVector - The query embedding vector
   * @param options - Query options (topK, filters, etc.)
   */
  query(
    userId: number,
    queryVector: number[],
    options?: VectorQueryOptions,
  ): Promise<VectorQueryResult>;

  /**
   * Delete vectors by IDs
   * @param userId - User ID for namespace isolation
   * @param ids - Array of vector IDs to delete
   */
  delete(userId: number, ids: string[]): Promise<BatchDeleteResult>;

  /**
   * Delete vectors matching a filter
   * @param userId - User ID for namespace isolation
   * @param filter - Filter criteria for deletion
   */
  deleteByFilter(
    userId: number,
    filter: VectorFilter,
  ): Promise<BatchDeleteResult>;

  /**
   * Delete all vectors for a user
   * @param userId - User ID whose vectors should be deleted
   */
  deleteAll(userId: number): Promise<BatchDeleteResult>;

  /**
   * Get statistics about the vector store
   */
  getStats(): Promise<VectorStoreStats>;
}

/**
 * Statistics about the vector store
 */
export interface VectorStoreStats {
  /** Total number of vectors stored */
  totalVectors: number;
  /** Number of vectors per user/namespace */
  vectorsByUser?: Record<number, number>;
  /** Index size in bytes (if available) */
  indexSizeBytes?: number;
  /** Whether the index is ready */
  indexReady: boolean;
}

// ==================== Factory Types ====================

/**
 * Factory function type for creating vector stores
 */
export type VectorStoreFactory = (config: AnyVectorStoreConfig) => VectorStore;

/**
 * Token for dependency injection of VectorStore
 */
export const VECTOR_STORE_TOKEN = 'VECTOR_STORE';
