-- Migration: Simplify schema for single WABA model
-- Remove waba_accounts table and wabaAccountId from senders
-- The SaaS uses a single WABA (META_WABA_ID) configured via environment variables

-- Step 1: Remove the foreign key index from senders
DROP INDEX IF EXISTS sender_waba_account_id_idx;

-- Step 2: Remove the waba_account_id column from senders
ALTER TABLE senders
DROP COLUMN IF EXISTS waba_account_id;

-- Step 3: Drop the waba_accounts table entirely
DROP TABLE IF EXISTS waba_accounts CASCADE;

-- Step 4: Ensure senders has all necessary columns for Meta phone number management
-- These columns may have been added by the previous migration, so use IF NOT EXISTS pattern

-- Add verified_name if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'senders' AND column_name = 'verified_name') THEN
    ALTER TABLE senders ADD COLUMN verified_name VARCHAR;
  END IF;
END $$;

-- Add code_verification_status if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'senders' AND column_name = 'code_verification_status') THEN
    ALTER TABLE senders ADD COLUMN code_verification_status VARCHAR(20);
  END IF;
END $$;

-- Add quality_rating if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'senders' AND column_name = 'quality_rating') THEN
    ALTER TABLE senders ADD COLUMN quality_rating VARCHAR(20);
  END IF;
END $$;

-- Add messaging_limit if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'senders' AND column_name = 'messaging_limit') THEN
    ALTER TABLE senders ADD COLUMN messaging_limit VARCHAR(50);
  END IF;
END $$;

-- Add status if not exists (with default PENDING)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'senders' AND column_name = 'status') THEN
    ALTER TABLE senders ADD COLUMN status VARCHAR(20) DEFAULT 'PENDING';
  END IF;
END $$;

-- Add name_status if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'senders' AND column_name = 'name_status') THEN
    ALTER TABLE senders ADD COLUMN name_status VARCHAR(50);
  END IF;
END $$;

-- Add is_official_business_account if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'senders' AND column_name = 'is_official_business_account') THEN
    ALTER TABLE senders ADD COLUMN is_official_business_account BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Add registered_at if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'senders' AND column_name = 'registered_at') THEN
    ALTER TABLE senders ADD COLUMN registered_at TIMESTAMP;
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN senders.phone_number_id IS 'Meta Cloud API phone number ID - obtained from WABA sync';
COMMENT ON COLUMN senders.verified_name IS 'Meta-verified business display name';
COMMENT ON COLUMN senders.code_verification_status IS 'Phone verification status: NOT_VERIFIED, VERIFIED';
COMMENT ON COLUMN senders.quality_rating IS 'Phone quality rating from Meta: GREEN, YELLOW, RED, NA';
COMMENT ON COLUMN senders.messaging_limit IS 'Messaging tier limit: TIER_1K, TIER_10K, TIER_100K, UNLIMITED';
COMMENT ON COLUMN senders.status IS 'Phone status: PENDING (not synced), CONNECTED (synced & verified), DISCONNECTED, BANNED';
COMMENT ON COLUMN senders.is_official_business_account IS 'Whether this number has Official Business Account (blue checkmark) status';
