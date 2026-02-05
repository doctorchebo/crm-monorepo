-- Migration: Remove unused columns from catalog_items table
-- These columns were originally added for Google Product Feed compatibility
-- but are not used since we're using Meta Commerce API exclusively

-- Remove google_product_category (Google taxonomy ID - not used with Meta)
ALTER TABLE catalog_items DROP COLUMN IF EXISTS google_product_category;

-- Remove product_type (Seller's categorization - not used)
ALTER TABLE catalog_items DROP COLUMN IF EXISTS product_type;

-- Add comment to clarify Meta-specific columns
COMMENT ON COLUMN catalog_items.meta_product_id IS 'Product ID assigned by Meta Commerce API after sync';
COMMENT ON COLUMN catalog_items.meta_retailer_id IS 'Retailer ID (SKU) registered with Meta Commerce catalog';
COMMENT ON COLUMN catalog_items.retailer_id IS 'Internal/external product code (SKU) - used as product_retailer_id in WhatsApp product messages';

-- Ensure existing catalogs have metaCatalogId populated
-- This updates any catalogs that were created before Meta Commerce was configured
-- Note: This requires META_CATALOG_ID to be set in environment before running
-- The actual linking is done in application code when a catalog is accessed
