-- Migration: 067_add_workflow_builder_tables.sql
-- Description: Create visual workflow builder tables for canvas-based workflow definitions
-- Date: 2026-01-27

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Workflow status enum
CREATE TYPE workflow_status AS ENUM ('draft', 'published', 'archived', 'disabled');

-- Workflow node types enum
CREATE TYPE workflow_node_type AS ENUM (
  'trigger',
  'condition', 
  'action',
  'delay',
  'branch',
  'sub_workflow',
  'end'
);

-- Workflow execution status enum
CREATE TYPE workflow_execution_status AS ENUM (
  'running',
  'waiting',
  'completed',
  'failed',
  'cancelled',
  'timeout'
);

-- Execution trigger type enum
CREATE TYPE execution_trigger_type AS ENUM (
  'message',
  'time_based',
  'webhook',
  'manual',
  'tag_added',
  'stage_entered',
  'sub_workflow'
);

-- Connection type enum
CREATE TYPE workflow_connection_type AS ENUM (
  'default',
  'success',
  'failure',
  'timeout',
  'condition_true',
  'condition_false',
  'branch'
);

-- Variable type enum
CREATE TYPE workflow_variable_type AS ENUM (
  'string',
  'number',
  'boolean',
  'array',
  'object',
  'date'
);

-- Variable scope enum
CREATE TYPE workflow_variable_scope AS ENUM (
  'workflow',
  'execution',
  'chat',
  'global'
);

-- ============================================================================
-- TABLES
-- ============================================================================

-- Workflows table - main workflow definitions
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  color VARCHAR(20),
  status workflow_status NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  is_template BOOLEAN NOT NULL DEFAULT FALSE,
  trigger_config JSONB NOT NULL DEFAULT '{}',
  settings JSONB NOT NULL DEFAULT '{}',
  canvas_state JSONB NOT NULL DEFAULT '{}',
  created_by INTEGER NOT NULL REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  published_at TIMESTAMP,
  published_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Indexes for workflows
