-- Migration: Add s3_key column to template_media table
-- This column stores the S3 key for the uploaded media file
-- Used to generate public URLs for display in template edit mode

ALTER TABLE template_media
ADD COLUMN IF NOT EXISTS s3_key TEXT;

-- Add comment for documentation
COMMENT ON COLUMN template_media.s3_key IS 'S3 key where the file is stored for display in edit mode';
