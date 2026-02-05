-- Migration: Add Commerce Settings to Senders
-- Description: Adds columns to track WhatsApp Commerce Settings per phone number
--
-- New columns on senders table:
-- - is_catalog_enabled: Whether the catalog is visible to customers
-- - is_cart_enabled: Whether the shopping cart is enabled
-- - linked_catalog_id: The Meta catalog ID linked to this phone number
-- - commerce_settings_synced_at: When settings were last synced from Meta
--
-- These settings are managed via Meta's WhatsApp Commerce Settings API:
-- https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account-to-number-current-status/whatsapp_commerce_settings/

-- Add commerce settings columns to senders table
ALTER TABLE senders 
ADD COLUMN IF NOT EXISTS is_catalog_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_cart_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS linked_catalog_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS commerce_settings_synced_at TIMESTAMP;

-- Add index for quick lookup of senders with commerce enabled
CREATE INDEX IF NOT EXISTS idx_senders_commerce_enabled 
ON senders(is_catalog_enabled, is_cart_enabled) 
WHERE is_catalog_enabled = true OR is_cart_enabled = true;

-- Add comment for documentation
COMMENT ON COLUMN senders.is_catalog_enabled IS 'Whether the product catalog is visible to customers chatting with this number';
COMMENT ON COLUMN senders.is_cart_enabled IS 'Whether the shopping cart feature is enabled for this number';
COMMENT ON COLUMN senders.linked_catalog_id IS 'The Meta Commerce catalog ID linked to this phone number';
COMMENT ON COLUMN senders.commerce_settings_synced_at IS 'When commerce settings were last synced from Meta API';
