-- Migration: Add lastMessageType to chats table
-- Purpose: Store the type of the last message for proper display in chat list
-- (e.g., 'gif', 'sticker', 'image', 'video', 'audio', 'document', 'text')

ALTER TABLE chats
ADD COLUMN IF NOT EXISTS last_message_type VARCHAR(50);

-- Update existing rows to have 'text' as default if they have a last_message
UPDATE chats
SET last_message_type = 'text'
WHERE last_message IS NOT NULL AND last_message_type IS NULL;
