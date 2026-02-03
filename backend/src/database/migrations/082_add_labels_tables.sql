-- ============================================================================
-- Labels Feature Migration
-- 
-- Creates tables for chat labels (tags) to allow users to organize and
-- filter chats by color-coded labels.
--
-- Tables:
-- - labels: Team-scoped label definitions with colors and emoji icons
-- - chat_labels: Junction table linking chats to labels (M:N relationship)
--
-- Default labels are seeded based on workflow template tag actions to ensure
-- workflow automation works correctly out of the box.
-- ============================================================================

-- ============================================================================
-- LABELS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) NOT NULL DEFAULT '#6366f1', -- Default indigo color
    emoji VARCHAR(50), -- Optional emoji icon
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE, -- System labels cannot be deleted (from workflow templates)
    sort_order INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(team_id, name)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_labels_team_id ON labels(team_id);
CREATE INDEX IF NOT EXISTS idx_labels_is_system ON labels(is_system);
CREATE INDEX IF NOT EXISTS idx_labels_sort_order ON labels(team_id, sort_order);

-- Comments
COMMENT ON TABLE labels IS 'Team-scoped labels for organizing chats with colors and optional emoji icons';
COMMENT ON COLUMN labels.is_system IS 'System labels are auto-created for workflow templates and cannot be deleted';

-- ============================================================================
-- CHAT LABELS JUNCTION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id VARCHAR NOT NULL REFERENCES chats(chat_id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    applied_by INTEGER REFERENCES users(id) ON DELETE SET NULL, -- User who applied the label (null if by workflow)
    applied_by_workflow_id UUID, -- Workflow that applied the label (if applicable)
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(chat_id, label_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_chat_labels_chat_id ON chat_labels(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_labels_label_id ON chat_labels(label_id);
CREATE INDEX IF NOT EXISTS idx_chat_labels_applied_by ON chat_labels(applied_by);

-- Comments
COMMENT ON TABLE chat_labels IS 'Junction table linking chats to labels (many-to-many relationship)';

-- ============================================================================
-- UPDATE WORKFLOW TEMPLATES: RENAME "TAG" TO "LABEL" IN NODE LABELS
-- ============================================================================

-- Update workflow template definitions to use "Label" wording instead of "Tag"
-- This normalizes the terminology across the system

UPDATE workflow_templates 
SET definition = REPLACE(definition::text, '"label":"Tag as Qualified"', '"label":"Label as Qualified"')::jsonb,
    updated_at = NOW()
WHERE definition::text LIKE '%"label":"Tag as Qualified"%';

UPDATE workflow_templates 
SET definition = REPLACE(definition::text, '"label":"Tag as Urgent"', '"label":"Label as Urgent"')::jsonb,
    updated_at = NOW()
WHERE definition::text LIKE '%"label":"Tag as Urgent"%';

UPDATE workflow_templates 
SET definition = REPLACE(definition::text, '"label":"Tag Complaint"', '"label":"Label as Complaint"')::jsonb,
    updated_at = NOW()
WHERE definition::text LIKE '%"label":"Tag Complaint"%';

UPDATE workflow_templates 
SET definition = REPLACE(definition::text, '"label":"Tag for Follow-up"', '"label":"Label for Follow-up"')::jsonb,
    updated_at = NOW()
WHERE definition::text LIKE '%"label":"Tag for Follow-up"%';

UPDATE workflow_templates 
SET definition = REPLACE(definition::text, '"label":"Tag New Contact"', '"label":"Label as New Contact"')::jsonb,
    updated_at = NOW()
WHERE definition::text LIKE '%"label":"Tag New Contact"%';

-- Also update descriptions that mention "tag"
UPDATE workflow_templates 
SET definition = REPLACE(definition::text, '"description":"Add qualified lead tag"', '"description":"Add qualified lead label"')::jsonb,
    updated_at = NOW()
WHERE definition::text LIKE '%"description":"Add qualified lead tag"%';

-- ============================================================================
-- DEFAULT SYSTEM LABELS
-- These are created per-team when a team is created.
-- For existing teams, we'll create them via a function that can be called.
-- ============================================================================

-- Function to create default labels for a team
-- This function extracts label names from workflow template definitions
CREATE OR REPLACE FUNCTION create_default_labels_for_team(p_team_id INTEGER)
RETURNS void AS $$
DECLARE
    v_label_colors TEXT[] := ARRAY[
        '#ef4444', -- red - qualified-lead
        '#f97316', -- orange - urgent-support  
        '#eab308', -- yellow - complaint
        '#22c55e', -- green - new-contact
        '#3b82f6', -- blue - negative-feedback
        '#8b5cf6', -- violet - after-hours-message
        '#ec4899', -- pink
        '#06b6d4', -- cyan
        '#14b8a6', -- teal
        '#84cc16'  -- lime
    ];
BEGIN
    -- Insert default labels based on workflow template tag names
    -- Only insert if they don't already exist for this team
    
    INSERT INTO labels (team_id, name, color, is_system, sort_order, created_at, updated_at)
    VALUES 
        (p_team_id, 'qualified-lead', v_label_colors[1], true, 1, NOW(), NOW()),
        (p_team_id, 'urgent-support', v_label_colors[2], true, 2, NOW(), NOW()),
        (p_team_id, 'complaint', v_label_colors[3], true, 3, NOW(), NOW()),
        (p_team_id, 'new-contact', v_label_colors[4], true, 4, NOW(), NOW()),
        (p_team_id, 'negative-feedback', v_label_colors[5], true, 5, NOW(), NOW()),
        (p_team_id, 'after-hours-message', v_label_colors[6], true, 6, NOW(), NOW())
    ON CONFLICT (team_id, name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Create default labels for all existing teams
DO $$
DECLARE
    team_record RECORD;
BEGIN
    FOR team_record IN SELECT id FROM teams LOOP
        PERFORM create_default_labels_for_team(team_record.id);
    END LOOP;
END $$;

-- Create trigger to automatically create default labels for new teams
CREATE OR REPLACE FUNCTION trigger_create_default_labels()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM create_default_labels_for_team(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_default_labels ON teams;
CREATE TRIGGER trg_create_default_labels
    AFTER INSERT ON teams
    FOR EACH ROW
    EXECUTE FUNCTION trigger_create_default_labels();

COMMENT ON FUNCTION create_default_labels_for_team IS 'Creates default system labels for a team based on workflow template tag actions';
COMMENT ON TRIGGER trg_create_default_labels ON teams IS 'Automatically creates default labels when a new team is created';
