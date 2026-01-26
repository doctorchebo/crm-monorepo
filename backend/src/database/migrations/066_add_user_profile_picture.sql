-- Migration: Add profile picture columns to users table
-- This enables users to have profile pictures with async thumbnail generation

-- Add profile picture columns
ALTER TABLE users
ADD COLUMN IF NOT EXISTS profile_picture_key VARCHAR(500),
ADD COLUMN IF NOT EXISTS profile_picture_thumbnail_key VARCHAR(500),
ADD COLUMN IF NOT EXISTS profile_picture_status VARCHAR(20) DEFAULT 'none';

-- Index for quick lookups when displaying profile pictures
CREATE INDEX IF NOT EXISTS idx_users_profile_picture_status ON users(profile_picture_status) WHERE profile_picture_status != 'none';

-- Add comment for documentation
COMMENT ON COLUMN users.profile_picture_key IS 'S3 key for the original uploaded profile picture';
COMMENT ON COLUMN users.profile_picture_thumbnail_key IS 'S3 key for the generated thumbnail (200x200)';
COMMENT ON COLUMN users.profile_picture_status IS 'Status of profile picture: none, uploading, processing, ready, error';
