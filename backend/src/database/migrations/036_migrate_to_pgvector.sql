-- Migration: Migrate from Pinecone to pgvector
-- Description: Adds pgvector extension and vector columns to AI memory tables
-- This enables local vector similarity search without external vector database dependencies
--
-- PREREQUISITES:
-- The pgvector extension must be installed on your PostgreSQL server.
--
-- Option 1: Use Docker with pgvector image (recommended for development)
--   docker-compose -f docker-compose.postgres.yml up -d
--
-- Option 2: Install pgvector on existing PostgreSQL
--   - Ubuntu/Debian: sudo apt install postgresql-16-pgvector
--   - macOS with Homebrew: brew install pgvector
--   - From source: https://github.com/pgvector/pgvector#installation
--
-- Option 3: Use a managed PostgreSQL with pgvector support
--   - Supabase (built-in)
--   - Neon (built-in)
--   - AWS RDS (enable extension)
--   - Azure Database for PostgreSQL (Flexible Server)

-- =============================================
-- Enable pgvector extension
-- =============================================
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================
-- Add vector columns to ai_memories
-- =============================================
-- Using 3072 dimensions to match text-embedding-3-large model
-- Can be adjusted based on embedding model used

-- Add vector column for storing embeddings
ALTER TABLE ai_memories 
ADD COLUMN IF NOT EXISTS embedding vector(3072);

-- Create index for vector similarity search using IVFFlat
-- IVFFlat supports dimensions > 2000 (HNSW is limited to 2000)
-- Using cosine distance operator for semantic similarity
-- Note: IVFFlat requires the table to have data before creating the index
-- We'll create the index in a separate step after data exists
-- For now, we skip index creation - it will be created when first query runs
-- or you can run: CREATE INDEX CONCURRENTLY ... after inserting initial data

-- Add index on metadata->>'userId' for filtering by user during vector search
CREATE INDEX IF NOT EXISTS idx_ai_memories_metadata_user_id 
ON ai_memories ((metadata->>'userId'));

-- Add index on metadata->>'chatId' for filtering by chat
CREATE INDEX IF NOT EXISTS idx_ai_memories_metadata_chat_id 
ON ai_memories ((metadata->>'chatId'));

-- =============================================
-- Add vector columns to ai_uploaded_content
-- =============================================

-- Add vector column for storing embeddings
ALTER TABLE ai_uploaded_content 
ADD COLUMN IF NOT EXISTS embedding vector(3072);

-- IVFFlat index will be created after data exists
-- See note above about index creation

-- =============================================
-- Remove Pinecone-specific columns (optional)
-- =============================================
-- Note: We're keeping pinecone_id for now for backward compatibility
-- It can be removed in a future migration once migration is complete
-- Uncomment the following lines to remove pinecone_id columns:

-- ALTER TABLE ai_memories DROP COLUMN IF EXISTS pinecone_id;
-- ALTER TABLE ai_uploaded_content DROP COLUMN IF EXISTS pinecone_id;

-- =============================================
-- Create helper functions for vector operations
-- =============================================

-- Function to search memories by vector similarity
-- Returns matches sorted by cosine similarity
CREATE OR REPLACE FUNCTION search_ai_memories(
    query_embedding vector(3072),
    target_user_id INTEGER,
    target_chat_id VARCHAR DEFAULT NULL,
    similarity_threshold FLOAT DEFAULT 0.7,
    result_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    metadata JSONB,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.content,
        m.metadata,
        1 - (m.embedding <=> query_embedding) AS similarity
    FROM ai_memories m
    WHERE 
        m.embedding IS NOT NULL
        AND (m.metadata->>'userId')::INTEGER = target_user_id
        AND (target_chat_id IS NULL OR m.metadata->>'chatId' = target_chat_id)
        AND 1 - (m.embedding <=> query_embedding) >= similarity_threshold
    ORDER BY m.embedding <=> query_embedding
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to search uploaded content by vector similarity
CREATE OR REPLACE FUNCTION search_ai_uploaded_content(
    query_embedding vector(3072),
    target_user_id INTEGER,
    target_chat_id VARCHAR DEFAULT NULL,
    similarity_threshold FLOAT DEFAULT 0.7,
    result_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    extracted_content TEXT,
    metadata JSONB,
    type VARCHAR,
    file_name VARCHAR,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.extracted_content,
        c.metadata,
        c.type,
        c.file_name,
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM ai_uploaded_content c
    WHERE 
        c.embedding IS NOT NULL
        AND c.user_id = target_user_id
        AND c.status = 'completed'
        AND (target_chat_id IS NULL OR c.chat_id = target_chat_id)
        AND 1 - (c.embedding <=> query_embedding) >= similarity_threshold
    ORDER BY c.embedding <=> query_embedding
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Comments for documentation
-- =============================================
COMMENT ON COLUMN ai_memories.embedding IS 'Vector embedding generated from content using LLM embedding model (e.g., text-embedding-3-large)';
COMMENT ON COLUMN ai_uploaded_content.embedding IS 'Vector embedding generated from extracted content using LLM embedding model';

COMMENT ON FUNCTION search_ai_memories IS 'Performs cosine similarity search on ai_memories table. Returns memories matching the query vector above the threshold.';
COMMENT ON FUNCTION search_ai_uploaded_content IS 'Performs cosine similarity search on ai_uploaded_content table. Returns content matching the query vector above the threshold.';
