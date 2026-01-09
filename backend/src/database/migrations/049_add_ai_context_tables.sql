-- Migration: Add AI Context Tables (Lightweight Replacement for AI Memory)
--
-- This migration creates new tables for the cost-efficient AI context system:
-- - conversation_summaries: Rolling summaries per chat
-- - ai_usage_daily_limits: Daily usage tracking per user
-- - ai_operation_logs: Audit trail for AI operations
--
-- These tables replace the per-message embedding system with a more efficient
-- summary-based approach that reduces AI costs by ~90%.

-- ============================================================================
-- Conversation Summaries Table
-- ============================================================================
-- One summary per chat, updated incrementally when threshold conditions are met
CREATE TABLE IF NOT EXISTS conversation_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id VARCHAR(255) NOT NULL UNIQUE,
    summary_text TEXT,
    last_message_id VARCHAR(255),
    pending_message_count INTEGER NOT NULL DEFAULT 0,
    summary_version INTEGER NOT NULL DEFAULT 0,
    last_updated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_chat_id 
    ON conversation_summaries(chat_id);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_pending_count 
    ON conversation_summaries(pending_message_count) 
    WHERE pending_message_count > 0;
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_last_updated 
    ON conversation_summaries(last_updated_at);

-- ============================================================================
-- AI Usage Daily Limits Table
-- ============================================================================
-- Tracks daily usage per user for cost control
CREATE TABLE IF NOT EXISTS ai_usage_daily_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    calls_count INTEGER NOT NULL DEFAULT 0,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
    limit_reached BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_limits_user_date 
    ON ai_usage_daily_limits(user_id, date);
CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_limits_date 
    ON ai_usage_daily_limits(date);
CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_limits_limit_reached 
    ON ai_usage_daily_limits(limit_reached) 
    WHERE limit_reached = TRUE;

-- ============================================================================
-- AI Operation Logs Table
-- ============================================================================
-- Audit trail for every AI operation
CREATE TABLE IF NOT EXISTS ai_operation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    chat_id VARCHAR(255),
    operation_type VARCHAR(50) NOT NULL,
    trigger_reason VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'success',
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for analytics and debugging
CREATE INDEX IF NOT EXISTS idx_ai_operation_logs_user_id 
    ON ai_operation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_operation_logs_chat_id 
    ON ai_operation_logs(chat_id) 
    WHERE chat_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_operation_logs_created_at 
    ON ai_operation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_operation_logs_operation_type 
    ON ai_operation_logs(operation_type);
CREATE INDEX IF NOT EXISTS idx_ai_operation_logs_status 
    ON ai_operation_logs(status);

-- Composite index for user analytics queries
CREATE INDEX IF NOT EXISTS idx_ai_operation_logs_user_created 
    ON ai_operation_logs(user_id, created_at DESC);

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE conversation_summaries IS 
    'Rolling conversation summaries for AI context. One summary per chat, updated incrementally.';
COMMENT ON TABLE ai_usage_daily_limits IS 
    'Daily usage tracking per user for cost control and billing.';
COMMENT ON TABLE ai_operation_logs IS 
    'Audit trail for AI operations. Used for debugging, analytics, and billing.';

COMMENT ON COLUMN conversation_summaries.pending_message_count IS 
    'Number of new messages since last summary update. Triggers update when threshold is reached.';
COMMENT ON COLUMN conversation_summaries.summary_version IS 
    'Incremented each time summary is updated. Useful for caching and conflict detection.';
COMMENT ON COLUMN ai_usage_daily_limits.limit_reached IS 
    'Set to true when any daily limit is reached. Quick check without recalculation.';
COMMENT ON COLUMN ai_operation_logs.trigger_reason IS 
    'What caused this AI operation: message_threshold, staleness_timeout, user_request, ai_reply_needed, manual_refresh';
