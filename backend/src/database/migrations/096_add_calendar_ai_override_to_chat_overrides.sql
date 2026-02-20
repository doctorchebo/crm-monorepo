-- Migration: Add Calendar AI Override Fields to chat_ai_overrides
-- Description:
--   Adds per-chat calendar AI override fields to chat_ai_overrides table.
--   These allow the global calendar AI settings to be overridden on a per-chat basis.
--   NULL values mean "inherit from global calendar AI settings".

ALTER TABLE chat_ai_overrides
  ADD COLUMN IF NOT EXISTS calendar_ai_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS calendar_can_create_events BOOLEAN,
  ADD COLUMN IF NOT EXISTS calendar_can_modify_events BOOLEAN,
  ADD COLUMN IF NOT EXISTS calendar_can_delete_events BOOLEAN,
  ADD COLUMN IF NOT EXISTS calendar_ai_instructions TEXT;
