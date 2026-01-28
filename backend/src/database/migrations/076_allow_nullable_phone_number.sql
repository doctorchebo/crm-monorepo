-- Migration: Allow nullable phone_number for email-only contacts
-- This migration makes phone_number nullable to support importing contacts
-- that only have an email address (no phone number).

-- ============================================================================
-- IMPORTANT: This migration is NON-DESTRUCTIVE
-- ============================================================================

-- 1. Make phone_number column nullable
-- This allows email-only contacts to be stored without a phone number
ALTER TABLE contacts ALTER COLUMN phone_number DROP NOT NULL;

-- 2. Drop the existing partial unique index on phone_number
DROP INDEX IF EXISTS contacts_phone_number_active_idx;

-- 3. Create a new partial unique index that:
--    - Only applies to active contacts (is_active = true)
--    - Only applies to non-null phone numbers
--    This allows:
--    - Multiple email-only contacts (all with NULL phone_number)
--    - Only one active contact per phone number
CREATE UNIQUE INDEX contacts_phone_number_active_idx 
ON contacts(phone_number) 
WHERE is_active = true AND phone_number IS NOT NULL;

-- 4. Add a unique index for email to prevent duplicate email-only contacts
-- Only applies to active contacts with non-null email and null phone_number
CREATE UNIQUE INDEX contacts_email_only_active_idx
ON contacts(email)
WHERE is_active = true AND phone_number IS NULL AND email IS NOT NULL;
