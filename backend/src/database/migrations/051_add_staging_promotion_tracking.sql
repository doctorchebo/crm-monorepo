-- Migration: Add staging promotion tracking columns
-- Purpose: Track when staging files are promoted and handle late thumbnail arrivals
--
-- Background:
-- When a user sends a media message, the main file is promoted from staging to
-- the final path immediately. However, thumbnails are generated asynchronously
-- and may arrive after the main file is promoted. These new columns track:
-- 1. When the main file was promoted (promotedAt)
-- 2. Where it was promoted to (promotedMessageId, promotedS3Key, promotedThumbnailKey)
-- 3. When the thumbnail was copied to the final path (thumbnailPromotedAt)
--
-- This allows the thumbnail callback to find promoted records and copy
-- late-arriving thumbnails to the correct destination.

-- Add promotion tracking columns
ALTER TABLE staged_media
ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS promoted_message_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS promoted_s3_key VARCHAR(1024),
ADD COLUMN IF NOT EXISTS promoted_thumbnail_key VARCHAR(1024),
ADD COLUMN IF NOT EXISTS thumbnail_promoted_at TIMESTAMP;

-- Add index for finding promoted records that need thumbnail cleanup
CREATE INDEX IF NOT EXISTS idx_staged_media_promoted_at
ON staged_media(promoted_at)
WHERE promoted_at IS NOT NULL;

-- Add comment explaining the promotion flow
COMMENT ON COLUMN staged_media.promoted_at IS 'When the main file was promoted from staging to final path';
COMMENT ON COLUMN staged_media.promoted_message_id IS 'The message ID the file was promoted to';
COMMENT ON COLUMN staged_media.promoted_s3_key IS 'Final S3 key after promotion';
COMMENT ON COLUMN staged_media.promoted_thumbnail_key IS 'Expected final thumbnail S3 key after promotion';
COMMENT ON COLUMN staged_media.thumbnail_promoted_at IS 'When thumbnail was copied to final path (null if pending)';
