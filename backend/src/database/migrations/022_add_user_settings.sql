-- Migration: Add User Settings table
-- Description: Creates a flexible user settings table for storing preferences
-- This design uses a category/key pattern for extensibility while maintaining type safety

-- User Settings table - stores user preferences with JSONB for flexible values
CREATE TABLE IF NOT EXISTS user_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL, -- 'notifications', 'appearance', 'chat', etc.
  key VARCHAR(100) NOT NULL, -- Setting key within category (e.g., 'browser_notifications_enabled')
  value JSONB NOT NULL DEFAULT '{}', -- Flexible value storage
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure unique settings per user/category/key combination
  CONSTRAINT user_settings_unique UNIQUE (user_id, category, key)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_category ON user_settings(category);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_category ON user_settings(user_id, category);

-- Insert default notification settings for existing users (off by default)
-- This ensures all users have explicit settings rather than relying on fallback defaults
INSERT INTO user_settings (user_id, category, key, value)
SELECT 
  id as user_id,
  'notifications' as category,
  'browser_notifications_enabled' as key,
  'false'::jsonb as value
FROM users
ON CONFLICT (user_id, category, key) DO NOTHING;

INSERT INTO user_settings (user_id, category, key, value)
SELECT 
  id as user_id,
  'notifications' as category,
  'sound_enabled' as key,
  'true'::jsonb as value
FROM users
ON CONFLICT (user_id, category, key) DO NOTHING;

INSERT INTO user_settings (user_id, category, key, value)
SELECT 
  id as user_id,
  'notifications' as category,
  'sound_volume' as key,
  '0.5'::jsonb as value
FROM users
ON CONFLICT (user_id, category, key) DO NOTHING;

-- Comment on table for documentation
COMMENT ON TABLE user_settings IS 'Stores user preferences and settings with flexible JSONB values. Categories include notifications, appearance, chat, etc.';
COMMENT ON COLUMN user_settings.category IS 'Setting category: notifications, appearance, chat, privacy, etc.';
COMMENT ON COLUMN user_settings.key IS 'Setting key within the category';
COMMENT ON COLUMN user_settings.value IS 'Setting value as JSONB - can be boolean, number, string, or object';
