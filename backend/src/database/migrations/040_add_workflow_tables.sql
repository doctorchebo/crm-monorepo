-- Migration: 040_add_workflow_tables
-- Description: Creates workflow system tables for chat stage management, rules, and AI handoff
-- Created: 2026-01-02

-- ============================================================================
-- Workflow Stages Table
-- ============================================================================
-- Defines pipeline stages (e.g., Lead, Interested, Negotiating, Closed)
-- Each user can have their own set of stages

CREATE TABLE IF NOT EXISTS workflow_stages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  color VARCHAR(20) DEFAULT '#3b82f6',
  icon VARCHAR(50),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  is_final BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  -- AI behavior settings for this stage
  ai_auto_reply BOOLEAN DEFAULT true,
  ai_handoff_required BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_stages_user_id ON workflow_stages(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_stages_sort_order ON workflow_stages(sort_order);

-- ============================================================================
-- Workflow Rules Table
-- ============================================================================
-- Defines conditions for automatic stage transitions

CREATE TABLE IF NOT EXISTS workflow_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  from_stage_id UUID REFERENCES workflow_stages(id) ON DELETE CASCADE,
  to_stage_id UUID NOT NULL REFERENCES workflow_stages(id) ON DELETE CASCADE,
  condition_type VARCHAR(50) NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}',
  use_ai_classification BOOLEAN DEFAULT true,
  ai_prompt TEXT,
  confidence_threshold INTEGER DEFAULT 70,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  requires_human_approval BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_rules_user_id ON workflow_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_rules_priority ON workflow_rules(priority);
CREATE INDEX IF NOT EXISTS idx_workflow_rules_condition_type ON workflow_rules(condition_type);

-- ============================================================================
-- Chat Stage Assignments Table
-- ============================================================================
-- Tracks which stage each chat is in and AI pause status
-- This table is used by HandoffService for AI pause/resume functionality

CREATE TABLE IF NOT EXISTS chat_stage_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id VARCHAR(255) NOT NULL UNIQUE,
  stage_id UUID REFERENCES workflow_stages(id) ON DELETE SET NULL,
  -- AI handoff status
  awaiting_handoff BOOLEAN DEFAULT false,
  handoff_requested_at TIMESTAMP WITH TIME ZONE,
  handoff_reason TEXT,
  -- AI pause status
  ai_paused BOOLEAN DEFAULT false,
  ai_paused_at TIMESTAMP WITH TIME ZONE,
  ai_paused_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ai_pause_reason TEXT,
  -- Timestamps
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_stage_assignments_stage_id ON chat_stage_assignments(stage_id);
CREATE INDEX IF NOT EXISTS idx_chat_stage_assignments_handoff ON chat_stage_assignments(awaiting_handoff);
CREATE INDEX IF NOT EXISTS idx_chat_stage_assignments_ai_paused ON chat_stage_assignments(ai_paused);

-- ============================================================================
-- Chat Stage History Table
-- ============================================================================
-- Audit log of all stage transitions

CREATE TABLE IF NOT EXISTS chat_stage_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id VARCHAR(255) NOT NULL,
  from_stage_id UUID REFERENCES workflow_stages(id) ON DELETE SET NULL,
  to_stage_id UUID REFERENCES workflow_stages(id) ON DELETE SET NULL,
  trigger_type VARCHAR(20) NOT NULL,
  trigger_message_id VARCHAR(255),
  triggered_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  rule_id UUID REFERENCES workflow_rules(id) ON DELETE SET NULL,
  ai_classification JSONB,
  ai_confidence INTEGER,
  reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_stage_history_chat_id ON chat_stage_history(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_stage_history_trigger_type ON chat_stage_history(trigger_type);
CREATE INDEX IF NOT EXISTS idx_chat_stage_history_created_at ON chat_stage_history(created_at);

-- ============================================================================
-- Foreign key from chat_stage_assignments to chats (if chats table exists)
-- Using DO block to handle case where chats table might not have chat_id column
-- ============================================================================
DO $$
BEGIN
  -- Try to add foreign key constraint only if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_chat_stage_assignments_chat_id' 
    AND table_name = 'chat_stage_assignments'
  ) THEN
    -- Check if chats table exists and has chat_id column
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'chats' AND column_name = 'chat_id'
    ) THEN
      ALTER TABLE chat_stage_assignments 
      ADD CONSTRAINT fk_chat_stage_assignments_chat_id 
      FOREIGN KEY (chat_id) REFERENCES chats(chat_id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE workflow_stages IS 'Pipeline stages for chat workflow management';
COMMENT ON TABLE workflow_rules IS 'Automatic stage transition rules based on conditions';
COMMENT ON TABLE chat_stage_assignments IS 'Current stage assignment and AI pause status for each chat';
COMMENT ON TABLE chat_stage_history IS 'Audit log of all stage transitions';

COMMENT ON COLUMN workflow_stages.ai_auto_reply IS 'Whether AI can auto-reply when chat is in this stage';
COMMENT ON COLUMN workflow_stages.ai_handoff_required IS 'Whether human review is required for this stage';
COMMENT ON COLUMN chat_stage_assignments.ai_paused IS 'Whether AI responses are paused for this chat';
COMMENT ON COLUMN chat_stage_assignments.awaiting_handoff IS 'Whether chat is waiting for human intervention';
