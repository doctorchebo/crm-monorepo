-- Add contacts table for managing WhatsApp contacts
CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  contact_id VARCHAR UNIQUE NOT NULL,
  first_name VARCHAR NOT NULL,
  last_name VARCHAR,
  country_code VARCHAR NOT NULL,
  phone_number VARCHAR UNIQUE NOT NULL,
  twilio_contact_id VARCHAR,
  last_message_time TIMESTAMP,
  last_message_preview TEXT,
  last_message_type VARCHAR,
  avatar TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_contacts_phone_number ON contacts(phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_contact_id ON contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_contacts_is_active ON contacts(is_active);
