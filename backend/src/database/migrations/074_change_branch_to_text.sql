-- ============================================================================
-- Change workflow_connections.branch from enum to text
-- 
-- This migration changes the branch column from an enum type to text.
-- This allows for dynamic branch values based on AI classification categories
-- which can have arbitrary names like "interested", "support", "billing", etc.
--
-- The enum was too restrictive and only allowed:
-- 'default', 'true', 'false', 'timeout', 'error'
--
-- With text, we can support:
-- - Standard branches: 'default', 'true', 'false', 'timeout', 'error'
-- - AI classification category names: 'interested', 'support', 'billing', etc.
-- - Any custom branch name for future extensibility
-- ============================================================================

-- Step 1: Add a new text column
ALTER TABLE workflow_connections ADD COLUMN branch_new text;

-- Step 2: Copy data from enum column to text column
UPDATE workflow_connections SET branch_new = branch::text;

-- Step 3: Set default value on new column
ALTER TABLE workflow_connections ALTER COLUMN branch_new SET DEFAULT 'default';

-- Step 4: Make new column NOT NULL after data migration
UPDATE workflow_connections SET branch_new = 'default' WHERE branch_new IS NULL;
ALTER TABLE workflow_connections ALTER COLUMN branch_new SET NOT NULL;

-- Step 5: Drop the old enum column
ALTER TABLE workflow_connections DROP COLUMN branch;

-- Step 6: Rename new column to original name
ALTER TABLE workflow_connections RENAME COLUMN branch_new TO branch;

-- Step 7: Add a check constraint for backwards compatibility with common values
-- but allow any text value (loose constraint for flexibility)
COMMENT ON COLUMN workflow_connections.branch IS 'Branch identifier for the connection. Common values: default, true, false, timeout, error. Also supports AI classification category names.';
