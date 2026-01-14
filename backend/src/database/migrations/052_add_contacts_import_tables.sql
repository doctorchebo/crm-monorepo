-- Migration: Add contacts import tables
-- This migration creates the infrastructure for bulk contact imports
-- via CSV/XLSX files with staging, validation, and rollback support.

-- ============================================================================
-- IMPORTANT: This migration is NON-DESTRUCTIVE
-- ============================================================================

-- 1. Create import_jobs table
CREATE TABLE IF NOT EXISTS import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'UPLOADED',
    original_filename TEXT,
    s3_key TEXT,
    total_rows INTEGER DEFAULT 0,
    valid_rows INTEGER DEFAULT 0,
    invalid_rows INTEGER DEFAULT 0,
    duplicate_rows INTEGER DEFAULT 0,
    field_mapping JSONB,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for import_jobs
CREATE INDEX IF NOT EXISTS idx_import_jobs_user_id ON import_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at ON import_jobs(created_at);

-- 2. Create import_contacts_staging table
-- CRITICAL: All imported contacts must flow through staging first
CREATE TABLE IF NOT EXISTS import_contacts_staging (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_job_id UUID NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    raw_data JSONB NOT NULL,
    mapped_data JSONB,
    validation_errors JSONB DEFAULT '[]',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    row_number INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for import_contacts_staging
CREATE INDEX IF NOT EXISTS idx_import_staging_job_id ON import_contacts_staging(import_job_id);
CREATE INDEX IF NOT EXISTS idx_import_staging_status ON import_contacts_staging(status);

-- 3. Create import_mapping_profiles table
-- Allows users to save and reuse column mapping configurations
CREATE TABLE IF NOT EXISTS import_mapping_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_name TEXT NOT NULL,
    mapping JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for import_mapping_profiles
CREATE INDEX IF NOT EXISTS idx_import_profiles_user_id ON import_mapping_profiles(user_id);

-- 4. Add reversibility columns to contacts table
-- These enable tracking import source and supporting rollback operations
ALTER TABLE contacts 
    ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'MANUAL';

ALTER TABLE contacts 
    ADD COLUMN IF NOT EXISTS import_job_id UUID;

-- Index for fast rollback queries (find all contacts from a specific import)
CREATE INDEX IF NOT EXISTS idx_contacts_import_job_id ON contacts(import_job_id);

-- Note: We intentionally do NOT add a foreign key from contacts.import_job_id to import_jobs.id
-- This allows import_jobs to be deleted without affecting the imported contacts.
-- Rollback is handled at the application level by querying contacts by import_job_id.

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE import_jobs IS 'Tracks contact import job lifecycle from upload to completion';
COMMENT ON TABLE import_contacts_staging IS 'Staging table for imported contacts - all imports flow through here before final import';
COMMENT ON TABLE import_mapping_profiles IS 'Saved column mappings for reusable import configurations';
COMMENT ON COLUMN contacts.source IS 'How the contact was created: MANUAL, IMPORT, or API';
COMMENT ON COLUMN contacts.import_job_id IS 'References the import job that created this contact (for rollback support)';
