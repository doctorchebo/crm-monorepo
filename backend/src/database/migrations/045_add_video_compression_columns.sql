-- Migration: Add video compression columns to kb_object_media table
-- Purpose: Track video compression status and metadata for WhatsApp media limits

-- Add compression status column (none, pending, processing, completed, failed)
ALTER TABLE kb_object_media
ADD COLUMN IF NOT EXISTS compression_status VARCHAR(20) DEFAULT 'none';

-- Add compressed file S3 key (path to compressed version)
ALTER TABLE kb_object_media
ADD COLUMN IF NOT EXISTS compressed_s3_key VARCHAR(1000);

-- Add compressed file size in bytes
ALTER TABLE kb_object_media
ADD COLUMN IF NOT EXISTS compressed_file_size INTEGER;

-- Add original file size in bytes (preserved after compression replaces main file)
ALTER TABLE kb_object_media
ADD COLUMN IF NOT EXISTS original_file_size INTEGER;

-- Add compression error message
ALTER TABLE kb_object_media
ADD COLUMN IF NOT EXISTS compression_error TEXT;

-- Create index for compression status queries (find pending/processing jobs)
CREATE INDEX IF NOT EXISTS idx_kb_media_compression_status
ON kb_object_media (compression_status)
WHERE compression_status IN ('pending', 'processing');

-- Comment on columns for documentation
COMMENT ON COLUMN kb_object_media.compression_status IS 'Video compression status: none, pending, processing, completed, failed';
COMMENT ON COLUMN kb_object_media.compressed_s3_key IS 'S3 key of the compressed video file';
COMMENT ON COLUMN kb_object_media.compressed_file_size IS 'Size of compressed video in bytes';
COMMENT ON COLUMN kb_object_media.original_file_size IS 'Original file size before compression';
COMMENT ON COLUMN kb_object_media.compression_error IS 'Error message if compression failed';
