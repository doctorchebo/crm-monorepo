-- Migration: Comprehensive fix for ALL team collaboration and invitation tables
-- This migration ensures ALL tables and columns defined in schema.ts exist in the database
-- It consolidates fixes from migrations 057, 058, 059 and adds missing invitation tables

-- ============================================================================
-- INVITATION_RATE_LIMITS TABLE (from migration 0046 which may not have run)
-- ============================================================================

CREATE TABLE IF NOT EXISTS invitation_rate_limits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    period_type VARCHAR(20) NOT NULL, -- 'hourly' or 'daily'
    period_start TIMESTAMP NOT NULL,
    count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Add unique constraints for rate limit tracking
CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limits_user_period 
ON invitation_rate_limits(user_id, period_type, period_start)
WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limits_team_period 
ON invitation_rate_limits(team_id, period_type, period_start)
WHERE team_id IS NOT NULL;

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_id 
ON invitation_rate_limits(user_id, period_start);

CREATE INDEX IF NOT EXISTS idx_rate_limits_team_id 
ON invitation_rate_limits(team_id, period_start);

-- ============================================================================
-- INVITATIONS TABLE COLUMNS
-- ============================================================================

-- Fix invitations.token
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invitations' AND column_name = 'token'
    ) THEN
        ALTER TABLE invitations ADD COLUMN token TEXT UNIQUE;
    END IF;
END $$;

-- Fix invitations.token_hash
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invitations' AND column_name = 'token_hash'
    ) THEN
        ALTER TABLE invitations ADD COLUMN token_hash VARCHAR(255);
    END IF;
END $$;

-- Fix invitations.expires_at
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invitations' AND column_name = 'expires_at'
    ) THEN
        ALTER TABLE invitations ADD COLUMN expires_at TIMESTAMP;
    END IF;
END $$;

-- Fix invitations.accepted_at
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invitations' AND column_name = 'accepted_at'
    ) THEN
        ALTER TABLE invitations ADD COLUMN accepted_at TIMESTAMP;
    END IF;
END $$;

-- Fix invitations.email_sent_at
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invitations' AND column_name = 'email_sent_at'
    ) THEN
        ALTER TABLE invitations ADD COLUMN email_sent_at TIMESTAMP;
    END IF;
END $$;

-- Fix invitations.delivery_status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invitations' AND column_name = 'delivery_status'
    ) THEN
        ALTER TABLE invitations ADD COLUMN delivery_status VARCHAR(20) DEFAULT 'PENDING';
    END IF;
END $$;

-- ============================================================================
-- INVITATIONS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_team_id ON invitations(team_id);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);
CREATE INDEX IF NOT EXISTS idx_invitations_delivery_status ON invitations(delivery_status);
