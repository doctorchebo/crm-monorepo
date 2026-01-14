-- Migration: 050_create_staged_media_table.sql
-- Description: Create staged_media table for thumbnail pre-generation
-- Created: 2026-01-13
--
-- This table tracks files that are uploaded to S3 staging area before
-- being committed to a message. Used for thumbnail pre-generation so
-- thumbnails are ready by the time the user sends.

-- Create the staged_media table
CREATE TABLE IF NOT EXISTS staged_media (
    id SERIAL PRIMARY KEY,
    staging_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL,
    contact_id VARCHAR NOT NULL,
    s3_key VARCHAR NOT NULL,
    thumbnail_key VARCHAR,
    file_name VARCHAR NOT NULL,
    mime_type VARCHAR NOT NULL,
    size INTEGER NOT NULL,
    media_type VARCHAR NOT NULL,
    thumbnail_status VARCHAR DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_staged_media_staging_id ON staged_media(staging_id);
CREATE INDEX IF NOT EXISTS idx_staged_media_user_id ON staged_media(user_id);
CREATE INDEX IF NOT EXISTS idx_staged_media_expires_at ON staged_media(expires_at);

-- Add comment for documentation
COMMENT ON TABLE staged_media IS 'Temporary storage for files being staged before sending. Used for thumbnail pre-generation.';
COMMENT ON COLUMN staged_media.staging_id IS 'Unique identifier for the staged file';
COMMENT ON COLUMN staged_media.user_id IS 'User who initiated the upload';
COMMENT ON COLUMN staged_media.sender_id IS 'Target sender for when the file is promoted to a message';
COMMENT ON COLUMN staged_media.contact_id IS 'Target contact/chat for when the file is promoted';
COMMENT ON COLUMN staged_media.s3_key IS 'S3 object key in the staging area';
COMMENT ON COLUMN staged_media.thumbnail_key IS 'S3 object key for the generated thumbnail';
COMMENT ON COLUMN staged_media.thumbnail_status IS 'Status of thumbnail generation: pending, ready, failed, not-applicable';
COMMENT ON COLUMN staged_media.expires_at IS 'When this staging record expires and can be cleaned up';
