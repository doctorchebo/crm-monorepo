-- Fix is_active column type from INT to BOOLEAN in senders table

-- Step 1: Create a temporary column with BOOLEAN type
ALTER TABLE senders
ADD COLUMN is_active_bool BOOLEAN DEFAULT true;

-- Step 2: Migrate existing data (INT to BOOLEAN)
-- Convert 1/0 to true/false
UPDATE senders
SET is_active_bool = (is_active::INTEGER != 0);

-- Step 3: Drop the old column
ALTER TABLE senders
DROP COLUMN is_active;

-- Step 4: Rename the new column to is_active
ALTER TABLE senders
RENAME COLUMN is_active_bool TO is_active;

-- Update migration 004's index to use BOOLEAN true instead of INT 1
DROP INDEX IF EXISTS senders_user_phone_unique;
CREATE UNIQUE INDEX senders_user_phone_unique ON senders(user_id, phone_number) WHERE is_active = true;
