-- Migration: Add pinned messages table
-- Created: 2024-12-31
-- Description: Enables users to pin messages in chats with expiration

-- Create pinned_messages table
CREATE TABLE IF NOT EXISTS pinned_messages (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR(255) NOT NULL,
    chat_id VARCHAR(255) NOT NULL,
    pinned_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pinned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Each message can only be pinned once per chat
    CONSTRAINT unique_message_pin UNIQUE (message_id, chat_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_pinned_messages_chat_id ON pinned_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_pinned_messages_message_id ON pinned_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_pinned_messages_expires_at ON pinned_messages(expires_at);

-- Add comment
COMMENT ON TABLE pinned_messages IS 'Stores pinned messages per chat with expiration (max 3 per chat)';
