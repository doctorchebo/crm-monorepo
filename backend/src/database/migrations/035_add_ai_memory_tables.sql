-- Migration: Add AI Memory Tables for Long-term Memory System
-- Description: Creates tables for AI memory storage with Pinecone vector DB integration

-- Enable uuid-ossp extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- AI Memories Table
-- =============================================
-- Stores references to embeddings stored in Pinecone vector DB
-- Links to existing chats and messages tables as source of truth
CREATE TABLE IF NOT EXISTS ai_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- References to source data (existing tables)
    chat_id VARCHAR NOT NULL,
    message_id VARCHAR,  -- Nullable if memory is derived from uploaded content
    
    -- Vector reference (actual vector stored in Pinecone)
    pinecone_id VARCHAR(255) NOT NULL UNIQUE,  -- ID used in Pinecone for this embedding
    
    -- Content used for embedding generation
    content TEXT NOT NULL,
    content_hash VARCHAR(64),  -- SHA-256 hash to detect content changes
    
    -- Metadata for filtering and context
    metadata JSONB NOT NULL DEFAULT '{}',
    -- Expected metadata structure:
    -- {
    --   "user_id": number,
    --   "sender_id": number,
    --   "timestamp": ISO string,
    --   "source": "message" | "note" | "summary",
    --   "content_type": "text" | "media_description" | "document_text",
    --   "direction": "inbound" | "outbound",
    --   "participant_phone": string,
    --   "importance_score": number (0-1)
    -- }
    
    -- Embedding metadata
    embedding_model VARCHAR(100) NOT NULL DEFAULT 'text-embedding-3-large',
    embedding_dimensions INTEGER NOT NULL DEFAULT 3072,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for ai_memories
