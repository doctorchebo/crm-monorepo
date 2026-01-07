-- Migration: Add interactive message metadata column
-- Purpose: Store interactive button/list message data for rendering in UI

-- Add metadata JSONB column to messages table
-- This stores interactive message data (buttons, lists) and other extensible metadata
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN messages.metadata IS 'Stores interactive message data (buttons, lists) and other extensible metadata. Structure: { interactiveType?: "button"|"list", interactiveData?: { buttons?: [], sections?: [], footerText?: string, headerText?: string } }';

-- Create index for efficient queries on interactive messages
CREATE INDEX IF NOT EXISTS idx_messages_metadata_interactive_type 
ON messages ((metadata->>'interactiveType'))
WHERE metadata->>'interactiveType' IS NOT NULL;
