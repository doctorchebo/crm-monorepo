-- ============================================================================
-- Migration 090: Unified Audit System
-- ============================================================================
--
-- Enhances the existing activity_logs table to serve as the SINGLE source of
-- truth for ALL audit events across the application. Adds columns for:
--   - category: high-level section grouping (pipeline, contacts, team, etc.)
--   - user_name / entity_name: denormalized for fast reads without joins
--   - description: human-readable summary of the action
--   - changes: JSONB diff of changed fields { field: { from, to } }
--   - chat_id: nullable FK for chat-related events
--
-- Also adds composite indexes optimized for the primary query patterns:
--   - Filter by team + category + date range
--   - Filter by team + user + date range
--   - Entity-specific history lookups
--
-- Backfills category for existing rows based on entity_type and action values.
--
-- This migration is part of the consolidation of three audit tables into one:
--   1. activity_logs (this table - enhanced)
--   2. workflow_activity_logs (deprecated, reads redirected)
--   3. chat_stage_history (deprecated, reads redirected)

-- ============================================================================
-- Step 1: Add new columns to activity_logs
-- ============================================================================

ALTER TABLE activity_logs
  ADD COLUMN IF NOT EXISTS category VARCHAR(50),
  ADD COLUMN IF NOT EXISTS user_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS entity_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS changes JSONB,
  ADD COLUMN IF NOT EXISTS chat_id VARCHAR;

-- Add FK constraint for chat_id (nullable, soft reference)
-- Using a DO block to avoid error if constraint already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_activity_logs_chat_id'
      AND table_name = 'activity_logs'
  ) THEN
    ALTER TABLE activity_logs
      ADD CONSTRAINT fk_activity_logs_chat_id
      FOREIGN KEY (chat_id) REFERENCES chats(chat_id) ON DELETE SET NULL;
  END IF;
END$$;

-- ============================================================================
-- Step 2: Add composite indexes for primary query patterns
-- ============================================================================

-- Primary listing query: filter by team + category + date (DESC for recent-first)
CREATE INDEX IF NOT EXISTS idx_activity_logs_team_category_created
  ON activity_logs (team_id, category, created_at DESC);

-- Member filter query: filter by team + user + date
CREATE INDEX IF NOT EXISTS idx_activity_logs_team_user_created
  ON activity_logs (team_id, user_id, created_at DESC);

-- Category filter (for global audit page category tabs)
CREATE INDEX IF NOT EXISTS idx_activity_logs_category
  ON activity_logs (category);

-- Chat-specific history
CREATE INDEX IF NOT EXISTS idx_activity_logs_chat_id
  ON activity_logs (chat_id)
  WHERE chat_id IS NOT NULL;

-- ============================================================================
-- Step 3: Backfill category for existing rows
-- ============================================================================

-- Pipeline-related actions (workflow stages, chat transitions)
UPDATE activity_logs
SET category = 'pipeline'
WHERE category IS NULL
  AND entity_type IN ('workflow_stage', 'chat', 'chat_lock');

-- Auth-related actions (sign in, sign up, password changes)
UPDATE activity_logs
SET category = 'auth'
WHERE category IS NULL
  AND action IN (
    'sign_in', 'sign_up', 'sign_out',
    'password_changed', 'password_reset_requested', 'password_reset_completed',
    'account_deleted'
  );

-- Team-related actions (invitations, role changes, member management)
UPDATE activity_logs
SET category = 'team'
WHERE category IS NULL
  AND entity_type IN ('team', 'team_member', 'invitation');

-- Message-related actions
UPDATE activity_logs
SET category = 'pipeline'
WHERE category IS NULL
  AND entity_type = 'message';

-- AI config actions
UPDATE activity_logs
SET category = 'pipeline'
WHERE category IS NULL
  AND entity_type = 'ai_config';

-- Note-related actions
UPDATE activity_logs
SET category = 'pipeline'
WHERE category IS NULL
  AND entity_type = 'note';

-- Catch-all: anything remaining gets 'other'
UPDATE activity_logs
SET category = 'other'
WHERE category IS NULL;

-- ============================================================================
-- Step 4: Migrate data from workflow_activity_logs into activity_logs
-- ============================================================================

INSERT INTO activity_logs (
  user_id, team_id, entity_type, entity_id, action, metadata,
  created_at, category, user_name, entity_name, description, changes, chat_id
)
SELECT
  wal.user_id,
  wal.team_id,
  wal.entity_type,
  wal.entity_id,
  wal.activity_type,       -- maps to action
  wal.metadata,
  wal.created_at,
  'pipeline',              -- all workflow activity is pipeline category
  wal.user_name,
  wal.entity_name,
  wal.description,
  CASE
    WHEN wal.previous_state IS NOT NULL OR wal.new_state IS NOT NULL
    THEN jsonb_build_object('previousState', wal.previous_state, 'newState', wal.new_state)
    ELSE NULL
  END,
  wal.chat_id
FROM workflow_activity_logs wal
-- Avoid duplicating rows that might already exist (by checking no matching action+entity+created_at)
WHERE NOT EXISTS (
  SELECT 1 FROM activity_logs al
  WHERE al.action = wal.activity_type
    AND al.entity_id = wal.entity_id
    AND al.created_at = wal.created_at
    AND al.user_id = wal.user_id
);

-- ============================================================================
-- Step 5: Migrate data from chat_stage_history into activity_logs
-- ============================================================================

INSERT INTO activity_logs (
  user_id, team_id, entity_type, entity_id, action, metadata,
  created_at, category, chat_id, description
)
SELECT
  csh.triggered_by,
  -- Resolve team_id from the chat's sender
  (SELECT s.user_id FROM chats c
   JOIN senders s ON c.sender_id = s.id
   WHERE c.chat_id = csh.chat_id
   LIMIT 1),
  'chat',
  csh.id::text,
  'chat_transitioned',
  jsonb_build_object(
    'fromStageId', csh.from_stage_id,
    'toStageId', csh.to_stage_id,
    'triggerType', csh.trigger_type,
    'triggerMessageId', csh.trigger_message_id,
    'ruleId', csh.rule_id,
    'aiClassification', csh.ai_classification,
    'aiConfidence', csh.ai_confidence,
    'reason', csh.reason
  ) || COALESCE(csh.metadata, '{}'::jsonb),
  csh.created_at,
  'pipeline',
  csh.chat_id,
  csh.reason
FROM chat_stage_history csh
WHERE NOT EXISTS (
  SELECT 1 FROM activity_logs al
  WHERE al.action = 'chat_transitioned'
    AND al.chat_id = csh.chat_id
    AND al.created_at = csh.created_at
    AND al.entity_id = csh.id::text
);

-- ============================================================================
-- Step 6: Add comments
-- ============================================================================

COMMENT ON COLUMN activity_logs.category IS 'High-level section grouping: pipeline, contacts, templates, team, catalog, senders, labels, knowledge_base, import, settings, auth';
COMMENT ON COLUMN activity_logs.user_name IS 'Denormalized user display name at time of action (avoids joins)';
COMMENT ON COLUMN activity_logs.entity_name IS 'Denormalized entity display name at time of action';
COMMENT ON COLUMN activity_logs.description IS 'Human-readable summary of the action performed';
COMMENT ON COLUMN activity_logs.changes IS 'JSONB diff of changed fields: { field: { from: oldValue, to: newValue } }';
COMMENT ON COLUMN activity_logs.chat_id IS 'Associated chat ID for chat-related events';
