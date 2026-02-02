-- Migration: Add AI defaults settings to ai_configurations table
-- These columns allow users to configure default AI behavior for new chats
-- 
-- defaultAiRepliesEnabled: Whether AI replies are enabled by default for new chats (default: false)
-- defaultAiPaused: Whether AI is paused by default for new chats when AI replies are enabled (default: true)
--
-- Business Logic:
-- - If defaultAiRepliesEnabled = false: AI is completely off for new chats, defaultAiPaused is ignored
-- - If defaultAiRepliesEnabled = true: AI is enabled, and defaultAiPaused controls whether it starts paused
-- - Default behavior: AI replies OFF (conservative approach - users must explicitly enable)

-- Add default AI behavior columns
ALTER TABLE ai_configurations 
ADD COLUMN IF NOT EXISTS default_ai_replies_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS default_ai_paused BOOLEAN DEFAULT true;

-- Add comment explaining the relationship between these columns
COMMENT ON COLUMN ai_configurations.default_ai_replies_enabled IS 
  'Master switch for AI replies in new chats. When false, AI is completely disabled. When true, AI capability is enabled and default_ai_paused determines initial state.';

COMMENT ON COLUMN ai_configurations.default_ai_paused IS 
  'Default pause state for AI in new chats when AI replies are enabled. When true, AI starts paused and user must manually unpause. Only effective when default_ai_replies_enabled is true.';

-- Update existing rows to have the default values
UPDATE ai_configurations 
SET default_ai_replies_enabled = false, 
    default_ai_paused = true 
WHERE default_ai_replies_enabled IS NULL;
