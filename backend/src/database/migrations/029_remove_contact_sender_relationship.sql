-- Migration: 029_remove_contact_sender_relationship
-- Description: Remove the contact-sender many-to-many relationship as any sender can now message any contact
-- Date: 2024-12-24

-- Step 1: Drop the contact_senders junction table
DROP TABLE IF EXISTS contact_senders;

-- Step 2: Remove the contactCount column from senders table (no longer needed)
ALTER TABLE senders DROP COLUMN IF EXISTS contact_count;

-- Step 3: Remove the phoneNumberId column from contacts table (was storing primary sender reference)
ALTER TABLE contacts DROP COLUMN IF EXISTS phone_number_id;
