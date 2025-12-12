-- Migration: Add message edit and delete tracking
-- Adds fields to messages table to support edit and delete functionality
-- Edited messages can only be edited within 15 minutes of sending
-- Deleted messages will show a placeholder instead of actual content

ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP; -- Timestamp when message was edited
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE; -- Soft delete flag
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP; -- Timestamp when message was deleted
ALTER TABLE messages ADD COLUMN IF NOT EXISTS original_text TEXT; -- Store original text before first edit (for audit trail)

-- Add index for efficient queries on deleted messages
CREATE INDEX IF NOT EXISTS idx_messages_is_deleted ON messages(is_deleted);
