-- Migration: Add missing teams columns (owner_id, description)
-- The 057 migration was applied before including these fixes

-- Fix teams.owner_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'teams' AND column_name = 'owner_id'
    ) THEN
        ALTER TABLE teams ADD COLUMN owner_id INT REFERENCES users(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- Set owner_id from the first member with 'owner' role for each team
UPDATE teams t
SET owner_id = (
    SELECT tm.user_id 
    FROM team_members tm 
    WHERE tm.team_id = t.id AND tm.role = 'owner' 
    LIMIT 1
)
WHERE t.owner_id IS NULL;

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
