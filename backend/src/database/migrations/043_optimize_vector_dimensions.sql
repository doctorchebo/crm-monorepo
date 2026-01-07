-- Migration: Optimize vector dimensions for pgvector indexing
-- Description: Reduce embedding dimensions from 3072 to 1536 to enable HNSW indexing
--
-- OpenAI's text-embedding-3-large supports native dimension reduction via the 'dimensions' parameter.
-- This maintains quality while enabling:
-- 1. pgvector HNSW/IVFFlat indexing (max 2000 dimensions)
-- 2. Faster similarity searches (O(log n) instead of O(n))
-- 3. Reduced storage costs (~50% reduction)
-- 4. Faster embedding generation
--
-- IMPORTANT: After running this migration, all existing embeddings must be regenerated
-- using the new 1536-dimension configuration.

-- Step 1: Drop any existing embedding data (must regenerate with new dimensions)
-- This is necessary because we cannot convert 3072-dim vectors to 1536-dim in SQL
UPDATE kb_object_chunks SET embedding = NULL, status = 'pending', embedded_at = NULL WHERE embedding IS NOT NULL;
UPDATE kb_unstructured_uploads SET embedding = NULL WHERE embedding IS NOT NULL;
UPDATE kb_retrieval_logs SET query_vector = NULL WHERE query_vector IS NOT NULL;

-- Step 2: Alter columns to use 1536 dimensions
-- KB Object Chunks
ALTER TABLE kb_object_chunks 
  ALTER COLUMN embedding TYPE vector(1536) USING NULL::vector(1536);

-- KB Unstructured Uploads  
ALTER TABLE kb_unstructured_uploads
  ALTER COLUMN embedding TYPE vector(1536) USING NULL::vector(1536);

-- KB Retrieval Logs (query vector)
ALTER TABLE kb_retrieval_logs
  ALTER COLUMN query_vector TYPE vector(1536) USING NULL::vector(1536);

-- AI Memory tables (if they exist with embeddings)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_memory_chunks' AND column_name = 'embedding') THEN
    EXECUTE 'UPDATE ai_memory_chunks SET embedding = NULL WHERE embedding IS NOT NULL';
    EXECUTE 'ALTER TABLE ai_memory_chunks ALTER COLUMN embedding TYPE vector(1536) USING NULL::vector(1536)';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_memory_uploads' AND column_name = 'embedding') THEN
    EXECUTE 'UPDATE ai_memory_uploads SET embedding = NULL WHERE embedding IS NOT NULL';
    EXECUTE 'ALTER TABLE ai_memory_uploads ALTER COLUMN embedding TYPE vector(1536) USING NULL::vector(1536)';
  END IF;
END $$;

-- Step 4: Update default dimensions in metadata columns (only for tables that have this column)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kb_object_chunks' AND column_name = 'embedding_dimensions') THEN
    EXECUTE 'UPDATE kb_object_chunks SET embedding_dimensions = 1536 WHERE embedding_dimensions = 3072';
  END IF;
END $$;

-- Step 4: Create HNSW indexes for fast approximate nearest neighbor search
-- HNSW (Hierarchical Navigable Small World) provides O(log n) query time

-- Index for KB Object Chunks - primary vector search table
CREATE INDEX IF NOT EXISTS idx_kb_object_chunks_embedding_hnsw 
  ON kb_object_chunks 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index for KB Unstructured Uploads
CREATE INDEX IF NOT EXISTS idx_kb_unstructured_uploads_embedding_hnsw
  ON kb_unstructured_uploads
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index for KB Retrieval Logs query vector
CREATE INDEX IF NOT EXISTS idx_kb_retrieval_logs_embedding_hnsw
  ON kb_retrieval_logs
  USING hnsw (query_vector vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Step 5: Mark all KB objects as pending re-indexing
UPDATE kb_objects SET status = 'pending', chunk_count = 0 WHERE status = 'indexed';

-- Step 6: Add comment documenting the dimension configuration
COMMENT ON COLUMN kb_object_chunks.embedding IS 'Vector embedding (1536 dimensions) using text-embedding-3-large with dimension reduction for HNSW indexing support';
COMMENT ON COLUMN kb_unstructured_uploads.embedding IS 'Vector embedding (1536 dimensions) using text-embedding-3-large with dimension reduction';
COMMENT ON COLUMN kb_retrieval_logs.query_vector IS 'Query vector embedding (1536 dimensions) for retrieval logs';

-- Verify migration
DO $$
DECLARE
  chunk_dim INTEGER;
  upload_dim INTEGER;
BEGIN
  -- Check kb_object_chunks embedding dimension
  SELECT atttypmod INTO chunk_dim
  FROM pg_attribute 
  WHERE attrelid = 'kb_object_chunks'::regclass 
    AND attname = 'embedding';
  
  IF chunk_dim != 1536 THEN
    RAISE WARNING 'kb_object_chunks.embedding dimension is %, expected 1536', chunk_dim;
  ELSE
    RAISE NOTICE 'Successfully updated kb_object_chunks.embedding to 1536 dimensions';
  END IF;

  -- Check HNSW index exists
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_kb_object_chunks_embedding_hnsw') THEN
    RAISE NOTICE 'HNSW index created successfully on kb_object_chunks';
  ELSE
    RAISE WARNING 'HNSW index creation may have failed on kb_object_chunks';
  END IF;
END $$;
