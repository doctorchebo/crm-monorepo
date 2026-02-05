/**
 * Catalog Schema
 *
 * Defines database tables for product catalog management:
 * - catalogs: Main catalog container per team
 * - catalogItems: Individual products in the catalog
 * - catalogItemImages: Multiple images per product (up to 10)
 * - catalogCollections: Product groupings/sets
 * - catalogCollectionItems: Junction table for collection membership
 *
 * Based on Meta Commerce Platform catalog specifications:
 * - Images: JPEG/PNG, max 8MB, recommended 1024x1024
 * - Max 10 additional images per product
 * - Required fields: id, title, description, price, availability, link, image_link
 * - Product approval flow with pending/approved/rejected states
 *
 * WhatsApp Product Link Format:
 * https://wa.me/p/{product_id}/{phone_number}
 */

import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { teams, users } from './schema';

// ==================== Catalog Tables ====================

/**
 * Catalog container - one per team
 * Links to Meta Commerce catalog for synchronization
 */
export const catalogs = pgTable(
  'catalogs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull().default('Product Catalog'),
    description: text('description'),
    // Meta Commerce API integration
    metaCatalogId: varchar('meta_catalog_id', { length: 100 }), // Meta catalog ID after linking
    metaBusinessId: varchar('meta_business_id', { length: 100 }), // Meta Business ID
    currency: varchar('currency', { length: 3 }).notNull().default('USD'), // ISO 4217 currency code
    isActive: boolean('is_active').default(true),
    // Sync status
    lastSyncedAt: timestamp('last_synced_at'),
    syncStatus: varchar('sync_status', { length: 20 }).default('pending'), // 'pending', 'syncing', 'synced', 'error'
    syncError: text('sync_error'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    teamIdIndex: index('idx_catalogs_team_id').on(table.teamId),
    metaCatalogIdIndex: index('idx_catalogs_meta_catalog_id').on(
      table.metaCatalogId,
    ),
    // Each team can have only one catalog
    uniqueTeamCatalog: unique('uq_catalogs_team').on(table.teamId),
  }),
);

export type Catalog = typeof catalogs.$inferSelect;
export type NewCatalog = typeof catalogs.$inferInsert;

/**
 * Catalog Item approval status
 *
 * DRAFT: Item created locally, not submitted to Meta
 * PENDING_APPROVAL: Submitted to Meta, awaiting review
 * APPROVED: Approved by Meta, visible in WhatsApp
 * REJECTED: Rejected by Meta, see rejectionReason
 * NEEDS_UPDATE: Item needs update after rejection
 * ARCHIVED: Soft-deleted/archived item
 */
export type CatalogItemStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'NEEDS_UPDATE'
  | 'ARCHIVED';

/**
 * Catalog Items - individual products
 *
 * Based on Meta Commerce Catalog required and optional fields:
 * - Required: id, title, description, availability, condition, price, link, image_link
 * - Optional: sale_price, brand, google_product_category, additional_image_link, etc.
 *
 * WhatsApp specific:
 * - Hidden items won't appear in WhatsApp catalog but are stored locally
 * - Approval flow mirrors WhatsApp Business item review process
 */
