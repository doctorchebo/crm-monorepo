-- Migration: Fix Pinecone references and add LLM usage logs table
-- Description: 
--   1. Makes pinecone_id columns nullable (no longer using Pinecone)
--   2. Creates llm_usage_logs table for tracking LLM API usage
-- Date: 2026-01-02

-- =============================================
-- Make pinecone_id nullable in ai_memories
-- =============================================
-- Since we've migrated to pgvector, pinecone_id is no longer required

ALTER TABLE ai_memories 
ALTER COLUMN pinecone_id DROP NOT NULL;

-- Drop the unique constraint if it exists (from original migration)
ALTER TABLE ai_memories 
DROP CONSTRAINT IF EXISTS ai_memories_pinecone_id_key;

-- =============================================
-- Make pinecone_id nullable in ai_uploaded_content
-- =============================================

ALTER TABLE ai_uploaded_content 
ALTER COLUMN pinecone_id DROP NOT NULL;

-- Drop the unique constraint if it exists
ALTER TABLE ai_uploaded_content 
DROP CONSTRAINT IF EXISTS ai_uploaded_content_pinecone_id_key;

-- =============================================
-- Create LLM Usage Logs table
-- =============================================
-- Provider-agnostic tracking of all LLM API calls for billing and monitoring

CREATE TABLE IF NOT EXISTS llm_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Context
    user_id INTEGER REFERENCES users(id),
    chat_id VARCHAR,
    
    -- Provider information
    provider VARCHAR(50) NOT NULL, -- 'openai', 'anthropic', 'cohere', etc.
    model VARCHAR(100) NOT NULL,   -- 'gpt-4o-mini', 'claude-3-opus', etc.
    
    -- Operation type
    operation_type VARCHAR(50) NOT NULL, -- 'chat', 'embedding', 'classification', 'transcription'
    
    -- Token usage
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    
    -- Cost tracking (in USD, stored as string for precision)
    input_cost VARCHAR(20) DEFAULT '0',
    output_cost VARCHAR(20) DEFAULT '0',
    total_cost VARCHAR(20) DEFAULT '0',
    
    -- Performance metrics
    latency_ms INTEGER,
    
    -- Request/Response metadata
    request_metadata JSONB DEFAULT '{}',
    response_metadata JSONB DEFAULT '{}',
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'success', -- 'success', 'failed', 'rate_limited'
    error_code VARCHAR(50),
    error_message TEXT,
    
    -- Timestamp
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for llm_usage_logs
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_user_id ON llm_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_provider ON llm_usage_logs(provider);
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_operation_type ON llm_usage_logs(operation_type);
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_created_at ON llm_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_status ON llm_usage_logs(status);

-- Composite index for user billing queries
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_user_period 
    ON llm_usage_logs(user_id, created_at);

-- =============================================
-- Comments
-- =============================================
COMMENT ON TABLE llm_usage_logs IS 'Tracks all LLM API calls for billing, monitoring, and analytics';
COMMENT ON COLUMN llm_usage_logs.provider IS 'LLM provider: openai, anthropic, cohere, etc.';
COMMENT ON COLUMN llm_usage_logs.model IS 'Specific model used: gpt-4o-mini, claude-3-opus, etc.';
COMMENT ON COLUMN llm_usage_logs.operation_type IS 'Type of operation: chat, embedding, classification, transcription';
COMMENT ON COLUMN llm_usage_logs.input_cost IS 'Cost in USD for input tokens';
COMMENT ON COLUMN llm_usage_logs.output_cost IS 'Cost in USD for output tokens';
COMMENT ON COLUMN llm_usage_logs.total_cost IS 'Total cost in USD';
