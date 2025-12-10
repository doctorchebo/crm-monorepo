-- Add senderId column to chats table
-- This tracks which sender number initiated each conversation
-- Allows multiple conversations with same contact via different senders

ALTER TABLE chats ADD COLUMN sender_id INTEGER NOT NULL DEFAULT 1;

-- Create foreign key relationship to senders table
ALTER TABLE chats ADD CONSTRAINT fk_chats_sender_id 
  FOREIGN KEY (sender_id) REFERENCES senders(id) ON DELETE CASCADE;

-- Create index for efficient querying by sender
CREATE INDEX idx_chats_sender_id ON chats(sender_id);

-- Create compound index for filtering chats by user and sender
CREATE INDEX idx_chats_user_sender ON chats(user_id, sender_id);
