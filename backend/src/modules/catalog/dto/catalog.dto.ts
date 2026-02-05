import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

// ==================== Enums ====================

export enum CatalogItemStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  NEEDS_UPDATE = 'NEEDS_UPDATE',
  ARCHIVED = 'ARCHIVED',
}

export enum ItemAvailability {
  IN_STOCK = 'in stock',
  OUT_OF_STOCK = 'out of stock',
  PREORDER = 'preorder',
  AVAILABLE_FOR_ORDER = 'available for order',
}

export enum ItemCondition {
  NEW = 'new',
  REFURBISHED = 'refurbished',
  USED = 'used',
}

export enum ImageStatus {
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  READY = 'ready',
  ERROR = 'error',
}

export enum BulkImportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Meta Catalog vertical type
 * Only 'commerce' is supported for WhatsApp product messages
 */
export type MetaCatalogVertical = 'commerce';

// ==================== Meta Catalog DTOs ====================

/**
 * DTO for Meta Catalog from the Graph API
 */
export class MetaCatalogDto {
  @ApiProperty({ description: 'Meta Catalog ID' })
  id: string;

  @ApiProperty({ description: 'Catalog name' })
  name: string;

  @ApiProperty({
    description: 'Catalog type/vertical (always commerce for WhatsApp)',
  })
  vertical: string;

  @ApiPropertyOptional({ description: 'Number of products in catalog' })
  productCount?: number;

  @ApiPropertyOptional({ description: 'Number of feeds in catalog' })
  feedCount?: number;

  @ApiPropertyOptional({ description: 'Meta Business ID' })
  businessId?: string;

  @ApiPropertyOptional({ description: 'Business name' })
  businessName?: string;
}

/**
 * DTO for creating a new Meta catalog
 * Commerce vertical is automatically used for WhatsApp compatibility
 */
export class CreateMetaCatalogDto {
  @ApiProperty({
    description: 'Catalog name',
    example: 'My WhatsApp Product Catalog',
  })
  @IsString()
  @Length(1, 255)
  name: string;
}

/**
 * DTO for linking a Meta catalog to the local catalog
 */
export class LinkMetaCatalogDto {
  @ApiProperty({
    description: 'Meta Catalog ID to link',
    example: '1234567890123456',
  })
  @IsString()
  metaCatalogId: string;
}

/**
 * Response DTO for list of Meta catalogs
 */
export class MetaCatalogsResponseDto {
  @ApiProperty({
    description: 'List of Meta catalogs',
    type: [MetaCatalogDto],
  })
  catalogs: MetaCatalogDto[];

  @ApiProperty({ description: 'Total number of catalogs' })
  total: number;

  @ApiPropertyOptional({ description: 'Meta Business ID' })
  businessId?: string;
}

/**
 * Response DTO for Meta catalog deletion
 * Includes information about WABA disconnection and catalog deletion
 */
export class DeleteMetaCatalogResponseDto {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success: boolean;

  @ApiProperty({ description: 'The ID of the catalog' })
  catalogId: string;

  @ApiPropertyOptional({
    description: 'Whether the catalog was disconnected from WABA',
  })
  disconnectedFromWaba?: boolean;

  @ApiPropertyOptional({
    description:
      'Whether the catalog was deleted from Meta (only possible if we own it)',
  })
  deletedFromMeta?: boolean;

  @ApiPropertyOptional({
    description: 'Whether the local catalog was unlinked',
  })
  localCatalogUnlinked?: boolean;

  @ApiPropertyOptional({
    description: 'Human-readable message about the result',
  })
  message?: string;
}

/**
 * DTO for Meta product set (collection)
 */
export class MetaProductSetDto {
  @ApiProperty({ description: 'Product set ID' })
  id: string;

  @ApiProperty({ description: 'Product set name' })
  name: string;

  @ApiPropertyOptional({ description: 'Number of products in set' })
  productCount?: number;
}

/**
 * DTO for creating a Meta product set
 */