export const catalogItems = pgTable(
  'catalog_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    catalogId: uuid('catalog_id')
      .notNull()
      .references(() => catalogs.id, { onDelete: 'cascade' }),
    // Meta Commerce required fields
    retailerId: varchar('retailer_id', { length: 100 }), // External/internal product code (item_code in form)
    name: varchar('name', { length: 200 }).notNull(), // title field in Meta API
    description: text('description'), // Optional in our form, but recommended for Meta
    // Pricing (stored in cents for precision)
    price: integer('price').notNull(), // Price in smallest currency unit (cents)
    salePrice: integer('sale_price'), // Optional sale price
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    // Product details
    link: text('link'), // Optional: link to product page
    availability: varchar('availability', { length: 20 })
      .notNull()
      .default('in stock'), // 'in stock', 'out of stock', 'preorder', 'available for order'
    condition: varchar('condition', { length: 20 }).notNull().default('new'), // 'new', 'refurbished', 'used'
    brand: varchar('brand', { length: 100 }),
    // Origin and compliance
    countryOfOrigin: varchar('country_of_origin', { length: 2 }).notNull(), // ISO 3166-1 alpha-2 (required in form)
    // Inventory
    inventory: integer('inventory').default(0),
    // Visibility
    isHidden: boolean('is_hidden').default(false), // Hide from WhatsApp catalog
    hiddenAt: timestamp('hidden_at'),
    hiddenBy: integer('hidden_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    // Meta Commerce sync - these fields link to the Meta Commerce catalog
    metaProductId: varchar('meta_product_id', { length: 100 }), // Product ID assigned by Meta after sync
    metaRetailerId: varchar('meta_retailer_id', { length: 100 }), // Retailer ID registered with Meta
    // Approval status (mirrors Meta's review process)
    status: varchar('status', { length: 20 }).notNull().default('DRAFT'),
    statusMessage: text('status_message'), // Rejection reason or status details
    reviewedAt: timestamp('reviewed_at'),
    // Timestamps
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    catalogIdIndex: index('idx_catalog_items_catalog_id').on(table.catalogId),
    statusIndex: index('idx_catalog_items_status').on(table.status),
    isHiddenIndex: index('idx_catalog_items_is_hidden').on(table.isHidden),
    metaProductIdIndex: index('idx_catalog_items_meta_product_id').on(
      table.metaProductId,
    ),
    retailerIdIndex: index('idx_catalog_items_retailer_id').on(
      table.retailerId,
    ),
    // Unique retailer ID per catalog (for external reference)
    uniqueRetailerId: unique('uq_catalog_items_retailer_id').on(
      table.catalogId,
      table.retailerId,
    ),
  }),
);

export type CatalogItem = typeof catalogItems.$inferSelect;
export type NewCatalogItem = typeof catalogItems.$inferInsert;

/**
 * Catalog Item Images
 *
 * Meta Commerce image requirements:
 * - JPEG or PNG format
 * - Max 8MB file size
 * - Recommended 1024x1024 pixels (min 500x500)
 * - Up to 10 additional images per product
 * - Main image is required (sortOrder = 0)
 *
 * Storage:
 * - Original images stored in S3 (chatflowai-dev bucket)
 * - Thumbnails generated asynchronously via Lambda
 */
export const catalogItemImages = pgTable(
  'catalog_item_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    catalogItemId: uuid('catalog_item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    // S3 storage keys
    imageKey: varchar('image_key', { length: 500 }).notNull(), // S3 key for full image
    thumbnailKey: varchar('thumbnail_key', { length: 500 }), // S3 key for thumbnail
    // Image metadata
    originalFilename: varchar('original_filename', { length: 255 }),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: integer('file_size').notNull(), // Size in bytes
    width: integer('width'),
    height: integer('height'),
    // Processing status
    status: varchar('status', { length: 20 }).notNull().default('uploading'), // 'uploading', 'processing', 'ready', 'error'
    errorMessage: text('error_message'),
    // Ordering (0 = main image)
    sortOrder: integer('sort_order').notNull().default(0),
    isMain: boolean('is_main').default(false), // Derived from sortOrder = 0
    // Meta Commerce sync
    metaImageUrl: text('meta_image_url'), // URL registered with Meta
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    catalogItemIdIndex: index('idx_catalog_item_images_item_id').on(
      table.catalogItemId,
    ),
    sortOrderIndex: index('idx_catalog_item_images_sort_order').on(
      table.sortOrder,
    ),
    statusIndex: index('idx_catalog_item_images_status').on(table.status),
    // Only one main image per item
    uniqueMainImage: unique('uq_catalog_item_images_main').on(
      table.catalogItemId,
      table.isMain,
    ),
  }),
);

