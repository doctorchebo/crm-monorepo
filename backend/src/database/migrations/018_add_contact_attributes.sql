-- Migration: Add contact_attributes table for custom profile fields
-- This supports arbitrary key-value attributes without schema changes

CREATE TABLE IF NOT EXISTS contact_attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  key VARCHAR(100) NOT NULL,
  value TEXT,
  value_type VARCHAR(20) DEFAULT 'string', -- 'string', 'number', 'date', 'phone', 'email'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_contact_attribute UNIQUE(contact_id, key)
);

-- Index for efficient lookups by contact
CREATE INDEX idx_contact_attributes_contact_id ON contact_attributes(contact_id);

-- Index for searching by key across all contacts
CREATE INDEX idx_contact_attributes_key ON contact_attributes(key);

-- Add email field to contacts table if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contacts' AND column_name = 'email'
  ) THEN
    ALTER TABLE contacts ADD COLUMN email VARCHAR(255);
  END IF;
END $$;
