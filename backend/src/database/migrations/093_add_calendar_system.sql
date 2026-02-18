-- Migration: Add Calendar & Scheduling System
-- Description: Creates tables for calendars, events, booking links, availability, external sync, and AI integration
-- 
-- Tables created:
-- - calendars: User/team calendars
-- - calendar_events: Calendar entries with recurrence support
-- - event_attendees: Event participants (users, contacts, external)
-- - event_reminders: Configurable event reminders
-- - calendar_shares: Calendar sharing permissions
-- - booking_links: Public booking pages (Calendly-style)
-- - booking_link_members: Users assigned to booking links
-- - availability_rules: Weekly recurring availability
-- - availability_overrides: Date-specific exceptions
-- - bookings: Actual bookings made
-- - calendar_sync_connections: OAuth for external calendars
-- - calendar_sync_logs: Sync operation logs
-- - calendar_ai_settings: Per-user AI calendar permissions
-- - calendar_ai_actions: AI calendar action audit log

-- ============================================================================
-- PART 1: Core Calendar Tables
-- ============================================================================

-- Calendars table
CREATE TABLE IF NOT EXISTS calendars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
    visibility VARCHAR(20) NOT NULL DEFAULT 'private',
    is_default BOOLEAN DEFAULT false,
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    show_week_numbers BOOLEAN DEFAULT false,
    week_starts_on INTEGER DEFAULT 0,
    default_event_duration INTEGER DEFAULT 30,
    sync_enabled BOOLEAN DEFAULT false,
    last_synced_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    -- Constraint: either team_id or user_id must be set
    CONSTRAINT calendars_owner_check CHECK (
        (team_id IS NOT NULL AND user_id IS NULL) OR 
        (team_id IS NULL AND user_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_calendars_team_id ON calendars(team_id);
CREATE INDEX IF NOT EXISTS idx_calendars_user_id ON calendars(user_id);
CREATE INDEX IF NOT EXISTS idx_calendars_is_default ON calendars(is_default);
CREATE INDEX IF NOT EXISTS idx_calendars_is_active ON calendars(is_active);

-- Calendar Events table
CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_id UUID NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    event_type VARCHAR(30) NOT NULL DEFAULT 'meeting',
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    is_all_day BOOLEAN DEFAULT false,
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    recurrence_rule TEXT,
    recurrence_exceptions JSONB DEFAULT '[]',
    recurring_event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
    is_recurring_instance BOOLEAN DEFAULT false,
    original_start_time TIMESTAMP,
    location TEXT,
    location_url TEXT,
    is_online BOOLEAN DEFAULT false,
    video_conference_url TEXT,
    video_conference_provider VARCHAR(30),
    video_conference_id VARCHAR(100),
    video_conference_password VARCHAR(50),
    related_chat_id VARCHAR REFERENCES chats(chat_id) ON DELETE SET NULL,
    related_contact_id UUID,
    booking_link_id UUID,
    booking_id UUID,
    organizer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    visibility VARCHAR(20) DEFAULT 'calendar_default',
    show_as_busy BOOLEAN DEFAULT true,
    external_event_id VARCHAR(255),
    external_calendar_id VARCHAR(255),
    sync_provider VARCHAR(20),
    last_synced_at TIMESTAMP,
    sync_etag VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    deleted_at TIMESTAMP,
    deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_calendar_id ON calendar_events(calendar_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_end_time ON calendar_events(end_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_organizer_id ON calendar_events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_recurring_event_id ON calendar_events(recurring_event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_related_chat_id ON calendar_events(related_chat_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_related_contact_id ON calendar_events(related_contact_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_external_event_id ON calendar_events(external_event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_deleted_at ON calendar_events(deleted_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_calendar_date_range ON calendar_events(calendar_id, start_time, end_time);

-- Event Attendees table
CREATE TABLE IF NOT EXISTS event_attendees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    attendee_type VARCHAR(20) NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    contact_id UUID,
    external_email VARCHAR(255),
    external_name VARCHAR(100),
    response_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    responded_at TIMESTAMP,
    response_note TEXT,
    is_organizer BOOLEAN DEFAULT false,
    is_optional BOOLEAN DEFAULT false,
    notification_sent BOOLEAN DEFAULT false,
    notification_sent_at TIMESTAMP,
    reminder_sent BOOLEAN DEFAULT false,
    reminder_sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_attendees_event_id ON event_attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user_id ON event_attendees(user_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_contact_id ON event_attendees(contact_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_response_status ON event_attendees(response_status);

-- Unique constraints for attendees (only one per type per event)
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_attendees_user ON event_attendees(event_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_attendees_contact ON event_attendees(event_id, contact_id) WHERE contact_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_attendees_external ON event_attendees(event_id, external_email) WHERE external_email IS NOT NULL;

-- Event Reminders table
CREATE TABLE IF NOT EXISTS event_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    reminder_method VARCHAR(20) NOT NULL DEFAULT 'push',
    minutes_before INTEGER NOT NULL DEFAULT 15,
    is_sent BOOLEAN DEFAULT false,
    sent_at TIMESTAMP,
    error_message TEXT,
    attendee_id UUID REFERENCES event_attendees(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_reminders_event_id ON event_reminders(event_id);
CREATE INDEX IF NOT EXISTS idx_event_reminders_attendee_id ON event_reminders(attendee_id);
CREATE INDEX IF NOT EXISTS idx_event_reminders_is_sent ON event_reminders(is_sent);

-- Calendar Shares table
CREATE TABLE IF NOT EXISTS calendar_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_id UUID NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    shared_with_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    shared_with_team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    permission_level VARCHAR(20) NOT NULL DEFAULT 'view',
    can_see_details BOOLEAN DEFAULT true,
    shared_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    -- Constraint: must share with either user or team
    CONSTRAINT calendar_shares_target_check CHECK (
        (shared_with_user_id IS NOT NULL AND shared_with_team_id IS NULL) OR 
        (shared_with_user_id IS NULL AND shared_with_team_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_calendar_shares_calendar_id ON calendar_shares(calendar_id);
CREATE INDEX IF NOT EXISTS idx_calendar_shares_shared_with_user_id ON calendar_shares(shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_shares_shared_with_team_id ON calendar_shares(shared_with_team_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_shares_user ON calendar_shares(calendar_id, shared_with_user_id) WHERE shared_with_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_shares_team ON calendar_shares(calendar_id, shared_with_team_id) WHERE shared_with_team_id IS NOT NULL;

-- ============================================================================
-- PART 2: Booking & Scheduling Tables
-- ============================================================================

-- Booking Links table
CREATE TABLE IF NOT EXISTS booking_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    event_type VARCHAR(30) NOT NULL DEFAULT 'meeting',
    duration INTEGER NOT NULL DEFAULT 30,
    location_type VARCHAR(30) NOT NULL DEFAULT 'video',
    location_details TEXT,
    video_provider VARCHAR(30),
    calendar_id UUID REFERENCES calendars(id) ON DELETE SET NULL,
    min_notice_minutes INTEGER DEFAULT 60,
    max_future_days INTEGER DEFAULT 60,
    buffer_before_minutes INTEGER DEFAULT 0,
    buffer_after_minutes INTEGER DEFAULT 0,
    max_bookings_per_day INTEGER,
    is_round_robin BOOLEAN DEFAULT false,
    round_robin_mode VARCHAR(20),
    assigned_user_ids JSONB DEFAULT '[]',
    confirmation_message TEXT,
    requires_approval BOOLEAN DEFAULT false,
    color VARCHAR(20) DEFAULT '#3b82f6',
    custom_questions JSONB DEFAULT '[]',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    total_bookings INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_links_team_id ON booking_links(team_id);
CREATE INDEX IF NOT EXISTS idx_booking_links_created_by ON booking_links(created_by);
CREATE INDEX IF NOT EXISTS idx_booking_links_status ON booking_links(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_links_team_slug ON booking_links(team_id, slug);

-- Booking Link Members table
CREATE TABLE IF NOT EXISTS booking_link_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_link_id UUID NOT NULL REFERENCES booking_links(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    last_assigned_at TIMESTAMP,
    total_assignments INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_link_members_booking_link_id ON booking_link_members(booking_link_id);
CREATE INDEX IF NOT EXISTS idx_booking_link_members_user_id ON booking_link_members(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_link_members ON booking_link_members(booking_link_id, user_id);

-- Availability Rules table
CREATE TABLE IF NOT EXISTS availability_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rule_type VARCHAR(20) NOT NULL DEFAULT 'available',
    days_of_week JSONB NOT NULL DEFAULT '[1,2,3,4,5]',
    start_minutes INTEGER NOT NULL DEFAULT 540,
    end_minutes INTEGER NOT NULL DEFAULT 1020,
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    booking_link_id UUID REFERENCES booking_links(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_availability_rules_user_id ON availability_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_availability_rules_booking_link_id ON availability_rules(booking_link_id);
CREATE INDEX IF NOT EXISTS idx_availability_rules_is_active ON availability_rules(is_active);

-- Availability Overrides table
CREATE TABLE IF NOT EXISTS availability_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TIMESTAMP NOT NULL,
    override_type VARCHAR(20) NOT NULL DEFAULT 'unavailable',
    custom_windows JSONB DEFAULT '[]',
    reason VARCHAR(200),
    booking_link_id UUID REFERENCES booking_links(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_availability_overrides_user_id ON availability_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_availability_overrides_date ON availability_overrides(date);
CREATE INDEX IF NOT EXISTS idx_availability_overrides_user_date ON availability_overrides(user_id, date);

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_link_id UUID NOT NULL REFERENCES booking_links(id) ON DELETE CASCADE,
    event_id UUID REFERENCES calendar_events(id) ON DELETE SET NULL,
    assigned_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    booker_contact_id UUID,
    booker_name VARCHAR(100) NOT NULL,
    booker_email VARCHAR(255) NOT NULL,
    booker_phone VARCHAR(30),
    booker_timezone VARCHAR(50),
    scheduled_start TIMESTAMP NOT NULL,
    scheduled_end TIMESTAMP NOT NULL,
    question_responses JSONB DEFAULT '{}',
    booker_notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    cancelled_at TIMESTAMP,
    cancelled_by VARCHAR(20),
    cancellation_reason TEXT,
    reminder_sent_at TIMESTAMP,
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    referrer TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_booking_link_id ON bookings(booking_link_id);
CREATE INDEX IF NOT EXISTS idx_bookings_event_id ON bookings(event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_assigned_user_id ON bookings(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_start ON bookings(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_bookings_booker_email ON bookings(booker_email);

-- ============================================================================
-- PART 3: External Sync Tables
-- ============================================================================

-- Calendar Sync Connections table
CREATE TABLE IF NOT EXISTS calendar_sync_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL,
    provider_account_id VARCHAR(255),
    provider_email VARCHAR(255),
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type VARCHAR(50) DEFAULT 'Bearer',
    expires_at TIMESTAMP,
    scope TEXT,
    sync_direction VARCHAR(20) NOT NULL DEFAULT 'bidirectional',
    sync_calendar_ids JSONB DEFAULT '[]',
    linked_calendar_id UUID REFERENCES calendars(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    last_sync_at TIMESTAMP,
    last_sync_error TEXT,
    sync_token TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_sync_connections_user_id ON calendar_sync_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_connections_provider ON calendar_sync_connections(provider);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_connections_status ON calendar_sync_connections(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_sync_connections ON calendar_sync_connections(user_id, provider);

-- Calendar Sync Logs table
CREATE TABLE IF NOT EXISTS calendar_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES calendar_sync_connections(id) ON DELETE CASCADE,
    operation VARCHAR(30) NOT NULL,
    direction VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    events_created INTEGER DEFAULT 0,
    events_updated INTEGER DEFAULT 0,
    events_deleted INTEGER DEFAULT 0,
    conflicts_resolved INTEGER DEFAULT 0,
    error_code VARCHAR(50),
    error_message TEXT,
    error_details JSONB,
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_sync_logs_connection_id ON calendar_sync_logs(connection_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_logs_status ON calendar_sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_logs_created_at ON calendar_sync_logs(created_at);

-- ============================================================================
-- PART 4: AI Integration Tables
-- ============================================================================

-- Calendar AI Settings table
CREATE TABLE IF NOT EXISTS calendar_ai_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    ai_enabled BOOLEAN DEFAULT true,
    can_check_availability BOOLEAN DEFAULT true,
    can_create_events BOOLEAN DEFAULT true,
    can_update_events BOOLEAN DEFAULT true,
    can_cancel_events BOOLEAN DEFAULT false,
    can_suggest_times BOOLEAN DEFAULT true,
    can_send_reminders BOOLEAN DEFAULT true,
    autonomy_level VARCHAR(20) NOT NULL DEFAULT 'suggest',
    allowed_calendar_ids JSONB DEFAULT '[]',
    max_events_per_day INTEGER DEFAULT 5,
    min_notice_minutes INTEGER DEFAULT 60,
    blocked_time_ranges JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_ai_settings_user_id ON calendar_ai_settings(user_id);

-- Calendar AI Actions table
CREATE TABLE IF NOT EXISTS calendar_ai_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chat_id VARCHAR REFERENCES chats(chat_id) ON DELETE SET NULL,
    action_type VARCHAR(30) NOT NULL,
    action_status VARCHAR(20) NOT NULL,
    event_id UUID REFERENCES calendar_events(id) ON DELETE SET NULL,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    ai_request JSONB,
    ai_response JSONB,
    executed_action JSONB,
    required_confirmation BOOLEAN DEFAULT false,
    confirmed_at TIMESTAMP,
    confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    rejected_at TIMESTAMP,
    rejection_reason TEXT,
    error_message TEXT,
    latency_ms INTEGER,
    created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_ai_actions_user_id ON calendar_ai_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_ai_actions_chat_id ON calendar_ai_actions(chat_id);
CREATE INDEX IF NOT EXISTS idx_calendar_ai_actions_action_type ON calendar_ai_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_calendar_ai_actions_action_status ON calendar_ai_actions(action_status);
CREATE INDEX IF NOT EXISTS idx_calendar_ai_actions_created_at ON calendar_ai_actions(created_at);

-- ============================================================================
-- PART 5: Add Calendar Permissions
-- ============================================================================

-- Add calendar-related permissions to the permissions table
INSERT INTO permissions (key, category, description) VALUES
    ('calendar.view', 'calendar', 'View calendars and events'),
    ('calendar.create', 'calendar', 'Create events and calendars'),
    ('calendar.edit', 'calendar', 'Edit own events'),
    ('calendar.edit.all', 'calendar', 'Edit any team event'),
    ('calendar.delete', 'calendar', 'Delete events'),
    ('calendar.booking.manage', 'calendar', 'Manage booking links'),
    ('calendar.sync.manage', 'calendar', 'Connect external calendars'),
    ('calendar.ai.manage', 'calendar', 'Configure AI calendar access')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- PART 6: Assign Calendar Permissions to Existing Roles
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
    -- For every existing team, assign calendar permissions to roles
    FOR team_record IN SELECT id FROM teams
    LOOP
        -- Get role IDs for this team
        SELECT id INTO owner_role_id FROM roles WHERE team_id = team_record.id AND name = 'Owner' LIMIT 1;
        SELECT id INTO admin_role_id FROM roles WHERE team_id = team_record.id AND name = 'Admin' LIMIT 1;
        SELECT id INTO agent_role_id FROM roles WHERE team_id = team_record.id AND name = 'Agent' LIMIT 1;
        SELECT id INTO viewer_role_id FROM roles WHERE team_id = team_record.id AND name = 'Viewer' LIMIT 1;
        
        -- Owner gets all calendar permissions
        IF owner_role_id IS NOT NULL THEN
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT owner_role_id, id FROM permissions WHERE category = 'calendar'
            ON CONFLICT DO NOTHING;
        END IF;
        
        -- Admin gets all calendar permissions
        IF admin_role_id IS NOT NULL THEN
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT admin_role_id, id FROM permissions WHERE category = 'calendar'
            ON CONFLICT DO NOTHING;
        END IF;
        
        -- Agent gets view, create, edit own, booking.manage
        IF agent_role_id IS NOT NULL THEN
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT agent_role_id, id FROM permissions 
            WHERE key IN ('calendar.view', 'calendar.create', 'calendar.edit', 'calendar.booking.manage')
            ON CONFLICT DO NOTHING;
        END IF;
        
        -- Viewer gets view only
        IF viewer_role_id IS NOT NULL THEN
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT viewer_role_id, id FROM permissions WHERE key = 'calendar.view'
            ON CONFLICT DO NOTHING;
        END IF;
        
    END LOOP;
END $$;

-- ============================================================================
-- PART 7: Add Foreign Key for related_contact_id
-- ============================================================================

-- Add foreign key constraint to calendar_events.related_contact_id
-- Done separately because contacts table uses UUID contact_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_calendar_events_related_contact'
    ) THEN
        ALTER TABLE calendar_events 
        ADD CONSTRAINT fk_calendar_events_related_contact 
        FOREIGN KEY (related_contact_id) REFERENCES contacts(contact_id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add foreign key constraint to event_attendees.contact_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_event_attendees_contact'
    ) THEN
        ALTER TABLE event_attendees 
        ADD CONSTRAINT fk_event_attendees_contact 
        FOREIGN KEY (contact_id) REFERENCES contacts(contact_id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add foreign key constraint to bookings.booker_contact_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_bookings_booker_contact'
    ) THEN
        ALTER TABLE bookings 
        ADD CONSTRAINT fk_bookings_booker_contact 
        FOREIGN KEY (booker_contact_id) REFERENCES contacts(contact_id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================================================
-- PART 8: Comments for Documentation
-- ============================================================================

COMMENT ON TABLE calendars IS 'User/team calendars with visibility and sync settings';
COMMENT ON TABLE calendar_events IS 'Calendar events with recurrence, video conferencing, and CRM integration';
COMMENT ON TABLE event_attendees IS 'Event participants - users, contacts, or external emails';
COMMENT ON TABLE event_reminders IS 'Configurable event reminders with multiple delivery methods';
COMMENT ON TABLE calendar_shares IS 'Calendar sharing between team members with permission levels';
COMMENT ON TABLE booking_links IS 'Public booking pages (Calendly-style) with round-robin support';
COMMENT ON TABLE booking_link_members IS 'Users assigned to booking links for round-robin';
COMMENT ON TABLE availability_rules IS 'Weekly recurring availability windows';
COMMENT ON TABLE availability_overrides IS 'Date-specific availability exceptions';
COMMENT ON TABLE bookings IS 'Bookings made through booking links';
COMMENT ON TABLE calendar_sync_connections IS 'OAuth connections to external calendars (Google, Outlook, Apple)';
COMMENT ON TABLE calendar_sync_logs IS 'Sync operation audit logs';
COMMENT ON TABLE calendar_ai_settings IS 'Per-user AI calendar autonomy settings';
COMMENT ON TABLE calendar_ai_actions IS 'Audit log of AI calendar operations';
