-- Change contact_id from varchar to uuid with auto-generation
-- First, drop the unique constraint
ALTER TABLE contacts DROP CONSTRAINT contacts_contact_id_key;

-- Remove the unique index if it exists
DROP INDEX IF EXISTS contacts_contact_id_key;

-- Drop and recreate the column as uuid with default value
ALTER TABLE contacts 
DROP COLUMN contact_id,
ADD COLUMN contact_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid();
