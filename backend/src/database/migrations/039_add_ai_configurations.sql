-- Migration: 039_add_ai_configurations
-- Description: Add AI behavior configuration tables for user, chat, and workflow stage levels
-- Created: 2024-01-20

-- ============================================================================
-- User-level AI Configuration
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_configurations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Tone and style defaults
  default_tone VARCHAR(50) DEFAULT 'friendly',
  default_style VARCHAR(50) DEFAULT 'concise',
  formality_level VARCHAR(50) DEFAULT 'balanced',
  
  -- Rate limiting
  max_messages_per_hour INTEGER DEFAULT 5,
  max_messages_per_day INTEGER DEFAULT 50,
  min_delay_between_messages_ms INTEGER DEFAULT 3000,
  
  -- Language preferences
  language_preference VARCHAR(10),
  auto_translate_responses BOOLEAN DEFAULT false,
  
  -- Reply behavior
  allow_free_text_replies_within_24h BOOLEAN DEFAULT true,
  prefer_templates_over_24h BOOLEAN DEFAULT true,
  auto_suggest_templates BOOLEAN DEFAULT true,
  
  -- Content restrictions
  max_response_length INTEGER DEFAULT 500,
  avoid_topics JSONB DEFAULT '[]',
  required_signature VARCHAR(255),
  
  -- AI model preferences
  preferred_model VARCHAR(100),
  temperature INTEGER DEFAULT 70,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- One config per user
  CONSTRAINT unique_user_ai_config UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_configurations_user_id ON ai_configurations(user_id);

-- ============================================================================
-- Chat-level AI Override
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_ai_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id VARCHAR(255) NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Tone and style overrides (null means inherit from user config)
  tone VARCHAR(50),
  style VARCHAR(50),
  formality_level VARCHAR(50),
  
  -- Rate limit override
  max_messages_per_hour INTEGER,
  
  -- Language override
  language_preference VARCHAR(10),
  
  -- Reply behavior overrides
  allow_free_text_replies BOOLEAN,
  use_templates_only BOOLEAN DEFAULT false,
  
  -- Content restrictions
  max_response_length INTEGER,
  avoid_topics JSONB,
  
  -- Custom instructions for this chat
  custom_instructions TEXT,
  
  -- AI behavior flags
  ai_enabled BOOLEAN DEFAULT true,
  
  -- Reason for override (for audit)
  override_reason VARCHAR(255),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- One override per chat
  CONSTRAINT unique_chat_ai_override UNIQUE(chat_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_ai_overrides_chat_id ON chat_ai_overrides(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_ai_overrides_user_id ON chat_ai_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_ai_overrides_ai_enabled ON chat_ai_overrides(ai_enabled);

-- ============================================================================
-- Workflow Stage AI Settings
-- Note: workflow_stages table may not exist yet, using VARCHAR for stage_id
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_stage_ai_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_id VARCHAR(255) NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Tone and style for this stage
  tone VARCHAR(50),
  style VARCHAR(50),
  formality_level VARCHAR(50),
  
  -- Rate limiting for this stage
  max_messages_per_hour INTEGER,
  
  -- Language for this stage
  language_preference VARCHAR(10),
  
  -- Reply behavior
  allow_free_text_replies BOOLEAN,
  use_templates_only BOOLEAN DEFAULT false,
  suggested_template_ids JSONB DEFAULT '[]',
  
  -- Content settings
  max_response_length INTEGER,
  
  -- Stage-specific AI context
  system_prompt_addition TEXT,
  goal_description TEXT,
  
  -- Escalation triggers
  escalation_triggers JSONB DEFAULT '[]',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- One settings record per stage
  CONSTRAINT unique_stage_ai_settings UNIQUE(stage_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_stage_ai_settings_stage_id ON workflow_stage_ai_settings(stage_id);
CREATE INDEX IF NOT EXISTS idx_workflow_stage_ai_settings_user_id ON workflow_stage_ai_settings(user_id);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE ai_configurations IS 'User-level default AI behavior configurations';
COMMENT ON TABLE chat_ai_overrides IS 'Per-chat AI behavior overrides that take priority over user defaults';
COMMENT ON TABLE workflow_stage_ai_settings IS 'Per-workflow-stage AI settings for stage-specific behavior';

COMMENT ON COLUMN ai_configurations.default_tone IS 'Default tone: friendly, professional, casual, formal';
COMMENT ON COLUMN ai_configurations.default_style IS 'Default style: concise, detailed, conversational, technical';
COMMENT ON COLUMN ai_configurations.formality_level IS 'Formality: casual, balanced, formal, very_formal';
COMMENT ON COLUMN ai_configurations.max_messages_per_hour IS 'Maximum AI-generated messages per hour';
COMMENT ON COLUMN ai_configurations.max_messages_per_day IS 'Maximum AI-generated messages per day';
COMMENT ON COLUMN ai_configurations.language_preference IS 'ISO language code for AI responses';
COMMENT ON COLUMN ai_configurations.temperature IS 'AI model temperature (0-100)';

COMMENT ON COLUMN chat_ai_overrides.ai_enabled IS 'Whether AI is enabled for this specific chat';
COMMENT ON COLUMN chat_ai_overrides.use_templates_only IS 'Force templates only, no free-text AI responses';
COMMENT ON COLUMN chat_ai_overrides.custom_instructions IS 'Custom context or instructions for this chat';
COMMENT ON COLUMN chat_ai_overrides.override_reason IS 'Reason for the override (audit trail)';

COMMENT ON COLUMN workflow_stage_ai_settings.system_prompt_addition IS 'Additional system prompt content for this stage';
COMMENT ON COLUMN workflow_stage_ai_settings.goal_description IS 'Description of AI goal for this stage';
COMMENT ON COLUMN workflow_stage_ai_settings.escalation_triggers IS 'JSON array of triggers that escalate to human';
