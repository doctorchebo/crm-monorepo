-- Add language preference column to contacts table
-- This allows users to specify a customer's preferred language for template auto-selection

ALTER TABLE contacts 
ADD COLUMN language VARCHAR(10) DEFAULT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN contacts.language IS 'Preferred language code (e.g., en, es, pt, fr, de, it) for template auto-selection';