export type CatalogItemImage = typeof catalogItemImages.$inferSelect;
export type NewCatalogItemImage = typeof catalogItemImages.$inferInsert;

/**
 * Catalog Collections
 *
 * Product sets/collections for organizing items:
 * - Group related products together
 * - Featured collections for showcase
 * - Seasonal/promotional groupings
 */
export const catalogCollections = pgTable(
  'catalog_collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    catalogId: uuid('catalog_id')
      .notNull()
      .references(() => catalogs.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    // Cover image
    coverImageKey: varchar('cover_image_key', { length: 500 }),
    coverThumbnailKey: varchar('cover_thumbnail_key', { length: 500 }),
    // Visibility
    isActive: boolean('is_active').default(true),
    // Ordering
    sortOrder: integer('sort_order').default(0),
    // Meta Commerce sync
    metaSetId: varchar('meta_set_id', { length: 100 }), // Product set ID from Meta
    // Timestamps
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    catalogIdIndex: index('idx_catalog_collections_catalog_id').on(
      table.catalogId,
    ),
    sortOrderIndex: index('idx_catalog_collections_sort_order').on(
      table.sortOrder,
    ),
    isActiveIndex: index('idx_catalog_collections_is_active').on(
      table.isActive,
    ),
    uniqueName: unique('uq_catalog_collections_name').on(
      table.catalogId,
      table.name,
    ),
  }),
);

export type CatalogCollection = typeof catalogCollections.$inferSelect;
export type NewCatalogCollection = typeof catalogCollections.$inferInsert;

/**
 * Catalog Collection Items - Junction table
 * Links products to collections (many-to-many)
 */
export const catalogCollectionItems = pgTable(
  'catalog_collection_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => catalogCollections.id, { onDelete: 'cascade' }),
    catalogItemId: uuid('catalog_item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    collectionIdIndex: index('idx_catalog_collection_items_collection_id').on(
      table.collectionId,
    ),
    catalogItemIdIndex: index('idx_catalog_collection_items_item_id').on(
      table.catalogItemId,
    ),
    sortOrderIndex: index('idx_catalog_collection_items_sort_order').on(
      table.sortOrder,
    ),
    // Unique item per collection
    uniqueCollectionItem: unique('uq_catalog_collection_items').on(
      table.collectionId,
      table.catalogItemId,
    ),
  }),
);

export type CatalogCollectionItem = typeof catalogCollectionItems.$inferSelect;
export type NewCatalogCollectionItem =
  typeof catalogCollectionItems.$inferInsert;

/**
 * Catalog Bulk Import Jobs
 *
 * Tracks bulk import operations:
 * - CSV/feed uploads
 * - Progress tracking
 * - Error handling and rollback support
 */
export const catalogBulkImportJobs = pgTable(
  'catalog_bulk_import_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    catalogId: uuid('catalog_id')
      .notNull()
      .references(() => catalogs.id, { onDelete: 'cascade' }),
    // Import source
    sourceType: varchar('source_type', { length: 20 }).notNull(), // 'csv', 'json', 'feed_url'
    sourceUrl: text('source_url'), // For feed URL imports
    sourceFileKey: varchar('source_file_key', { length: 500 }), // S3 key for uploaded file
    // Progress tracking
    status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending', 'processing', 'completed', 'failed', 'cancelled'
    totalItems: integer('total_items').default(0),
    processedItems: integer('processed_items').default(0),
    successfulItems: integer('successful_items').default(0),
    failedItems: integer('failed_items').default(0),
    // Error details
    errors: jsonb('errors').default('[]'), // Array of error objects with line/item info
    errorSummary: text('error_summary'),
    // Timestamps
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    catalogIdIndex: index('idx_catalog_bulk_import_jobs_catalog_id').on(
      table.catalogId,
    ),
    statusIndex: index('idx_catalog_bulk_import_jobs_status').on(table.status),
    createdAtIndex: index('idx_catalog_bulk_import_jobs_created_at').on(
      table.createdAt,
    ),
  }),
);

