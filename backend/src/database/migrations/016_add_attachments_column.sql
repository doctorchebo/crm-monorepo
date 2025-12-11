-- Migration 016: Add attachments column to messages table
--
-- Adds support for storing multiple file attachments per message:
-- - attachments: JSONB array of attachment metadata objects
--   Each attachment includes: id, type, fileName, mimeType, size, s3Key, thumbnailKey, duration, uploadedAt, status, errorMessage
--
-- This column enables the media messaging feature with support for:
-- - Images (jpg, png, gif, webp)
-- - Videos (mp4, mov)
-- - Audio files (mp3, wav, ogg, m4a)
-- - Documents (pdf, doc, docx, xls, xlsx, ppt, pptx)

-- Add attachments JSONB column
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Create index on attachments for efficient queries
CREATE INDEX IF NOT EXISTS messages_attachments_idx 
ON messages USING GIN(attachments);