CREATE INDEX IF NOT EXISTS idx_workflows_team_id ON workflows(team_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_created_by ON workflows(created_by);
CREATE INDEX IF NOT EXISTS idx_workflows_deleted_at ON workflows(deleted_at);

-- Workflow nodes table - individual steps in a workflow
CREATE TABLE IF NOT EXISTS workflow_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  type workflow_node_type NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  position_x REAL NOT NULL DEFAULT 0,
  position_y REAL NOT NULL DEFAULT 0,
  width REAL,
  height REAL,
  is_entry_point BOOLEAN NOT NULL DEFAULT FALSE,
  is_exit_point BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for workflow nodes
CREATE INDEX IF NOT EXISTS idx_workflow_nodes_workflow_id ON workflow_nodes(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_nodes_type ON workflow_nodes(type);
CREATE INDEX IF NOT EXISTS idx_workflow_nodes_is_entry_point ON workflow_nodes(is_entry_point);

-- Workflow connections table - edges between nodes
CREATE TABLE IF NOT EXISTS workflow_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
  source_handle VARCHAR(100),
  target_handle VARCHAR(100),
  type workflow_connection_type NOT NULL DEFAULT 'default',
  label VARCHAR(255),
  condition JSONB,
  priority INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for workflow connections
CREATE INDEX IF NOT EXISTS idx_workflow_connections_workflow_id ON workflow_connections(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_connections_source_node_id ON workflow_connections(source_node_id);
CREATE INDEX IF NOT EXISTS idx_workflow_connections_target_node_id ON workflow_connections(target_node_id);

-- Workflow variables table - workflow-scoped variables
CREATE TABLE IF NOT EXISTS workflow_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type workflow_variable_type NOT NULL DEFAULT 'string',
  scope workflow_variable_scope NOT NULL DEFAULT 'workflow',
  default_value JSONB,
  description TEXT,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  validation JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_workflow_variable_name UNIQUE (workflow_id, name)
);

-- Indexes for workflow variables
CREATE INDEX IF NOT EXISTS idx_workflow_variables_workflow_id ON workflow_variables(workflow_id);

-- Workflow executions table - runtime execution instances
CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  workflow_version INTEGER NOT NULL,
  chat_id VARCHAR(255),
  contact_id UUID,
  trigger_type execution_trigger_type NOT NULL,
  trigger_data JSONB NOT NULL DEFAULT '{}',
  status workflow_execution_status NOT NULL DEFAULT 'running',
  current_node_id UUID REFERENCES workflow_nodes(id) ON DELETE SET NULL,
  variables JSONB NOT NULL DEFAULT '{}',
  context JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  error_details JSONB,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  parent_execution_id UUID REFERENCES workflow_executions(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- Indexes for workflow executions
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_chat_id ON workflow_executions(chat_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_contact_id ON workflow_executions(contact_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_started_at ON workflow_executions(started_at);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_parent_execution_id ON workflow_executions(parent_execution_id);

-- Workflow execution logs table - detailed step-by-step logs
CREATE TABLE IF NOT EXISTS workflow_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  node_id UUID REFERENCES workflow_nodes(id) ON DELETE SET NULL,
  node_name VARCHAR(255),
  node_type workflow_node_type,
  action VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  input JSONB,
  output JSONB,
  error TEXT,
  error_stack TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for workflow execution logs
CREATE INDEX IF NOT EXISTS idx_workflow_execution_logs_execution_id ON workflow_execution_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_workflow_execution_logs_node_id ON workflow_execution_logs(node_id);
CREATE INDEX IF NOT EXISTS idx_workflow_execution_logs_created_at ON workflow_execution_logs(created_at);

-- Workflow chat state table - tracks which workflow is active for each chat
CREATE TABLE IF NOT EXISTS workflow_chat_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id VARCHAR(255) NOT NULL UNIQUE,
  active_workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
  active_execution_id UUID REFERENCES workflow_executions(id) ON DELETE SET NULL,
  current_node_id UUID REFERENCES workflow_nodes(id) ON DELETE SET NULL,
  current_ai_instructions TEXT,
  current_ai_tone VARCHAR(50),
  current_ai_goal TEXT,
  allowed_kb_templates JSONB,
  is_paused BOOLEAN NOT NULL DEFAULT FALSE,
  paused_at TIMESTAMP,
  paused_by INTEGER REFERENCES users(id),
  pause_reason TEXT,
  entered_workflow_at TIMESTAMP,
  last_node_change_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for workflow chat state
CREATE INDEX IF NOT EXISTS idx_workflow_chat_state_chat_id ON workflow_chat_state(chat_id);
CREATE INDEX IF NOT EXISTS idx_workflow_chat_state_active_workflow_id ON workflow_chat_state(active_workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_chat_state_active_execution_id ON workflow_chat_state(active_execution_id);

-- Workflow versions table - version history for rollback
CREATE TABLE IF NOT EXISTS workflow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  change_summary TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_workflow_version UNIQUE (workflow_id, version)
);

-- Indexes for workflow versions
CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow_id ON workflow_versions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_version ON workflow_versions(version);

-- Workflow template categories table
CREATE TABLE IF NOT EXISTS workflow_template_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  icon VARCHAR(50),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Workflow templates table - pre-built workflow templates
CREATE TABLE IF NOT EXISTS workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES workflow_template_categories(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  preview_image_url TEXT,
  definition JSONB NOT NULL,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for workflow templates
CREATE INDEX IF NOT EXISTS idx_workflow_templates_category_id ON workflow_templates(category_id);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_is_featured ON workflow_templates(is_featured);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE workflows IS 'Main workflow definitions for the visual workflow builder';
COMMENT ON TABLE workflow_nodes IS 'Individual nodes/steps in a workflow canvas';
COMMENT ON TABLE workflow_connections IS 'Edges connecting workflow nodes with optional conditions';
COMMENT ON TABLE workflow_variables IS 'Variables defined for use within workflows';
COMMENT ON TABLE workflow_executions IS 'Runtime execution instances of workflows';
COMMENT ON TABLE workflow_execution_logs IS 'Detailed step-by-step execution logs';
COMMENT ON TABLE workflow_chat_state IS 'Tracks active workflow state for each chat';
COMMENT ON TABLE workflow_versions IS 'Version history for workflow rollback';
COMMENT ON TABLE workflow_template_categories IS 'Categories for organizing workflow templates';
COMMENT ON TABLE workflow_templates IS 'Pre-built workflow templates for quick start';

-- ============================================================================
-- DONE
-- ============================================================================

SELECT 'Migration 067_add_workflow_builder_tables completed successfully' as status;
