-- Drop the existing unique constraint on phone_number
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_phone_number_key;

-- Create a unique index that only applies to active contacts
-- This allows soft-deleted contacts to be overwritten
CREATE UNIQUE INDEX contacts_phone_number_active_idx 
ON contacts(phone_number) 
WHERE is_active = true;
