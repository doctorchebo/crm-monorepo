-- Migration: Create Knowledge Base Tables
-- Date: 2025-01-01
-- Description: Creates all tables for the knowledge base system including templates,
--              objects, fields, chunks, media, uploads, and retrieval logs.

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Field type enum for template fields
CREATE TYPE kb_field_type AS ENUM (
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
  'key_value'
);

-- AI relevance enum
CREATE TYPE kb_ai_relevance AS ENUM (
  'low',
  'medium',
  'high',
  'critical'
);

-- Object status enum
CREATE TYPE kb_object_status AS ENUM (
  'draft',
  'pending',
  'indexing',
  'indexed',
  'error',
  'archived'
);

-- Chunk status enum
CREATE TYPE kb_chunk_status AS ENUM (
  'pending',
  'processing',
  'embedded',
  'error'
);

-- ============================================================================
-- OBJECT TEMPLATES TABLE
-- ============================================================================

CREATE TABLE kb_object_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  
  -- Template identification
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,
  icon VARCHAR(50) DEFAULT 'file-text',
  color VARCHAR(20) DEFAULT '#3b82f6',
  
  -- Template classification
  category VARCHAR(50) NOT NULL DEFAULT 'custom',
  is_system BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- AI Behavior Metadata
  ai_usage_hints TEXT,
  ai_retrieval_context TEXT,
  supported_intents JSONB DEFAULT '[]',
  fabrication_warnings JSONB DEFAULT '[]',
  priority_score INTEGER DEFAULT 50,
  
  -- Schema version for migrations
  schema_version INTEGER DEFAULT 1,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for object templates
CREATE INDEX idx_kb_templates_slug ON kb_object_templates(slug);
CREATE INDEX idx_kb_templates_user_id ON kb_object_templates(user_id);
CREATE INDEX idx_kb_templates_category ON kb_object_templates(category);
CREATE INDEX idx_kb_templates_is_system ON kb_object_templates(is_system);
CREATE UNIQUE INDEX idx_kb_templates_unique_slug_per_user ON kb_object_templates(user_id, slug);

-- ============================================================================
-- TEMPLATE FIELDS TABLE
-- ============================================================================

CREATE TABLE kb_template_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES kb_object_templates(id) ON DELETE CASCADE,
  
  -- Field identification
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,
  placeholder VARCHAR(255),
  
  -- Field type and validation
  field_type kb_field_type NOT NULL DEFAULT 'short_text',
  is_required BOOLEAN DEFAULT FALSE,
  is_unique BOOLEAN DEFAULT FALSE,
  default_value TEXT,
  
  -- Type-specific configuration
  field_config JSONB DEFAULT '{}',
  validation JSONB DEFAULT '{}',
  
  -- AI-specific settings
  ai_relevance kb_ai_relevance DEFAULT 'medium',
  ai_include_in_embedding BOOLEAN DEFAULT TRUE,
  ai_field_hints TEXT,
  
  -- Display settings
  sort_order INTEGER DEFAULT 0,
  group_name VARCHAR(100),
  is_hidden BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for template fields
CREATE INDEX idx_kb_fields_template_id ON kb_template_fields(template_id);
CREATE INDEX idx_kb_fields_sort_order ON kb_template_fields(sort_order);
CREATE UNIQUE INDEX idx_kb_fields_unique_slug ON kb_template_fields(template_id, slug);

-- ============================================================================
-- KNOWLEDGE OBJECTS TABLE
-- ============================================================================

CREATE TABLE kb_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES kb_object_templates(id) ON DELETE RESTRICT,
  
  -- Object identification
  name VARCHAR(500) NOT NULL,
  slug VARCHAR(500),
  external_id VARCHAR(255),
  
  -- Status and indexing
  status kb_object_status DEFAULT 'draft',
  last_indexed_at TIMESTAMP,
  indexing_error TEXT,
  chunk_count INTEGER DEFAULT 0,
  
  -- Version control
  version INTEGER DEFAULT 1,
  published_at TIMESTAMP,
  
  -- Media tracking
  media_count INTEGER DEFAULT 0,
  file_count INTEGER DEFAULT 0,
  
  -- AI metadata
  ai_summary TEXT,
  ai_tags JSONB DEFAULT '[]',
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  archived_at TIMESTAMP
);

-- Indexes for knowledge objects
CREATE INDEX idx_kb_objects_user_id ON kb_objects(user_id);
CREATE INDEX idx_kb_objects_template_id ON kb_objects(template_id);
CREATE INDEX idx_kb_objects_status ON kb_objects(status);
CREATE INDEX idx_kb_objects_external_id ON kb_objects(external_id);
CREATE INDEX idx_kb_objects_created_at ON kb_objects(created_at);

