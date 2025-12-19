-- Migration: Add display_name column to templates table
-- This allows users to have a friendly display name while maintaining
-- a Meta-compliant internal name (lowercase, underscores only)

-- Add display_name column
ALTER TABLE templates ADD COLUMN display_name VARCHAR(255);

-- Populate display_name from existing name for backward compatibility
-- Convert underscores to spaces and capitalize words
UPDATE templates 
SET display_name = INITCAP(REPLACE(name, '_', ' '));

-- Make display_name NOT NULL after populating
ALTER TABLE templates ALTER COLUMN display_name SET NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN templates.display_name IS 'User-friendly display name shown in UI (e.g., "Order Confirmation")';
COMMENT ON COLUMN templates.name IS 'Meta-compliant template name (lowercase, underscores, e.g., "order_confirmation")';
