/**
 * Vector Store Module Exports
 *
 * This module provides an abstraction layer for vector storage.
 * Currently implements PostgreSQL pgvector for cost-effective local storage.
 *
 * To migrate to a dedicated vector database in the future:
 * 1. Create a new store implementation (e.g., PineconeStore, WeaviateStore)
 * 2. Implement the VectorStore interface
 * 3. Update the module to use the new store based on configuration
 */

// Types and interfaces
export * from './vector-store.types';

// Implementations
export { PgVectorStore } from './pgvector.store';
