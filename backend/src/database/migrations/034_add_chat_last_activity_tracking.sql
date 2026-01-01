-- Migration: Add chat last activity tracking
-- This adds columns to track the most recent activity in a chat
-- Activity can be either a message or a reaction
-- This enables the chat list to show "Reacted 👍 to: <message>" previews

-- Add last activity tracking columns to chats table
ALTER TABLE chats
ADD COLUMN IF NOT EXISTS last_activity_type VARCHAR(20) DEFAULT 'message',
ADD COLUMN IF NOT EXISTS last_reaction_emoji VARCHAR(50),
ADD COLUMN IF NOT EXISTS last_reaction_is_own BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_reacted_message_preview TEXT;

-- Add index for faster activity-based sorting (commonly used in chat list)
CREATE INDEX IF NOT EXISTS idx_chats_last_activity_type ON chats(last_activity_type);

-- Comment on new columns
COMMENT ON COLUMN chats.last_activity_type IS 'Type of last activity: message or reaction';
COMMENT ON COLUMN chats.last_reaction_emoji IS 'Emoji used in the last reaction (when last_activity_type = reaction)';
COMMENT ON COLUMN chats.last_reaction_is_own IS 'True if CRM user reacted, false if customer reacted';
COMMENT ON COLUMN chats.last_reacted_message_preview IS 'Preview of the message that was reacted to';