CREATE INDEX IF NOT EXISTS idx_ai_memories_chat_id ON ai_memories(chat_id);
CREATE INDEX IF NOT EXISTS idx_ai_memories_message_id ON ai_memories(message_id);
CREATE INDEX IF NOT EXISTS idx_ai_memories_pinecone_id ON ai_memories(pinecone_id);
CREATE INDEX IF NOT EXISTS idx_ai_memories_content_hash ON ai_memories(content_hash);
CREATE INDEX IF NOT EXISTS idx_ai_memories_created_at ON ai_memories(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_memories_metadata ON ai_memories USING GIN (metadata);

-- =============================================
-- AI Uploaded Content Table
-- =============================================
-- Stores references to embeddings for user-uploaded documents, images, and media
CREATE TABLE IF NOT EXISTS ai_uploaded_content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Owner reference
    user_id INTEGER NOT NULL,
    
    -- Optional chat context (content can be global or chat-specific)
    chat_id VARCHAR,
    
    -- Content type classification
    type VARCHAR(50) NOT NULL,  -- 'document', 'image', 'audio', 'video'
    
    -- Original file information
    file_name VARCHAR(500),
    file_url TEXT,  -- S3 or storage URL
    file_size INTEGER,  -- Size in bytes
    mime_type VARCHAR(100),
    
    -- Vector reference (actual vector stored in Pinecone)
    pinecone_id VARCHAR(255) NOT NULL UNIQUE,
    
    -- Extracted/processed content used for embedding
    extracted_content TEXT NOT NULL,  -- OCR text, transcription, document content
    content_hash VARCHAR(64),
    
    -- Processing metadata
    metadata JSONB NOT NULL DEFAULT '{}',
    -- Expected metadata structure:
    -- {
    --   "processing_method": "ocr" | "transcription" | "extraction" | "description",
    --   "language": string,
    --   "page_count": number (for documents),
    --   "duration": number (for audio/video),
    --   "image_description": string (for images),
    --   "tags": string[],
    --   "confidence_score": number
    -- }
    
    -- Embedding metadata
    embedding_model VARCHAR(100) NOT NULL DEFAULT 'text-embedding-3-large',
    embedding_dimensions INTEGER NOT NULL DEFAULT 3072,
    
    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed'
    error_message TEXT,  -- Error details if processing failed
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for ai_uploaded_content
CREATE INDEX IF NOT EXISTS idx_ai_uploaded_content_user_id ON ai_uploaded_content(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_uploaded_content_chat_id ON ai_uploaded_content(chat_id);
CREATE INDEX IF NOT EXISTS idx_ai_uploaded_content_type ON ai_uploaded_content(type);
CREATE INDEX IF NOT EXISTS idx_ai_uploaded_content_pinecone_id ON ai_uploaded_content(pinecone_id);
CREATE INDEX IF NOT EXISTS idx_ai_uploaded_content_status ON ai_uploaded_content(status);
CREATE INDEX IF NOT EXISTS idx_ai_uploaded_content_metadata ON ai_uploaded_content USING GIN (metadata);

-- =============================================
-- AI Memory Logs Table
-- =============================================
-- Audit and tracking for all AI memory operations
-- Used for debugging, billing, and monitoring
CREATE TABLE IF NOT EXISTS ai_memory_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Operation tracking
    operation VARCHAR(50) NOT NULL,  -- 'embed', 'store', 'retrieve', 'update', 'delete'
    status VARCHAR(20) NOT NULL,  -- 'success', 'failed', 'partial'
    
    -- Context references
    user_id INTEGER,
    chat_id VARCHAR,
    memory_id UUID,
    uploaded_content_id UUID,
    
    -- Operation details
    request_metadata JSONB DEFAULT '{}',
    -- {
    --   "query": string (for retrieval),
    --   "content_length": number,
    --   "top_k": number (for retrieval),
    --   "filters": object
    -- }
    
    response_metadata JSONB DEFAULT '{}',
    -- {
    --   "results_count": number,
    --   "scores": number[],
    --   "latency_ms": number,
    --   "tokens_used": number
    -- }
    
    -- Error tracking
    error_code VARCHAR(50),
    error_message TEXT,
    error_stack TEXT,
    
    -- Performance metrics
    latency_ms INTEGER,
    tokens_used INTEGER,
    
    -- Billing tracking
    cost_usd DECIMAL(10, 6),  -- Cost in USD for this operation
    
    -- Timestamp
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for ai_memory_logs
CREATE INDEX IF NOT EXISTS idx_ai_memory_logs_operation ON ai_memory_logs(operation);
CREATE INDEX IF NOT EXISTS idx_ai_memory_logs_status ON ai_memory_logs(status);
CREATE INDEX IF NOT EXISTS idx_ai_memory_logs_user_id ON ai_memory_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_memory_logs_chat_id ON ai_memory_logs(chat_id);
CREATE INDEX IF NOT EXISTS idx_ai_memory_logs_created_at ON ai_memory_logs(created_at);

-- Partition strategy note: For production with high volume,
-- consider partitioning ai_memory_logs by created_at (monthly partitions)

-- =============================================
-- Add foreign key constraints
-- =============================================
-- Note: chat_id references chats.chat_id (VARCHAR), not chats.id (serial)
-- message_id references messages.message_id (VARCHAR), not messages.id (serial)

-- We use deferred constraints to allow for flexibility in insertion order
-- and to handle cases where the referenced data may not exist yet

-- Trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_ai_memory_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER trigger_ai_memories_updated_at
    BEFORE UPDATE ON ai_memories
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_memory_timestamp();

CREATE TRIGGER trigger_ai_uploaded_content_updated_at
    BEFORE UPDATE ON ai_uploaded_content
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_memory_timestamp();

-- =============================================
-- Comments for documentation
-- =============================================
COMMENT ON TABLE ai_memories IS 'Stores references to vector embeddings in Pinecone for message-based memories';
COMMENT ON TABLE ai_uploaded_content IS 'Stores references to vector embeddings for user-uploaded content';
COMMENT ON TABLE ai_memory_logs IS 'Audit log for all AI memory operations - used for debugging and billing';

COMMENT ON COLUMN ai_memories.pinecone_id IS 'Unique identifier used to reference this embedding in Pinecone vector DB';
COMMENT ON COLUMN ai_memories.content IS 'The text content that was embedded - stored for debugging and re-embedding';
COMMENT ON COLUMN ai_memories.metadata IS 'JSONB metadata for filtering during vector search';

COMMENT ON COLUMN ai_uploaded_content.extracted_content IS 'Text extracted from uploaded content via OCR, transcription, or parsing';
COMMENT ON COLUMN ai_uploaded_content.status IS 'Processing status: pending, processing, completed, failed';

COMMENT ON COLUMN ai_memory_logs.cost_usd IS 'Estimated cost in USD for billing purposes';
