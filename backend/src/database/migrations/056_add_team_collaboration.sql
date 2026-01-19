-- Migration: Add Team Collaboration System
-- Part 1: Teams and Membership
-- Part 2: Invitations Enhancement  
-- Part 3: Chat Ownership and Assignment
-- Part 4: Chat Locks
-- Part 5: Activity Logs Enhancement
-- Part 6: Migrate Existing Data

-- ============================================================================
-- PART 1: Teams Table
-- ============================================================================

-- Teams table - organizational unit that owns chats
CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    owner_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON teams(owner_id);

-- Team Members table - users belonging to teams with roles
CREATE TABLE IF NOT EXISTS team_members (
    id SERIAL PRIMARY KEY,
    team_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'agent' CHECK (role IN ('owner', 'admin', 'agent', 'viewer')),
    joined_at TIMESTAMP DEFAULT now(),
    invited_by INT REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    UNIQUE(team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_role ON team_members(role);

-- ============================================================================
-- PART 2: Invitations Enhancement
-- ============================================================================

-- Check if invitations table exists, create if not
CREATE TABLE IF NOT EXISTS invitations (
    id SERIAL PRIMARY KEY,
    team_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'agent' CHECK (role IN ('owner', 'admin', 'agent', 'viewer')),
    invited_by INT NOT NULL REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    created_at TIMESTAMP DEFAULT now()
);

-- Add new columns for token-based invitations (if they don't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invitations' AND column_name = 'token') THEN
        ALTER TABLE invitations ADD COLUMN token TEXT UNIQUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invitations' AND column_name = 'expires_at') THEN
        ALTER TABLE invitations ADD COLUMN expires_at TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invitations' AND column_name = 'accepted_at') THEN
        ALTER TABLE invitations ADD COLUMN accepted_at TIMESTAMP;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_team_id ON invitations(team_id);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);

-- ============================================================================
-- PART 3: Chat Ownership and Assignment
-- ============================================================================

-- Add team ownership and assignment columns to chats
DO $$
BEGIN
    -- Team ownership
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chats' AND column_name = 'team_id') THEN
        ALTER TABLE chats ADD COLUMN team_id INT REFERENCES teams(id) ON DELETE SET NULL;
    END IF;
    
    -- Assignment columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chats' AND column_name = 'assigned_to') THEN
        ALTER TABLE chats ADD COLUMN assigned_to INT REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chats' AND column_name = 'assigned_at') THEN
        ALTER TABLE chats ADD COLUMN assigned_at TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chats' AND column_name = 'assigned_by') THEN
        ALTER TABLE chats ADD COLUMN assigned_by INT REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chats_team_id ON chats(team_id);
CREATE INDEX IF NOT EXISTS idx_chats_assigned_to ON chats(assigned_to);

-- ============================================================================
-- PART 4: Chat Locks Table
-- ============================================================================

-- Chat Locks table - exclusive control mechanism
-- Only ONE actor (human or AI) may control a chat at a time
CREATE TABLE IF NOT EXISTS chat_locks (
    chat_id VARCHAR NOT NULL PRIMARY KEY,
    locked_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lock_type VARCHAR(20) NOT NULL CHECK (lock_type IN ('human', 'ai', 'system')),
    locked_at TIMESTAMP NOT NULL DEFAULT now(),
    expires_at TIMESTAMP NOT NULL,
    reason TEXT,
    CONSTRAINT fk_chat_locks_chat FOREIGN KEY (chat_id) REFERENCES chats(chat_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_locks_locked_by ON chat_locks(locked_by);
CREATE INDEX IF NOT EXISTS idx_chat_locks_expires_at ON chat_locks(expires_at);
CREATE INDEX IF NOT EXISTS idx_chat_locks_lock_type ON chat_locks(lock_type);

-- ============================================================================
-- PART 5: Activity Logs Enhancement (Audit Trail)
-- ============================================================================

-- Check if activity_logs table exists, create if not
CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT now()
);

-- Add audit trail columns
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_logs' AND column_name = 'entity_type') THEN
        ALTER TABLE activity_logs ADD COLUMN entity_type VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_logs' AND column_name = 'entity_id') THEN
        ALTER TABLE activity_logs ADD COLUMN entity_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_logs' AND column_name = 'action') THEN
        ALTER TABLE activity_logs ADD COLUMN action VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_logs' AND column_name = 'metadata') THEN
        ALTER TABLE activity_logs ADD COLUMN metadata JSONB DEFAULT '{}';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_logs' AND column_name = 'team_id') THEN
        ALTER TABLE activity_logs ADD COLUMN team_id INT REFERENCES teams(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_logs' AND column_name = 'ip_address') THEN
        ALTER TABLE activity_logs ADD COLUMN ip_address VARCHAR(45);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_type ON activity_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_id ON activity_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_team_id ON activity_logs(team_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);

-- ============================================================================
-- PART 6: Migrate Existing Data
-- ============================================================================

-- Create a default "Personal" team for each existing user and assign their chats
DO $$
DECLARE
    user_record RECORD;
    new_team_id INT;
BEGIN
    -- For each user who has chats but no team
    FOR user_record IN 
        SELECT DISTINCT u.id as user_id, u.name as user_name
        FROM users u
        INNER JOIN chats c ON c.user_id = u.id
        WHERE c.team_id IS NULL
    LOOP
        -- Check if user already has a personal team
        SELECT t.id INTO new_team_id
        FROM teams t
        INNER JOIN team_members tm ON tm.team_id = t.id
        WHERE tm.user_id = user_record.user_id AND tm.role = 'owner'
        LIMIT 1;
        
        -- If no team exists, create one
        IF new_team_id IS NULL THEN
            INSERT INTO teams (name, owner_id, description)
            VALUES (
                user_record.user_name || '''s Team',
                user_record.user_id,
                'Default team created during migration'
            )
            RETURNING id INTO new_team_id;
            
            -- Add user as owner of their team
            INSERT INTO team_members (team_id, user_id, role)
            VALUES (new_team_id, user_record.user_id, 'owner');
        END IF;
        
        -- Assign all their chats to this team
        UPDATE chats
        SET team_id = new_team_id
        WHERE user_id = user_record.user_id AND team_id IS NULL;
    END LOOP;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE teams IS 'Organizational units that own chats. Teams enable multi-tenant collaboration.';
COMMENT ON TABLE team_members IS 'Users belonging to teams with role-based permissions (owner, admin, agent, viewer).';
COMMENT ON TABLE chat_locks IS 'Exclusive control mechanism preventing concurrent access. Only one actor (human or AI) may control a chat at a time.';
COMMENT ON COLUMN chat_locks.lock_type IS 'Type of lock: human (5 min TTL), ai (30 sec TTL), system (1 min TTL)';
COMMENT ON COLUMN chats.team_id IS 'Team that owns this chat. Teams own chats, not individual users.';
COMMENT ON COLUMN chats.assigned_to IS 'User assigned responsibility for this chat. Assignment != lock.';
