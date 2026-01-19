-- Migration: Fix missing columns in teams and team_members tables
-- The 056_add_team_collaboration migration used CREATE TABLE IF NOT EXISTS
-- which doesn't add columns if the table already exists.
-- This migration adds the missing columns.

-- Fix team_members.is_active
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'team_members' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE team_members ADD COLUMN is_active BOOLEAN DEFAULT true;
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

-- Fix teams.owner_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'teams' AND column_name = 'owner_id'
    ) THEN
        ALTER TABLE teams ADD COLUMN owner_id INT REFERENCES users(id) ON DELETE RESTRICT;
        -- Set owner_id from the first member with 'owner' role for each team
        UPDATE teams t
        SET owner_id = tm.user_id
        FROM team_members tm
        WHERE tm.team_id = t.id AND tm.role = 'owner' AND t.owner_id IS NULL;
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

-- Create index if not exists
CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON teams(owner_id);
