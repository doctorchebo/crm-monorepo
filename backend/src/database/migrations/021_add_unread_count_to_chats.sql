-- Migration: Add unread_count to chats table
-- Purpose: Track number of unread inbound messages per chat for real-time notifications

-- Add unread_count column with default value of 0
ALTER TABLE chats ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0;

-- Create index for efficient queries on unread messages
CREATE INDEX IF NOT EXISTS idx_chats_unread_count ON chats (unread_count) WHERE unread_count > 0;

-- Update existing chats to have 0 unread count (already handled by default)
-- This migration is idempotent - can be run multiple times safely
