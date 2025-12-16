-- Migration: Add variable_definitions table for structured template variable registry
-- This creates a system-level registry of allowed template variables
-- Users cannot define arbitrary variables - they must use registered ones

CREATE TABLE IF NOT EXISTS variable_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL,           -- 'customer', 'chat', 'sender', 'order', 'property', 'custom'
  property VARCHAR(100) NOT NULL,          -- 'first_name', 'email', etc.
  display_name VARCHAR(100) NOT NULL,      -- User-friendly name for UI
  description TEXT,                        -- Help text explaining the variable
  data_type VARCHAR(20) NOT NULL DEFAULT 'string',  -- 'string', 'number', 'date', 'phone', 'email', 'currency'
  source_table VARCHAR(100),               -- Source table for resolution (e.g., 'contacts', 'chats')
  source_column VARCHAR(100),              -- Column to read value from
  fallback_value TEXT,                     -- Default if value is missing
  is_required BOOLEAN DEFAULT FALSE,       -- Whether value must be present to send
  is_system BOOLEAN DEFAULT TRUE,          -- System-defined vs user-defined (for extensibility)
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,            -- For UI ordering within category
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast category lookups (for category selector)
CREATE INDEX idx_variable_definitions_category ON variable_definitions(category);

-- Unique constraint: one variable per category.property combination
CREATE UNIQUE INDEX idx_variable_definitions_unique ON variable_definitions(category, property);

-- Index for active variables
CREATE INDEX idx_variable_definitions_active ON variable_definitions(is_active) WHERE is_active = TRUE;
