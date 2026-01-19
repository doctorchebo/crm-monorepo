-- Migration: Add created_at column to activity_logs table
-- This column is required by the AuditService

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'activity_logs' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE activity_logs ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
    END IF;
END $$;

-- Backfill any null created_at values
UPDATE activity_logs SET created_at = NOW() WHERE created_at IS NULL;
