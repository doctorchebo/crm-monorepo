-- Migration 015: Add message status tracking timestamps
-- 
-- Adds fields to track the lifecycle of message delivery:
-- - sent_at: When message was confirmed sent to WhatsApp
-- - delivered_at: When message reached recipient's device
-- - read_at: When message was read by recipient
-- - failed_reason: Error message if delivery failed
-- - updated_at: Track last status update for efficient querying
--
-- These fields enable the double-tick (✓✓) feature:
-- - One tick: sent_at is set
-- - Two ticks: delivered_at is set
-- - Two blue ticks: read_at is set

-- Add status tracking timestamp columns
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS read_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS failed_reason TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Create index on status and updated_at for efficient status queries
CREATE INDEX IF NOT EXISTS messages_status_updated_at_idx 
ON messages(status, updated_at DESC);

-- Create index on chat_id and timestamp for efficient message retrieval
CREATE INDEX IF NOT EXISTS messages_chat_timestamp_idx 
ON messages(chat_id, timestamp DESC);
