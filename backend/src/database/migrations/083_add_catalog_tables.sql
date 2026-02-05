-- Migration: Add Catalog Tables
-- Description: Creates tables for product catalog management with Meta Commerce integration
--
-- Tables created:
-- - catalogs: Main catalog container per team
-- - catalog_items: Individual products with Meta Commerce fields
-- - catalog_item_images: Multiple images per product (max 10)
-- - catalog_collections: Product groupings/sets
-- - catalog_collection_items: Junction table for collection membership
-- - catalog_bulk_import_jobs: Bulk import job tracking
-- - catalog_item_messages: Links sent messages to catalog items

-- ==================== Catalogs Table ====================
CREATE TABLE IF NOT EXISTS catalogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL DEFAULT 'Product Catalog',
  description TEXT,
  -- Meta Commerce API integration
  meta_catalog_id VARCHAR(100),
  meta_business_id VARCHAR(100),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  is_active BOOLEAN DEFAULT true,
  -- Sync status
  last_synced_at TIMESTAMP,
  sync_status VARCHAR(20) DEFAULT 'pending',
  sync_error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Each team can have only one catalog
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalogs_team ON catalogs(team_id);
CREATE INDEX IF NOT EXISTS idx_catalogs_team_id ON catalogs(team_id);
CREATE INDEX IF NOT EXISTS idx_catalogs_meta_catalog_id ON catalogs(meta_catalog_id);

-- ==================== Catalog Items Table ====================
CREATE TABLE IF NOT EXISTS catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id UUID NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  -- Meta Commerce required fields
  retailer_id VARCHAR(100),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  -- Pricing (stored in cents for precision)
  price INTEGER NOT NULL,
  sale_price INTEGER,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  -- Product details
  link TEXT,
  availability VARCHAR(20) NOT NULL DEFAULT 'in stock',
  condition VARCHAR(20) NOT NULL DEFAULT 'new',
  brand VARCHAR(100),
  -- Category
  google_product_category VARCHAR(500),
  product_type VARCHAR(500),
  -- Origin and compliance
  country_of_origin VARCHAR(2) NOT NULL,
  -- Inventory
  inventory INTEGER DEFAULT 0,
  -- Visibility
  is_hidden BOOLEAN DEFAULT false,
  hidden_at TIMESTAMP,
  hidden_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- Meta Commerce sync
  meta_product_id VARCHAR(100),
  meta_retailer_id VARCHAR(100),
  -- Approval status
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  status_message TEXT,
  reviewed_at TIMESTAMP,
  -- Timestamps
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_items_catalog_id ON catalog_items(catalog_id);
CREATE INDEX IF NOT EXISTS idx_catalog_items_status ON catalog_items(status);
CREATE INDEX IF NOT EXISTS idx_catalog_items_is_hidden ON catalog_items(is_hidden);
CREATE INDEX IF NOT EXISTS idx_catalog_items_meta_product_id ON catalog_items(meta_product_id);
CREATE INDEX IF NOT EXISTS idx_catalog_items_retailer_id ON catalog_items(retailer_id);
-- Unique retailer ID per catalog
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_items_retailer_id ON catalog_items(catalog_id, retailer_id) WHERE retailer_id IS NOT NULL;

-- ==================== Catalog Item Images Table ====================
CREATE TABLE IF NOT EXISTS catalog_item_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  -- S3 storage keys
  image_key VARCHAR(500) NOT NULL,
  thumbnail_key VARCHAR(500),
  -- Image metadata
  original_filename VARCHAR(255),
  mime_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  -- Processing status
  status VARCHAR(20) NOT NULL DEFAULT 'uploading',
  error_message TEXT,
  -- Ordering (0 = main image)
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_main BOOLEAN DEFAULT false,
  -- Meta Commerce sync
  meta_image_url TEXT,
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_item_images_item_id ON catalog_item_images(catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_catalog_item_images_sort_order ON catalog_item_images(sort_order);
CREATE INDEX IF NOT EXISTS idx_catalog_item_images_status ON catalog_item_images(status);
-- Only one main image per item (using partial index for is_main = true only)
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_item_images_main ON catalog_item_images(catalog_item_id) WHERE is_main = true;

-- ==================== Catalog Collections Table ====================
CREATE TABLE IF NOT EXISTS catalog_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id UUID NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  -- Cover image
  cover_image_key VARCHAR(500),
  cover_thumbnail_key VARCHAR(500),
  -- Visibility
  is_active BOOLEAN DEFAULT true,
  -- Ordering
  sort_order INTEGER DEFAULT 0,
  -- Meta Commerce sync
  meta_set_id VARCHAR(100),
  -- Timestamps
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_collections_catalog_id ON catalog_collections(catalog_id);
CREATE INDEX IF NOT EXISTS idx_catalog_collections_sort_order ON catalog_collections(sort_order);
CREATE INDEX IF NOT EXISTS idx_catalog_collections_is_active ON catalog_collections(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_collections_name ON catalog_collections(catalog_id, name);

-- ==================== Catalog Collection Items Junction Table ====================
CREATE TABLE IF NOT EXISTS catalog_collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES catalog_collections(id) ON DELETE CASCADE,
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_collection_items_collection_id ON catalog_collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_catalog_collection_items_item_id ON catalog_collection_items(catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_catalog_collection_items_sort_order ON catalog_collection_items(sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_collection_items ON catalog_collection_items(collection_id, catalog_item_id);

-- ==================== Catalog Bulk Import Jobs Table ====================
CREATE TABLE IF NOT EXISTS catalog_bulk_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id UUID NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  -- Import source
  source_type VARCHAR(20) NOT NULL,
  source_url TEXT,
  source_file_key VARCHAR(500),
  -- Progress tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  successful_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  -- Error details
  errors JSONB DEFAULT '[]',
  error_summary TEXT,
  -- Timestamps
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_bulk_import_jobs_catalog_id ON catalog_bulk_import_jobs(catalog_id);
CREATE INDEX IF NOT EXISTS idx_catalog_bulk_import_jobs_status ON catalog_bulk_import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_catalog_bulk_import_jobs_created_at ON catalog_bulk_import_jobs(created_at);

-- ==================== Catalog Item Messages Table ====================
CREATE TABLE IF NOT EXISTS catalog_item_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id VARCHAR NOT NULL,
  chat_id VARCHAR NOT NULL,
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  -- Snapshot of item at time of sending
  item_snapshot JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_item_messages_message_id ON catalog_item_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_catalog_item_messages_chat_id ON catalog_item_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_catalog_item_messages_item_id ON catalog_item_messages(catalog_item_id);
