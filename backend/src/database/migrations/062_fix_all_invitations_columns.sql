-- Migration: Ensure ALL invitations table columns exist
-- This is a comprehensive fix that adds all columns defined in schema.ts

-- Core columns that should already exist from initial table creation
-- team_id, email, role, invited_by, status (these should already exist)

-- Add invited_by if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invitations' AND column_name = 'invited_by'
    ) THEN
        ALTER TABLE invitations ADD COLUMN invited_by INT NOT NULL REFERENCES users(id);
    END IF;
END $$;

-- Add token if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invitations' AND column_name = 'token'
    ) THEN
        ALTER TABLE invitations ADD COLUMN token TEXT UNIQUE;
    END IF;
END $$;

-- Add token_hash if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invitations' AND column_name = 'token_hash'
    ) THEN
        ALTER TABLE invitations ADD COLUMN token_hash VARCHAR(255);
    END IF;
END $$;

-- Add expires_at if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invitations' AND column_name = 'expires_at'
    ) THEN
        ALTER TABLE invitations ADD COLUMN expires_at TIMESTAMP;
    END IF;
END $$;

-- Add accepted_at if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invitations' AND column_name = 'accepted_at'
    ) THEN
        ALTER TABLE invitations ADD COLUMN accepted_at TIMESTAMP;
    END IF;
END $$;

-- Add email_sent_at if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invitations' AND column_name = 'email_sent_at'
    ) THEN
        ALTER TABLE invitations ADD COLUMN email_sent_at TIMESTAMP;
    END IF;
END $$;

-- Add delivery_status if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invitations' AND column_name = 'delivery_status'
    ) THEN
        ALTER TABLE invitations ADD COLUMN delivery_status VARCHAR(20) DEFAULT 'PENDING';
    END IF;
END $$;

-- Add created_at if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invitations' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE invitations ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
    END IF;
END $$;

-- Backfill any null created_at values
UPDATE invitations SET created_at = NOW() WHERE created_at IS NULL;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_team_id ON invitations(team_id);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);
CREATE INDEX IF NOT EXISTS idx_invitations_delivery_status ON invitations(delivery_status);
