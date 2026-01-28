-- Migration: Add soft delete support to workflows table
-- This adds a deleted_at timestamp field for proper soft delete functionality
-- When a workflow is deleted, we set deleted_at instead of changing status
-- This allows archived workflows to still be visible while deleted ones are hidden

-- Add deleted_at column
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Create index for efficient filtering of non-deleted workflows
CREATE INDEX IF NOT EXISTS idx_workflows_deleted_at ON workflows (deleted_at);

-- Create partial index for active (non-deleted) workflows - more efficient queries
CREATE INDEX IF NOT EXISTS idx_workflows_active ON workflows (team_id, status) WHERE deleted_at IS NULL;
