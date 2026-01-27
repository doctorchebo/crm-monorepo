-- Migration: 070_fix_workflows_missing_columns.sql
-- Description: Add missing columns to workflows table that exist in schema but not in DB
-- Date: 2026-01-27

-- Add missing columns to workflows table
ALTER TABLE workflows
ADD COLUMN IF NOT EXISTS is_exclusive BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_executions_per_chat INTEGER,
ADD COLUMN IF NOT EXISTS viewport_x REAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS viewport_y REAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS viewport_zoom REAL DEFAULT 1;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_workflows_priority ON workflows(priority);

-- Add comment
COMMENT ON COLUMN workflows.is_exclusive IS 'Only one workflow per chat at a time';
COMMENT ON COLUMN workflows.priority IS 'Higher = evaluated first when multiple workflows match';
COMMENT ON COLUMN workflows.max_executions_per_chat IS 'Limit re-entries per chat';
