-- Migration: Add created_at column to invitations table
-- This column was missed in previous migrations

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invitations' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE invitations ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
    END IF;
END $$;

-- Backfill existing rows with current timestamp
UPDATE invitations SET created_at = NOW() WHERE created_at IS NULL;
