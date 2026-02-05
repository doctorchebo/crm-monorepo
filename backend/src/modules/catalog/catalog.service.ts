import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { db } from '@database/db.connection';
import {
  catalogCollectionItems,
  catalogCollections,
  catalogItemImages,
  catalogItemMessages,
  catalogItems,
  catalogs,
  chats,
  NewCatalog,
  NewCatalogCollection,
  NewCatalogItem,
  NewCatalogItemImage,
  NewCatalogItemMessage,
  senders,
} from '@database/schema';
import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PermissionService } from '@shared/services/permission.service';
import { and, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import { WhatsAppService } from '../whatsapp/whatsapp.service';
import {
  CatalogCollectionResponseDto,
  CatalogItemImageDto,
  CatalogItemResponseDto,
  CatalogItemsQueryDto,
  CatalogItemStatus,
  CatalogResponseDto,
  CompleteImageUploadDto,
  CreateCatalogCollectionDto,
  CreateCatalogItemDto,
  ImageStatus,
  ImageUploadResponseDto,
  InitiateImageUploadDto,
  PaginatedCatalogItemsResponseDto,
  SubmitForReviewResponseDto,
  SyncSingleItemResultDto,
  SyncStatusResultDto,
  UpdateCatalogDto,
  UpdateCatalogItemDto,
} from './dto/catalog.dto';
import {
  CatalogTypeError,
  MetaCommerceApiService,
  MetaProductData,
} from './services/meta-commerce-api.service';

/**
 * Catalog Service
 *
 * Manages product catalog operations:
 * - CRUD for catalogs, items, collections
 * - Image upload with S3 pre-signed URLs
 * - Thumbnail generation via SQS + Lambda
 * - Bulk import support
 * - Meta Commerce API sync (future)
 *
 * Image Requirements (per Meta):
 * - Max 8MB per image
 * - JPEG or PNG format
 * - Recommended 1024x1024 pixels
 * - Max 10 images per item
 */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);
  private readonly s3Client: S3Client;
  private readonly sqsClient: SQSClient;
  private readonly bucketName: string;
  private readonly thumbnailQueueUrl?: string;

  // Meta Commerce image requirements
  private readonly MAX_IMAGE_SIZE = 8 * 1024 * 1024; // 8MB
  private readonly MAX_IMAGES_PER_ITEM = 10;
  private readonly ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => WhatsAppService))
    private readonly whatsappService: WhatsAppService,
    private readonly permissionService: PermissionService,
    private readonly metaCommerceApi: MetaCommerceApiService,
  ) {
    // Initialize S3 client
    this.s3Client = new S3Client({
      region: this.configService.get<string>('AWS_REGION', 'us-east-1'),
    });

    // Initialize SQS client for thumbnail generation
    this.sqsClient = new SQSClient({
      region: this.configService.get<string>('AWS_REGION', 'us-east-1'),
    });

    this.bucketName = this.configService.get<string>(
      'S3_BUCKET',
      'chatflowai-dev',
    );
    this.thumbnailQueueUrl = this.configService.get<string>(
      'CATALOG_THUMBNAIL_QUEUE_URL',
    );
  }

  // ==================== Team Resolution ====================

  /**
   * Get the team ID for a user
   * Uses PermissionService for robust team resolution
   *
   * @param userId - The user's ID
   * @returns The team ID
   * @throws ForbiddenException if user has no active team membership
   */
  async getUserTeamId(userId: number): Promise<number> {
    return this.permissionService.getUserTeamId(
      userId,
      'You must be part of a team to manage the catalog',
    );
  }

  // ==================== Catalog Operations ====================

  /**
   * Get or create catalog for a team
   * Each team has exactly one catalog
   *
   * IMPORTANT: Also auto-links existing catalogs to Meta if not already linked.
   * This ensures catalogs created before Meta Commerce was configured get linked.
   */
  async getOrCreateCatalog(teamId: number): Promise<CatalogResponseDto> {
    const metaConfig = this.metaCommerceApi.getConfig();

    // Try to get existing catalog
    const existing = await db
      .select()
      .from(catalogs)
      .where(eq(catalogs.teamId, teamId))
      .limit(1);

    if (existing.length > 0) {
      const catalog = existing[0];

      // Auto-link to Meta if not already linked and Meta is configured
      if (!catalog.metaCatalogId && metaConfig.catalogId) {
        const [updated] = await db
          .update(catalogs)
          .set({
            metaCatalogId: metaConfig.catalogId,
            metaBusinessId: metaConfig.businessId,
            updatedAt: new Date(),
          })
          .where(eq(catalogs.id, catalog.id))
          .returning();

        this.logger.log(
          `Auto-linked existing catalog ${catalog.id} to Meta catalog ${metaConfig.catalogId}`,
        );
        return this.formatCatalogResponse(updated);
      }

      return this.formatCatalogResponse(catalog);
    }

    // Create new catalog with Meta catalog ID from environment
    // The META_CATALOG_ID is the catalog linked to the WhatsApp Business Account
    const newCatalog: NewCatalog = {
      teamId,
      name: 'Product Catalog',
      currency: 'USD',
      isActive: true,
      // Link to Meta catalog - required for product messages
      metaCatalogId: metaConfig.catalogId || null,
      metaBusinessId: metaConfig.businessId || null,
    };

    const [created] = await db.insert(catalogs).values(newCatalog).returning();
    this.logger.log(
      `Created catalog ${created.id} for team ${teamId}` +
        (metaConfig.catalogId
          ? ` (linked to Meta catalog ${metaConfig.catalogId})`
          : ' (no Meta catalog linked)'),
    );

    return this.formatCatalogResponse(created);
  }

  /**
   * Link existing catalog to Meta Commerce
   *
   * This method updates an existing catalog with the Meta catalog ID from environment.
   * Useful for catalogs created before Meta Commerce was configured.
   *
   * @param catalogId - The catalog ID to link
   * @param teamId - The team ID for authorization
   * @returns Updated catalog
   */
  async linkCatalogToMeta(
    catalogId: string,
    teamId: number,
  ): Promise<CatalogResponseDto> {
    const [catalog] = await db
      .select()
      .from(catalogs)
      .where(and(eq(catalogs.id, catalogId), eq(catalogs.teamId, teamId)))
      .limit(1);

    if (!catalog) {
      throw new NotFoundException('Catalog not found');
    }

    const metaConfig = this.metaCommerceApi.getConfig();

    if (!metaConfig.catalogId) {
      throw new BadRequestException(
        'META_CATALOG_ID is not configured. Please set it in the environment variables.',
      );
    }

    const [updated] = await db
      .update(catalogs)
      .set({
        metaCatalogId: metaConfig.catalogId,
        metaBusinessId: metaConfig.businessId,
        updatedAt: new Date(),
      })
      .where(eq(catalogs.id, catalogId))
      .returning();

    this.logger.log(
      `Linked catalog ${catalogId} to Meta catalog ${metaConfig.catalogId}`,
    );

    return this.formatCatalogResponse(updated);
  }

  /**
   * Get catalog by team ID
   */
  async getCatalogByTeamId(teamId: number): Promise<CatalogResponseDto | null> {
    const [catalog] = await db
      .select()
      .from(catalogs)
      .where(eq(catalogs.teamId, teamId))
      .limit(1);

    if (!catalog) {
      return null;
    }

    return this.formatCatalogResponse(catalog);
  }

  /**
   * Update catalog settings
   */
  async updateCatalog(
    catalogId: string,
    teamId: number,
    dto: UpdateCatalogDto,
  ): Promise<CatalogResponseDto> {
    const [catalog] = await db
      .select()
      .from(catalogs)
      .where(and(eq(catalogs.id, catalogId), eq(catalogs.teamId, teamId)))
      .limit(1);

    if (!catalog) {
      throw new NotFoundException('Catalog not found');
    }

    const [updated] = await db
      .update(catalogs)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(catalogs.id, catalogId))
      .returning();

    return this.formatCatalogResponse(updated);
  }

  private async formatCatalogResponse(
    catalog: typeof catalogs.$inferSelect,
  ): Promise<CatalogResponseDto> {
    // Get item count
    const [{ itemCount }] = await db
      .select({ itemCount: count() })
      .from(catalogItems)
      .where(eq(catalogItems.catalogId, catalog.id));

    return {
      id: catalog.id,
      teamId: catalog.teamId,
      name: catalog.name,
      description: catalog.description,
      metaCatalogId: catalog.metaCatalogId,
      currency: catalog.currency,
      isActive: catalog.isActive ?? true,
      lastSyncedAt: catalog.lastSyncedAt?.toISOString() ?? null,
      syncStatus: catalog.syncStatus ?? null,
      itemCount: Number(itemCount) || 0,
      createdAt: catalog.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: catalog.updatedAt?.toISOString() || new Date().toISOString(),
    };
  }

  // ==================== Catalog Item Operations ====================

  /**
   * Create a new catalog item
   */
  async createCatalogItem(
    catalogId: string,
    teamId: number,
    userId: number,
    dto: CreateCatalogItemDto,
  ): Promise<CatalogItemResponseDto> {
    // Verify catalog belongs to team
    const [catalog] = await db
      .select()
      .from(catalogs)
      .where(and(eq(catalogs.id, catalogId), eq(catalogs.teamId, teamId)))
      .limit(1);

    if (!catalog) {
      throw new NotFoundException('Catalog not found');
    }

    // Check for duplicate retailerId if provided
    if (dto.retailerId) {
      const existing = await db
        .select()
        .from(catalogItems)
        .where(
          and(
            eq(catalogItems.catalogId, catalogId),
            eq(catalogItems.retailerId, dto.retailerId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        throw new ConflictException(
          `Item with code ${dto.retailerId} already exists`,
        );
      }
    }

    const newItem: NewCatalogItem = {
      catalogId,
      name: dto.name,
      description: dto.description,
      price: dto.price,
      salePrice: dto.salePrice,
      currency: dto.currency || catalog.currency,
      link: dto.link,
      countryOfOrigin: 'US', // Default - not exposed in Meta Commerce API
      retailerId: dto.retailerId,
      availability: dto.availability || 'in stock',
      condition: dto.condition || 'new',
      brand: dto.brand,
      inventory: 0, // Deprecated - availability is used for Meta catalogs
      isHidden: false, // Deprecated - items are always visible
      status: 'DRAFT',
      createdBy: userId,
    };

    const [created] = await db.insert(catalogItems).values(newItem).returning();
    this.logger.log(
      `Created catalog item ${created.id} in catalog ${catalogId}`,
    );

    return this.formatCatalogItemResponse(created);
  }

  /**
   * Get catalog items with pagination and filtering
   */
  async getCatalogItems(
    catalogId: string,
    teamId: number,
    query: CatalogItemsQueryDto,
  ): Promise<PaginatedCatalogItemsResponseDto> {
    // Verify catalog belongs to team
    const [catalog] = await db
      .select()
      .from(catalogs)
      .where(and(eq(catalogs.id, catalogId), eq(catalogs.teamId, teamId)))
      .limit(1);

    if (!catalog) {
      throw new NotFoundException('Catalog not found');
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions = [eq(catalogItems.catalogId, catalogId)];

    if (query.search) {
      conditions.push(
        or(
          ilike(catalogItems.name, `%${query.search}%`),
          ilike(catalogItems.description, `%${query.search}%`),
          ilike(catalogItems.retailerId, `%${query.search}%`),
        ) as any,
      );
    }

    if (query.status) {
      conditions.push(eq(catalogItems.status, query.status));
    }

    if (query.availableOnly) {
      // Only approved items
      conditions.push(eq(catalogItems.status, CatalogItemStatus.APPROVED));
    }

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(catalogItems)
      .where(and(...conditions));

    // Get items
    const items = await db
      .select()
      .from(catalogItems)
      .where(and(...conditions))
      .orderBy(desc(catalogItems.createdAt))
      .limit(limit)
      .offset(offset);

    // Format responses with images
    const formattedItems = await Promise.all(
      items.map((item) => this.formatCatalogItemResponse(item)),
    );

    return {
      items: formattedItems,
      total: Number(total),
      page,
      limit,
      totalPages: Math.ceil(Number(total) / limit),
    };
  }

  /**
   * Get a single catalog item by ID
   */
  async getCatalogItem(
    itemId: string,
    teamId: number,
  ): Promise<CatalogItemResponseDto> {
    const [item] = await db
      .select()
      .from(catalogItems)
      .innerJoin(catalogs, eq(catalogItems.catalogId, catalogs.id))
      .where(and(eq(catalogItems.id, itemId), eq(catalogs.teamId, teamId)))
      .limit(1);

    if (!item) {
      throw new NotFoundException('Catalog item not found');
    }

    return this.formatCatalogItemResponse(item.catalog_items);
  }

  /**
   * Update a catalog item
   */
  async updateCatalogItem(
    itemId: string,
    teamId: number,
    dto: UpdateCatalogItemDto,
  ): Promise<CatalogItemResponseDto> {
    // Verify item belongs to team's catalog
    const [existing] = await db
      .select()
      .from(catalogItems)
      .innerJoin(catalogs, eq(catalogItems.catalogId, catalogs.id))
      .where(and(eq(catalogItems.id, itemId), eq(catalogs.teamId, teamId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Catalog item not found');
    }

    // Check for duplicate retailerId if provided and changed
    if (
      dto.retailerId &&
      dto.retailerId !== existing.catalog_items.retailerId
    ) {
      const duplicate = await db
        .select()
        .from(catalogItems)
        .where(
          and(
            eq(catalogItems.catalogId, existing.catalog_items.catalogId),
            eq(catalogItems.retailerId, dto.retailerId),
          ),
        )
        .limit(1);

      if (duplicate.length > 0) {
        throw new ConflictException(
          `Item with code ${dto.retailerId} already exists`,
        );
      }
    }

    const updateData: Partial<typeof catalogItems.$inferInsert> = {
      ...dto,
      updatedAt: new Date(),
    };

    const [updated] = await db
      .update(catalogItems)
      .set(updateData)
      .where(eq(catalogItems.id, itemId))
      .returning();

    return this.formatCatalogItemResponse(updated);
  }

  /**
   * Delete a catalog item
   */
  async deleteCatalogItem(itemId: string, teamId: number): Promise<void> {
    // Verify item belongs to team's catalog
    const [existing] = await db
      .select()
      .from(catalogItems)
      .innerJoin(catalogs, eq(catalogItems.catalogId, catalogs.id))
      .where(and(eq(catalogItems.id, itemId), eq(catalogs.teamId, teamId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Catalog item not found');
    }

    // Delete item (cascade deletes images)
    await db.delete(catalogItems).where(eq(catalogItems.id, itemId));

    this.logger.log(`Deleted catalog item ${itemId}`);
  }

  /**
   * Submit catalog items for Meta review
   *
   * Items must meet the following requirements:
   * - Must have at least one image
   * - Must have name, description, and price
   * - Must have valid country of origin
   * - Must be in DRAFT or NEEDS_UPDATE status
   *
   * Flow:
   * 1. Validate items locally
   * 2. Generate unique retailer_id if not present
   * 3. Submit to Meta Commerce API (items_batch)
   * 4. Update local status to PENDING_APPROVAL
   * 5. Store Meta's batch handles for status tracking
   *
   * @param itemIds - Array of item IDs to submit
   * @param teamId - Team ID for authorization
   * @returns Result with success/fail counts and validation failures
   */
  async submitForReview(
    itemIds: string[],
    teamId: number,
  ): Promise<SubmitForReviewResponseDto> {
    const failures: Array<{
      itemId: string;
      itemName: string;
      reason: string;
    }> = [];
    const validItems: Array<{
      item: typeof catalogItems.$inferSelect;
      mainImageUrl: string;
      additionalImageUrls: string[];
    }> = [];

    // Get catalog for CDN base URL
    const catalog = await this.getOrCreateCatalog(teamId);

    // Get all items with their images
    const items = await db
      .select()
      .from(catalogItems)
      .innerJoin(catalogs, eq(catalogItems.catalogId, catalogs.id))
      .where(
        and(inArray(catalogItems.id, itemIds), eq(catalogs.teamId, teamId)),
      );

    if (items.length === 0) {
      throw new NotFoundException('No items found');
    }

    // Get all images for these items
    const allImages = await db
      .select()
      .from(catalogItemImages)
      .where(
        and(
          inArray(
            catalogItemImages.catalogItemId,
            items.map((i) => i.catalog_items.id),
          ),
          eq(catalogItemImages.status, 'ready'),
        ),
      )
      .orderBy(catalogItemImages.sortOrder);

    // Group images by item
    const imagesByItem = new Map<string, typeof allImages>();
    for (const img of allImages) {
      const existing = imagesByItem.get(img.catalogItemId) || [];
      existing.push(img);
      imagesByItem.set(img.catalogItemId, existing);
    }

    const cdnBaseUrl =
      this.configService.get('CDN_BASE_URL') ||
      `https://${this.bucketName}.s3.amazonaws.com`;

    // Validate each item
    for (const { catalog_items: item } of items) {
      const validationErrors: string[] = [];

      // Check status - only DRAFT, NEEDS_UPDATE, or REJECTED can be submitted
      if (
        item.status !== 'DRAFT' &&
        item.status !== 'NEEDS_UPDATE' &&
        item.status !== 'REJECTED'
      ) {
        validationErrors.push(
          `Item is already ${item.status.toLowerCase().replace('_', ' ')}`,
        );
      }

      // Check required fields
      if (!item.name || item.name.trim().length === 0) {
        validationErrors.push('Name is required');
      }

      if (!item.description || item.description.trim().length === 0) {
        validationErrors.push('Description is required');
      }

      if (item.price === null || item.price === undefined || item.price < 0) {
        validationErrors.push('Valid price is required');
      }

      // Check for product link (required by Meta Commerce)
      if (!item.link || item.link.trim().length === 0) {
        validationErrors.push('Product link URL is required');
      }

      // Check for at least one image
      const itemImages = imagesByItem.get(item.id) || [];
      if (itemImages.length === 0) {
        validationErrors.push('At least one image is required');
      }

      if (validationErrors.length > 0) {
        failures.push({
          itemId: item.id,
          itemName: item.name || 'Unnamed Item',
          reason: validationErrors.join('; '),
        });
      } else {
        // Find main image and additional images
        const mainImage = itemImages.find((img) => img.isMain) || itemImages[0];
        const additionalImages = itemImages.filter(
          (img) => img.id !== mainImage?.id,
        );

        validItems.push({
          item,
          mainImageUrl: `${cdnBaseUrl}/${mainImage.imageKey}`,
          additionalImageUrls: additionalImages.map(
            (img) => `${cdnBaseUrl}/${img.imageKey}`,
          ),
        });
      }
    }

    // If no valid items, return early
    if (validItems.length === 0) {
      return {
        submittedCount: 0,
        failedCount: failures.length,
        failures,
        message: 'No items passed validation',
      };
    }

    // Generate retailer_id for items that don't have one
    for (const { item } of validItems) {
      if (!item.retailerId) {
        // Generate a unique retailer ID based on item ID
        const retailerId = `SKU-${item.id.slice(0, 8).toUpperCase()}`;
        await db
          .update(catalogItems)
          .set({ retailerId, updatedAt: new Date() })
          .where(eq(catalogItems.id, item.id));
        item.retailerId = retailerId;
      }
    }

    // Prepare products for Meta API
    const metaProducts: MetaProductData[] = validItems.map(
      ({ item, mainImageUrl, additionalImageUrls }) => ({
        retailer_id: item.retailerId!,
        name: item.name,
        description: item.description || '',
        availability: (item.availability as any) || 'in stock',
        condition: (item.condition as any) || 'new',
        price: `${(item.price / 100).toFixed(2)} ${item.currency}`,
        sale_price: item.salePrice
          ? `${(item.salePrice / 100).toFixed(2)} ${item.currency}`
          : undefined,
        url: item.link || `https://catalog.example.com/p/${item.retailerId}`,
        image_url: mainImageUrl,
        additional_image_urls:
          additionalImageUrls.length > 0 ? additionalImageUrls : undefined,
        brand: item.brand || undefined,
        origin_country: item.countryOfOrigin,
      }),
    );

    // Submit to Meta Commerce API (only if we have a linked Meta catalog)
    if (!catalog.metaCatalogId) {
      this.logger.warn(
        `Catalog ${catalog.id} has no Meta catalog linked. Submitting in simulation mode.`,
      );
    }

    try {
      const batchResponse = await this.metaCommerceApi.submitProducts(
        metaProducts,
        catalog.metaCatalogId ?? undefined,
      );

      // Check for validation errors from Meta
      if (batchResponse.validation_status) {
        for (const status of batchResponse.validation_status) {
          if (status.errors && status.errors.length > 0) {
            const failedItem = validItems.find(
              (v) => v.item.retailerId === status.retailer_id,
            );
            if (failedItem) {
              failures.push({
                itemId: failedItem.item.id,
                itemName: failedItem.item.name,
                reason: status.errors.map((e) => e.message).join('; '),
              });
              // Remove from valid items
              const index = validItems.indexOf(failedItem);
              if (index > -1) {
                validItems.splice(index, 1);
              }
            }
          }
        }
      }

      // Update status for successfully submitted items
      for (const { item } of validItems) {
        await db
          .update(catalogItems)
          .set({
            status: CatalogItemStatus.PENDING_APPROVAL,
            statusMessage: 'Submitted to Meta for review',
            metaRetailerId: item.retailerId,
            updatedAt: new Date(),
          })
          .where(eq(catalogItems.id, item.id));
      }

      this.logger.log(
        `Submitted ${validItems.length} items to Meta Commerce API. ` +
          `Handles: ${batchResponse.handles?.join(', ') || 'none'}`,
      );
    } catch (error) {
      // Re-throw CatalogTypeError - this indicates wrong catalog type
      // which should be shown to the user, not silently handled
      if (error instanceof CatalogTypeError) {
        throw new BadRequestException(
          `Catalog type error: ${error.message}. ` +
            'WhatsApp product messages require an E-Commerce catalog. ' +
            'Please create a new Commerce catalog in Meta Commerce Manager.',
        );
      }

      this.logger.error(
        `Meta Commerce API submission failed: ${error.message}`,
      );

      // Fall back to local-only status update if Meta API fails
      // This allows development without Meta credentials
      for (const { item } of validItems) {
        await db
          .update(catalogItems)
          .set({
            status: CatalogItemStatus.PENDING_APPROVAL,
            statusMessage: 'Pending review (Meta API unavailable)',
            metaRetailerId: item.retailerId,
            updatedAt: new Date(),
          })
          .where(eq(catalogItems.id, item.id));
      }
    }

    const submittedCount = validItems.length;
    const message =
      submittedCount > 0
        ? `${submittedCount} item(s) submitted for review`
        : 'No items were submitted for review';

    this.logger.log(
      `Submit for review: ${submittedCount} submitted, ${failures.length} failed validation`,
    );

    return {
      submittedCount,
      failedCount: failures.length,
      failures,
      message,
    };
  }

  /**
   * Sync catalog item statuses with Meta Commerce API
   * Queries Meta's API to get the current review_status for each item
   *
   * @param itemIds - Optional item IDs to sync (syncs all pending if not provided)
   * @param teamId - Team ID for authorization
   * @returns Sync result with any status changes
   */
  async syncItemStatuses(
    itemIds: string[] | undefined,
    teamId: number,
  ): Promise<SyncStatusResultDto> {
    // First, get the catalog for this team to get the metaCatalogId
    const [catalog] = await db
      .select({
        id: catalogs.id,
        metaCatalogId: catalogs.metaCatalogId,
      })
      .from(catalogs)
      .where(eq(catalogs.teamId, teamId))
      .limit(1);

    if (!catalog) {
      return {
        totalChecked: 0,
        changedCount: 0,
        changes: [],
        message: 'No catalog found for this team',
      };
    }

    // Get items to sync
    const conditions = [eq(catalogItems.catalogId, catalog.id)];

    if (itemIds && itemIds.length > 0) {
      conditions.push(inArray(catalogItems.id, itemIds));
    } else {
      // If no specific items, sync all pending approval items
      conditions.push(
        eq(catalogItems.status, CatalogItemStatus.PENDING_APPROVAL),
      );
    }

    const items = await db
      .select({
        id: catalogItems.id,
        name: catalogItems.name,
        status: catalogItems.status,
        metaProductId: catalogItems.metaProductId,
        metaRetailerId: catalogItems.metaRetailerId,
        retailerId: catalogItems.retailerId,
        updatedAt: catalogItems.updatedAt,
      })
      .from(catalogItems)
      .where(and(...conditions));

    if (items.length === 0) {
      return {
        totalChecked: 0,
        changedCount: 0,
        changes: [],
        message: 'No items to sync',
      };
    }

    const changes: SyncStatusResultDto['changes'] = [];

    // Collect all retailer IDs for batch lookup
    const retailerIds = items
      .map((item) => item.metaRetailerId || item.retailerId)
      .filter((id): id is string => !!id);

    // Query Meta Commerce API for all products in one batch
    // Pass the catalog's metaCatalogId to use the correct Meta catalog
    let metaProductsMap = new Map<
      string,
      { id: string; review_status: string }
    >();

    if (retailerIds.length > 0 && catalog.metaCatalogId) {
      try {
        const metaProductsResult =
          await this.metaCommerceApi.getProductsByRetailerIds(
            retailerIds,
            catalog.metaCatalogId,
          );

        // The result is already a Map<string, MetaProductItem>
        for (const [retailerId, product] of metaProductsResult) {
          metaProductsMap.set(retailerId, {
            id: product.id,
            review_status: product.review_status || 'pending',
          });
        }

        this.logger.log(
          `Fetched ${metaProductsResult.size} products from Meta catalog ${catalog.metaCatalogId} for ${retailerIds.length} retailer IDs`,
        );
      } catch (error) {
        // Re-throw CatalogTypeError - this indicates wrong catalog type
        // which should be shown to the user, not silently handled
        if (error instanceof CatalogTypeError) {
          throw new BadRequestException(
            `Catalog type error: ${error.message}. ` +
              'WhatsApp product messages require an E-Commerce catalog. ' +
              'Please create a new Commerce catalog in Meta Commerce Manager.',
          );
        }

        this.logger.error(
          `Failed to fetch products from Meta: ${error.message}`,
        );
        // If Meta API fails, we'll fall back to simulation mode for dev
      }
    } else if (retailerIds.length > 0 && !catalog.metaCatalogId) {
      this.logger.warn(
        `Catalog ${catalog.id} has no Meta catalog linked. Status sync will use simulation mode.`,
      );
    }

    // Process each item
    for (const item of items) {
      const previousStatus = item.status;
      const retailerId = item.metaRetailerId || item.retailerId;
      const metaProduct = retailerId ? metaProductsMap.get(retailerId) : null;

      let newStatus: string;
      let statusMessage: string | null = null;
      let metaProductId = item.metaProductId;

      if (metaProduct) {
        // We have data from Meta - use it
        newStatus = this.metaCommerceApi.mapReviewStatusToCatalogStatus(
          metaProduct.review_status,
        );
        metaProductId = metaProduct.id;

        switch (metaProduct.review_status) {
          case 'approved':
            statusMessage = 'Approved by Meta';
            break;
          case 'rejected':
            statusMessage = 'Rejected by Meta';
            break;
          case 'outdated':
            statusMessage = 'Needs update - product information is outdated';
            break;
          default:
            statusMessage = 'Under review by Meta';
        }
      } else {
        // No Meta data - use simulation for development
        const simulatedResult = await this.metaCommerceApi.simulateStatusCheck(
          item.id,
          item.updatedAt,
        );
        newStatus = simulatedResult.status;
        statusMessage = simulatedResult.message;

        // Generate a fake meta product ID for simulation
        if (newStatus === CatalogItemStatus.APPROVED && !metaProductId) {
          metaProductId = `sim_${item.id.slice(0, 8)}`;
        }
      }

      if (newStatus !== previousStatus) {
        // Update the item status
        await db
          .update(catalogItems)
          .set({
            status: newStatus as CatalogItemStatus,
            statusMessage,
            metaProductId,
            reviewedAt:
              newStatus === CatalogItemStatus.APPROVED ||
              newStatus === CatalogItemStatus.REJECTED
                ? new Date()
                : undefined,
            updatedAt: new Date(),
          })
          .where(eq(catalogItems.id, item.id));

        changes.push({
          itemId: item.id,
          itemName: item.name || 'Unnamed Item',
          previousStatus,
          newStatus,
          message: statusMessage ?? undefined,
        });
      }
    }

    const message =
      changes.length > 0
        ? `Synced ${items.length} item(s). ${changes.length} status(es) changed.`
        : `Synced ${items.length} item(s). No status changes.`;

    this.logger.log(
      `Status sync: checked ${items.length} items, ${changes.length} changed`,
    );

    return {
      totalChecked: items.length,
      changedCount: changes.length,
      changes,
      message,
    };
  }

  /**
   * Sync status for a single catalog item
   *
   * @param itemId - Item ID to sync
   * @param teamId - Team ID for authorization
   * @returns Sync result for the specific item
   */
  async syncSingleItemStatus(
    itemId: string,
    teamId: number,
  ): Promise<SyncSingleItemResultDto> {
    // Get the item along with its catalog's metaCatalogId
    const [dbResult] = await db
      .select({
        id: catalogItems.id,
        name: catalogItems.name,
        status: catalogItems.status,
        statusMessage: catalogItems.statusMessage,
        metaProductId: catalogItems.metaProductId,
        metaRetailerId: catalogItems.metaRetailerId,
        retailerId: catalogItems.retailerId,
        updatedAt: catalogItems.updatedAt,
        metaCatalogId: catalogs.metaCatalogId,
      })
      .from(catalogItems)
      .innerJoin(catalogs, eq(catalogItems.catalogId, catalogs.id))
      .where(and(eq(catalogItems.id, itemId), eq(catalogs.teamId, teamId)));

    if (!dbResult) {
      throw new NotFoundException(`Catalog item ${itemId} not found`);
    }

    const item = dbResult;
    const metaCatalogId = dbResult.metaCatalogId;
    const previousStatus = item.status;

    // Only sync items that are pending
    if (item.status !== CatalogItemStatus.PENDING_APPROVAL) {
      return {
        itemId: item.id,
        itemName: item.name || 'Unnamed Item',
        previousStatus,
        currentStatus: item.status,
        changed: false,
        statusMessage: item.statusMessage ?? undefined,
      };
    }

    const retailerId = item.metaRetailerId || item.retailerId;
    let newStatus: string = previousStatus;
    let statusMessage: string | null = item.statusMessage;
    let metaProductId = item.metaProductId;

    this.logger.debug(
      `Syncing status for item ${itemId}: retailerId="${retailerId}", metaCatalogId="${metaCatalogId || 'not linked'}"`,
    );

    // Try to get status from Meta API (only if we have a linked Meta catalog)
    if (retailerId && metaCatalogId) {
      try {
        const metaProduct = await this.metaCommerceApi.getProductByRetailerId(
          retailerId,
          metaCatalogId,
        );

        if (metaProduct) {
          const metaReviewStatus = metaProduct.review_status || 'pending';
          newStatus =
            this.metaCommerceApi.mapReviewStatusToCatalogStatus(
              metaReviewStatus,
            );
          metaProductId = metaProduct.id;

          this.logger.log(
            `Item ${itemId} sync result: Meta review_status="${metaReviewStatus}" -> local status="${newStatus}" (previous: "${previousStatus}")`,
          );

          switch (metaProduct.review_status) {
            case 'approved':
              statusMessage = 'Approved by Meta';
              break;
            case 'rejected':
              statusMessage =
                metaProduct.review_rejection_reasons?.join('; ') ||
                'Rejected by Meta';
              break;
            case 'outdated':
              statusMessage = 'Needs update - product information is outdated';
              break;
            default:
              statusMessage = 'Under review by Meta';
          }
        } else {
          this.logger.warn(
            `Item ${itemId}: No product found in Meta catalog for retailerId="${retailerId}". Product may not be submitted yet.`,
          );
        }
      } catch (error) {
        // Re-throw CatalogTypeError - this indicates wrong catalog type
        // which should be shown to the user, not silently handled
        if (error instanceof CatalogTypeError) {
          throw new BadRequestException(
            `Catalog type error: ${error.message}. ` +
              'WhatsApp product messages require an E-Commerce catalog. ' +
              'Please create a new Commerce catalog in Meta Commerce Manager.',
          );
        }

        this.logger.warn(
          `Failed to get Meta status for item ${itemId}: ${error.message}`,
        );
        // Fall back to simulation
        const simulatedResult = await this.metaCommerceApi.simulateStatusCheck(
          item.id,
          item.updatedAt,
        );
        newStatus = simulatedResult.status;
        statusMessage = simulatedResult.message;

        if (newStatus === CatalogItemStatus.APPROVED && !metaProductId) {
          metaProductId = `sim_${item.id.slice(0, 8)}`;
        }
      }
    } else if (retailerId && !metaCatalogId) {
      // Has retailer ID but no Meta catalog linked - use simulation
      this.logger.warn(
        `No Meta catalog linked for item ${itemId}. Using simulation mode.`,
      );
      const simulatedResult = await this.metaCommerceApi.simulateStatusCheck(
        item.id,
        item.updatedAt,
      );
      newStatus = simulatedResult.status;
      statusMessage = simulatedResult.message;

      if (newStatus === CatalogItemStatus.APPROVED && !metaProductId) {
        metaProductId = `sim_${item.id.slice(0, 8)}`;
      }
    } else {
      // No retailer ID - use simulation
      const simulatedResult = await this.metaCommerceApi.simulateStatusCheck(
        item.id,
        item.updatedAt,
      );
      newStatus = simulatedResult.status;
      statusMessage = simulatedResult.message;

      if (newStatus === CatalogItemStatus.APPROVED && !metaProductId) {
        metaProductId = `sim_${item.id.slice(0, 8)}`;
      }
    }

    if (newStatus !== previousStatus) {
      // Update the item status
      await db
        .update(catalogItems)
        .set({
          status: newStatus as CatalogItemStatus,
          statusMessage,
          metaProductId,
          reviewedAt:
            newStatus === CatalogItemStatus.APPROVED ||
            newStatus === CatalogItemStatus.REJECTED
              ? new Date()
              : undefined,
          updatedAt: new Date(),
        })
        .where(eq(catalogItems.id, item.id));

      this.logger.log(
        `Item ${item.id} status changed: ${previousStatus} -> ${newStatus}`,
      );
    } else {
      this.logger.debug(
        `Item ${item.id} status unchanged: "${previousStatus}" (still ${statusMessage || 'pending'})`,
      );
    }

    const result = {
      itemId: item.id,
      itemName: item.name || 'Unnamed Item',
      previousStatus,
      currentStatus: newStatus,
      changed: newStatus !== previousStatus,
      statusMessage: statusMessage ?? undefined,
    };

    this.logger.log(
      `Sync single item result: itemId=${result.itemId}, changed=${result.changed}, ` +
        `status="${result.currentStatus}", message="${result.statusMessage || 'none'}"`,
    );

    return result;
  }

  /**
   * Handle incoming webhook for catalog item status update
   * Called by CatalogWebhookController when Meta sends a status update
   *
   * @param data - Webhook data containing retailerId or metaProductId and new status
   * @returns Update result or null if item not found
   */
  async handleStatusWebhook(data: {
    retailerId?: string;
    metaProductId?: string;
    reviewStatus: string;
    rejectionReasons?: string[];
  }): Promise<{
    itemId: string;
    itemName: string;
    retailerId?: string;
    metaProductId?: string;
    previousStatus: string;
    newStatus: string;
    statusMessage?: string;
    teamId: number;
  } | null> {
    // Define the shape of item we need
    type WebhookItem = {
      id: string;
      name: string;
      status: string;
      statusMessage: string | null;
      metaProductId: string | null;
      metaRetailerId: string | null;
      retailerId: string | null;
      teamId: number;
    };

    // Find the item by retailerId or metaProductId
    let item: WebhookItem | undefined;

    if (data.retailerId) {
      const [found] = await db
        .select({
          id: catalogItems.id,
          name: catalogItems.name,
          status: catalogItems.status,
          statusMessage: catalogItems.statusMessage,
          metaProductId: catalogItems.metaProductId,
          metaRetailerId: catalogItems.metaRetailerId,
          retailerId: catalogItems.retailerId,
          teamId: catalogs.teamId,
        })
        .from(catalogItems)
        .innerJoin(catalogs, eq(catalogItems.catalogId, catalogs.id))
        .where(
          or(
            eq(catalogItems.retailerId, data.retailerId),
            eq(catalogItems.metaRetailerId, data.retailerId),
          ),
        )
        .limit(1);
      item = found;
    } else if (data.metaProductId) {
      const [found] = await db
        .select({
          id: catalogItems.id,
          name: catalogItems.name,
          status: catalogItems.status,
          statusMessage: catalogItems.statusMessage,
          metaProductId: catalogItems.metaProductId,
          metaRetailerId: catalogItems.metaRetailerId,
          retailerId: catalogItems.retailerId,
          teamId: catalogs.teamId,
        })
        .from(catalogItems)
        .innerJoin(catalogs, eq(catalogItems.catalogId, catalogs.id))
        .where(eq(catalogItems.metaProductId, data.metaProductId))
        .limit(1);
      item = found;
    }

    if (!item) {
      this.logger.warn(
        `Webhook received for unknown item: retailerId=${data.retailerId}, productId=${data.metaProductId}`,
      );
      return null;
    }

    const previousStatus = item.status;
    const newStatus = this.metaCommerceApi.mapReviewStatusToCatalogStatus(
      data.reviewStatus,
    );

    // Determine status message
    let statusMessage: string | null = item.statusMessage;
    switch (data.reviewStatus) {
      case 'approved':
        statusMessage = 'Approved by Meta';
        break;
      case 'rejected':
        statusMessage = data.rejectionReasons?.join('; ') || 'Rejected by Meta';
        break;
      case 'outdated':
        statusMessage = 'Needs update - product information is outdated';
        break;
      case 'pending':
        statusMessage = 'Under review by Meta';
        break;
    }

    // Only update if status actually changed
    if (newStatus !== previousStatus) {
      await db
        .update(catalogItems)
        .set({
          status: newStatus as CatalogItemStatus,
          statusMessage,
          metaProductId: data.metaProductId || item.metaProductId,
          reviewedAt:
            newStatus === CatalogItemStatus.APPROVED ||
            newStatus === CatalogItemStatus.REJECTED
              ? new Date()
              : undefined,
          updatedAt: new Date(),
        })
        .where(eq(catalogItems.id, item.id));

      this.logger.log(
        `📬 Webhook: Item ${item.id} (${item.name}) status changed: ${previousStatus} -> ${newStatus}`,
      );
    } else {
      this.logger.log(
        `📬 Webhook: Item ${item.id} (${item.name}) status unchanged: ${previousStatus}`,
      );
    }

    return {
      itemId: item.id,
      itemName: item.name || 'Unnamed Item',
      retailerId: item.retailerId || item.metaRetailerId || undefined,
      metaProductId: data.metaProductId || item.metaProductId || undefined,
      previousStatus,
      newStatus,
      statusMessage: statusMessage || undefined,
      teamId: item.teamId,
    };
  }

  private async formatCatalogItemResponse(
    item: typeof catalogItems.$inferSelect,
  ): Promise<CatalogItemResponseDto> {
    // Get images
    const images = await db
      .select()
      .from(catalogItemImages)
      .where(eq(catalogItemImages.catalogItemId, item.id))
      .orderBy(catalogItemImages.sortOrder);

    const formattedImages = await Promise.all(
      images.map((img) => this.formatImageResponse(img)),
    );

    const mainImage =
      formattedImages.find((img) => img.isMain) || formattedImages[0];

    // Generate WhatsApp product link if approved
    let whatsappProductLink: string | null = null;
    if (item.metaProductId && item.status === 'APPROVED') {
      // Format: https://wa.me/p/{product_id}/{phone_number}
      // Phone number will be added when sending
      whatsappProductLink = `https://wa.me/p/${item.metaProductId}`;
    }

    return {
      id: item.id,
      catalogId: item.catalogId,
      name: item.name,
      description: item.description,
      price: item.price,
      salePrice: item.salePrice,
      currency: item.currency,
      link: item.link,
      retailerId: item.retailerId,
      availability: item.availability,
      condition: item.condition,
      brand: item.brand,
      status: item.status as CatalogItemStatus,
      statusMessage: item.statusMessage,
      metaProductId: item.metaProductId,
      images: formattedImages,
      mainImageUrl: mainImage?.url ?? null,
      mainThumbnailUrl: mainImage?.thumbnailUrl ?? null,
      whatsappProductLink,
      createdBy: item.createdBy,
      createdAt: item.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: item.updatedAt?.toISOString() || new Date().toISOString(),
    };
  }

  // ==================== Image Operations ====================

  /**
   * Direct image upload through backend proxy (CORS-free)
   * Uploads image directly to S3 without requiring browser CORS
   */
  async proxyImageUpload(
    teamId: number,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
    catalogItemId?: string,
  ): Promise<{
    imageId: string;
    imageKey: string;
    status: string;
    originalFilename: string;
    fileSize: number;
    mimeType: string;
  }> {
    // Validate MIME type
    if (!this.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG and PNG images are allowed');
    }

    // Validate file size
    if (file.size > this.MAX_IMAGE_SIZE) {
      throw new BadRequestException('Image size must be 8MB or less');
    }

    // If catalogItemId provided, verify item and check image count
    if (catalogItemId) {
      const [item] = await db
        .select()
        .from(catalogItems)
        .innerJoin(catalogs, eq(catalogItems.catalogId, catalogs.id))
        .where(
          and(eq(catalogItems.id, catalogItemId), eq(catalogs.teamId, teamId)),
        )
        .limit(1);

      if (!item) {
        throw new NotFoundException('Catalog item not found');
      }

      const [{ imageCount }] = await db
        .select({ imageCount: count() })
        .from(catalogItemImages)
        .where(eq(catalogItemImages.catalogItemId, catalogItemId));

      if (Number(imageCount) >= this.MAX_IMAGES_PER_ITEM) {
        throw new BadRequestException(
          `Maximum ${this.MAX_IMAGES_PER_ITEM} images allowed per item`,
        );
      }
    }

    // Generate unique image ID and S3 key
    const imageId = uuidv4();
    const ext = file.mimetype === 'image/jpeg' ? 'jpg' : 'png';
    const imageKey = `catalog/${teamId}/${imageId}.${ext}`;

    this.logger.log(
      `[proxyImageUpload] Starting S3 upload: bucket=${this.bucketName}, key=${imageKey}, size=${file.size}, type=${file.mimetype}`,
    );

    // Upload file directly to S3
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: imageKey,
      Body: file.buffer,
      ContentType: file.mimetype,
      ServerSideEncryption: 'AES256',
      Metadata: {
        teamId: teamId.toString(),
        originalFileName: file.originalname,
        uploadedAt: new Date().toISOString(),
      },
    });

    try {
      const s3Response = await this.s3Client.send(command);
      this.logger.log(
        `[proxyImageUpload] S3 upload SUCCESS: ${imageKey}, ETag=${s3Response.ETag}`,
      );
    } catch (s3Error: any) {
      this.logger.error(`[proxyImageUpload] S3 upload FAILED: ${imageKey}`, {
        errorName: s3Error.name,
        errorMessage: s3Error.message,
        errorCode: s3Error.Code || s3Error.$metadata?.httpStatusCode,
        bucket: this.bucketName,
        key: imageKey,
        stack: s3Error.stack,
      });
      throw new Error(`Failed to upload image to S3: ${s3Error.message}`);
    }

    // Create image record with processing status (ready for thumbnail generation)
    if (catalogItemId) {
      const newImage: NewCatalogItemImage = {
        id: imageId,
        catalogItemId: catalogItemId,
        imageKey,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        status: 'processing',
        sortOrder: await this.getNextImageSortOrder(catalogItemId),
        isMain: await this.isFirstImage(catalogItemId),
      };

      await db.insert(catalogItemImages).values(newImage);

      // Queue thumbnail generation
      const [inserted] = await db
        .select()
        .from(catalogItemImages)
        .where(eq(catalogItemImages.id, imageId))
        .limit(1);

      if (inserted) {
        await this.queueThumbnailGeneration(inserted);
      }
    }

    return {
      imageId,
      imageKey,
      status: catalogItemId ? 'processing' : 'pending',
      originalFilename: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
    };
  }

  /**
   * Associate a previously uploaded image with a catalog item
   * Used when images are uploaded before the item is created
   */
  async associateImage(
    teamId: number,
    catalogItemId: string,
    dto: {
      imageKey: string;
      originalFilename?: string;
      fileSize?: number;
      mimeType?: string;
      isMain?: boolean;
      sortOrder?: number;
    },
  ): Promise<{
    id: string;
    imageKey: string;
    status: string;
    isMain: boolean;
    sortOrder: number;
  }> {
    // Verify the item exists and belongs to the team
    const [item] = await db
      .select()
      .from(catalogItems)
      .innerJoin(catalogs, eq(catalogItems.catalogId, catalogs.id))
      .where(
        and(eq(catalogItems.id, catalogItemId), eq(catalogs.teamId, teamId)),
      )
      .limit(1);

    if (!item) {
      throw new NotFoundException('Catalog item not found');
    }

    // Verify image count limit
    const [{ imageCount }] = await db
      .select({ imageCount: count() })
      .from(catalogItemImages)
      .where(eq(catalogItemImages.catalogItemId, catalogItemId));

    if (Number(imageCount) >= this.MAX_IMAGES_PER_ITEM) {
      throw new BadRequestException(
        `Maximum ${this.MAX_IMAGES_PER_ITEM} images allowed per item`,
      );
    }

    // Verify the S3 object exists and belongs to this team
    const teamIdFromKey = dto.imageKey.split('/')[1];
    if (teamIdFromKey !== teamId.toString()) {
      throw new BadRequestException('Image does not belong to this team');
    }

    // Create image record
    const imageId = uuidv4();
    const sortOrder =
      dto.sortOrder ?? (await this.getNextImageSortOrder(catalogItemId));
    const isMain = dto.isMain ?? (await this.isFirstImage(catalogItemId));

    // Use provided metadata or extract from imageKey
    const ext = dto.imageKey.split('.').pop() || 'jpg';
    const mimeType =
      dto.mimeType || (ext === 'png' ? 'image/png' : 'image/jpeg');

    // fileSize is required - if not provided, we need to get it from S3
    let fileSize = dto.fileSize;
    if (!fileSize) {
      // Fallback: get file size from S3 HeadObject
      try {
        const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
        const headResponse = await this.s3Client.send(
          new HeadObjectCommand({
            Bucket: this.bucketName,
            Key: dto.imageKey,
          }),
        );
        fileSize = headResponse.ContentLength || 0;
      } catch (error) {
        this.logger.warn(
          `Could not get file size from S3 for ${dto.imageKey}, using 0`,
        );
        fileSize = 0;
      }
    }

    const newImage: NewCatalogItemImage = {
      id: imageId,
      catalogItemId,
      imageKey: dto.imageKey,
      originalFilename: dto.originalFilename || null,
      mimeType,
      fileSize,
      status: 'processing',
      sortOrder,
      isMain,
    };

    await db.insert(catalogItemImages).values(newImage);

    // Queue thumbnail generation
    const [inserted] = await db
      .select()
      .from(catalogItemImages)
      .where(eq(catalogItemImages.id, imageId))
      .limit(1);

    if (inserted) {
      await this.queueThumbnailGeneration(inserted);
    }

    return {
      id: imageId,
      imageKey: dto.imageKey,
      status: 'processing',
      isMain,
      sortOrder,
    };
  }

  /**
   * Initiate image upload - returns pre-signed URL
   */
  async initiateImageUpload(
    teamId: number,
    dto: InitiateImageUploadDto,
  ): Promise<ImageUploadResponseDto> {
    // Validate MIME type
    if (!this.ALLOWED_MIME_TYPES.includes(dto.mimeType)) {
      throw new BadRequestException('Only JPEG and PNG images are allowed');
    }

    // Validate file size
    if (dto.fileSize > this.MAX_IMAGE_SIZE) {
      throw new BadRequestException('Image size must be 8MB or less');
    }

    // If catalogItemId provided, verify item and check image count
    if (dto.catalogItemId) {
      const [item] = await db
        .select()
        .from(catalogItems)
        .innerJoin(catalogs, eq(catalogItems.catalogId, catalogs.id))
        .where(
          and(
            eq(catalogItems.id, dto.catalogItemId),
            eq(catalogs.teamId, teamId),
          ),
        )
        .limit(1);

      if (!item) {
        throw new NotFoundException('Catalog item not found');
      }

      const [{ imageCount }] = await db
        .select({ imageCount: count() })
        .from(catalogItemImages)
        .where(eq(catalogItemImages.catalogItemId, dto.catalogItemId));

      if (Number(imageCount) >= this.MAX_IMAGES_PER_ITEM) {
        throw new BadRequestException(
          `Maximum ${this.MAX_IMAGES_PER_ITEM} images allowed per item`,
        );
      }
    }

    // Generate unique image ID and S3 key
    const imageId = uuidv4();
    const ext = dto.mimeType === 'image/jpeg' ? 'jpg' : 'png';
    const imageKey = `catalog/${teamId}/${imageId}.${ext}`;

    // Create pre-signed upload URL
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: imageKey,
      ContentType: dto.mimeType,
      ContentLength: dto.fileSize,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 3600,
    });
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    // Create image record with uploading status
    const newImage: NewCatalogItemImage = {
      id: imageId,
      catalogItemId: dto.catalogItemId || (null as any), // Will be updated when item is created
      imageKey,
      originalFilename: dto.filename,
      mimeType: dto.mimeType,
      fileSize: dto.fileSize,
      status: 'uploading',
      sortOrder: dto.catalogItemId
        ? await this.getNextImageSortOrder(dto.catalogItemId)
        : 0,
      isMain: dto.catalogItemId
        ? await this.isFirstImage(dto.catalogItemId)
        : true,
    };

    // Only insert if catalogItemId is provided
    if (dto.catalogItemId) {
      await db.insert(catalogItemImages).values(newImage);
    }

    return {
      imageId,
      uploadUrl,
      imageKey,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Complete image upload - triggers thumbnail generation
   */
  async completeImageUpload(
    teamId: number,
    dto: CompleteImageUploadDto,
  ): Promise<CatalogItemImageDto> {
    const [image] = await db
      .select()
      .from(catalogItemImages)
      .innerJoin(
        catalogItems,
        eq(catalogItemImages.catalogItemId, catalogItems.id),
      )
      .innerJoin(catalogs, eq(catalogItems.catalogId, catalogs.id))
      .where(
        and(eq(catalogItemImages.id, dto.imageId), eq(catalogs.teamId, teamId)),
      )
      .limit(1);

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    // Update image with dimensions and status
    const [updated] = await db
      .update(catalogItemImages)
      .set({
        width: dto.width,
        height: dto.height,
        status: 'processing',
        updatedAt: new Date(),
      })
      .where(eq(catalogItemImages.id, dto.imageId))
      .returning();

    // Queue thumbnail generation
    await this.queueThumbnailGeneration(updated);

    return this.formatImageResponse(updated);
  }

  /**
   * Delete an image
   */
  async deleteImage(imageId: string, teamId: number): Promise<void> {
    const [image] = await db
      .select()
      .from(catalogItemImages)
      .innerJoin(
        catalogItems,
        eq(catalogItemImages.catalogItemId, catalogItems.id),
      )
      .innerJoin(catalogs, eq(catalogItems.catalogId, catalogs.id))
      .where(
        and(eq(catalogItemImages.id, imageId), eq(catalogs.teamId, teamId)),
      )
      .limit(1);

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    const img = image.catalog_item_images;
    const wasMain = img.isMain;
    const itemId = img.catalogItemId;

    // Delete from S3
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: img.imageKey,
        }),
      );

      if (img.thumbnailKey) {
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: img.thumbnailKey,
          }),
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to delete S3 objects for image ${imageId}:`,
        error,
      );
    }

    // Delete from database
    await db.delete(catalogItemImages).where(eq(catalogItemImages.id, imageId));

    // If this was the main image, make the next one main
    if (wasMain) {
      const [nextImage] = await db
        .select()
        .from(catalogItemImages)
        .where(eq(catalogItemImages.catalogItemId, itemId))
        .orderBy(catalogItemImages.sortOrder)
        .limit(1);

      if (nextImage) {
        await db
          .update(catalogItemImages)
          .set({ isMain: true, sortOrder: 0 })
          .where(eq(catalogItemImages.id, nextImage.id));
      }
    }

    this.logger.log(`Deleted image ${imageId}`);
  }

  /**
   * Reorder images
   */
  async reorderImages(
    itemId: string,
    imageIds: string[],
    teamId: number,
  ): Promise<CatalogItemImageDto[]> {
    // Verify item belongs to team
    const [item] = await db
      .select()
      .from(catalogItems)
      .innerJoin(catalogs, eq(catalogItems.catalogId, catalogs.id))
      .where(and(eq(catalogItems.id, itemId), eq(catalogs.teamId, teamId)))
      .limit(1);

    if (!item) {
      throw new NotFoundException('Catalog item not found');
    }

    // Update sort order and main flag
    for (let i = 0; i < imageIds.length; i++) {
      await db
        .update(catalogItemImages)
        .set({
          sortOrder: i,
          isMain: i === 0,
          updatedAt: new Date(),
        })
        .where(eq(catalogItemImages.id, imageIds[i]));
    }

    // Return updated images
    const images = await db
      .select()
      .from(catalogItemImages)
      .where(eq(catalogItemImages.catalogItemId, itemId))
      .orderBy(catalogItemImages.sortOrder);

    return Promise.all(images.map((img) => this.formatImageResponse(img)));
  }

  private async getNextImageSortOrder(catalogItemId: string): Promise<number> {
    const [{ maxOrder }] = await db
      .select({ maxOrder: sql<number>`COALESCE(MAX(sort_order), -1)` })
      .from(catalogItemImages)
      .where(eq(catalogItemImages.catalogItemId, catalogItemId));

    return (maxOrder ?? -1) + 1;
  }

  private async isFirstImage(catalogItemId: string): Promise<boolean> {
    const [{ imageCount }] = await db
      .select({ imageCount: count() })
      .from(catalogItemImages)
      .where(eq(catalogItemImages.catalogItemId, catalogItemId));

    return Number(imageCount) === 0;
  }

  private async queueThumbnailGeneration(
    image: typeof catalogItemImages.$inferSelect,
  ): Promise<void> {
    if (!this.thumbnailQueueUrl) {
      this.logger.warn(
        'Thumbnail queue URL not configured, skipping thumbnail generation',
      );
      // Mark as ready without thumbnail
      await db
        .update(catalogItemImages)
        .set({ status: 'ready', updatedAt: new Date() })
        .where(eq(catalogItemImages.id, image.id));
      return;
    }

    const thumbnailKey = image.imageKey.replace(/\.(jpg|png)$/, '_thumb.$1');

    try {
      await this.sqsClient.send(
        new SendMessageCommand({
          QueueUrl: this.thumbnailQueueUrl,
          MessageBody: JSON.stringify({
            jobType: 'catalog_thumbnail',
            imageId: image.id,
            inputBucket: this.bucketName,
            inputKey: image.imageKey,
            outputBucket: this.bucketName,
            outputKey: thumbnailKey,
            targetWidth: 300,
            targetHeight: 300,
            callback: {
              type: 'db_update',
              table: 'catalog_item_images',
              idColumn: 'id',
              idValue: image.id,
              updateColumns: {
                thumbnail_key: thumbnailKey,
                status: 'ready',
                updated_at: new Date().toISOString(),
              },
            },
          }),
        }),
      );

      this.logger.debug(`Queued thumbnail generation for image ${image.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to queue thumbnail generation for image ${image.id}:`,
        error,
      );
      // Mark as ready without thumbnail
      await db
        .update(catalogItemImages)
        .set({ status: 'ready', updatedAt: new Date() })
        .where(eq(catalogItemImages.id, image.id));
    }
  }

  private async formatImageResponse(
    image: typeof catalogItemImages.$inferSelect,
  ): Promise<CatalogItemImageDto> {
    // Generate pre-signed URLs for reading
    const imageUrl = await this.getSignedReadUrl(image.imageKey);
    const thumbnailUrl = image.thumbnailKey
      ? await this.getSignedReadUrl(image.thumbnailKey)
      : null;

    return {
      id: image.id,
      url: imageUrl,
      thumbnailUrl,
      originalFilename: image.originalFilename,
      mimeType: image.mimeType,
      fileSize: image.fileSize,
      width: image.width,
      height: image.height,
      status: image.status as ImageStatus,
      sortOrder: image.sortOrder,
      isMain: image.isMain ?? false,
    };
  }

  private async getSignedReadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
  }

  // ==================== Collection Operations ====================

  /**
   * Create a new collection
   */
  async createCollection(
    catalogId: string,
    teamId: number,
    userId: number,
    dto: CreateCatalogCollectionDto,
  ): Promise<CatalogCollectionResponseDto> {
    // Verify catalog belongs to team
    const [catalog] = await db
      .select()
      .from(catalogs)
      .where(and(eq(catalogs.id, catalogId), eq(catalogs.teamId, teamId)))
      .limit(1);

    if (!catalog) {
      throw new NotFoundException('Catalog not found');
    }

    // Check for duplicate name
    const existing = await db
      .select()
      .from(catalogCollections)
      .where(
        and(
          eq(catalogCollections.catalogId, catalogId),
          eq(catalogCollections.name, dto.name),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException(`Collection "${dto.name}" already exists`);
    }

    // Get next sort order
    const [{ maxOrder }] = await db
      .select({ maxOrder: sql<number>`COALESCE(MAX(sort_order), -1)` })
      .from(catalogCollections)
      .where(eq(catalogCollections.catalogId, catalogId));

    const newCollection: NewCatalogCollection = {
      catalogId,
      name: dto.name,
      description: dto.description,
      sortOrder: (maxOrder ?? -1) + 1,
      createdBy: userId,
    };

    const [created] = await db
      .insert(catalogCollections)
      .values(newCollection)
      .returning();

    // Add items to collection if provided
    if (dto.itemIds && dto.itemIds.length > 0) {
      await this.addItemsToCollection(created.id, dto.itemIds, teamId);
    }

    this.logger.log(`Created collection ${created.id} in catalog ${catalogId}`);

    return this.formatCollectionResponse(created);
  }

  /**
   * Get all collections for a catalog
   */
  async getCollections(
    catalogId: string,
    teamId: number,
  ): Promise<CatalogCollectionResponseDto[]> {
    // Verify catalog belongs to team
    const [catalog] = await db
      .select()
      .from(catalogs)
      .where(and(eq(catalogs.id, catalogId), eq(catalogs.teamId, teamId)))
      .limit(1);

    if (!catalog) {
      throw new NotFoundException('Catalog not found');
    }

    const collections = await db
      .select()
      .from(catalogCollections)
      .where(eq(catalogCollections.catalogId, catalogId))
      .orderBy(catalogCollections.sortOrder);

    return Promise.all(
      collections.map((c) => this.formatCollectionResponse(c)),
    );
  }

  /**
   * Add items to a collection
   */
  async addItemsToCollection(
    collectionId: string,
    itemIds: string[],
    teamId: number,
  ): Promise<void> {
    // Verify collection belongs to team
    const [collection] = await db
      .select()
      .from(catalogCollections)
      .innerJoin(catalogs, eq(catalogCollections.catalogId, catalogs.id))
      .where(
        and(
          eq(catalogCollections.id, collectionId),
          eq(catalogs.teamId, teamId),
        ),
      )
      .limit(1);

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    // Verify all items belong to the same catalog
    const items = await db
      .select()
      .from(catalogItems)
      .where(
        and(
          inArray(catalogItems.id, itemIds),
          eq(catalogItems.catalogId, collection.catalog_collections.catalogId),
        ),
      );

    if (items.length !== itemIds.length) {
      throw new BadRequestException(
        'Some items not found or not in the same catalog',
      );
    }

    // Get current max sort order
    const [{ maxOrder }] = await db
      .select({ maxOrder: sql<number>`COALESCE(MAX(sort_order), -1)` })
      .from(catalogCollectionItems)
      .where(eq(catalogCollectionItems.collectionId, collectionId));

    // Add items (ignore duplicates)
    let currentOrder = (maxOrder ?? -1) + 1;
    for (const itemId of itemIds) {
      try {
        await db.insert(catalogCollectionItems).values({
          collectionId,
          catalogItemId: itemId,
          sortOrder: currentOrder++,
        });
      } catch (error) {
        // Ignore duplicate key errors
        if (!(error as any).code?.includes('23505')) {
          throw error;
        }
      }
    }
  }

  /**
   * Remove items from a collection
   */
  async removeItemsFromCollection(
    collectionId: string,
    itemIds: string[],
    teamId: number,
  ): Promise<void> {
    // Verify collection belongs to team
    const [collection] = await db
      .select()
      .from(catalogCollections)
      .innerJoin(catalogs, eq(catalogCollections.catalogId, catalogs.id))
      .where(
        and(
          eq(catalogCollections.id, collectionId),
          eq(catalogs.teamId, teamId),
        ),
      )
      .limit(1);

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    await db
      .delete(catalogCollectionItems)
      .where(
        and(
          eq(catalogCollectionItems.collectionId, collectionId),
          inArray(catalogCollectionItems.catalogItemId, itemIds),
        ),
      );
  }

  /**
   * Delete a collection
   */
  async deleteCollection(collectionId: string, teamId: number): Promise<void> {
    // Verify collection belongs to team
    const [collection] = await db
      .select()
      .from(catalogCollections)
      .innerJoin(catalogs, eq(catalogCollections.catalogId, catalogs.id))
      .where(
        and(
          eq(catalogCollections.id, collectionId),
          eq(catalogs.teamId, teamId),
        ),
      )
      .limit(1);

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    await db
      .delete(catalogCollections)
      .where(eq(catalogCollections.id, collectionId));

    this.logger.log(`Deleted collection ${collectionId}`);
  }

  private async formatCollectionResponse(
    collection: typeof catalogCollections.$inferSelect,
  ): Promise<CatalogCollectionResponseDto> {
    // Get item count
    const [{ itemCount }] = await db
      .select({ itemCount: count() })
      .from(catalogCollectionItems)
      .where(eq(catalogCollectionItems.collectionId, collection.id));

    // Get cover image URLs
    let coverImageUrl: string | null = null;
    let coverThumbnailUrl: string | null = null;

    if (collection.coverImageKey) {
      coverImageUrl = await this.getSignedReadUrl(collection.coverImageKey);
    }
    if (collection.coverThumbnailKey) {
      coverThumbnailUrl = await this.getSignedReadUrl(
        collection.coverThumbnailKey,
      );
    }

    return {
      id: collection.id,
      catalogId: collection.catalogId,
      name: collection.name,
      description: collection.description,
      coverImageUrl,
      coverThumbnailUrl,
      isActive: collection.isActive ?? true,
      itemCount: Number(itemCount) || 0,
      sortOrder: collection.sortOrder ?? 0,
      createdAt:
        collection.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt:
        collection.updatedAt?.toISOString() || new Date().toISOString(),
    };
  }

  // ==================== Send Catalog Item ====================

  /**
   * Record a catalog item being sent in a message
   */
  async recordCatalogItemSent(
    messageId: string,
    chatId: string,
    catalogItemId: string,
  ): Promise<void> {
    const [item] = await db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.id, catalogItemId))
      .limit(1);

    if (!item) {
      throw new NotFoundException('Catalog item not found');
    }

    // Get main image
    const [mainImage] = await db
      .select()
      .from(catalogItemImages)
      .where(
        and(
          eq(catalogItemImages.catalogItemId, catalogItemId),
          eq(catalogItemImages.isMain, true),
        ),
      )
      .limit(1);

    const snapshot = {
      id: item.id,
      name: item.name,
      description: item.description,
      price: item.price,
      salePrice: item.salePrice,
      currency: item.currency,
      mainImageKey: mainImage?.imageKey,
      link: item.link,
      metaProductId: item.metaProductId,
    };

    const record: NewCatalogItemMessage = {
      messageId,
      chatId,
      catalogItemId,
      itemSnapshot: snapshot,
    };

    await db.insert(catalogItemMessages).values(record);
  }

  /**
   * Get catalog item from a message
   */
  async getCatalogItemFromMessage(
    messageId: string,
  ): Promise<CatalogItemResponseDto | null> {
    const [record] = await db
      .select()
      .from(catalogItemMessages)
      .where(eq(catalogItemMessages.messageId, messageId))
      .limit(1);

    if (!record) {
      return null;
    }

    const [item] = await db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.id, record.catalogItemId))
      .limit(1);

    if (!item) {
      // Return from snapshot if item deleted
      return null;
    }

    return this.formatCatalogItemResponse(item);
  }

  /**
   * Send catalog item(s) to a single chat
   *
   * Uses WhatsApp Cloud API Single-Product Message (SPM) format.
   * Each catalog item is sent as a separate product message with:
   * - Product image (from Meta Commerce catalog)
   * - Product details (name, price) in the product card
   * - "View" button that opens Product Detail Page (PDP) in WhatsApp
   *
   * CRITICAL REQUIREMENTS:
   * 1. META_CATALOG_ID must be configured and linked to WhatsApp Business Account
   * 2. Products must be synced to Meta Commerce catalog with retailerId (SKU)
   * 3. Products must be approved by Meta before they can be shared
   * 4. Can only send within 24-hour conversation window
   *
   * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/sell-products-and-services/share-products
   */
  async sendCatalogItemToChat(
    chatId: string,
    catalogItemIds: string[],
    teamId: number,
    userId: number,
  ): Promise<{ success: boolean; messageId: string; messageIds?: string[] }> {
    // Get chat to verify it exists
    const [chat] = await db
      .select()
      .from(chats)
      .where(eq(chats.chatId, chatId))
      .limit(1);

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    // Get sender for the chat
    const [sender] = await db
      .select()
      .from(senders)
      .where(eq(senders.id, chat.senderId))
      .limit(1);

    if (!sender) {
      throw new NotFoundException('Sender not found for chat');
    }

    // Get catalog items
    const items = await db
      .select()
      .from(catalogItems)
      .where(inArray(catalogItems.id, catalogItemIds));

    if (items.length === 0) {
      throw new NotFoundException('No catalog items found');
    }

    // Get catalog to verify team ownership
    const [catalog] = await db
      .select()
      .from(catalogs)
      .where(eq(catalogs.id, items[0].catalogId))
      .limit(1);

    if (!catalog || catalog.teamId !== teamId) {
      throw new BadRequestException('Catalog items do not belong to your team');
    }

    // Use the catalog's linked Meta catalog ID (not global env)
    // This allows per-team catalog configuration
    if (!catalog.metaCatalogId) {
      this.logger.warn(
        `Catalog ${catalog.id} is not linked to a Meta catalog. ` +
          'Falling back to text message. ' +
          'To enable product messages, ensure META_CATALOG_ID is configured ' +
          'and the catalog is linked to Meta Commerce.',
      );
      return this.sendCatalogItemsAsTextMessage(
        chat,
        sender,
        items,
        userId,
        chatId,
      );
    }

    // Check that all items have retailerId (required for product messages)
    const itemsWithoutRetailerId = items.filter((item) => !item.retailerId);
    if (itemsWithoutRetailerId.length > 0) {
      this.logger.warn(
        `${itemsWithoutRetailerId.length} items missing retailerId. Falling back to text message.`,
      );
      return this.sendCatalogItemsAsTextMessage(
        chat,
        sender,
        items,
        userId,
        chatId,
      );
    }

    // Send each item as a separate product message
    const sentMessageIds: string[] = [];
    const errors: string[] = [];

    for (const item of items) {
      try {
        // Build optional body text with description
        const bodyText = item.description
          ? item.description.substring(0, 1024) // Max 1024 chars
          : undefined;

        // Build footer with price
        const priceText =
          item.salePrice !== null
            ? `${this.formatPrice(item.salePrice, item.currency)} (was ${this.formatPrice(item.price, item.currency)})`
            : this.formatPrice(item.price, item.currency);
        const footerText = `💰 ${priceText}`;

        // Send product message via WhatsApp Cloud API
        // retailerId is guaranteed non-null here (filtered above)
        // catalog.metaCatalogId is guaranteed non-null here (validated above)
        const result = await this.whatsappService.sendProductMessage(
          sender.id,
          chat.participantPhone,
          catalog.metaCatalogId!,
          item.retailerId!, // Non-null assertion - validated above
          bodyText,
          footerText,
        );

        if (result.success && result.messageId) {
          sentMessageIds.push(result.messageId);

          // Record the catalog item sent
          await this.recordCatalogItemSent(result.messageId, chatId, item.id);

          this.logger.log(
            `Sent product message for "${item.name}" (SKU: ${item.retailerId}) to chat ${chatId}`,
          );
        } else {
          errors.push(`Failed to send "${item.name}": ${result.error}`);
          this.logger.error(
            `Failed to send product message for "${item.name}": ${result.error}`,
          );
        }
      } catch (error) {
        errors.push(`Failed to send "${item.name}": ${error.message}`);
        this.logger.error(
          `Error sending product message for "${item.name}": ${error.message}`,
          error,
        );
      }
    }

    // Check if any messages were sent successfully
    if (sentMessageIds.length === 0) {
      throw new BadRequestException(
        `Failed to send any product messages: ${errors.join('; ')}`,
      );
    }

    this.logger.log(
      `Sent ${sentMessageIds.length}/${items.length} product message(s) to chat ${chatId}`,
    );

    return {
      success: true,
      messageId: sentMessageIds[0], // Return first message ID for compatibility
      messageIds: sentMessageIds, // Return all message IDs
    };
  }

  /**
   * Fallback: Send catalog items as a text message
   *
   * Used when:
   * - Meta Commerce API is not configured
   * - Products don't have retailerId (not synced to Meta)
   * - Product messages are not available
   *
   * @private
   */
  private async sendCatalogItemsAsTextMessage(
    chat: typeof chats.$inferSelect,
    sender: typeof senders.$inferSelect,
    items: (typeof catalogItems.$inferSelect)[],
    userId: number,
    chatId: string,
  ): Promise<{ success: boolean; messageId: string }> {
    // Get images for items
    const itemImages = await db
      .select()
      .from(catalogItemImages)
      .where(
        and(
          inArray(
            catalogItemImages.catalogItemId,
            items.map((i) => i.id),
          ),
          eq(catalogItemImages.isMain, true),
        ),
      );

    // Build item data for message
    const itemsData = items.map((item) => {
      const image = itemImages.find((img) => img.catalogItemId === item.id);
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        salePrice: item.salePrice,
        currency: item.currency,
        retailerId: item.retailerId,
        mainImageUrl: image
          ? `${this.configService.get('CDN_BASE_URL') || `https://${this.bucketName}.s3.amazonaws.com`}/${image.imageKey}`
          : null,
        mainThumbnailUrl: image?.thumbnailKey
          ? `${this.configService.get('CDN_BASE_URL') || `https://${this.bucketName}.s3.amazonaws.com`}/${image.thumbnailKey}`
          : null,
        link: item.link,
        status: item.status,
      };
    });

    // Build message body text
    let bodyText: string;
    if (itemsData.length === 1) {
      const item = itemsData[0];
      const priceText =
        item.salePrice !== null
          ? `~~${this.formatPrice(item.price, item.currency)}~~ ${this.formatPrice(item.salePrice, item.currency)}`
          : this.formatPrice(item.price, item.currency);
      bodyText = `📦 *${item.name}*\n${item.description || ''}\n\n💰 ${priceText}`;
    } else {
      bodyText = `📦 *${itemsData.length} Products*\n\n${itemsData.map((i) => `• ${i.name}`).join('\n')}`;
    }

    // Send as a text message with product data in metadata
    const result = await this.whatsappService.sendMessage(
      {
        senderId: sender.id,
        to: chat.participantPhone,
        body: bodyText,
      },
      userId,
    );

    if (!result.success || !result.messageId) {
      throw new BadRequestException(
        result.error || 'Failed to send catalog message',
      );
    }

    // Record the catalog items sent in this message
    for (const item of items) {
      await this.recordCatalogItemSent(result.messageId, chatId, item.id);
    }

    this.logger.log(
      `Sent ${items.length} catalog item(s) as text message to chat ${chatId}. Message ID: ${result.messageId}`,
    );

    return { success: true, messageId: result.messageId };
  }

  /**
   * Send catalog item(s) to multiple chats
   * Useful for bulk marketing/promotions
   */
  async sendCatalogItemToMultipleChats(
    chatIds: string[],
    catalogItemIds: string[],
    teamId: number,
    userId: number,
  ): Promise<{
    success: boolean;
    results: Array<{
      chatId: string;
      success: boolean;
      messageId?: string;
      error?: string;
    }>;
  }> {
    const results: Array<{
      chatId: string;
      success: boolean;
      messageId?: string;
      error?: string;
    }> = [];

    // Process each chat sequentially to avoid rate limiting
    for (const chatId of chatIds) {
      try {
        const result = await this.sendCatalogItemToChat(
          chatId,
          catalogItemIds,
          teamId,
          userId,
        );
        results.push({
          chatId,
          success: true,
          messageId: result.messageId,
        });
      } catch (error) {
        this.logger.error(
          `Failed to send catalog to chat ${chatId}: ${error.message}`,
        );
        results.push({
          chatId,
          success: false,
          error: error.message,
        });
      }

      // Small delay between sends to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const successCount = results.filter((r) => r.success).length;
    this.logger.log(
      `Bulk catalog send complete: ${successCount}/${chatIds.length} successful`,
    );

    return {
      success: successCount > 0,
      results,
    };
  }

  /**
   * Format price for display
   */
  private formatPrice(priceInCents: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(priceInCents / 100);
  }

  // ==================== Bulk Import ====================

  /**
   * Bulk import catalog items from parsed CSV/JSON data
   *
   * @param items - Array of items to import
   * @param teamId - Team ID for authorization
   * @param userId - User ID for created_by tracking
   * @returns Result with success/fail counts and errors
   */
  async bulkImportItems(
    items: Array<{
      name: string;
      description?: string;
      price: number;
      salePrice?: number;
      currency?: string;
      link: string;
      retailerId?: string;
      availability?: string;
      condition?: string;
      brand?: string;
      imageUrl?: string;
    }>,
    teamId: number,
    userId: number,
  ): Promise<{
    successCount: number;
    failedCount: number;
    totalCount: number;
    errors: Array<{ row: number; name: string; error: string }>;
    createdItemIds: string[];
  }> {
    const catalog = await this.getOrCreateCatalog(teamId);
    const results = {
      successCount: 0,
      failedCount: 0,
      totalCount: items.length,
      errors: [] as Array<{ row: number; name: string; error: string }>,
      createdItemIds: [] as string[],
    };

    this.logger.log(
      `Starting bulk import of ${items.length} items for catalog ${catalog.id}`,
    );

    // Process items in batches of 10 to avoid overwhelming the database
    const BATCH_SIZE = 10;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (item, batchIndex) => {
          const rowIndex = i + batchIndex + 1; // 1-based row number
          try {
            // Validate required fields
            if (!item.name || item.name.trim().length === 0) {
              throw new Error('Name is required');
            }
            if (typeof item.price !== 'number' || item.price < 0) {
              throw new Error('Valid price is required');
            }

            // Convert price to cents
            const priceInCents = Math.round(item.price * 100);
            const salePriceInCents = item.salePrice
              ? Math.round(item.salePrice * 100)
              : null;

            const itemId = uuidv4();
            const now = new Date();

            // Create the catalog item with Meta Commerce defaults
            const newItem: NewCatalogItem = {
              id: itemId,
              catalogId: catalog.id,
              name: item.name.trim().slice(0, 200),
              description: item.description?.trim().slice(0, 9999) || null,
              price: priceInCents,
              salePrice: salePriceInCents,
              currency: item.currency?.toUpperCase() || catalog.currency,
              link: item.link,
              countryOfOrigin: 'US', // Default - not exposed in UI
              retailerId: item.retailerId || null,
              availability: (item.availability as any) || 'in_stock',
              condition: (item.condition as any) || 'new',
              brand: item.brand || null,
              inventory: 1000, // Default - not exposed in UI
              isHidden: false, // Default - not exposed in UI
              status: 'DRAFT',
              statusMessage: null,
              metaProductId: null,
              createdBy: userId,
              createdAt: now,
              updatedAt: now,
            };

            await db.insert(catalogItems).values(newItem);

            // Note: For bulk import, image URLs are stored in the link field
            // Images should be added separately through the image upload flow
            // as they require S3 storage and thumbnail generation

            results.successCount++;
            results.createdItemIds.push(itemId);
          } catch (error) {
            this.logger.warn(
              `Bulk import row ${rowIndex} failed: ${error.message}`,
            );
            results.failedCount++;
            results.errors.push({
              row: rowIndex,
              name: item.name || `Row ${rowIndex}`,
              error: error.message,
            });
          }
        }),
      );
    }

    this.logger.log(
      `Bulk import complete: ${results.successCount} success, ${results.failedCount} failed`,
    );

    return results;
  }

  // ==================== Meta Catalog Management ====================

  /**
   * List all Meta catalogs available for the business
   *
   * This calls the Meta Graph API to get all product catalogs
   * owned by the configured business account.
   *
   * @returns List of Meta catalogs
   */
  async listMetaCatalogs(): Promise<{
    catalogs: Array<{
      id: string;
      name: string;
      vertical: string;
      productCount?: number;
      feedCount?: number;
      businessId?: string;
    }>;
    total: number;
    businessId?: string;
  }> {
    if (!this.metaCommerceApi.isEnabled()) {
      throw new BadRequestException(
        'Meta Commerce API is not configured. Please set META_ACCESS_TOKEN and META_BUSINESS_ID in environment variables.',
      );
    }

    const catalogList = await this.metaCommerceApi.listBusinessCatalogs();
    const config = this.metaCommerceApi.getConfig();

    // Log warning if no catalogs found - this might indicate a business ID mismatch
    if (catalogList.length === 0) {
      this.logger.warn(
        `No catalogs found for business ${config.businessId}. ` +
          `If a catalog is linked to your phone number but not showing here, ` +
          `the catalog may be owned by a different Meta Business account. ` +
          `Check your META_BUSINESS_ID environment variable.`,
      );
    }

    return {
      catalogs: catalogList.map((cat) => ({
        id: cat.id,
        name: cat.name,
        vertical: cat.vertical,
        productCount: cat.productCount,
        feedCount: cat.feedCount,
        businessId: cat.businessId,
      })),
      total: catalogList.length,
      businessId: config.businessId ?? undefined,
    };
  }

  /**
   * Create a new Meta catalog
   *
   * Creates a commerce catalog on Meta's platform via the Graph API,
   * then automatically links it to the team's local catalog.
   * Only commerce catalogs are supported for WhatsApp product messages.
   *
   * @param teamId - Team ID
   * @param name - Catalog name
   * @returns The updated local catalog with Meta link
   */
  async createMetaCatalog(
    teamId: number,
    name: string,
  ): Promise<CatalogResponseDto> {
    if (!this.metaCommerceApi.isEnabled()) {
      throw new BadRequestException(
        'Meta Commerce API is not configured. Please set META_ACCESS_TOKEN and META_BUSINESS_ID in environment variables.',
      );
    }

    // Always create commerce catalogs for WhatsApp compatibility
    const vertical = 'commerce';

    // Create catalog on Meta with auto-permission assignment
    const metaCatalog = await this.metaCommerceApi.createCatalog(
      name,
      vertical,
      {
        autoAssignPermissions: true,
        assignToAdmins: true,
      },
    );

    this.logger.log(
      `Created Meta catalog ${metaCatalog.id} with name "${name}" and vertical "${vertical}"`,
    );

    // Log permission assignment results
    if (metaCatalog.permissionAssignment) {
      const { currentUser, admins, errors } = metaCatalog.permissionAssignment;
      if (currentUser?.success) {
        this.logger.log(
          `✅ Catalog permissions assigned to current user (${currentUser.id})`,
        );
      }
      if (admins.length > 0) {
        const successfulAdmins = admins.filter((a) => a.success);
        this.logger.log(
          `✅ Catalog permissions assigned to ${successfulAdmins.length} admin(s)`,
        );
      }
      if (errors.length > 0) {
        this.logger.warn(
          `⚠️ Some permission assignments failed: ${errors.join('; ')}`,
        );
      }
    }

    // Get or create local catalog and link to Meta
    const localCatalog = await this.getOrCreateCatalog(teamId);

    // Update local catalog with Meta catalog ID
    const [updated] = await db
      .update(catalogs)
      .set({
        metaCatalogId: metaCatalog.id,
        metaBusinessId: metaCatalog.businessId,
        name: name, // Update name to match Meta catalog
        updatedAt: new Date(),
      })
      .where(eq(catalogs.id, localCatalog.id))
      .returning();

    this.logger.log(
      `Linked local catalog ${localCatalog.id} to Meta catalog ${metaCatalog.id}`,
    );

    return this.formatCatalogResponse(updated);
  }

  /**
   * Link an existing Meta catalog to the team's local catalog
   *
   * This validates the Meta catalog exists and is a commerce type,
   * then links it to the team's local catalog.
   *
   * @param teamId - Team ID
   * @param metaCatalogId - Meta Catalog ID to link
   * @returns The updated local catalog
   */
  async linkExistingMetaCatalog(
    teamId: number,
    metaCatalogId: string,
  ): Promise<CatalogResponseDto> {
    if (!this.metaCommerceApi.isEnabled()) {
      throw new BadRequestException(
        'Meta Commerce API is not configured. Please set META_ACCESS_TOKEN and META_BUSINESS_ID in environment variables.',
      );
    }

    // Validate the Meta catalog exists and get info
    const metaCatalog =
      await this.metaCommerceApi.getCatalogInfo(metaCatalogId);

    // Warn if not a commerce catalog
    if (metaCatalog.vertical !== 'commerce') {
      this.logger.warn(
        `Linking catalog ${metaCatalogId} with vertical '${metaCatalog.vertical}'. ` +
          `Only 'commerce' catalogs support WhatsApp product messages.`,
      );
    }

    // Get or create local catalog
    const localCatalog = await this.getOrCreateCatalog(teamId);

    // Check if already linked to a different catalog
    if (
      localCatalog.metaCatalogId &&
      localCatalog.metaCatalogId !== metaCatalogId
    ) {
      throw new ConflictException(
        `Catalog is already linked to Meta catalog ${localCatalog.metaCatalogId}. ` +
          `Unlink it first before linking to a different catalog.`,
      );
    }

    // Update local catalog with Meta catalog ID
    const [updated] = await db
      .update(catalogs)
      .set({
        metaCatalogId: metaCatalog.id,
        metaBusinessId: metaCatalog.businessId,
        updatedAt: new Date(),
      })
      .where(eq(catalogs.id, localCatalog.id))
      .returning();

    this.logger.log(
      `Linked local catalog ${localCatalog.id} to existing Meta catalog ${metaCatalog.id}`,
    );

    return this.formatCatalogResponse(updated);
  }

  /**
   * Unlink Meta catalog from local catalog
   *
   * @param teamId - Team ID
   * @returns The updated local catalog
   */
  async unlinkMetaCatalog(teamId: number): Promise<CatalogResponseDto> {
    const catalog = await this.getCatalogByTeamId(teamId);

    if (!catalog) {
      throw new NotFoundException('No catalog found for team');
    }

    if (!catalog.metaCatalogId) {
      throw new BadRequestException(
        'Catalog is not linked to any Meta catalog',
      );
    }

    const [updated] = await db
      .update(catalogs)
      .set({
        metaCatalogId: null,
        metaBusinessId: null,
        updatedAt: new Date(),
      })
      .where(eq(catalogs.id, catalog.id))
      .returning();

    this.logger.log(
      `Unlinked local catalog ${catalog.id} from Meta catalog ${catalog.metaCatalogId}`,
    );

    return this.formatCatalogResponse(updated);
  }

  /**
   * Get Meta catalog details
   *
   * @param metaCatalogId - Meta Catalog ID
   * @returns Catalog info from Meta
   */
  async getMetaCatalogInfo(metaCatalogId: string): Promise<{
    id: string;
    name: string;
    vertical: string;
    productCount?: number;
    feedCount?: number;
    businessId?: string;
    businessName?: string;
  }> {
    if (!this.metaCommerceApi.isEnabled()) {
      throw new BadRequestException(
        'Meta Commerce API is not configured. Please set META_ACCESS_TOKEN and META_BUSINESS_ID in environment variables.',
      );
    }

    const info = await this.metaCommerceApi.getCatalogInfo(metaCatalogId);
    return {
      id: info.id,
      name: info.name,
      vertical: info.vertical,
      productCount: info.productCount,
      feedCount: info.feedCount,
      businessId: info.businessId,
      businessName: info.businessName,
    };
  }

  /**
   * Delete a Meta catalog
   *
   * This method performs a complete deletion:
   * 1. Disconnects the catalog from WABA if connected
   * 2. Deletes the catalog from Meta (if we have permissions)
   * 3. Unlinks the local catalog if it was linked to this Meta catalog
   *
   * Note: If the catalog is owned by a different business, we can still
   * disconnect it from our phone numbers but cannot delete it from Meta.
   *
   * @param teamId - Team ID for authorization
   * @param metaCatalogId - Meta Catalog ID to delete
   * @returns Deletion result with details
   */
  async deleteMetaCatalog(
    teamId: number,
    metaCatalogId: string,
  ): Promise<{
    success: boolean;
    catalogId: string;
    disconnectedFromWaba?: boolean;
    deletedFromMeta?: boolean;
    localCatalogUnlinked?: boolean;
    message?: string;
  }> {
    if (!this.metaCommerceApi.isEnabled()) {
      throw new BadRequestException(
        'Meta Commerce API is not configured. Please set META_ACCESS_TOKEN and META_BUSINESS_ID in environment variables.',
      );
    }

    this.logger.log(
      `[DeleteCatalog] Starting deletion of Meta catalog ${metaCatalogId} for team ${teamId}`,
    );

    // Check if we have access to this catalog (might be owned by different business)
    let hasAccessToCatalog = false;
    try {
      await this.metaCommerceApi.getCatalogInfo(metaCatalogId);
      hasAccessToCatalog = true;
      this.logger.log(
        `[DeleteCatalog] Have access to catalog ${metaCatalogId}`,
      );
    } catch (error) {
      this.logger.warn(
        `[DeleteCatalog] Cannot access catalog ${metaCatalogId} - may be owned by different business: ${error.message}`,
      );
    }

    let disconnectedFromWaba = false;
    let deletedFromMeta = false;

    // If we have access, try to delete (which also disconnects from WABA)
    if (hasAccessToCatalog) {
      try {
        const deleteResult =
          await this.metaCommerceApi.forceDeleteCatalog(metaCatalogId);

        this.logger.log(
          `[DeleteCatalog] Meta API result: disconnected=${deleteResult.disconnected}, deleted=${deleteResult.deleted}`,
        );

        disconnectedFromWaba = deleteResult.disconnected;
        deletedFromMeta = deleteResult.deleted;
      } catch (error) {
        this.logger.error(
          `[DeleteCatalog] Failed to delete from Meta: ${error.message}`,
        );
      }
    } else {
      // We don't own this catalog, but we can try to disconnect it from WABA
      this.logger.log(
        `[DeleteCatalog] No access to catalog - attempting to disconnect from WABA only`,
      );

      try {
        disconnectedFromWaba =
          await this.metaCommerceApi.disconnectCatalogFromWaba(metaCatalogId);

        this.logger.log(
          `[DeleteCatalog] WABA disconnection result: ${disconnectedFromWaba}`,
        );
      } catch (error) {
        this.logger.warn(
          `[DeleteCatalog] Failed to disconnect from WABA: ${error.message}`,
        );
      }
    }

    // Check if local catalog was linked to this Meta catalog and unlink it
    let localCatalogUnlinked = false;
    const localCatalog = await this.getCatalogByTeamId(teamId);

    if (localCatalog && localCatalog.metaCatalogId === metaCatalogId) {
      await db
        .update(catalogs)
        .set({
          metaCatalogId: null,
          metaBusinessId: null,
          updatedAt: new Date(),
        })
        .where(eq(catalogs.id, localCatalog.id));

      localCatalogUnlinked = true;
      this.logger.log(
        `[DeleteCatalog] Unlinked local catalog ${localCatalog.id} from Meta catalog`,
      );
    }

    // Also clear the linkedCatalogId from any senders that have this catalog linked
    const sendersWithCatalog = await db
      .select()
      .from(senders)
      .where(eq(senders.linkedCatalogId, metaCatalogId));

    if (sendersWithCatalog.length > 0) {
      await db
        .update(senders)
        .set({
          linkedCatalogId: null,
          updatedAt: new Date(),
        })
        .where(eq(senders.linkedCatalogId, metaCatalogId));

      this.logger.log(
        `[DeleteCatalog] Cleared linkedCatalogId from ${sendersWithCatalog.length} sender(s)`,
      );
    }

    // Build result message
    const messageParts: string[] = [];
    if (deletedFromMeta) {
      messageParts.push('deleted from Meta');
    } else if (disconnectedFromWaba) {
      messageParts.push('disconnected from WhatsApp');
    }
    if (localCatalogUnlinked) {
      messageParts.push('unlinked from team');
    }
    if (sendersWithCatalog.length > 0) {
      messageParts.push(
        `cleared from ${sendersWithCatalog.length} phone number(s)`,
      );
    }

    const success =
      deletedFromMeta ||
      disconnectedFromWaba ||
      localCatalogUnlinked ||
      sendersWithCatalog.length > 0;

    return {
      success,
      catalogId: metaCatalogId,
      disconnectedFromWaba,
      deletedFromMeta,
      localCatalogUnlinked,
      message: success
        ? `Catalog ${metaCatalogId} ${messageParts.join(', ')}`
        : `Could not perform any operations on catalog ${metaCatalogId}. It may be owned by a different business.`,
    };
  }

  // ==================== Meta Product Set (Collection) Management ====================

  /**
   * List product sets (collections) in a Meta catalog
   *
   * @param teamId - Team ID for authorization
   * @returns List of product sets
   */
  async listMetaProductSets(
    teamId: number,
  ): Promise<Array<{ id: string; name: string; productCount?: number }>> {
    const catalog = await this.getCatalogByTeamId(teamId);

    if (!catalog) {
      throw new NotFoundException('No catalog found for team');
    }

    if (!catalog.metaCatalogId) {
      throw new BadRequestException(
        'Catalog is not linked to a Meta catalog. Link a catalog first.',
      );
    }

    return this.metaCommerceApi.getCatalogProductSets(catalog.metaCatalogId);
  }

  /**
   * Create a product set (collection) in Meta catalog
   *
   * @param teamId - Team ID for authorization
   * @param name - Product set name
   * @param filter - Optional filter for dynamic sets
   * @returns Created product set
   */
  async createMetaProductSet(
    teamId: number,
    name: string,
    filter?: object,
  ): Promise<{ id: string; name: string }> {
    const catalog = await this.getCatalogByTeamId(teamId);

    if (!catalog) {
      throw new NotFoundException('No catalog found for team');
    }

    if (!catalog.metaCatalogId) {
      throw new BadRequestException(
        'Catalog is not linked to a Meta catalog. Link a catalog first.',
      );
    }

    const productSet = await this.metaCommerceApi.createProductSet(
      catalog.metaCatalogId,
      name,
      filter,
    );

    this.logger.log(
      `Created product set ${productSet.id} in Meta catalog ${catalog.metaCatalogId}`,
    );

    return productSet;
  }

  /**
   * Delete a product set from Meta catalog
   *
   * @param teamId - Team ID for authorization
   * @param productSetId - Product set ID to delete
   * @returns Success status
   */
  async deleteMetaProductSet(
    teamId: number,
    productSetId: string,
  ): Promise<{ success: boolean }> {
    // Verify team has a catalog (authorization)
    const catalog = await this.getCatalogByTeamId(teamId);

    if (!catalog) {
      throw new NotFoundException('No catalog found for team');
    }

    if (!catalog.metaCatalogId) {
      throw new BadRequestException('Catalog is not linked to a Meta catalog.');
    }

    const success = await this.metaCommerceApi.deleteProductSet(productSetId);

    this.logger.log(`Deleted product set ${productSetId}`);

    return { success };
  }
}
