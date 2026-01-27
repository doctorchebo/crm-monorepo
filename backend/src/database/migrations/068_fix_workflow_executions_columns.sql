-- Migration: 068_fix_workflow_executions_columns.sql
-- Description: Add missing columns to workflow_executions table
-- Date: 2026-01-27

-- Add missing columns to workflow_executions table
ALTER TABLE workflow_executions
  ADD COLUMN IF NOT EXISTS trigger_node_id UUID REFERENCES workflow_nodes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trigger_message_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS triggered_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_node_id UUID,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS error_node_id UUID,
  ADD COLUMN IF NOT EXISTS scheduled_resume_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS nodes_executed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_duration_ms INTEGER;

-- Create indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_workflow_exec_scheduled ON workflow_executions(scheduled_resume_at);
CREATE INDEX IF NOT EXISTS idx_workflow_exec_trigger_node ON workflow_executions(trigger_node_id);

-- Add comment
COMMENT ON TABLE workflow_executions IS 'Tracks workflow execution instances with full trigger and timing information';
