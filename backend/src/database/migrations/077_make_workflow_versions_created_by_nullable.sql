-- Migration: 077_make_workflow_versions_created_by_nullable.sql
-- Description: Make created_by column nullable in workflow_versions to align with Drizzle schema
-- Date: 2026-01-28
-- 
-- Problem:
-- The original migration (067) created workflow_versions with created_by as NOT NULL
-- But the Drizzle schema uses published_by (nullable) and the code doesn't populate created_by
-- This causes: "null value in column created_by violates not-null constraint"
--
-- Solution:
-- Make created_by nullable so inserts using only published_by don't fail

-- Make created_by nullable (the key fix)
ALTER TABLE workflow_versions ALTER COLUMN created_by DROP NOT NULL;

-- Ensure published_by and change_notes columns exist (in case 076 didn't fully run)
ALTER TABLE workflow_versions ADD COLUMN IF NOT EXISTS published_by INTEGER REFERENCES users(id);
ALTER TABLE workflow_versions ADD COLUMN IF NOT EXISTS change_notes TEXT;

-- Migrate any existing data
UPDATE workflow_versions SET published_by = created_by WHERE published_by IS NULL AND created_by IS NOT NULL;
UPDATE workflow_versions SET change_notes = change_summary WHERE change_notes IS NULL AND change_summary IS NOT NULL;

SELECT 'Migration 077_make_workflow_versions_created_by_nullable completed successfully' as status;
