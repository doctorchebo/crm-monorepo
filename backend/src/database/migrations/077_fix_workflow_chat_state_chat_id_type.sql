-- Migration: 077_fix_workflow_chat_state_chat_id_type.sql
-- Description: Fix workflow_chat_state.chat_id column type to allow string chat IDs (e.g. "chat_...")
-- Date: 2026-01-28

-- 1. Alter the column type to VARCHAR(255) to match chats.chatId
ALTER TABLE workflow_chat_state ALTER COLUMN chat_id TYPE VARCHAR(255);

-- 2. Ensure the foreign key constraint exists and is correct
-- First drop it if it exists to be safe and ensure clean state
ALTER TABLE workflow_chat_state DROP CONSTRAINT IF EXISTS workflow_chat_state_chat_id_chats_chat_id_fk;
ALTER TABLE workflow_chat_state DROP CONSTRAINT IF EXISTS workflow_chat_state_chat_id_fkey;

-- Re-add the constraint referencing chats(chat_id)
ALTER TABLE workflow_chat_state
  ADD CONSTRAINT workflow_chat_state_chat_id_chats_chat_id_fk
  FOREIGN KEY (chat_id)
  REFERENCES chats(chat_id)
  ON DELETE CASCADE;
