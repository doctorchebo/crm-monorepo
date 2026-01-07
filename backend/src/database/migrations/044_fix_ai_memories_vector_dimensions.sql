-- Migration: Fix ai_memories vector dimensions
-- Description: Update ai_memories.embedding column from 3072 to 1536 dimensions
--
-- The original migration (036_migrate_to_pgvector.sql) created the embedding column
-- with 3072 dimensions, but migration 043 changed the embedding model configuration
-- to use 1536 dimensions (for HNSW indexing compatibility).
--
-- This migration aligns ai_memories with the rest of the system.

-- Step 1: Clear existing embeddings (they need to be regenerated with new dimensions)
UPDATE ai_memories SET embedding = NULL WHERE embedding IS NOT NULL;

-- Step 2: Alter column to use 1536 dimensions
ALTER TABLE ai_memories 
  ALTER COLUMN embedding TYPE vector(1536) USING NULL::vector(1536);

-- Step 3: Update the default embedding_dimensions value
UPDATE ai_memories SET embedding_dimensions = 1536 WHERE embedding_dimensions = 3072;

-- Step 4: Update the column default
ALTER TABLE ai_memories 
  ALTER COLUMN embedding_dimensions SET DEFAULT 1536;

-- Step 5: Also fix ai_uploaded_content if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_uploaded_content' AND column_name = 'embedding') THEN
    EXECUTE 'UPDATE ai_uploaded_content SET embedding = NULL WHERE embedding IS NOT NULL';
    EXECUTE 'ALTER TABLE ai_uploaded_content ALTER COLUMN embedding TYPE vector(1536) USING NULL::vector(1536)';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_uploaded_content' AND column_name = 'embedding_dimensions') THEN
    EXECUTE 'UPDATE ai_uploaded_content SET embedding_dimensions = 1536 WHERE embedding_dimensions = 3072';
  END IF;
END $$;

-- Step 6: Create HNSW index for ai_memories for fast vector search
-- Drop any existing index first
DROP INDEX IF EXISTS idx_ai_memories_embedding;
DROP INDEX IF EXISTS idx_ai_memories_embedding_hnsw;

-- Create HNSW index with cosine distance operator
CREATE INDEX IF NOT EXISTS idx_ai_memories_embedding_hnsw
  ON ai_memories
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Step 7: Update column comment
COMMENT ON COLUMN ai_memories.embedding IS 'Vector embedding (1536 dimensions) using text-embedding-3-large with dimension reduction for HNSW indexing support';

-- Verify migration
DO $$
DECLARE
  mem_dim INTEGER;
BEGIN
  -- Check ai_memories embedding dimension
  SELECT atttypmod INTO mem_dim
  FROM pg_attribute 
  WHERE attrelid = 'ai_memories'::regclass 
    AND attname = 'embedding';
  
  IF mem_dim != 1536 THEN
    RAISE WARNING 'ai_memories.embedding dimension is %, expected 1536', mem_dim;
  ELSE
    RAISE NOTICE 'Successfully updated ai_memories.embedding to 1536 dimensions';
  END IF;
  
  -- Check HNSW index exists
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ai_memories_embedding_hnsw') THEN
    RAISE NOTICE 'HNSW index created successfully on ai_memories';
  ELSE
    RAISE WARNING 'HNSW index creation may have failed on ai_memories';
  END IF;
END $$;
