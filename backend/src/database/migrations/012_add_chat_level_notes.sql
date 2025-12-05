/**
 * Database Migration: Add chat_id to notes table
 * 
 * This migration adds support for chat-level notes in addition to message-level notes.
 * - Adds optional chat_id column
 * - Makes message_id nullable (either messageId OR chatId, but not both)
 * - Adds indexes for performance
 */

-- Make message_id nullable to allow chat-level notes
ALTER TABLE notes 
  ALTER COLUMN message_id DROP NOT NULL;

-- Add chat_id column for chat-level notes
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS chat_id VARCHAR;

-- Add foreign key constraint for chat_id
ALTER TABLE notes
  ADD CONSTRAINT fk_notes_chat_id 
  FOREIGN KEY (chat_id) REFERENCES chats(chat_id)
  ON DELETE CASCADE;

-- Add index on chat_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_notes_chat_id ON notes(chat_id);

-- Create a partial index for general chat notes (where message_id is NULL)
CREATE INDEX IF NOT EXISTS idx_notes_general_chat_notes 
  ON notes(chat_id) 
  WHERE message_id IS NULL;
