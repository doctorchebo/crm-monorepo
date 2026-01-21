-- Migration: Add Custom Roles and Permissions System
-- Description: Replaces hardcoded string roles with dynamic database-backed roles and granular permissions.

-- ============================================================================
-- PART 1: Create Tables
-- ============================================================================

-- Permissions Table: Catalog of all available system actions
CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE, -- e.g. 'chat.delete'
    description TEXT,
    category VARCHAR(50) NOT NULL, -- e.g. 'chat', 'team', 'workflow'
    created_at TIMESTAMP DEFAULT now()
);

-- Roles Table: Custom roles defined per team
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    team_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL, -- e.g. 'Supervisor'
    description TEXT,
    is_system BOOLEAN DEFAULT false, -- If true, cannot be deleted (e.g. Owner)
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    UNIQUE(team_id, name)
);

-- Role_Permissions Table: Granting permissions to roles
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (role_id, permission_id)
);

-- Add role_id to team_members
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_members' AND column_name = 'role_id') THEN
        ALTER TABLE team_members ADD COLUMN role_id INT REFERENCES roles(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_roles_team_id ON roles(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_role_id ON team_members(role_id);

-- ============================================================================
-- PART 2: Seed System Permissions
-- ============================================================================

INSERT INTO permissions (key, category, description) VALUES
    -- Team Management
    ('team.manage', 'team', 'Manage team settings, billing, and generic info'),
    ('team.member.add', 'team', 'Invite new members to the team'),
    ('team.member.remove', 'team', 'Remove members from the team'),
    ('team.member.edit', 'team', 'Edit member roles'),
    ('team.role.manage', 'team', 'Create, update and delete custom roles'),
    
    -- Chat Management
    ('chat.view', 'chat', 'View chats and messages'),
    ('chat.send', 'chat', 'Send messages'),
    ('chat.delete', 'chat', 'Delete chats and messages'),
    ('chat.assign', 'chat', 'Assign chats to specific team members'),
    ('chat.export', 'chat', 'Export chat transcripts'),
    
    -- Workflow
    ('workflow.manage', 'workflow', 'Modify workflow stages and automation rules'),
    ('workflow.move', 'workflow', 'Move chats between workflow stages'),
    
    -- Knowledge Base
    ('kb.manage', 'knowledge_base', 'Create and edit knowledge base objects'),
    
    -- Settings
    ('settings.view', 'settings', 'View system settings'),
    ('settings.manage', 'settings', 'Manage system settings')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- PART 3: Data Migration (Migrate existing teams to use new roles)
-- ============================================================================

DO $$
DECLARE
    team_record RECORD;
    owner_role_id INT;
    admin_role_id INT;
    agent_role_id INT;
    viewer_role_id INT;
    perm_record RECORD;
BEGIN
    -- For every existing team, create the standard set of roles
    FOR team_record IN SELECT id FROM teams
    LOOP
        -- 1. Create 'Owner' role (Super admin)
        INSERT INTO roles (team_id, name, description, is_system)
        VALUES (team_record.id, 'Owner', 'Full access to everything', true)
        ON CONFLICT (team_id, name) DO UPDATE SET description = 'Full access to everything'
        RETURNING id INTO owner_role_id;
        
        -- Assign ALL permissions to Owner
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT owner_role_id, id FROM permissions
        ON CONFLICT DO NOTHING;
        
        -- 2. Create 'Admin' role
        INSERT INTO roles (team_id, name, description, is_system)
        VALUES (team_record.id, 'Admin', 'Can manage members and settings, but less destructive', true)
        ON CONFLICT (team_id, name) DO UPDATE SET description = 'Can manage members and settings'
        RETURNING id INTO admin_role_id;
        
        -- Assign Admin permissions (All except maybe purely owner things - for now give all except strictly owner actions if any)
        -- Giving Admins almost everything for now
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT admin_role_id, id FROM permissions
        WHERE key != 'team.delete' -- Example restriction if we had it
        ON CONFLICT DO NOTHING;

        -- 3. Create 'Agent' role
        INSERT INTO roles (team_id, name, description, is_system)
        VALUES (team_record.id, 'Agent', 'Standard support staff', true)
        ON CONFLICT (team_id, name) DO UPDATE SET description = 'Standard support staff'
        RETURNING id INTO agent_role_id;
        
        -- Assign Agent permissions
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT agent_role_id, id FROM permissions
        WHERE key IN (
            'chat.view', 'chat.send', 'chat.assign', 
            'workflow.move', 
            'kb.manage'
        )
        ON CONFLICT DO NOTHING;
        
        -- 4. Create 'Viewer' role
        INSERT INTO roles (team_id, name, description, is_system)
        VALUES (team_record.id, 'Viewer', 'Read-only access', true)
        ON CONFLICT (team_id, name) DO UPDATE SET description = 'Read-only access'
        RETURNING id INTO viewer_role_id;
        
        -- Assign Viewer permissions
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT viewer_role_id, id FROM permissions
        WHERE key IN ('chat.view', 'settings.view')
        ON CONFLICT DO NOTHING;
        
        -- 5. Migrate Team Members
        -- Update team_members using the string 'role' column to map to the new role_id
        UPDATE team_members SET role_id = owner_role_id WHERE team_id = team_record.id AND role = 'owner';
        UPDATE team_members SET role_id = admin_role_id WHERE team_id = team_record.id AND role = 'admin';
        UPDATE team_members SET role_id = agent_role_id WHERE team_id = team_record.id AND role = 'agent';
        UPDATE team_members SET role_id = viewer_role_id WHERE team_id = team_record.id AND role = 'viewer';
        
    END LOOP;
END $$;

-- ============================================================================
-- PART 4: Cleanup & Constraints
-- ============================================================================

-- NOTE: We are NOT dropping the 'role' string column yet to safely allow rollback/code overlap.
-- But we can make role_id NOT NULL for new records if migration succeeded? 
-- For now, let's leave it nullable but trusted by new code.

COMMENT ON TABLE permissions IS 'System capabilities that can be granted to roles.';
COMMENT ON TABLE roles IS 'Customizable roles defined per team.';
COMMENT ON TABLE role_permissions IS 'Mapping of permissions to roles.';
