-- Migration: 072_align_workflow_schema_with_drizzle.sql
-- Description: Align database columns and enums with Drizzle schema definitions
-- Date: 2025-01-27

-- ============================================================================
-- FIX WORKFLOW_CONNECTIONS TABLE
-- ============================================================================

-- Rename columns to match Drizzle schema
ALTER TABLE workflow_connections RENAME COLUMN source_node_id TO from_node_id;
ALTER TABLE workflow_connections RENAME COLUMN target_node_id TO to_node_id;

-- Add missing columns from schema
ALTER TABLE workflow_connections ADD COLUMN IF NOT EXISTS condition_label VARCHAR(100);
ALTER TABLE workflow_connections ADD COLUMN IF NOT EXISTS condition_config JSONB;
ALTER TABLE workflow_connections ADD COLUMN IF NOT EXISTS animated BOOLEAN DEFAULT FALSE;
ALTER TABLE workflow_connections ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Create the workflow_connection_branch enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_connection_branch') THEN
    CREATE TYPE workflow_connection_branch AS ENUM ('default', 'true', 'false', 'timeout', 'error');
  END IF;
END$$;

-- Add branch column (we'll keep 'type' for backward compatibility but add 'branch' as the schema expects)
ALTER TABLE workflow_connections ADD COLUMN IF NOT EXISTS branch workflow_connection_branch DEFAULT 'default';

-- Migrate data from type to branch
UPDATE workflow_connections 
SET branch = CASE 
  WHEN type::text = 'default' THEN 'default'::workflow_connection_branch
  WHEN type::text = 'success' THEN 'true'::workflow_connection_branch
  WHEN type::text = 'failure' THEN 'false'::workflow_connection_branch
  WHEN type::text = 'timeout' THEN 'timeout'::workflow_connection_branch
  WHEN type::text = 'condition_true' THEN 'true'::workflow_connection_branch
  WHEN type::text = 'condition_false' THEN 'false'::workflow_connection_branch
  ELSE 'default'::workflow_connection_branch
END
WHERE branch IS NULL OR branch = 'default'::workflow_connection_branch;

-- Update indexes for renamed columns
DROP INDEX IF EXISTS idx_workflow_connections_source_node_id;
DROP INDEX IF EXISTS idx_workflow_connections_target_node_id;
CREATE INDEX IF NOT EXISTS idx_workflow_connections_from ON workflow_connections(from_node_id);
CREATE INDEX IF NOT EXISTS idx_workflow_connections_to ON workflow_connections(to_node_id);

-- Add unique constraint that schema expects
ALTER TABLE workflow_connections DROP CONSTRAINT IF EXISTS uq_workflow_connection;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_workflow_connection') THEN
    ALTER TABLE workflow_connections ADD CONSTRAINT uq_workflow_connection UNIQUE (from_node_id, to_node_id, branch);
  END IF;
END$$;

-- ============================================================================
-- FIX WORKFLOW_VARIABLES TABLE
-- ============================================================================

-- Add the new variable_type column (keeping old 'type' column for migration)
ALTER TABLE workflow_variables ADD COLUMN IF NOT EXISTS variable_type VARCHAR(50) DEFAULT 'string';

-- Migrate data from old type enum to new varchar column
UPDATE workflow_variables SET variable_type = type::text WHERE variable_type = 'string' AND type IS NOT NULL;

-- Add missing columns from schema
ALTER TABLE workflow_variables ADD COLUMN IF NOT EXISTS is_input BOOLEAN DEFAULT FALSE;
ALTER TABLE workflow_variables ADD COLUMN IF NOT EXISTS is_output BOOLEAN DEFAULT FALSE;

-- Remove columns not in schema (safely)
ALTER TABLE workflow_variables DROP COLUMN IF EXISTS scope;
ALTER TABLE workflow_variables DROP COLUMN IF EXISTS is_required;
ALTER TABLE workflow_variables DROP COLUMN IF EXISTS validation;
ALTER TABLE workflow_variables DROP COLUMN IF EXISTS type;

-- Drop and recreate unique constraint
ALTER TABLE workflow_variables DROP CONSTRAINT IF EXISTS unique_workflow_variable_name;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_workflow_var_name') THEN
    ALTER TABLE workflow_variables ADD CONSTRAINT uq_workflow_var_name UNIQUE (workflow_id, name);
  END IF;
END$$;

-- ============================================================================
-- FIX WORKFLOWS TABLE
-- ============================================================================

-- Add missing columns if they don't exist (some may have been added in migration 070)
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS is_exclusive BOOLEAN DEFAULT TRUE;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS max_executions_per_chat INTEGER;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS viewport_x REAL DEFAULT 0;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS viewport_y REAL DEFAULT 0;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS viewport_zoom REAL DEFAULT 1;

-- Remove columns not in schema
ALTER TABLE workflows DROP COLUMN IF EXISTS is_template;
ALTER TABLE workflows DROP COLUMN IF EXISTS settings;
ALTER TABLE workflows DROP COLUMN IF EXISTS canvas_state;
ALTER TABLE workflows DROP COLUMN IF EXISTS updated_by;
ALTER TABLE workflows DROP COLUMN IF EXISTS published_by;
ALTER TABLE workflows DROP COLUMN IF EXISTS deleted_at;

-- ============================================================================
-- FIX WORKFLOW_NODES TABLE (additional fixes beyond migration 071)
-- ============================================================================

-- Remove columns not in Drizzle schema
ALTER TABLE workflow_nodes DROP COLUMN IF EXISTS width;
ALTER TABLE workflow_nodes DROP COLUMN IF EXISTS height;
ALTER TABLE workflow_nodes DROP COLUMN IF EXISTS is_entry_point;
ALTER TABLE workflow_nodes DROP COLUMN IF EXISTS is_exit_point;
ALTER TABLE workflow_nodes DROP COLUMN IF EXISTS metadata;

-- ============================================================================
-- FIX WORKFLOW_EXECUTIONS TABLE
-- ============================================================================

-- Add missing columns from schema
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS trigger_node_id UUID REFERENCES workflow_nodes(id) ON DELETE SET NULL;
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS trigger_message_id VARCHAR(255);
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS triggered_by INTEGER REFERENCES users(id);
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS parent_node_id UUID;
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS error_node_id UUID;
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS scheduled_resume_at TIMESTAMP;
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS nodes_executed INTEGER DEFAULT 0;
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS total_duration_ms INTEGER;

-- Migrate data from old columns to new
UPDATE workflow_executions SET error_message = error WHERE error IS NOT NULL AND error_message IS NULL;

-- Rename started_at to started_at (already correct name)
-- Add completed_at if missing
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

-- Add new indexes
CREATE INDEX IF NOT EXISTS idx_workflow_exec_scheduled ON workflow_executions(scheduled_resume_at);
CREATE INDEX IF NOT EXISTS idx_workflow_exec_parent ON workflow_executions(parent_execution_id);

-- ============================================================================
-- CREATE MISSING TABLES (with IF NOT EXISTS)
-- ============================================================================

-- Workflow Versions table (may already exist from a partial run)
CREATE TABLE IF NOT EXISTS workflow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  published_by INTEGER REFERENCES users(id),
  snapshot JSONB NOT NULL,
  change_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow ON workflow_versions(workflow_id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_workflow_version') THEN
    ALTER TABLE workflow_versions ADD CONSTRAINT uq_workflow_version UNIQUE (workflow_id, version);
  END IF;
END$$;

-- Workflow Sub-Workflows table
CREATE TABLE IF NOT EXISTS workflow_sub_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
  target_workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  input_mapping JSONB DEFAULT '{}',
  output_mapping JSONB DEFAULT '{}',
  wait_for_completion BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_sub_node_id ON workflow_sub_workflows(node_id);
CREATE INDEX IF NOT EXISTS idx_workflow_sub_target ON workflow_sub_workflows(target_workflow_id);

-- Workflow Chat State table
CREATE TABLE IF NOT EXISTS workflow_chat_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id VARCHAR(255) NOT NULL UNIQUE REFERENCES chats(chat_id) ON DELETE CASCADE,
  active_workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
  active_execution_id UUID REFERENCES workflow_executions(id) ON DELETE SET NULL,
  current_node_id UUID REFERENCES workflow_nodes(id) ON DELETE SET NULL,
  current_ai_instructions TEXT,
  current_ai_tone VARCHAR(50),
  current_ai_goal TEXT,
  allowed_kb_templates JSONB,
  is_paused BOOLEAN DEFAULT FALSE,
  paused_at TIMESTAMP,
  paused_by INTEGER REFERENCES users(id),
  pause_reason TEXT,
  entered_workflow_at TIMESTAMP,
  last_node_change_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_chat_state_workflow ON workflow_chat_state(active_workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_chat_state_execution ON workflow_chat_state(active_execution_id);

-- Workflow Analytics table
CREATE TABLE IF NOT EXISTS workflow_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  period_type VARCHAR(20) NOT NULL,
  total_executions INTEGER DEFAULT 0,
  completed_executions INTEGER DEFAULT 0,
  failed_executions INTEGER DEFAULT 0,
  avg_duration_ms INTEGER,
  unique_chats INTEGER DEFAULT 0,
  chats_completed_goal INTEGER DEFAULT 0,
  node_metrics JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_analytics_workflow_period ON workflow_analytics(workflow_id, period_start);
CREATE INDEX IF NOT EXISTS idx_workflow_analytics_type ON workflow_analytics(period_type);

-- ============================================================================
-- UPDATE ENUMS (add missing values)
-- ============================================================================

-- Add missing values to workflow_status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'active' AND enumtypid = 'workflow_status'::regtype) THEN
    ALTER TYPE workflow_status ADD VALUE 'active';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'paused' AND enumtypid = 'workflow_status'::regtype) THEN
    ALTER TYPE workflow_status ADD VALUE 'paused';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

-- Add missing values to workflow_node_type enum for detailed types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'trigger_message' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'trigger_message';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'trigger_time' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'trigger_time';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'trigger_webhook' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'trigger_webhook';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'trigger_manual' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'trigger_manual';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'trigger_tag' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'trigger_tag';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'trigger_stage_enter' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'trigger_stage_enter';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'condition_ai_classification' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'condition_ai_classification';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'condition_keyword' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'condition_keyword';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'condition_contact_field' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'condition_contact_field';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'condition_time' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'condition_time';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'condition_chat_property' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'condition_chat_property';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'condition_expression' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'condition_expression';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'action_move_stage' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'action_move_stage';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'action_send_template' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'action_send_template';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'action_send_message' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'action_send_message';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'action_assign_agent' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'action_assign_agent';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'action_add_tag' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'action_add_tag';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'action_remove_tag' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'action_remove_tag';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'action_set_field' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'action_set_field';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'action_http_webhook' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'action_http_webhook';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'action_delay' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'action_delay';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'action_pause_ai' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'action_pause_ai';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'action_resume_ai' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'action_resume_ai';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'action_request_handoff' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'action_request_handoff';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'action_send_email' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'action_send_email';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'action_internal_note' AND enumtypid = 'workflow_node_type'::regtype) THEN
    ALTER TYPE workflow_node_type ADD VALUE 'action_internal_note';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

-- Add missing values to execution_trigger_type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'time' AND enumtypid = 'execution_trigger_type'::regtype) THEN
    ALTER TYPE execution_trigger_type ADD VALUE 'time';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'webhook' AND enumtypid = 'execution_trigger_type'::regtype) THEN
    ALTER TYPE execution_trigger_type ADD VALUE 'webhook';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'tag' AND enumtypid = 'execution_trigger_type'::regtype) THEN
    ALTER TYPE execution_trigger_type ADD VALUE 'tag';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'stage_change' AND enumtypid = 'execution_trigger_type'::regtype) THEN
    ALTER TYPE execution_trigger_type ADD VALUE 'stage_change';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;
