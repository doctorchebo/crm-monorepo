-- Migration: 030_add_chat_archive_columns
-- Description: Add is_archived and archived_at columns to chats table for archive functionality
-- Date: 2024-12-29

-- Step 1: Add is_archived column with default value of false
ALTER TABLE chats ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE NOT NULL;

-- Step 2: Add archived_at column (nullable timestamp)
ALTER TABLE chats ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;

-- Step 3: Create index on is_archived for efficient filtering
CREATE INDEX IF NOT EXISTS idx_chats_is_archived ON chats(is_archived);

-- Step 4: Create composite index for common query pattern (user_id + is_archived)
CREATE INDEX IF NOT EXISTS idx_chats_user_is_archived ON chats(user_id, is_archived);
