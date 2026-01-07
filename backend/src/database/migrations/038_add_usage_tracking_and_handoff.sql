-- Migration: Add Usage Tracking and Handoff Notification Tables
-- Description: Creates tables for AI usage tracking, billing, throttling, and handoff notifications

-- Enable uuid-ossp extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- AI Usage Logs Table
-- =============================================
-- Tracks AI token usage and costs per message
-- Schema matches user requirements exactly
CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Foreign key references
    chat_id VARCHAR NOT NULL,
    message_id VARCHAR,  -- Nullable for operations not tied to specific messages
    
    -- Provider tracking
    provider_name VARCHAR(50) NOT NULL,  -- 'openai', 'anthropic', 'gemini', etc.
    
    -- Usage metrics
    tokens_used INTEGER NOT NULL DEFAULT 0,
    cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    
    -- Extended tracking fields
    user_id INTEGER,
    sender_id INTEGER,
    operation_type VARCHAR(50),  -- 'chat_response', 'summarization', 'memory_query', etc.
    model_name VARCHAR(100),  -- Specific model used (gpt-4o, claude-3-sonnet, etc.)
    input_tokens INTEGER,
    output_tokens INTEGER,
    latency_ms INTEGER,  -- Response time in milliseconds
    
    -- Metadata for additional context
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for ai_usage_logs
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_chat_id ON ai_usage_logs(chat_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_message_id ON ai_usage_logs(message_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_id ON ai_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_provider ON ai_usage_logs(provider_name);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at ON ai_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_operation ON ai_usage_logs(operation_type);

-- Composite index for user billing queries
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_period 
    ON ai_usage_logs(user_id, created_at);

-- =============================================
-- Usage Limits Table
-- =============================================
-- Stores user-defined limits for usage throttling
CREATE TABLE IF NOT EXISTS usage_limits (
    id SERIAL PRIMARY KEY,
    
    -- User association
    user_id INTEGER NOT NULL,
    
    -- Limit configuration
    limit_type VARCHAR(20) NOT NULL,  -- 'tokens', 'cost', 'requests'
    limit_period VARCHAR(20) NOT NULL,  -- 'daily', 'weekly', 'monthly', 'total'
    limit_value NUMERIC(15, 2) NOT NULL,
    
    -- Warning threshold (percentage, e.g., 80 for 80%)
    warning_threshold INTEGER DEFAULT 80,
    
    -- Action when limit exceeded
    action_on_limit VARCHAR(20) DEFAULT 'notify',  -- 'pause', 'notify', 'block'
    
    -- Status tracking
    is_active BOOLEAN DEFAULT true,
    
    -- Current period tracking (for resetting counts)
    current_period_start TIMESTAMP DEFAULT NOW(),
    current_period_usage NUMERIC(15, 2) DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Unique constraint per user/type/period combination
    CONSTRAINT unique_user_limit UNIQUE (user_id, limit_type, limit_period)
);

-- Indexes for usage_limits
CREATE INDEX IF NOT EXISTS idx_usage_limits_user_id ON usage_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_limits_active ON usage_limits(is_active);

-- =============================================
-- Handoff Notifications Table
-- =============================================
-- Tracks human intervention requests and notifications
CREATE TABLE IF NOT EXISTS handoff_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Chat association
    chat_id VARCHAR NOT NULL,
    
    -- User who should be notified
    user_id INTEGER NOT NULL,
    
    -- Notification details
    notification_type VARCHAR(50) NOT NULL,  -- 'handoff_request', 'limit_warning', 'limit_exceeded', 'intervention_needed'
    priority VARCHAR(20) DEFAULT 'medium',  -- 'low', 'medium', 'high', 'critical'
    
    -- Content
    title VARCHAR(255) NOT NULL,
    message TEXT,
    ai_reason TEXT,  -- AI's explanation for why intervention is needed
    suggested_action TEXT,
    
    -- Status tracking
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'acknowledged', 'resolved', 'dismissed'
    acknowledged_at TIMESTAMP,
    acknowledged_by INTEGER,  -- User who acknowledged
    resolved_at TIMESTAMP,
    resolved_by INTEGER,
    resolution_notes TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for handoff_notifications
CREATE INDEX IF NOT EXISTS idx_handoff_notifications_chat_id ON handoff_notifications(chat_id);
CREATE INDEX IF NOT EXISTS idx_handoff_notifications_user_id ON handoff_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_handoff_notifications_status ON handoff_notifications(status);
CREATE INDEX IF NOT EXISTS idx_handoff_notifications_priority ON handoff_notifications(priority);
CREATE INDEX IF NOT EXISTS idx_handoff_notifications_created_at ON handoff_notifications(created_at);

-- Composite index for user notification queries
CREATE INDEX IF NOT EXISTS idx_handoff_notifications_user_status 
    ON handoff_notifications(user_id, status);

-- =============================================
-- Add AI Generation Fields to Messages Table
-- =============================================
-- Extend messages table with AI-related tracking fields
DO $$ 
BEGIN
    -- Add is_ai_generated flag
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'is_ai_generated'
    ) THEN
        ALTER TABLE messages ADD COLUMN is_ai_generated BOOLEAN DEFAULT false;
    END IF;

    -- Add AI generation timestamp
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'ai_generated_at'
    ) THEN
        ALTER TABLE messages ADD COLUMN ai_generated_at TIMESTAMP;
    END IF;

    -- Add AI model name
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'ai_model'
    ) THEN
        ALTER TABLE messages ADD COLUMN ai_model VARCHAR(100);
    END IF;

    -- Add AI provider name
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'ai_provider'
    ) THEN
        ALTER TABLE messages ADD COLUMN ai_provider VARCHAR(50);
    END IF;

    -- Add reference to usage log
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'ai_usage_log_id'
    ) THEN
        ALTER TABLE messages ADD COLUMN ai_usage_log_id UUID;
    END IF;

    -- Add manual override flag
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'was_manually_overridden'
    ) THEN
        ALTER TABLE messages ADD COLUMN was_manually_overridden BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Index for AI-generated messages
CREATE INDEX IF NOT EXISTS idx_messages_ai_generated ON messages(is_ai_generated) WHERE is_ai_generated = true;
CREATE INDEX IF NOT EXISTS idx_messages_ai_usage_log ON messages(ai_usage_log_id) WHERE ai_usage_log_id IS NOT NULL;

-- =============================================
-- Comments for documentation
-- =============================================
COMMENT ON TABLE ai_usage_logs IS 'Tracks AI token usage and costs per operation/message for billing and throttling';
COMMENT ON TABLE usage_limits IS 'User-defined limits for AI usage throttling (tokens, cost, requests)';
COMMENT ON TABLE handoff_notifications IS 'Human intervention requests and notifications for AI handoff';

COMMENT ON COLUMN ai_usage_logs.tokens_used IS 'Total tokens used (input + output)';
COMMENT ON COLUMN ai_usage_logs.cost IS 'Estimated cost in USD';
COMMENT ON COLUMN usage_limits.action_on_limit IS 'Action when limit exceeded: pause (stop AI), notify (alert user), block (reject requests)';
COMMENT ON COLUMN handoff_notifications.priority IS 'Notification priority level affecting display and alerts';
