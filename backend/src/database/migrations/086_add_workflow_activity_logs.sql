-- Migration: Add Workflow Activity Logs Table
-- Description: Creates the workflow_activity_logs table for tracking user actions
--              in the pipeline/workflow system (stage CRUD, chat transitions, etc.)
--
-- This table serves as a unified audit log for:
-- - Stage create/update/delete operations
-- - Stage reordering
-- - Default stage changes
-- - Chat stage transitions
-- - AI pause/resume actions
-- - Handoff requests and resolutions
--
-- Designed for efficient pagination and date range filtering with:
-- - Composite indexes for team + date queries
-- - Denormalized fields (userName, entityName) for faster reads
-- - JSON fields for flexible state tracking

-- Create the workflow_activity_logs table
CREATE TABLE IF NOT EXISTS workflow_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Team context for multi-tenant filtering
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    -- Who performed the action
    user_id INTEGER NOT NULL REFERENCES users(id),
    user_name VARCHAR(255), -- Denormalized for performance
    -- What type of activity
    activity_type VARCHAR(50) NOT NULL,
    -- Entity references (polymorphic - depends on activity_type)
    entity_type VARCHAR(50) NOT NULL, -- 'stage', 'chat', 'rule', etc.
    entity_id VARCHAR(255) NOT NULL,
    entity_name VARCHAR(255), -- Denormalized for display
    -- Chat context (if activity is chat-related)
    chat_id VARCHAR REFERENCES chats(chat_id) ON DELETE SET NULL,
    -- Description for UI display
    description TEXT,
    -- Additional structured data
    metadata JSONB DEFAULT '{}',
    -- Previous/new state for change tracking
    previous_state JSONB,
    new_state JSONB,
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Add check constraint for activity_type values
ALTER TABLE workflow_activity_logs 
ADD CONSTRAINT chk_workflow_activity_type 
CHECK (activity_type IN (
    'stage_created',
    'stage_updated', 
    'stage_deleted',
    'stage_reordered',
    'stage_default_changed',
    'chat_transitioned',
    'handoff_requested',
    'handoff_resolved',
    'ai_paused',
    'ai_resumed'
));

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_workflow_activity_logs_team_id 
ON workflow_activity_logs(team_id);

CREATE INDEX IF NOT EXISTS idx_workflow_activity_logs_user_id 
ON workflow_activity_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_workflow_activity_logs_activity_type 
ON workflow_activity_logs(activity_type);

CREATE INDEX IF NOT EXISTS idx_workflow_activity_logs_entity 
ON workflow_activity_logs(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_workflow_activity_logs_chat_id 
ON workflow_activity_logs(chat_id);

CREATE INDEX IF NOT EXISTS idx_workflow_activity_logs_created_at 
ON workflow_activity_logs(created_at);

-- Composite index for efficient team + date range queries (primary use case)
CREATE INDEX IF NOT EXISTS idx_workflow_activity_logs_team_created_at 
ON workflow_activity_logs(team_id, created_at DESC);

-- Add table and column comments for documentation
COMMENT ON TABLE workflow_activity_logs IS 'Unified audit log for pipeline/workflow activities - tracks user actions for history displays';
COMMENT ON COLUMN workflow_activity_logs.team_id IS 'Team context for multi-tenant filtering';
COMMENT ON COLUMN workflow_activity_logs.user_id IS 'User who performed the action';
COMMENT ON COLUMN workflow_activity_logs.user_name IS 'Denormalized user name for display performance';
COMMENT ON COLUMN workflow_activity_logs.activity_type IS 'Type of activity (stage_created, stage_updated, etc.)';
COMMENT ON COLUMN workflow_activity_logs.entity_type IS 'Type of entity affected (stage, chat, rule)';
COMMENT ON COLUMN workflow_activity_logs.entity_id IS 'ID of the affected entity';
COMMENT ON COLUMN workflow_activity_logs.entity_name IS 'Denormalized entity name for display performance';
COMMENT ON COLUMN workflow_activity_logs.chat_id IS 'Associated chat ID for chat-related activities';
COMMENT ON COLUMN workflow_activity_logs.description IS 'Human-readable description of the activity';
COMMENT ON COLUMN workflow_activity_logs.metadata IS 'Additional structured data about the activity';
COMMENT ON COLUMN workflow_activity_logs.previous_state IS 'State before the change (for audit trail)';
COMMENT ON COLUMN workflow_activity_logs.new_state IS 'State after the change (for audit trail)';
COMMENT ON COLUMN workflow_activity_logs.created_at IS 'When the activity occurred';
