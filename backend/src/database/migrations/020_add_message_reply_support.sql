-- Migration: Add message reply support
-- This migration adds fields to support WhatsApp message replies

-- Add reply_to_message_id column for linking to original message
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS reply_to_message_id varchar NULL;

-- Add reply_preview column for storing snapshot of quoted message
-- Structure: {
--   "message_id": "uuid",
--   "sender_type": "customer" | "agent",
--   "sender_name": "John Doe",
--   "type": "text" | "image" | "video" | "audio" | "document",
--   "text": "Short text excerpt",
--   "media": {
--     "url": "signed_or_cached_url",
--     "mime_type": "image/jpeg",
--     "thumbnail_url": "small_preview_url"
--   },
--   "unavailable": boolean (optional, true if original message is deleted/missing)
-- }
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS reply_preview jsonb NULL;

-- Add index for efficient lookups of replies to a message
CREATE INDEX IF NOT EXISTS idx_messages_reply_to_message_id 
ON messages(reply_to_message_id) 
WHERE reply_to_message_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN messages.reply_to_message_id IS 'References the message_id of the original message being replied to';
COMMENT ON COLUMN messages.reply_preview IS 'Cached snapshot of the original message for fast rendering of quoted replies';
