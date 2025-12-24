-- Migration: Add WABA accounts table and update senders for Meta Embedded Signup
-- This migration enables the Meta Embedded Signup flow for WhatsApp Business accounts

-- Step 1: Create waba_accounts table for WhatsApp Business Account data
CREATE TABLE waba_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  waba_id VARCHAR NOT NULL UNIQUE,
  business_id VARCHAR,
  name VARCHAR,
  currency VARCHAR(10),
  timezone_id VARCHAR(10),
  message_template_namespace VARCHAR,
  account_review_status VARCHAR(20),
  business_verification_status VARCHAR(50),
  access_token TEXT,
  access_token_expires_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  onboarded_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index on user_id for efficient lookups
CREATE INDEX waba_user_id_idx ON waba_accounts(user_id);

-- Step 2: Add new columns to senders table for Meta phone number metadata
ALTER TABLE senders
ADD COLUMN waba_account_id INTEGER REFERENCES waba_accounts(id) ON DELETE SET NULL;

ALTER TABLE senders
ADD COLUMN verified_name VARCHAR;

ALTER TABLE senders
ADD COLUMN code_verification_status VARCHAR(20);

ALTER TABLE senders
ADD COLUMN quality_rating VARCHAR(20);

ALTER TABLE senders
ADD COLUMN messaging_limit VARCHAR(50);

ALTER TABLE senders
ADD COLUMN status VARCHAR(20) DEFAULT 'PENDING';

ALTER TABLE senders
ADD COLUMN name_status VARCHAR(50);

ALTER TABLE senders
ADD COLUMN is_official_business_account BOOLEAN DEFAULT false;

ALTER TABLE senders
ADD COLUMN registered_at TIMESTAMP;

-- Step 3: Remove deprecated Twilio columns from senders table
-- Note: Only drop these columns if they exist (handles idempotent runs)
ALTER TABLE senders
DROP COLUMN IF EXISTS twilio_phone_number_sid;

ALTER TABLE senders
DROP COLUMN IF EXISTS twilio_messaging_service_sid;

ALTER TABLE senders
DROP COLUMN IF EXISTS twilio_account_sid;

ALTER TABLE senders
DROP COLUMN IF EXISTS is_verified;

-- Step 4: Create indexes for new senders columns
CREATE INDEX sender_waba_account_id_idx ON senders(waba_account_id);

-- Step 5: Add comments for documentation
COMMENT ON TABLE waba_accounts IS 'WhatsApp Business Accounts connected via Meta Embedded Signup';
COMMENT ON COLUMN waba_accounts.waba_id IS 'Meta WhatsApp Business Account ID';
COMMENT ON COLUMN waba_accounts.business_id IS 'Meta Business Portfolio ID';
COMMENT ON COLUMN waba_accounts.access_token IS 'Business integration access token for API calls';
COMMENT ON COLUMN senders.waba_account_id IS 'Reference to the WABA this phone number belongs to';
COMMENT ON COLUMN senders.verified_name IS 'Meta-verified business display name';
COMMENT ON COLUMN senders.quality_rating IS 'Phone number quality rating: GREEN, YELLOW, RED, or NA';
COMMENT ON COLUMN senders.status IS 'Phone number status: PENDING, CONNECTED, DISCONNECTED, BANNED';
