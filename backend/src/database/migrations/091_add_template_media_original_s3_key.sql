-- Migration: Add original_s3_key column to template_media table
-- Purpose: Track the original uploaded file separately from the thumbnail.
--          The s3_key column stores the thumbnail for UI preview, while
--          original_s3_key stores the original file needed by Meta at send time.
--
-- The original file must remain in S3 because Meta downloads media from the
-- provided URL each time a template message is sent — it does NOT reuse the
-- sample uploaded during template creation.

ALTER TABLE template_media
ADD COLUMN IF NOT EXISTS original_s3_key TEXT;

-- Backfill: for existing records where s3_key still points to an original file
-- (videos that were not deleted), copy it to original_s3_key.
-- For records where the original was already deleted, original_s3_key stays NULL
-- (these templates will need to be re-uploaded to work correctly).
UPDATE template_media
SET original_s3_key = s3_key
WHERE original_s3_key IS NULL
  AND s3_key IS NOT NULL
  AND s3_key NOT LIKE '%_thumb.jpg';

COMMENT ON COLUMN template_media.original_s3_key IS 'S3 key of the original uploaded file. Used to generate presigned URLs for Meta at send time. The s3_key column stores the thumbnail for UI preview.';
