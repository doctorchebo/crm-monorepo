-- Migration: Add message reactions table
-- Created: 2024-12-31
-- Description: Enables users to react to messages with emojis (like WhatsApp)

-- Create message_reactions table
CREATE TABLE IF NOT EXISTS message_reactions (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR(255) NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one reaction per user per message
    CONSTRAINT unique_user_message_reaction UNIQUE (message_id, user_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_reactions_message_id ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user_id ON message_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_reactions_created_at ON message_reactions(created_at);

-- Add comment for documentation
COMMENT ON TABLE message_reactions IS 'Stores emoji reactions on messages, one reaction per user per message';
COMMENT ON COLUMN message_reactions.message_id IS 'References messages.message_id';
COMMENT ON COLUMN message_reactions.user_id IS 'The user who reacted';
COMMENT ON COLUMN message_reactions.emoji IS 'The emoji character(s) used for reaction';
