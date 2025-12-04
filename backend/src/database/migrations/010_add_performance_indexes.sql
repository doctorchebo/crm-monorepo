-- Migration: Add recommended indexes for chat matching performance
-- These indexes optimize lookups by participant_phone, business_phone, and active contacts

BEGIN;

-- Index for participant_phone lookups in chats
-- Improves performance when looking up chats by participant phone number
CREATE INDEX IF NOT EXISTS idx_chats_participant_phone ON chats(participant_phone);

-- Index for business_phone lookups in chats
-- Improves performance when filtering chats by business phone number
CREATE INDEX IF NOT EXISTS idx_chats_business_phone ON chats(business_phone);

-- Index for finding active contacts
-- Improves performance when filtering for active contacts only
CREATE INDEX IF NOT EXISTS idx_contacts_is_active ON contacts(is_active);

-- Composite index for faster chat lookups
-- Improves performance when querying by both business_phone and participant_phone
CREATE INDEX IF NOT EXISTS idx_chats_business_participant ON chats(business_phone, participant_phone);

-- Composite index for faster contact lookups
-- Improves performance when looking up active contacts by phone number
CREATE INDEX IF NOT EXISTS idx_contacts_phone_active ON contacts(phone_number, is_active);

COMMIT;
