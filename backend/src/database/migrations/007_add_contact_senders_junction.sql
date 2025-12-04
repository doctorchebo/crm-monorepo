-- Add new columns to senders table and create contact_senders junction table

-- Step 1: Add new columns to senders table
ALTER TABLE senders
ADD COLUMN display_name VARCHAR;

ALTER TABLE senders
ADD COLUMN twilio_account_sid VARCHAR;

ALTER TABLE senders
ADD COLUMN is_verified BOOLEAN DEFAULT false;

ALTER TABLE senders
ADD COLUMN contact_count INTEGER DEFAULT 0;

ALTER TABLE senders
ADD COLUMN last_used_at TIMESTAMP;

-- Step 2: Add unique constraint on phone_number
ALTER TABLE senders
ADD CONSTRAINT senders_phone_number_key UNIQUE (phone_number);

-- Step 3: Create contact_senders junction table
CREATE TABLE contact_senders (
  id SERIAL PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES senders(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  added_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contact_id, sender_id)
);

-- Step 4: Migrate existing relationships from contacts.phone_number_id to contact_senders
INSERT INTO contact_senders (contact_id, sender_id, is_primary)
SELECT c.contact_id, c.phone_number_id, true 
FROM contacts c 
WHERE c.phone_number_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Step 5: Update contact_count for each sender based on contact_senders
UPDATE senders 
SET contact_count = (
  SELECT COUNT(DISTINCT contact_id) 
  FROM contact_senders 
  WHERE sender_id = senders.id
);
