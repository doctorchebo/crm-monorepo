-- Migration: Comprehensive fix for all missing team collaboration columns
-- This migration ensures ALL columns defined in schema.ts exist in the database
-- It handles the case where tables were created before the team collaboration migration

-- ============================================================================
-- TEAMS TABLE
-- ============================================================================

-- Fix teams.owner_id (should already exist from 058, but ensure it)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'teams' AND column_name = 'owner_id'
    ) THEN
        ALTER TABLE teams ADD COLUMN owner_id INT REFERENCES users(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- Fix teams.description
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'teams' AND column_name = 'description'
    ) THEN
        ALTER TABLE teams ADD COLUMN description TEXT;
    END IF;
END $$;

-- Fix teams.is_active
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'teams' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE teams ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Fix teams.created_at
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'teams' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE teams ADD COLUMN created_at TIMESTAMP DEFAULT now();
    END IF;
END $$;

-- Fix teams.updated_at
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'teams' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE teams ADD COLUMN updated_at TIMESTAMP DEFAULT now();
    END IF;
END $$;

-- ============================================================================
-- TEAM_MEMBERS TABLE
-- ============================================================================

-- Fix team_members.role
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'team_members' AND column_name = 'role'
    ) THEN
        ALTER TABLE team_members ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'agent';
    END IF;
END $$;

-- Fix team_members.joined_at
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'team_members' AND column_name = 'joined_at'
    ) THEN
        ALTER TABLE team_members ADD COLUMN joined_at TIMESTAMP DEFAULT now();
    END IF;
END $$;

-- Fix team_members.invited_by
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'team_members' AND column_name = 'invited_by'
    ) THEN
        ALTER TABLE team_members ADD COLUMN invited_by INT REFERENCES users(id);
    END IF;
END $$;

-- Fix team_members.is_active (should already exist from 057, but ensure it)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'team_members' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE team_members ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- ============================================================================
-- SET OWNER_ID FROM TEAM_MEMBERS IF NULL
-- ============================================================================

-- Set owner_id from the first member with 'owner' role for each team
UPDATE teams t
SET owner_id = (
    SELECT tm.user_id 
    FROM team_members tm 
    WHERE tm.team_id = t.id AND tm.role = 'owner' 
    LIMIT 1
)
WHERE t.owner_id IS NULL;

-- ============================================================================
-- CREATE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_role ON team_members(role);