export type CatalogBulkImportJob = typeof catalogBulkImportJobs.$inferSelect;
export type NewCatalogBulkImportJob = typeof catalogBulkImportJobs.$inferInsert;

/**
 * Catalog Item Sent Messages
 *
 * Tracks catalog items sent in chat messages:
 * - Links messages to catalog items
 * - Used for analytics and message rendering
 */
export const catalogItemMessages = pgTable(
  'catalog_item_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: varchar('message_id').notNull(), // References messages.message_id
    chatId: varchar('chat_id').notNull(), // References chats.chat_id
    catalogItemId: uuid('catalog_item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    // Snapshot of item at time of sending (for historical accuracy)
    itemSnapshot: jsonb('item_snapshot').notNull(), // { name, price, image, etc. }
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    messageIdIndex: index('idx_catalog_item_messages_message_id').on(
      table.messageId,
    ),
    chatIdIndex: index('idx_catalog_item_messages_chat_id').on(table.chatId),
    catalogItemIdIndex: index('idx_catalog_item_messages_item_id').on(
      table.catalogItemId,
    ),
  }),
);

export type CatalogItemMessage = typeof catalogItemMessages.$inferSelect;
export type NewCatalogItemMessage = typeof catalogItemMessages.$inferInsert;

// ==================== Relations ====================

export const catalogsRelations = relations(catalogs, ({ one, many }) => ({
  team: one(teams, {
    fields: [catalogs.teamId],
    references: [teams.id],
  }),
  items: many(catalogItems),
  collections: many(catalogCollections),
  bulkImportJobs: many(catalogBulkImportJobs),
}));

export const catalogItemsRelations = relations(
  catalogItems,
  ({ one, many }) => ({
    catalog: one(catalogs, {
      fields: [catalogItems.catalogId],
      references: [catalogs.id],
    }),
    createdByUser: one(users, {
      fields: [catalogItems.createdBy],
      references: [users.id],
    }),
    hiddenByUser: one(users, {
      fields: [catalogItems.hiddenBy],
      references: [users.id],
      relationName: 'hiddenBy',
    }),
    images: many(catalogItemImages),
    collectionItems: many(catalogCollectionItems),
    messages: many(catalogItemMessages),
  }),
);

export const catalogItemImagesRelations = relations(
  catalogItemImages,
  ({ one }) => ({
    catalogItem: one(catalogItems, {
      fields: [catalogItemImages.catalogItemId],
      references: [catalogItems.id],
    }),
  }),
);

export const catalogCollectionsRelations = relations(
  catalogCollections,
  ({ one, many }) => ({
    catalog: one(catalogs, {
      fields: [catalogCollections.catalogId],
      references: [catalogs.id],
    }),
    createdByUser: one(users, {
      fields: [catalogCollections.createdBy],
      references: [users.id],
    }),
    items: many(catalogCollectionItems),
  }),
);

export const catalogCollectionItemsRelations = relations(
  catalogCollectionItems,
  ({ one }) => ({
    collection: one(catalogCollections, {
      fields: [catalogCollectionItems.collectionId],
      references: [catalogCollections.id],
    }),
    catalogItem: one(catalogItems, {
      fields: [catalogCollectionItems.catalogItemId],
      references: [catalogItems.id],
    }),
  }),
);

export const catalogBulkImportJobsRelations = relations(
  catalogBulkImportJobs,
  ({ one }) => ({
    catalog: one(catalogs, {
      fields: [catalogBulkImportJobs.catalogId],
      references: [catalogs.id],
    }),
    createdByUser: one(users, {
      fields: [catalogBulkImportJobs.createdBy],
      references: [users.id],
    }),
  }),
);

export const catalogItemMessagesRelations = relations(
  catalogItemMessages,
  ({ one }) => ({
    catalogItem: one(catalogItems, {
      fields: [catalogItemMessages.catalogItemId],
      references: [catalogItems.id],
    }),
  }),
);
