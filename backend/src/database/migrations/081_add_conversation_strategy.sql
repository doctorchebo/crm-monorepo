-- Migration: Add conversation_strategy column to ai_configurations table
-- This column controls how AI handles initial or vague messages from customers
--
-- Values:
-- - 'direct': Provide information immediately when relevant knowledge base content exists
-- - 'qualifying': Ask clarifying questions first to understand user's specific needs (default)
-- - 'guided': Guide users through a discovery process before providing detailed info
--
-- Business Logic:
-- - Direct: Best for straightforward catalogs or when customers typically know what they want
-- - Qualifying: Understands customer needs first, provides more relevant recommendations
-- - Guided: Ideal for complex products/services or consultative sales

-- Add conversation_strategy column with default 'qualifying'
ALTER TABLE ai_configurations 
ADD COLUMN IF NOT EXISTS conversation_strategy VARCHAR(30) DEFAULT 'qualifying';

-- Add comment explaining the column
COMMENT ON COLUMN ai_configurations.conversation_strategy IS 
  'Controls how AI handles initial or vague messages. Options: direct (provide info immediately), qualifying (ask questions first), guided (discovery process). Default: qualifying.';

-- Update existing rows to have the default value
UPDATE ai_configurations 
SET conversation_strategy = 'qualifying' 
WHERE conversation_strategy IS NULL;
