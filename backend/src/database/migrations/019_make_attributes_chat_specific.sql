-- Migration: Make contact_attributes chat-specific
-- Attributes should be per-chat, not per-contact, so the same contact
-- can have different attribute values in different chats (different senders)

-- Add chat_id column to contact_attributes
ALTER TABLE contact_attributes 
ADD COLUMN IF NOT EXISTS chat_id VARCHAR(255);

-- Drop old unique constraint
ALTER TABLE contact_attributes 
DROP CONSTRAINT IF EXISTS unique_contact_attribute;

-- Create new unique constraint including chat_id
-- This allows the same key to exist for a contact across different chats
ALTER TABLE contact_attributes
ADD CONSTRAINT unique_contact_chat_attribute UNIQUE(contact_id, chat_id, key);

-- Add index for efficient lookups by chat
CREATE INDEX IF NOT EXISTS idx_contact_attributes_chat_id ON contact_attributes(chat_id);

-- Note: Existing attributes without chat_id will have NULL chat_id
-- They can be migrated or will remain accessible as "global" attributes
