-- Migration: 071_fix_workflow_nodes_columns.sql
-- Description: Fix workflow_nodes table to match Drizzle schema
-- Date: 2026-01-27

-- Rename 'type' to 'node_type' to match schema
ALTER TABLE workflow_nodes RENAME COLUMN type TO node_type;

-- Rename 'name' to 'label' to match schema
ALTER TABLE workflow_nodes RENAME COLUMN name TO label;

-- Add missing columns from schema
ALTER TABLE workflow_nodes
ADD COLUMN IF NOT EXISTS ai_instructions TEXT,
ADD COLUMN IF NOT EXISTS ai_tone VARCHAR(50),
ADD COLUMN IF NOT EXISTS ai_goal TEXT,
ADD COLUMN IF NOT EXISTS allowed_kb_templates JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS on_error_node_id UUID,
ADD COLUMN IF NOT EXISTS continue_on_error BOOLEAN DEFAULT FALSE;

-- Drop columns that exist in migration but not in schema
-- (width, height, is_entry_point, is_exit_point, metadata are in migration but schema uses different approach)
-- Note: Keeping is_entry_point, is_exit_point as they might be used
-- Dropping width, height, metadata as they're not in schema

-- Actually, let's check schema more carefully - it uses config for these
-- We'll keep existing columns for now and add foreign key for on_error_node_id

-- Add foreign key for on_error_node_id (self-referencing)
-- Note: Can't add FK directly as it might have null values pointing to non-existent nodes
-- ALTER TABLE workflow_nodes ADD CONSTRAINT fk_workflow_nodes_on_error 
--   FOREIGN KEY (on_error_node_id) REFERENCES workflow_nodes(id) ON DELETE SET NULL;

-- Update index to use new column name
DROP INDEX IF EXISTS idx_workflow_nodes_type;
CREATE INDEX IF NOT EXISTS idx_workflow_nodes_node_type ON workflow_nodes(node_type);

-- Add comment
COMMENT ON COLUMN workflow_nodes.node_type IS 'Type of workflow node: trigger, condition, action, delay, branch, sub_workflow, end';
COMMENT ON COLUMN workflow_nodes.ai_instructions IS 'Stage-specific AI behavior instructions';
COMMENT ON COLUMN workflow_nodes.ai_tone IS 'AI tone: friendly, professional, etc.';
COMMENT ON COLUMN workflow_nodes.ai_goal IS 'What the AI should accomplish at this node';
COMMENT ON COLUMN workflow_nodes.allowed_kb_templates IS 'Array of knowledge base template IDs allowed for this node';
