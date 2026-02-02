-- Migration: Change default for ai_paused to TRUE
-- Purpose: New chats should have AI paused by default (user must explicitly enable)
-- Date: 2026-02-01
-- Related: AI_DEFAULTS.AI_PAUSED in @shared/constants/ai-defaults.ts

-- Update the default value for ai_paused column
-- This ensures any future records created without explicitly setting aiPaused
-- will default to TRUE (paused state)
ALTER TABLE chat_stage_assignments 
ALTER COLUMN ai_paused SET DEFAULT TRUE;

-- Note: This migration does NOT update existing records.
-- Existing chats retain their current ai_paused state.
-- If you need to pause all existing chats, run:
-- UPDATE chat_stage_assignments SET ai_paused = TRUE WHERE ai_paused = FALSE;
