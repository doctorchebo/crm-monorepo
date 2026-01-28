-- Migration: 076_fix_workflow_versions_published_by.sql
-- Description: Completely align workflow_versions table with Drizzle schema
-- Date: 2026-01-28
-- 
-- This migration fixes schema mismatches between the original migration (067) and the Drizzle schema.
-- 
-- Original table (migration 067):
--   - created_by INTEGER NOT NULL (Drizzle expects: publishedBy)
--   - change_summary TEXT (Drizzle expects: changeNotes)
--   - snapshot JSONB NOT NULL
--   - workflow_id, version, id, created_at
--
-- Drizzle schema expects:
--   - published_by INTEGER (nullable, references users)
--   - change_notes TEXT
--   - snapshot JSONB NOT NULL
--   - workflow_id, version, id, created_at

-- Step 1: Add the published_by column that Drizzle expects
ALTER TABLE workflow_versions ADD COLUMN IF NOT EXISTS published_by INTEGER REFERENCES users(id);

-- Step 2: Add the change_notes column that Drizzle expects  
ALTER TABLE workflow_versions ADD COLUMN IF NOT EXISTS change_notes TEXT;

-- Step 3: Migrate data from old columns to new columns
UPDATE workflow_versions 
SET published_by = created_by 
WHERE published_by IS NULL AND created_by IS NOT NULL;

UPDATE workflow_versions 
SET change_notes = change_summary 
WHERE change_notes IS NULL AND change_summary IS NOT NULL;

-- Step 4: Make created_by nullable so the Drizzle insert (which only sets published_by) doesn't fail
-- This is the key fix - the NOT NULL constraint was causing the error
ALTER TABLE workflow_versions ALTER COLUMN created_by DROP NOT NULL;

-- Step 5: Rename change_summary to match Drizzle schema (optional - keep both for safety)
-- If you want to drop the old column later, uncomment these:
-- ALTER TABLE workflow_versions DROP COLUMN IF EXISTS change_summary;

-- Verification: List the current columns
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'workflow_versions';

SELECT 'Migration 076_fix_workflow_versions_published_by completed successfully' as status;
