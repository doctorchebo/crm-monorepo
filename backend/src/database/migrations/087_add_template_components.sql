-- ============================================================================
-- Migration: Add enhanced template components support
-- This adds support for buttons, media headers, carousels, and more
-- ============================================================================

-- Add components JSONB column to template_locales
-- This stores the full component structure for enhanced templates
ALTER TABLE template_locales 
ADD COLUMN IF NOT EXISTS components JSONB;

-- Add header_format to track the type of header
ALTER TABLE template_locales 
ADD COLUMN IF NOT EXISTS header_format VARCHAR(20);

-- Add buttons as a separate JSONB column for easier querying
-- Also stored in components, this is denormalized for performance
ALTER TABLE template_locales 
ADD COLUMN IF NOT EXISTS buttons JSONB DEFAULT '[]'::jsonb;

-- Add limited_time_offer configuration
ALTER TABLE template_locales 
ADD COLUMN IF NOT EXISTS limited_time_offer JSONB;

-- Add authentication_config for auth templates
ALTER TABLE template_locales 
ADD COLUMN IF NOT EXISTS authentication_config JSONB;

-- Add carousel_cards for marketing carousel templates
ALTER TABLE template_locales 
ADD COLUMN IF NOT EXISTS carousel_cards JSONB;

-- Add parameter_format to track named vs positional
ALTER TABLE template_locales 
ADD COLUMN IF NOT EXISTS parameter_format VARCHAR(20) DEFAULT 'named';

-- Create template_media table for tracking uploaded media assets
CREATE TABLE IF NOT EXISTS template_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    locale_id UUID NOT NULL REFERENCES template_locales(id) ON DELETE CASCADE,
    component_type VARCHAR(20) NOT NULL, -- 'header', 'carousel_0', 'carousel_1', etc.
    media_type VARCHAR(20) NOT NULL, -- 'image', 'video', 'document'
    original_filename VARCHAR(255),
    file_size_bytes BIGINT,
    mime_type VARCHAR(100),
    asset_handle VARCHAR(500), -- Meta's asset handle from Resumable Upload API
    asset_handle_expires_at TIMESTAMP, -- Asset handles expire after 30 days
    cdn_url TEXT, -- Our CDN URL for the file
    upload_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'uploading', 'completed', 'failed'
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for template_media
CREATE INDEX IF NOT EXISTS idx_template_media_locale_id ON template_media(locale_id);
CREATE INDEX IF NOT EXISTS idx_template_media_asset_handle ON template_media(asset_handle);
CREATE INDEX IF NOT EXISTS idx_template_media_upload_status ON template_media(upload_status);

-- Add index for querying templates by header format
CREATE INDEX IF NOT EXISTS idx_template_locales_header_format ON template_locales(header_format);

-- Add index for querying templates with buttons (partial index for non-empty arrays)
CREATE INDEX IF NOT EXISTS idx_template_locales_has_buttons 
ON template_locales ((buttons IS NOT NULL AND buttons != '[]'::jsonb))
WHERE buttons IS NOT NULL AND buttons != '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN template_locales.components IS 'Full template component structure: { header, body, footer, buttons, carousel, limitedTimeOffer, authentication }';
COMMENT ON COLUMN template_locales.header_format IS 'Header format type: TEXT, IMAGE, VIDEO, DOCUMENT, LOCATION';
COMMENT ON COLUMN template_locales.buttons IS 'Denormalized buttons array for query performance';
COMMENT ON COLUMN template_locales.parameter_format IS 'Variable format: named ({{customer.name}}) or positional ({{1}})';
COMMENT ON TABLE template_media IS 'Tracks media assets uploaded to Meta for template headers and carousel cards';