-- ============================================================================
-- OBJECT FIELD VALUES TABLE
-- ============================================================================

CREATE TABLE kb_object_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id UUID NOT NULL REFERENCES kb_objects(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES kb_template_fields(id) ON DELETE CASCADE,
  
  -- Value storage (JSONB for flexibility)
  value JSONB,
  
  -- For text fields, also store as plain text for full-text search
  text_value TEXT,
  
  -- For numeric fields
  numeric_value INTEGER,
  
  -- For date fields
  date_value TIMESTAMP,
  
  -- For boolean fields
  boolean_value BOOLEAN,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for object field values
CREATE INDEX idx_kb_field_values_object_id ON kb_object_field_values(object_id);
CREATE INDEX idx_kb_field_values_field_id ON kb_object_field_values(field_id);
CREATE UNIQUE INDEX idx_kb_field_values_unique ON kb_object_field_values(object_id, field_id);
CREATE INDEX idx_kb_field_values_text ON kb_object_field_values(text_value);

-- ============================================================================
-- OBJECT MEDIA TABLE
-- ============================================================================

CREATE TABLE kb_object_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id UUID NOT NULL REFERENCES kb_objects(id) ON DELETE CASCADE,
  field_id UUID REFERENCES kb_template_fields(id) ON DELETE SET NULL,
  
  -- File information
  file_name VARCHAR(500) NOT NULL,
  original_file_name VARCHAR(500),
  mime_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,
  
  -- S3 storage
  s3_bucket VARCHAR(100) NOT NULL,
  s3_key VARCHAR(1000) NOT NULL,
  s3_url TEXT,
  
  -- Media type classification
  media_type VARCHAR(50) NOT NULL,
  
  -- For images: dimensions
  width INTEGER,
  height INTEGER,
  
  -- For videos/audio: duration in seconds
  duration INTEGER,
  
  -- Thumbnail for images/videos
  thumbnail_s3_key VARCHAR(1000),
  thumbnail_url TEXT,
  
  -- Content extraction for AI
  extracted_content TEXT,
  extraction_status VARCHAR(20) DEFAULT 'pending',
  extraction_error TEXT,
  
  -- Display order
  sort_order INTEGER DEFAULT 0,
  
  -- Alt text for accessibility
  alt_text VARCHAR(500),
  caption TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for object media
CREATE INDEX idx_kb_media_object_id ON kb_object_media(object_id);
CREATE INDEX idx_kb_media_field_id ON kb_object_media(field_id);
CREATE INDEX idx_kb_media_type ON kb_object_media(media_type);
CREATE INDEX idx_kb_media_sort_order ON kb_object_media(sort_order);

-- ============================================================================
-- OBJECT CHUNKS TABLE (with pgvector)
-- ============================================================================

CREATE TABLE kb_object_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id UUID NOT NULL REFERENCES kb_objects(id) ON DELETE CASCADE,
  
  -- Chunk identification
  chunk_index INTEGER NOT NULL,
  chunk_type VARCHAR(50) NOT NULL DEFAULT 'content',
  
  -- Content
  content TEXT NOT NULL,
  content_hash VARCHAR(64),
  token_count INTEGER,
  
  -- Vector embedding using pgvector
  embedding vector(3072),
  
  -- Source tracking
  source_field_ids JSONB DEFAULT '[]',
  source_media_id UUID REFERENCES kb_object_media(id) ON DELETE SET NULL,
  
  -- Status
  status kb_chunk_status DEFAULT 'pending',
  error_message TEXT,
  
  -- Embedding metadata
  embedding_model VARCHAR(100) DEFAULT 'text-embedding-3-large',
  embedding_dimensions INTEGER DEFAULT 3072,
  embedded_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for object chunks
CREATE INDEX idx_kb_chunks_object_id ON kb_object_chunks(object_id);
CREATE INDEX idx_kb_chunks_type ON kb_object_chunks(chunk_type);
CREATE INDEX idx_kb_chunks_status ON kb_object_chunks(status);
CREATE INDEX idx_kb_chunks_content_hash ON kb_object_chunks(content_hash);
CREATE UNIQUE INDEX idx_kb_chunks_unique ON kb_object_chunks(object_id, chunk_index);

-- ============================================================================
-- UNSTRUCTURED UPLOADS TABLE
-- ============================================================================

CREATE TABLE kb_unstructured_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Optional link to object (if assigned)
  object_id UUID REFERENCES kb_objects(id) ON DELETE SET NULL,
  
  -- File information
  file_name VARCHAR(500) NOT NULL,
  original_file_name VARCHAR(500),
  mime_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,
  
  -- S3 storage
  s3_bucket VARCHAR(100) NOT NULL,
  s3_key VARCHAR(1000) NOT NULL,
  s3_url TEXT,
  
  -- Content extraction
  extracted_content TEXT,
  extracted_structure JSONB,
  content_hash VARCHAR(64),
  
  -- Processing status
  processing_status VARCHAR(20) DEFAULT 'pending',
  processing_error TEXT,
  processed_at TIMESTAMP,
  
  -- Suggested template/object mapping
  suggested_template_id UUID REFERENCES kb_object_templates(id),
  suggested_field_mappings JSONB,
  
  -- For bulk uploads, track the batch
  batch_id UUID,
  batch_file_name VARCHAR(500),
  row_index INTEGER,
  
  -- Vector embedding for standalone retrieval
  embedding vector(3072),
  embedding_status VARCHAR(20) DEFAULT 'pending',
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for unstructured uploads
CREATE INDEX idx_kb_uploads_user_id ON kb_unstructured_uploads(user_id);
CREATE INDEX idx_kb_uploads_object_id ON kb_unstructured_uploads(object_id);
CREATE INDEX idx_kb_uploads_status ON kb_unstructured_uploads(processing_status);
CREATE INDEX idx_kb_uploads_batch_id ON kb_unstructured_uploads(batch_id);
CREATE INDEX idx_kb_uploads_content_hash ON kb_unstructured_uploads(content_hash);

-- ============================================================================
-- BULK IMPORT BATCHES TABLE
-- ============================================================================

CREATE TABLE kb_bulk_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES kb_object_templates(id) ON DELETE RESTRICT,
  
  -- File information
  file_name VARCHAR(500) NOT NULL,
  file_type VARCHAR(20) NOT NULL,
  s3_key VARCHAR(1000),
  
  -- Field mappings (column -> field)
  field_mappings JSONB NOT NULL,
  
  -- Processing stats
  total_rows INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending',
  error_log JSONB DEFAULT '[]',
  
  -- Timestamps
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for bulk import batches
CREATE INDEX idx_kb_batches_user_id ON kb_bulk_import_batches(user_id);
CREATE INDEX idx_kb_batches_template_id ON kb_bulk_import_batches(template_id);
CREATE INDEX idx_kb_batches_status ON kb_bulk_import_batches(status);

-- ============================================================================
-- RETRIEVAL LOGS TABLE (with pgvector)
-- ============================================================================

CREATE TABLE kb_retrieval_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER REFERENCES users(id),
  chat_id VARCHAR(255),
  message_id VARCHAR(255),
  
  -- Query information
  query_text TEXT NOT NULL,
  query_vector vector(3072),
  
  -- Retrieval results
  retrieved_object_ids JSONB DEFAULT '[]',
  retrieved_chunk_ids JSONB DEFAULT '[]',
  similarity_scores JSONB DEFAULT '[]',
  
  -- Retrieval settings used
  top_k INTEGER,
  min_similarity INTEGER,
  filter_template_ids JSONB,
  
  -- Performance
  latency_ms INTEGER,
  total_results INTEGER,
  
  -- Feedback (for learning)
  was_helpful BOOLEAN,
  feedback_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for retrieval logs
CREATE INDEX idx_kb_retrieval_user_id ON kb_retrieval_logs(user_id);
CREATE INDEX idx_kb_retrieval_chat_id ON kb_retrieval_logs(chat_id);
CREATE INDEX idx_kb_retrieval_created_at ON kb_retrieval_logs(created_at);

-- ============================================================================
-- TEST QUERIES TABLE
-- ============================================================================

CREATE TABLE kb_test_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Query information
  name VARCHAR(200),
  query TEXT NOT NULL,
  
  -- Expected results (for testing)
  expected_object_ids JSONB DEFAULT '[]',
  
  -- Last execution
  last_response TEXT,
  last_retrieved_objects JSONB,
  last_executed_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for test queries
CREATE INDEX idx_kb_test_queries_user_id ON kb_test_queries(user_id);

-- ============================================================================
-- VECTOR INDEXES (for similarity search)
-- Note: pgvector indexes (HNSW and IVFFlat) have a 2000 dimension limit.
-- Embeddings use 3072 dimensions (text-embedding-3-large).
-- Queries will use sequential scan with exact results.
-- This is performant for datasets under 100k vectors.
-- ============================================================================

-- Placeholder to confirm migration complete
SELECT 1;
