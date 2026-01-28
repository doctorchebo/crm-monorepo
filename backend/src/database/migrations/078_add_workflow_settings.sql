-- Migration: Add team workflow settings table
-- This table stores team-level workflow configuration, including the default workflow
-- to be automatically assigned when customers initiate new conversations.

-- Create team_workflow_settings table
CREATE TABLE IF NOT EXISTS team_workflow_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id INTEGER NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  default_workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for efficient team lookup
CREATE INDEX IF NOT EXISTS idx_team_workflow_settings_team 
  ON team_workflow_settings(team_id);

-- Create index for finding settings by workflow (useful for deletion protection checks)
CREATE INDEX IF NOT EXISTS idx_team_workflow_settings_workflow 
  ON team_workflow_settings(default_workflow_id);

-- Add comment for documentation
COMMENT ON TABLE team_workflow_settings IS 'Stores team-level workflow configuration including default workflow for new customer-initiated chats';
COMMENT ON COLUMN team_workflow_settings.default_workflow_id IS 'The workflow automatically assigned to new chats when customers initiate conversations';
