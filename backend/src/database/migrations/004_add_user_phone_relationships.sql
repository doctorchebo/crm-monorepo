-- Add phoneNumberId to contacts table to link contacts with a specific WhatsApp Business phone
ALTER TABLE contacts
ADD COLUMN phone_number_id INTEGER;

-- Add userId to chats table to link chats with users
ALTER TABLE chats
ADD COLUMN user_id INTEGER;

-- Add foreign key constraint for contacts.phone_number_id -> senders.id
ALTER TABLE contacts
ADD CONSTRAINT contacts_phone_number_id_fkey
FOREIGN KEY (phone_number_id) REFERENCES senders(id) ON DELETE CASCADE;

-- Add foreign key constraint for chats.user_id -> senders.user_id
-- First we need to link chats to users through senders
-- Add a unique index on (user_id, phone_number) in senders if not exists
CREATE UNIQUE INDEX IF NOT EXISTS senders_user_phone_unique ON senders(user_id, phone_number) WHERE is_active = 1;

-- Update existing chats to get user_id from their business_phone
-- This assumes a user has only one business phone for now
UPDATE chats c
SET user_id = (
  SELECT DISTINCT user_id FROM senders s 
  WHERE s.phone_number = c.business_phone 
  LIMIT 1
)
WHERE c.user_id IS NULL;

-- Update existing contacts: if they don't have a phone_number_id, try to infer it
-- For now, we'll leave them NULL since we can't determine the phone_number_id without more context

-- Make columns NOT NULL after data is populated (optional - can keep nullable for backward compatibility)
-- ALTER TABLE contacts ALTER COLUMN phone_number_id SET NOT NULL;
-- ALTER TABLE chats ALTER COLUMN user_id SET NOT NULL;
