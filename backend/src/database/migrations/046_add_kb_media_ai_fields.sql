-- Migration: Add AI instructions and AI enabled fields to kb_object_media
-- These fields allow users to provide specific instructions to the AI about when to use each media file

-- Add ai_instructions column - stores custom instructions for AI about when/how to use this media
ALTER TABLE kb_object_media
ADD COLUMN IF NOT EXISTS ai_instructions TEXT;

-- Add ai_enabled column - controls whether AI can send this media
ALTER TABLE kb_object_media
ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN kb_object_media.ai_instructions IS 'Custom instructions for AI about when to send this media. E.g., "Send when customer asks about pricing" or "Only send to interested buyers in the decision stage"';
COMMENT ON COLUMN kb_object_media.ai_enabled IS 'Whether AI is allowed to send this media to customers. Defaults to true.';
