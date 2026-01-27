-- Migration: 069_fix_workflow_execution_logs_columns.sql
-- Description: Add missing columns to workflow_execution_logs table to match schema
-- Date: 2026-01-27

-- Add missing columns to workflow_execution_logs table
ALTER TABLE workflow_execution_logs
  ADD COLUMN IF NOT EXISTS condition_result BOOLEAN,
  ADD COLUMN IF NOT EXISTS condition_details JSONB,
  ADD COLUMN IF NOT EXISTS ai_classification JSONB,
  ADD COLUMN IF NOT EXISTS ai_confidence REAL,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMP DEFAULT NOW();

-- Rename existing columns if they have different names
-- Note: Some columns might already exist with different names from the initial migration
-- The schema expects 'error_message' but migration created 'error'
-- We'll add both to be safe

-- Create index for executed_at
CREATE INDEX IF NOT EXISTS idx_workflow_logs_executed_at ON workflow_execution_logs(executed_at);

-- Add comment
COMMENT ON TABLE workflow_execution_logs IS 'Detailed step-by-step execution logs for workflow debugging and analytics';
