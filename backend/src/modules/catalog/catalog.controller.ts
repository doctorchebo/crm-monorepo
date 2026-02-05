import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import type { AuthenticatedRequest } from '@shared/types';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CatalogService } from './catalog.service';
import {
  AddItemsToCollectionDto,
  BulkImportPreviewDto,
  BulkImportResultDto,
  CatalogCollectionResponseDto,
  CatalogItemImageDto,
  CatalogItemResponseDto,
  CatalogItemsQueryDto,
  CatalogResponseDto,
  CompleteImageUploadDto,
  CreateCatalogCollectionDto,
  CreateCatalogItemDto,
  CreateMetaCatalogDto,
  CreateMetaProductSetDto,
  DeleteMetaCatalogResponseDto,
  DirectImageUploadResponseDto,
  ImageUploadResponseDto,
  InitiateImageUploadDto,
  LinkMetaCatalogDto,
  MetaCatalogDto,
  MetaCatalogsResponseDto,
  MetaProductSetDto,
  PaginatedCatalogItemsResponseDto,
  ReorderImagesDto,
  SendCatalogItemDto,
  SendCatalogItemToMultipleDto,
  SubmitForReviewDto,
  SubmitForReviewResponseDto,
  SyncItemStatusDto,
  SyncSingleItemResultDto,
  SyncStatusResultDto,
  UpdateCatalogDto,
  UpdateCatalogItemDto,
} from './dto/catalog.dto';

/**
 * Catalog Controller
 *
 * REST API for managing product catalogs:
 * - Catalog CRUD
 * - Catalog item management
 * - Image upload with pre-signed URLs
 * - Collection management
 * - Bulk operations
 *
 * Team Resolution:
 * All endpoints use CatalogService.getUserTeamId() to resolve the team ID
 * from the authenticated user's ID. This ensures robust team membership
 * validation regardless of whether teamId is present in the JWT.
 */
