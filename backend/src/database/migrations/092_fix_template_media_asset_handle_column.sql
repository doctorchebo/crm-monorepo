-- Migration: Change asset_handle from VARCHAR(500) to TEXT
-- Purpose: Meta's asset handles from the Resumable Upload API can exceed 500
--          characters. Using TEXT removes any length constraint and prevents
--          "value too long for type character varying(500)" errors.

ALTER TABLE template_media
ALTER COLUMN asset_handle TYPE TEXT;

COMMENT ON COLUMN template_media.asset_handle IS 'Meta asset handle from Resumable Upload API. TEXT type used because handle length is unbounded.';