export class CreateMetaProductSetDto {
  @ApiProperty({
    description: 'Product set name',
    example: 'Featured Products',
  })
  @IsString()
  @Length(1, 255)
  name: string;

  @ApiPropertyOptional({
    description:
      'Filter rules for dynamic sets. Leave empty for manual product assignment.',
    example: { product_type: { i_contains: 'shirt' } },
  })
  @IsOptional()
  filter?: Record<string, unknown>;
}

// ==================== Catalog DTOs ====================

export class CreateCatalogDto {
  @ApiPropertyOptional({
    description: 'Catalog name',
    default: 'Product Catalog',
  })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  @ApiPropertyOptional({ description: 'Catalog description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Currency code (ISO 4217)',
    default: 'USD',
  })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}

export class UpdateCatalogDto {
  @ApiPropertyOptional({ description: 'Catalog name' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  @ApiPropertyOptional({ description: 'Catalog description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Currency code (ISO 4217)' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ description: 'Is catalog active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CatalogResponseDto {
  @ApiProperty({ description: 'Catalog ID' })
  id: string;

  @ApiProperty({ description: 'Team ID' })
  teamId: number;

  @ApiProperty({ description: 'Catalog name' })
  name: string;

  @ApiPropertyOptional({ description: 'Catalog description' })
  description?: string | null;

  @ApiPropertyOptional({ description: 'Meta Commerce catalog ID' })
  metaCatalogId?: string | null;

  @ApiProperty({ description: 'Currency code' })
  currency: string;

  @ApiProperty({ description: 'Is catalog active' })
  isActive: boolean;

  @ApiPropertyOptional({ description: 'Last sync timestamp' })
  lastSyncedAt?: string | null;

  @ApiPropertyOptional({ description: 'Sync status' })
  syncStatus?: string | null;

  @ApiProperty({ description: 'Number of items in catalog' })
  itemCount: number;

  @ApiProperty({ description: 'Created at timestamp' })
  createdAt: string;

  @ApiProperty({ description: 'Updated at timestamp' })
  updatedAt: string;
}

// ==================== Catalog Item DTOs ====================

/**
 * DTO for creating a catalog item
 * Fields align with Meta Commerce catalog requirements
 * @see https://developers.facebook.com/docs/commerce-platform/catalog/fields
 */
export class CreateCatalogItemDto {
  @ApiProperty({
    description: 'Product name (Meta: title)',
    maxLength: 200,
  })
  @IsString()
  @Length(1, 200)
  name: string;

  @ApiProperty({
    description: 'Product description (required by Meta)',
  })
  @IsString()
  @Length(1, 5000)
  description: string;

  @ApiProperty({
    description: 'Price in cents (smallest currency unit)',
    minimum: 0,
  })
  @IsNumber()
  @IsInt()
  @Min(0)
  price: number;

  @ApiPropertyOptional({
    description: 'Sale price in cents (optional)',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(0)
  salePrice?: number;

  @ApiPropertyOptional({
    description: 'Currency code (ISO 4217)',
    default: 'USD',
  })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiProperty({
    description: 'Product link URL (required by Meta)',
  })
  @IsUrl()
  link: string;

  @ApiPropertyOptional({
    description: 'Retailer/SKU ID (Meta: id/content_id)',
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  retailerId?: string;

  @ApiPropertyOptional({
    description: 'Product availability (Meta required)',
    enum: ItemAvailability,
    default: ItemAvailability.IN_STOCK,
  })
  @IsOptional()
  @IsEnum(ItemAvailability)
  availability?: ItemAvailability;

  @ApiPropertyOptional({
    description: 'Product condition (Meta required)',
    enum: ItemCondition,
    default: ItemCondition.NEW,
  })
  @IsOptional()
  @IsEnum(ItemCondition)
  condition?: ItemCondition;

  @ApiPropertyOptional({
    description: 'Brand name (required for some Meta categories)',
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  brand?: string;
}

/**
 * DTO for updating a catalog item
 * All Meta Commerce catalog fields are optional for updates
 */
export class UpdateCatalogItemDto {
  @ApiPropertyOptional({ description: 'Product name' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @ApiPropertyOptional({ description: 'Product description' })
  @IsOptional()
  @IsString()
  @Length(1, 5000)
  description?: string;

  @ApiPropertyOptional({ description: 'Price in cents' })
  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: 'Sale price in cents' })
  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(0)
  salePrice?: number;

  @ApiPropertyOptional({ description: 'Product link URL' })
  @IsOptional()
  @IsUrl()
  link?: string;

  @ApiPropertyOptional({ description: 'Retailer/SKU ID' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  retailerId?: string;

  @ApiPropertyOptional({
    description: 'Product availability',
    enum: ItemAvailability,
  })
  @IsOptional()
  @IsEnum(ItemAvailability)
  availability?: ItemAvailability;

  @ApiPropertyOptional({
    description: 'Product condition',
    enum: ItemCondition,
  })
  @IsOptional()
  @IsEnum(ItemCondition)
  condition?: ItemCondition;

  @ApiPropertyOptional({ description: 'Brand name' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  brand?: string;
}

export class CatalogItemImageDto {
  @ApiProperty({ description: 'Image ID' })
  id: string;

  @ApiProperty({ description: 'Image URL' })
  url: string;

  @ApiPropertyOptional({ description: 'Thumbnail URL' })
  thumbnailUrl?: string | null;

  @ApiProperty({ description: 'Original filename' })
  originalFilename?: string | null;

  @ApiProperty({ description: 'MIME type' })
  mimeType: string;

  @ApiProperty({ description: 'File size in bytes' })
  fileSize: number;

  @ApiPropertyOptional({ description: 'Image width' })
  width?: number | null;

  @ApiPropertyOptional({ description: 'Image height' })
  height?: number | null;

  @ApiProperty({ description: 'Processing status', enum: ImageStatus })
  status: ImageStatus;

  @ApiProperty({ description: 'Sort order (0 = main image)' })
  sortOrder: number;

  @ApiProperty({ description: 'Is main/primary image' })
  isMain: boolean;
}

/**
 * DTO for catalog item response
 * Fields align with Meta Commerce catalog requirements
 */
export class CatalogItemResponseDto {
  @ApiProperty({ description: 'Item ID' })
  id: string;

  @ApiProperty({ description: 'Catalog ID' })
  catalogId: string;

  @ApiProperty({ description: 'Product name (Meta: title)' })
  name: string;

  @ApiProperty({ description: 'Product description' })
  description: string | null;

  @ApiProperty({ description: 'Price in cents' })
  price: number;

  @ApiPropertyOptional({ description: 'Sale price in cents' })
  salePrice?: number | null;

  @ApiProperty({ description: 'Currency code' })
  currency: string;

  @ApiProperty({ description: 'Product link URL (Meta required)' })
  link: string | null;

  @ApiPropertyOptional({ description: 'Retailer/SKU ID' })
  retailerId?: string | null;

  @ApiProperty({ description: 'Product availability' })
  availability: string;

  @ApiProperty({ description: 'Product condition' })
  condition: string;

  @ApiPropertyOptional({ description: 'Brand name' })
  brand?: string | null;

  @ApiProperty({ description: 'Approval status', enum: CatalogItemStatus })
  status: CatalogItemStatus;

  @ApiPropertyOptional({ description: 'Status message/rejection reason' })
  statusMessage?: string | null;

  @ApiPropertyOptional({ description: 'Meta product ID' })
  metaProductId?: string | null;

  @ApiProperty({ description: 'Product images (Meta: image_link)' })
  images: CatalogItemImageDto[];

  @ApiPropertyOptional({ description: 'Main image URL (convenience field)' })
  mainImageUrl?: string | null;

  @ApiPropertyOptional({
    description: 'Main thumbnail URL (convenience field)',
  })
  mainThumbnailUrl?: string | null;

  @ApiPropertyOptional({ description: 'WhatsApp product link' })
  whatsappProductLink?: string | null;

  @ApiPropertyOptional({ description: 'Created by user ID' })
  createdBy?: number | null;

  @ApiProperty({ description: 'Created at timestamp' })
  createdAt: string;

  @ApiProperty({ description: 'Updated at timestamp' })
  updatedAt: string;
}

// ==================== Catalog Collection DTOs ====================

// ==================== Submit for Review DTOs ====================

export class SubmitForReviewDto {
  @ApiProperty({
    description: 'Item IDs to submit for Meta review',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  itemIds: string[];
}

export class SubmitForReviewResponseDto {
  @ApiProperty({ description: 'Number of items submitted' })
  submittedCount: number;

  @ApiProperty({ description: 'Number of items that failed validation' })
  failedCount: number;

  @ApiProperty({ description: 'Items that failed validation' })
  failures: Array<{
    itemId: string;
    itemName: string;
    reason: string;
  }>;

  @ApiProperty({ description: 'Message describing the result' })
  message: string;
}

// ==================== Catalog Collection DTOs (continued) ====================

export class CreateCatalogCollectionDto {
  @ApiProperty({ description: 'Collection name', maxLength: 200 })
  @IsString()
  @Length(1, 200)
  name: string;

  @ApiPropertyOptional({ description: 'Collection description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Item IDs to add to collection' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  itemIds?: string[];
}

export class UpdateCatalogCollectionDto {
  @ApiPropertyOptional({ description: 'Collection name' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @ApiPropertyOptional({ description: 'Collection description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Is collection active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CatalogCollectionResponseDto {
  @ApiProperty({ description: 'Collection ID' })
  id: string;

  @ApiProperty({ description: 'Catalog ID' })
  catalogId: string;

  @ApiProperty({ description: 'Collection name' })
  name: string;

  @ApiPropertyOptional({ description: 'Collection description' })
  description?: string | null;

  @ApiPropertyOptional({ description: 'Cover image URL' })
  coverImageUrl?: string | null;

  @ApiPropertyOptional({ description: 'Cover thumbnail URL' })
  coverThumbnailUrl?: string | null;

  @ApiProperty({ description: 'Is collection active' })
  isActive: boolean;

  @ApiProperty({ description: 'Number of items in collection' })
  itemCount: number;

  @ApiProperty({ description: 'Sort order' })
  sortOrder: number;

  @ApiProperty({ description: 'Created at timestamp' })
  createdAt: string;

  @ApiProperty({ description: 'Updated at timestamp' })
  updatedAt: string;
}

// ==================== Bulk Import DTOs ====================

export class CreateBulkImportDto {
  @ApiProperty({
    description: 'Import source type',
    enum: ['csv', 'json', 'feed_url'],
  })
  @IsString()
  @IsEnum(['csv', 'json', 'feed_url'])
  sourceType: 'csv' | 'json' | 'feed_url';

  @ApiPropertyOptional({ description: 'Feed URL for URL imports' })
  @IsOptional()
  @IsUrl()
  sourceUrl?: string;
}

export class BulkImportJobResponseDto {
  @ApiProperty({ description: 'Job ID' })
  id: string;

  @ApiProperty({ description: 'Catalog ID' })
  catalogId: string;

  @ApiProperty({ description: 'Import source type' })
  sourceType: string;

  @ApiProperty({ description: 'Job status', enum: BulkImportStatus })
  status: BulkImportStatus;

  @ApiProperty({ description: 'Total items to process' })
  totalItems: number;

  @ApiProperty({ description: 'Items processed so far' })
  processedItems: number;

  @ApiProperty({ description: 'Successfully imported items' })
  successfulItems: number;

  @ApiProperty({ description: 'Failed items' })
  failedItems: number;

  @ApiPropertyOptional({ description: 'Error summary' })
  errorSummary?: string | null;

  @ApiPropertyOptional({ description: 'Started at timestamp' })
  startedAt?: string | null;

  @ApiPropertyOptional({ description: 'Completed at timestamp' })
  completedAt?: string | null;

  @ApiProperty({ description: 'Created at timestamp' })
  createdAt: string;
}

export class BulkImportCsvRowDto {
  @ApiProperty({ description: 'Product name', required: true })
  @IsString()
  @Length(1, 200)
  name: string;

  @ApiPropertyOptional({ description: 'Product description' })
  @IsOptional()
  @IsString()
  @Length(0, 9999)
  description?: string;

  @ApiProperty({ description: 'Product price in decimal (e.g., 29.99)' })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ description: 'Sale price in decimal' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @ApiPropertyOptional({ description: 'Currency code (e.g., USD)' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiProperty({
    description: 'Product link URL (required for Meta Commerce)',
    required: true,
  })
  @IsString()
  link: string;

  @ApiPropertyOptional({ description: 'Retailer/SKU ID' })
  @IsOptional()
  @IsString()
  retailerId?: string;

  @ApiPropertyOptional({
    description: 'Availability status',
    enum: ItemAvailability,
    default: ItemAvailability.IN_STOCK,
  })
  @IsOptional()
  @IsEnum(ItemAvailability)
  availability?: ItemAvailability;

  @ApiPropertyOptional({
    description: 'Item condition',
    enum: ItemCondition,
    default: ItemCondition.NEW,
  })
  @IsOptional()
  @IsEnum(ItemCondition)
  condition?: ItemCondition;

  @ApiPropertyOptional({ description: 'Brand name' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ description: 'Image URL (primary)' })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class BulkImportPreviewDto {
  @ApiProperty({
    description: 'List of items to import',
    type: [BulkImportCsvRowDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BulkImportCsvRowDto)
  items: BulkImportCsvRowDto[];
}

export class BulkImportResultDto {
  @ApiProperty({ description: 'Number of items successfully imported' })
  successCount: number;

  @ApiProperty({ description: 'Number of items that failed' })
  failedCount: number;

  @ApiProperty({ description: 'Total items attempted' })
  totalCount: number;

  @ApiProperty({
    description: 'Errors for failed items',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        row: { type: 'number' },
        name: { type: 'string' },
        error: { type: 'string' },
      },
    },
  })
  errors: Array<{ row: number; name: string; error: string }>;

  @ApiProperty({
    description: 'Successfully created item IDs',
    type: [String],
  })
  createdItemIds: string[];
}

// ==================== Image Upload DTOs ====================

export class InitiateImageUploadDto {
  @ApiProperty({ description: 'Original filename' })
  @IsString()
  @Length(1, 255)
  filename: string;

  @ApiProperty({ description: 'MIME type (image/jpeg or image/png)' })
  @IsString()
  @Matches(/^image\/(jpeg|png)$/, {
    message: 'MIME type must be image/jpeg or image/png',
  })
  mimeType: string;

  @ApiProperty({ description: 'File size in bytes', maximum: 8 * 1024 * 1024 })
  @IsNumber()
  @IsInt()
  @Min(1)
  @Max(8 * 1024 * 1024) // 8MB max per Meta requirements
  fileSize: number;

  @ApiPropertyOptional({
    description: 'Catalog item ID (required for existing items)',
  })
  @IsOptional()
  @IsUUID('4')
  catalogItemId?: string;
}

export class ImageUploadResponseDto {
  @ApiProperty({ description: 'Image ID' })
  imageId: string;

  @ApiProperty({ description: 'Pre-signed upload URL' })
  uploadUrl: string;

  @ApiProperty({ description: 'S3 key for the image' })
  imageKey: string;

  @ApiProperty({ description: 'Upload URL expiration timestamp' })
  expiresAt: string;
}

export class DirectImageUploadResponseDto {
  @ApiProperty({ description: 'Image ID (UUID)' })
  imageId: string;

  @ApiProperty({ description: 'S3 key for the image' })
  imageKey: string;

  @ApiProperty({ description: 'Upload status' })
  status: string;

  @ApiPropertyOptional({ description: 'Original filename' })
  originalFilename?: string;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  fileSize?: number;

  @ApiPropertyOptional({ description: 'MIME type' })
  mimeType?: string;
}

export class CompleteImageUploadDto {
  @ApiProperty({ description: 'Image ID' })
  @IsUUID('4')
  imageId: string;

  @ApiPropertyOptional({ description: 'Image width' })
  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(1)
  width?: number;

  @ApiPropertyOptional({ description: 'Image height' })
  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(1)
  height?: number;
}

// ==================== Send Catalog Item DTOs ====================

export class SendCatalogItemDto {
  @ApiProperty({ description: 'Chat ID to send to' })
  @IsString()
  chatId: string;

  @ApiProperty({
    description: 'Catalog item IDs to send (max 30 for multi-product)',
    type: [String],
    maxItems: 30,
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(30)
  catalogItemIds: string[];
}

export class SendCatalogItemToMultipleDto {
  @ApiProperty({ description: 'Chat IDs to send to', maxItems: 50 })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  chatIds: string[];

  @ApiProperty({
    description: 'Catalog item IDs to send (max 30 for multi-product)',
    type: [String],
    maxItems: 30,
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(30)
  catalogItemIds: string[];
}

// ==================== Collection Item Management ====================

export class AddItemsToCollectionDto {
  @ApiProperty({ description: 'Item IDs to add' })
  @IsArray()
  @IsUUID('4', { each: true })
  itemIds: string[];
}

export class RemoveItemsFromCollectionDto {
  @ApiProperty({ description: 'Item IDs to remove' })
  @IsArray()
  @IsUUID('4', { each: true })
  itemIds: string[];
}

// ==================== Query DTOs ====================

export class CatalogItemsQueryDto {
  @ApiPropertyOptional({ description: 'Search query' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: CatalogItemStatus,
  })
  @IsOptional()
  @IsEnum(CatalogItemStatus)
  status?: CatalogItemStatus;

  @ApiPropertyOptional({
    description: 'Include only items available for sending',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  availableOnly?: boolean;

  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class PaginatedCatalogItemsResponseDto {
  @ApiProperty({ description: 'Catalog items', type: [CatalogItemResponseDto] })
  items: CatalogItemResponseDto[];

  @ApiProperty({ description: 'Total number of items' })
  total: number;

  @ApiProperty({ description: 'Current page' })
  page: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;
}

// ==================== Image Reorder DTOs ====================

export class ReorderImagesDto {
  @ApiProperty({
    description: 'Ordered array of image IDs (first becomes main)',
    type: [String],
  })
  @IsArray()
  @IsUUID(4, { each: true })
  imageIds: string[];
}

// ==================== Status Sync DTOs ====================

export class SyncItemStatusDto {
  @ApiPropertyOptional({
    description:
      'Item IDs to sync. If not provided, syncs all pending approval items.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  itemIds?: string[];
}

export class SyncStatusResultDto {
  @ApiProperty({ description: 'Total number of items checked' })
  totalChecked: number;

  @ApiProperty({ description: 'Number of items with status changes' })
  changedCount: number;

  @ApiProperty({
    description: 'Details of items that changed status',
    type: 'array',
  })
  changes: Array<{
    itemId: string;
    itemName: string;
    previousStatus: string;
    newStatus: string;
    message?: string;
  }>;

  @ApiProperty({ description: 'Summary message' })
  message: string;
}

export class SyncSingleItemResultDto {
  @ApiProperty({ description: 'Item ID' })
  itemId: string;

  @ApiProperty({ description: 'Item name' })
  itemName: string;

  @ApiProperty({ description: 'Previous status before sync' })
  previousStatus: string;

  @ApiProperty({ description: 'Current status after sync' })
  currentStatus: string;

  @ApiProperty({ description: 'Whether the status changed' })
  changed: boolean;

  @ApiProperty({ description: 'Status message from Meta (if any)' })
  statusMessage?: string;
}

// ==================== Collection Item DTOs ====================

// Removed duplicate AddItemsToCollectionDto - already defined above