@ApiTags('catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('catalog')
export class CatalogController {
  private readonly logger = new Logger(CatalogController.name);

  constructor(private readonly catalogService: CatalogService) {}

  // ==================== Catalog Endpoints ====================

  @Get()
  @ApiOperation({ summary: 'Get catalog for current team' })
  @ApiResponse({
    status: 200,
    description: 'Returns catalog',
    type: CatalogResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Catalog not found' })
  async getCatalog(
    @Req() req: AuthenticatedRequest,
  ): Promise<CatalogResponseDto> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.getOrCreateCatalog(teamId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update catalog settings' })
  @ApiResponse({
    status: 200,
    description: 'Catalog updated',
    type: CatalogResponseDto,
  })
  @ApiBody({ type: UpdateCatalogDto })
  async updateCatalog(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateCatalogDto,
  ): Promise<CatalogResponseDto> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    const catalog = await this.catalogService.getOrCreateCatalog(teamId);
    return this.catalogService.updateCatalog(catalog.id, teamId, dto);
  }

  @Post('link-meta')
  @ApiOperation({
    summary: 'Link catalog to Meta Commerce',
    description:
      'Links the team catalog to Meta Commerce catalog. ' +
      'Required for sending product messages via WhatsApp. ' +
      'Uses the META_CATALOG_ID from environment configuration.',
  })
  @ApiResponse({
    status: 200,
    description: 'Catalog linked to Meta Commerce',
    type: CatalogResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'META_CATALOG_ID not configured',
  })
  async linkCatalogToMeta(
    @Req() req: AuthenticatedRequest,
  ): Promise<CatalogResponseDto> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    const catalog = await this.catalogService.getOrCreateCatalog(teamId);
    return this.catalogService.linkCatalogToMeta(catalog.id, teamId);
  }

  // ==================== Meta Catalog Management Endpoints ====================

  @Get('meta/catalogs')
  @ApiOperation({
    summary: 'List all Meta catalogs for the business',
    description:
      'Returns all product catalogs owned by the configured Meta Business account. ' +
      'Use this to find existing catalogs to link or verify catalog setup.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of Meta catalogs',
    type: MetaCatalogsResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Meta Commerce API not configured',
  })
  async listMetaCatalogs(
    @Req() req: AuthenticatedRequest,
  ): Promise<MetaCatalogsResponseDto> {
    // Verify user has team access
    await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.listMetaCatalogs();
  }

  @Post('meta/catalogs')
  @ApiOperation({
    summary: 'Create a new Meta catalog',
    description:
      'Creates a new commerce product catalog on Meta platform and automatically links it to your team catalog. ' +
      'Only commerce catalogs are supported for WhatsApp product messages.',
  })
  @ApiResponse({
    status: 201,
    description: 'Meta catalog created and linked',
    type: CatalogResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Meta Commerce API not configured',
  })
  @ApiBody({ type: CreateMetaCatalogDto })
  async createMetaCatalog(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateMetaCatalogDto,
  ): Promise<CatalogResponseDto> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.createMetaCatalog(teamId, dto.name);
  }

  @Get('meta/catalogs/:metaCatalogId')
  @ApiOperation({
    summary: 'Get Meta catalog details',
    description: 'Returns detailed information about a specific Meta catalog.',
  })
  @ApiParam({ name: 'metaCatalogId', description: 'Meta Catalog ID' })
  @ApiResponse({
    status: 200,
    description: 'Meta catalog details',
    type: MetaCatalogDto,
  })
  async getMetaCatalogInfo(
    @Req() req: AuthenticatedRequest,
    @Param('metaCatalogId') metaCatalogId: string,
  ): Promise<MetaCatalogDto> {
    // Verify user has team access
    await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.getMetaCatalogInfo(metaCatalogId);
  }

  @Delete('meta/catalogs/:metaCatalogId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a Meta catalog',
    description:
      'Permanently deletes a Meta catalog. ' +
      'This will disconnect it from WABA if connected, delete it from Meta, ' +
      'and unlink it from your team catalog if linked. ' +
      'This action cannot be undone.',
  })
  @ApiParam({ name: 'metaCatalogId', description: 'Meta Catalog ID to delete' })
  @ApiResponse({
    status: 200,
    description: 'Meta catalog deleted successfully',
    type: DeleteMetaCatalogResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Meta Commerce API not configured or deletion failed',
  })
  @ApiResponse({
    status: 404,
    description: 'Meta catalog not found',
  })
  async deleteMetaCatalog(
    @Req() req: AuthenticatedRequest,
    @Param('metaCatalogId') metaCatalogId: string,
  ): Promise<DeleteMetaCatalogResponseDto> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.deleteMetaCatalog(teamId, metaCatalogId);
  }

  @Post('meta/link')
  @ApiOperation({
    summary: 'Link existing Meta catalog to team catalog',
    description:
      'Links an existing Meta catalog to your team catalog. ' +
      'The Meta catalog must be a commerce type for WhatsApp product messages.',
  })
  @ApiResponse({
    status: 200,
    description: 'Meta catalog linked successfully',
    type: CatalogResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid catalog or API not configured',
  })
  @ApiResponse({
    status: 409,
    description: 'Catalog already linked to a different Meta catalog',
  })
  @ApiBody({ type: LinkMetaCatalogDto })
  async linkExistingMetaCatalog(
    @Req() req: AuthenticatedRequest,
    @Body() dto: LinkMetaCatalogDto,
  ): Promise<CatalogResponseDto> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.linkExistingMetaCatalog(
      teamId,
      dto.metaCatalogId,
    );
  }

  @Delete('meta/link')
  @ApiOperation({
    summary: 'Unlink Meta catalog from team catalog',
    description:
      'Removes the link between your team catalog and Meta catalog. ' +
      'Products will no longer sync to Meta.',
  })
  @ApiResponse({
    status: 200,
    description: 'Meta catalog unlinked',
    type: CatalogResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Catalog not linked to any Meta catalog',
  })
  async unlinkMetaCatalog(
    @Req() req: AuthenticatedRequest,
  ): Promise<CatalogResponseDto> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.unlinkMetaCatalog(teamId);
  }

  // ==================== Meta Product Set (Collection) Endpoints ====================

  @Get('meta/product-sets')
  @ApiOperation({
    summary: 'List product sets (collections) in Meta catalog',
    description:
      'Returns all product sets in the linked Meta catalog. ' +
      'Product sets are used for organizing products into collections.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of product sets',
    type: [MetaProductSetDto],
  })
  @ApiResponse({
    status: 400,
    description: 'Catalog not linked to Meta',
  })
  async listMetaProductSets(
    @Req() req: AuthenticatedRequest,
  ): Promise<MetaProductSetDto[]> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.listMetaProductSets(teamId);
  }

  @Post('meta/product-sets')
  @ApiOperation({
    summary: 'Create a product set (collection) in Meta catalog',
    description:
      'Creates a new product set in the linked Meta catalog. ' +
      'Use filter parameter for dynamic sets based on product attributes.',
  })
  @ApiResponse({
    status: 201,
    description: 'Product set created',
    type: MetaProductSetDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Catalog not linked to Meta',
  })
  @ApiBody({ type: CreateMetaProductSetDto })
  async createMetaProductSet(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateMetaProductSetDto,
  ): Promise<MetaProductSetDto> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.createMetaProductSet(
      teamId,
      dto.name,
      dto.filter,
    );
  }

  @Delete('meta/product-sets/:productSetId')
  @ApiOperation({
    summary: 'Delete a product set from Meta catalog',
  })
  @ApiParam({ name: 'productSetId', description: 'Product Set ID' })
  @ApiResponse({
    status: 200,
    description: 'Product set deleted',
  })
  async deleteMetaProductSet(
    @Req() req: AuthenticatedRequest,
    @Param('productSetId') productSetId: string,
  ): Promise<{ success: boolean }> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.deleteMetaProductSet(teamId, productSetId);
  }

  // ==================== Catalog Item Endpoints ====================

  @Get('items')
  @ApiOperation({ summary: 'List catalog items with pagination and filtering' })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated catalog items',
    type: PaginatedCatalogItemsResponseDto,
  })
  async getCatalogItems(
    @Req() req: AuthenticatedRequest,
    @Query() query: CatalogItemsQueryDto,
  ): Promise<PaginatedCatalogItemsResponseDto> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    const catalog = await this.catalogService.getOrCreateCatalog(teamId);
    return this.catalogService.getCatalogItems(catalog.id, teamId, query);
  }

  @Post('items')
  @ApiOperation({ summary: 'Create a new catalog item' })
  @ApiResponse({
    status: 201,
    description: 'Catalog item created',
    type: CatalogItemResponseDto,
  })
  @ApiBody({ type: CreateCatalogItemDto })
  async createCatalogItem(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCatalogItemDto,
  ): Promise<CatalogItemResponseDto> {
    const userId = req.user.userId;
    const teamId = await this.catalogService.getUserTeamId(userId);
    const catalog = await this.catalogService.getOrCreateCatalog(teamId);
    return this.catalogService.createCatalogItem(
      catalog.id,
      teamId,
      userId,
      dto,
    );
  }

  @Get('items/:itemId')
  @ApiOperation({ summary: 'Get a single catalog item' })
  @ApiParam({ name: 'itemId', description: 'Catalog item ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Returns catalog item',
    type: CatalogItemResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Catalog item not found' })
  async getCatalogItem(
    @Req() req: AuthenticatedRequest,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<CatalogItemResponseDto> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.getCatalogItem(itemId, teamId);
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Update a catalog item' })
  @ApiParam({ name: 'itemId', description: 'Catalog item ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Catalog item updated',
    type: CatalogItemResponseDto,
  })
  @ApiBody({ type: UpdateCatalogItemDto })
  async updateCatalogItem(
    @Req() req: AuthenticatedRequest,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateCatalogItemDto,
  ): Promise<CatalogItemResponseDto> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.updateCatalogItem(itemId, teamId, dto);
  }

  @Delete('items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a catalog item' })
  @ApiParam({ name: 'itemId', description: 'Catalog item ID (UUID)' })
  @ApiResponse({ status: 204, description: 'Catalog item deleted' })
  @ApiResponse({ status: 404, description: 'Catalog item not found' })
  async deleteCatalogItem(
    @Req() req: AuthenticatedRequest,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.deleteCatalogItem(itemId, teamId);
  }

  @Post('items/submit-for-review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit catalog items for Meta review',
    description: `
      Validates and submits catalog items for Meta Commerce review.
      
      Items must meet these Meta Commerce requirements:
      - At least one uploaded image (image_link)
      - Name/title filled in
      - Description filled in
      - Price with currency
      - Product link URL (required)
      - Availability and condition set
      - Status must be DRAFT, NEEDS_UPDATE, or REJECTED
      
      Successfully validated items will be set to PENDING_APPROVAL status.
      Items failing validation will be returned with the specific reasons.
    `,
  })
  @ApiResponse({
    status: 200,
    description: 'Items submitted for review',
    type: SubmitForReviewResponseDto,
  })
  @ApiBody({ type: SubmitForReviewDto })
  async submitForReview(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SubmitForReviewDto,
  ): Promise<SubmitForReviewResponseDto> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.submitForReview(dto.itemIds, teamId);
  }

  // ==================== Status Sync Endpoints ====================

  @Post('items/sync-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sync catalog item statuses with Meta Commerce',
    description: `
      Checks the approval status of catalog items with Meta Commerce API.
      If no item IDs are provided, syncs all items with PENDING_APPROVAL status.
      
      In development mode, this simulates Meta approval by randomly approving
      pending items (for testing purposes).
    `,
  })
  @ApiResponse({
    status: 200,
    description: 'Sync completed',
    type: SyncStatusResultDto,
  })
  @ApiBody({ type: SyncItemStatusDto })
  async syncItemStatuses(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SyncItemStatusDto,
  ): Promise<SyncStatusResultDto> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.syncItemStatuses(dto.itemIds, teamId);
  }

  @Post('items/:itemId/sync-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sync status for a single catalog item',
    description:
      'Checks the approval status of a specific item with Meta Commerce API',
  })
  @ApiParam({ name: 'itemId', description: 'Catalog item ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Item status synced',
    type: SyncSingleItemResultDto,
  })
  async syncSingleItemStatus(
    @Req() req: AuthenticatedRequest,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<SyncSingleItemResultDto> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.syncSingleItemStatus(itemId, teamId);
  }

  // ==================== Image Upload Endpoints ====================

  @Post('images/initiate')
  @ApiOperation({
    summary: 'Initiate image upload',
    description: 'Returns a pre-signed URL for direct upload to S3',
  })
  @ApiResponse({
    status: 201,
    description: 'Returns upload URL and image metadata',
    type: ImageUploadResponseDto,
  })
  @ApiBody({ type: InitiateImageUploadDto })
  async initiateImageUpload(
    @Req() req: AuthenticatedRequest,
    @Body() dto: InitiateImageUploadDto,
  ): Promise<ImageUploadResponseDto> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.initiateImageUpload(teamId, dto);
  }

  @Post('images/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 8 * 1024 * 1024, // 8MB max per Meta requirements
      },
    }),
  )
  @ApiOperation({
    summary: 'Upload image directly through backend (CORS-free)',
    description:
      'Uploads image file directly to S3 via backend proxy, avoiding CORS issues',
  })
  @ApiResponse({
    status: 201,
    description: 'Returns image metadata after successful upload',
    type: DirectImageUploadResponseDto,
  })
  async uploadImageDirect(
    @UploadedFile() file: any,
    @Query('catalogItemId') catalogItemId: string | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<DirectImageUploadResponseDto> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file type
    if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only JPEG and PNG images are allowed.',
      );
    }

    const teamId = await this.catalogService.getUserTeamId(req.user.userId);

    this.logger.log(
      `Direct image upload started: ${file.originalname} (${file.size} bytes), mimeType: ${file.mimetype}`,
    );

    const result = await this.catalogService.proxyImageUpload(
      teamId,
      file,
      catalogItemId,
    );

    this.logger.log(
      `Direct image upload completed: imageId=${result.imageId}, key=${result.imageKey}`,
    );

    return result;
  }

  @Post('items/:itemId/images/associate')
  @ApiOperation({
    summary: 'Associate uploaded image with catalog item',
    description:
      'Associates a previously uploaded image with a catalog item. Used when images are uploaded before the item is created.',
  })
  @ApiParam({ name: 'itemId', description: 'Catalog item ID (UUID)' })
  @ApiResponse({
    status: 201,
    description: 'Image associated with item',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        imageKey: {
          type: 'string',
          description: 'S3 key of the uploaded image',
        },
        originalFilename: {
          type: 'string',
          description: 'Original filename of the uploaded image',
        },
        fileSize: {
          type: 'number',
          description: 'File size in bytes',
        },
        mimeType: {
          type: 'string',
          description: 'MIME type of the image',
        },
        isMain: {
          type: 'boolean',
          description: 'Whether this is the main image',
        },
        sortOrder: { type: 'number', description: 'Sort order for the image' },
      },
      required: ['imageKey'],
    },
  })
  async associateImage(
    @Req() req: AuthenticatedRequest,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body()
    dto: {
      imageKey: string;
      originalFilename?: string;
      fileSize?: number;
      mimeType?: string;
      isMain?: boolean;
      sortOrder?: number;
    },
  ) {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.associateImage(teamId, itemId, dto);
  }

  @Post('images/complete')
  @ApiOperation({
    summary: 'Complete image upload',
    description:
      'Called after successful upload to trigger thumbnail generation',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns image metadata',
    type: CatalogItemImageDto,
  })
  @ApiBody({ type: CompleteImageUploadDto })
  async completeImageUpload(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CompleteImageUploadDto,
  ): Promise<CatalogItemImageDto> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.completeImageUpload(teamId, dto);
  }

  @Delete('images/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an image' })
  @ApiParam({ name: 'imageId', description: 'Image ID (UUID)' })
  @ApiResponse({ status: 204, description: 'Image deleted' })
  async deleteImage(
    @Req() req: AuthenticatedRequest,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ): Promise<void> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.deleteImage(imageId, teamId);
  }

  @Put('items/:itemId/images/reorder')
  @ApiOperation({ summary: 'Reorder images for a catalog item' })
  @ApiParam({ name: 'itemId', description: 'Catalog item ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Returns updated images',
    type: [CatalogItemImageDto],
  })
  @ApiBody({ type: ReorderImagesDto })
  async reorderImages(
    @Req() req: AuthenticatedRequest,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: ReorderImagesDto,
  ): Promise<CatalogItemImageDto[]> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.reorderImages(itemId, dto.imageIds, teamId);
  }

  // ==================== Collection Endpoints ====================

  @Get('collections')
  @ApiOperation({ summary: 'Get all collections for the catalog' })
  @ApiResponse({
    status: 200,
    description: 'Returns collections',
    type: [CatalogCollectionResponseDto],
  })
  async getCollections(
    @Req() req: AuthenticatedRequest,
  ): Promise<CatalogCollectionResponseDto[]> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    const catalog = await this.catalogService.getOrCreateCatalog(teamId);
    return this.catalogService.getCollections(catalog.id, teamId);
  }

  @Post('collections')
  @ApiOperation({ summary: 'Create a new collection' })
  @ApiResponse({
    status: 201,
    description: 'Collection created',
    type: CatalogCollectionResponseDto,
  })
  @ApiBody({ type: CreateCatalogCollectionDto })
  async createCollection(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCatalogCollectionDto,
  ): Promise<CatalogCollectionResponseDto> {
    const userId = req.user.userId;
    const teamId = await this.catalogService.getUserTeamId(userId);
    const catalog = await this.catalogService.getOrCreateCatalog(teamId);
    return this.catalogService.createCollection(
      catalog.id,
      teamId,
      userId,
      dto,
    );
  }

  @Post('collections/:collectionId/items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add items to a collection' })
  @ApiParam({ name: 'collectionId', description: 'Collection ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Items added to collection' })
  @ApiBody({ type: AddItemsToCollectionDto })
  async addItemsToCollection(
    @Req() req: AuthenticatedRequest,
    @Param('collectionId', ParseUUIDPipe) collectionId: string,
    @Body() dto: AddItemsToCollectionDto,
  ): Promise<void> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.addItemsToCollection(
      collectionId,
      dto.itemIds,
      teamId,
    );
  }

  @Delete('collections/:collectionId/items')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove items from a collection' })
  @ApiParam({ name: 'collectionId', description: 'Collection ID (UUID)' })
  @ApiResponse({ status: 204, description: 'Items removed from collection' })
  @ApiBody({ type: AddItemsToCollectionDto })
  async removeItemsFromCollection(
    @Req() req: AuthenticatedRequest,
    @Param('collectionId', ParseUUIDPipe) collectionId: string,
    @Body() dto: AddItemsToCollectionDto,
  ): Promise<void> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.removeItemsFromCollection(
      collectionId,
      dto.itemIds,
      teamId,
    );
  }

  @Delete('collections/:collectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a collection' })
  @ApiParam({ name: 'collectionId', description: 'Collection ID (UUID)' })
  @ApiResponse({ status: 204, description: 'Collection deleted' })
  async deleteCollection(
    @Req() req: AuthenticatedRequest,
    @Param('collectionId', ParseUUIDPipe) collectionId: string,
  ): Promise<void> {
    const teamId = await this.catalogService.getUserTeamId(req.user.userId);
    return this.catalogService.deleteCollection(collectionId, teamId);
  }

  // ==================== Send Catalog Items ====================

  @Post('items/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send catalog item to a chat' })
  @ApiBody({ type: SendCatalogItemDto })
  @ApiResponse({
    status: 200,
    description: 'Catalog item sent successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        messageId: { type: 'string' },
      },
    },
  })
  async sendCatalogItem(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SendCatalogItemDto,
  ): Promise<{ success: boolean; messageId: string }> {
    const userId = req.user.userId;
    const teamId = await this.catalogService.getUserTeamId(userId);
    return this.catalogService.sendCatalogItemToChat(
      dto.chatId,
      dto.catalogItemIds,
      teamId,
      userId,
    );
  }

  @Post('items/send-bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send catalog item to multiple chats' })
  @ApiBody({ type: SendCatalogItemToMultipleDto })
  @ApiResponse({
    status: 200,
    description: 'Catalog items sent to multiple chats',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              chatId: { type: 'string' },
              success: { type: 'boolean' },
              messageId: { type: 'string' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async sendCatalogItemToMultiple(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SendCatalogItemToMultipleDto,
  ): Promise<{
    success: boolean;
    results: Array<{
      chatId: string;
      success: boolean;
      messageId?: string;
      error?: string;
    }>;
  }> {
    const userId = req.user.userId;
    const teamId = await this.catalogService.getUserTeamId(userId);
    return this.catalogService.sendCatalogItemToMultipleChats(
      dto.chatIds,
      dto.catalogItemIds,
      teamId,
      userId,
    );
  }

  // ==================== Bulk Import Endpoints ====================

  @Post('items/bulk-import')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Bulk import catalog items',
    description:
      'Import multiple catalog items from CSV/JSON data. Maximum 500 items per request.',
  })
  @ApiBody({ type: BulkImportPreviewDto })
  @ApiResponse({
    status: 201,
    description: 'Import completed',
    type: BulkImportResultDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid import data' })
  async bulkImportItems(
    @Req() req: AuthenticatedRequest,
    @Body() dto: BulkImportPreviewDto,
  ): Promise<BulkImportResultDto> {
    const userId = req.user.userId;
    const teamId = await this.catalogService.getUserTeamId(userId);
    return this.catalogService.bulkImportItems(dto.items, teamId, userId);
  }
}
