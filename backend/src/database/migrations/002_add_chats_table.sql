-- Add chats table for conversation metadata
CREATE TABLE IF NOT EXISTS chats (
  id SERIAL PRIMARY KEY,
  chat_id VARCHAR NOT NULL UNIQUE,
  participant_phone VARCHAR NOT NULL,
  business_phone VARCHAR NOT NULL,
  participant_name VARCHAR,
  last_message TEXT,
  last_message_time TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Update messages table to add direction and status columns
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS direction VARCHAR DEFAULT 'inbound',
ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'sent';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_chats_chat_id ON chats(chat_id);
CREATE INDEX IF NOT EXISTS idx_chats_is_active ON chats(is_active);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
