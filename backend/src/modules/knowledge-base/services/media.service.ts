/**
 * Knowledge Base Media Service
 *
 * Core service for managing media attached to knowledge base objects.
 * Handles:
 * - Media upload with mandatory metadata validation
 * - AI eligibility checks
 * - S3 storage coordination
 * - Media metadata CRUD operations
 * - Image normalization for WhatsApp compatibility
 * - Video compression via Lambda or local BullMQ (with automatic fallback)
 */

import { db } from '@database/db.connection';
import {
  kbObjectMedia,
  kbObjects,
  kbTemplateFields,
  NewKbObjectMedia,
} from '@database/knowledge-base.schema';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KB_OBJECT_MEDIA_LIMIT,
  validateWhatsAppMedia,
  videoNeedsCompression,
} from '@shared/constants/whatsapp-media-limits';
import { ImageProcessingService } from '@shared/services/image-processing.service';
import { LambdaCompressionService } from '@shared/services/lambda-compression.service';
import { S3Service } from '@shared/services/s3.service';
import { and, eq, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { CompressionQueueService } from '../../video-compression/compression-queue.service';
import {
  ConfirmMediaUploadDto,
  InitiateMediaUploadDto,
  UpdateMediaAiPermissionDto,
  UpdateMediaDto,
} from '../dto/media.dto';
import {
  getMediaRoleMetadata,
  isValidMimeTypeForRole,
  isWhatsAppSupportedMimeType,
  MediaAiPermission,
  MediaEligibilityFailure,
  MediaEligibilityResult,
  MediaRole,
} from '../types/media.types';
import { KbThumbnailService } from './kb-thumbnail.service';
import { KnowledgeBaseStorageService } from './storage.service';

export interface MediaWithObject {
  id: string;
  objectId: string;
  fieldId: string | null;
  fileName: string;
  originalFileName: string | null;
  mimeType: string;
  fileSize: number;
  s3Bucket: string;
  s3Key: string;
  s3Url: string | null;
  mediaType: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  thumbnailS3Key: string | null;
  thumbnailUrl: string | null;
  // Compression fields
  compressionStatus: string | null;
  compressedS3Key: string | null;
  compressedFileSize: number | null;
  originalFileSize: number | null;
  compressionError: string | null;
  extractedContent: string | null;
  extractionStatus: string | null;
  extractionError: string | null;
  sortOrder: number | null;
  altText: string | null;
  caption: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  // AI fields for media selection guidance
  aiEnabled: boolean;
  aiInstructions: string | null;
  // Extended fields from joins
  objectName?: string;
  objectStatus?: string;
  templateId?: string;
  templateName?: string;
  aiPermission?: MediaAiPermission;
}

@Injectable()
export class KbMediaService {
  private readonly logger = new Logger(KbMediaService.name);

  // ============================================================================
  // PRIVATE HELPER: IMAGE NORMALIZATION
  // ============================================================================

  /**
   * Normalize and upload an image buffer to S3.
   * For images, this ensures WhatsApp compatibility by converting to 8-bit sRGB JPEG.
   * For non-images, uploads the buffer as-is.
   *
   * @param buffer - The file buffer to upload
   * @param mimeType - The original MIME type
   * @param s3Key - The S3 key to upload to
   * @returns Object with the final buffer, mimeType, and fileSize
   */
  private async normalizeAndUploadToS3(
    buffer: Buffer,
    mimeType: string,
    s3Key: string,
  ): Promise<{
    buffer: Buffer;
    mimeType: string;
    fileSize: number;
    wasProcessed: boolean;
  }> {
    let finalBuffer = buffer;
    let finalMimeType = mimeType;
    let wasProcessed = false;

    // Normalize images for WhatsApp compatibility
    if (mimeType.startsWith('image/')) {
      this.logger.log(
        `[Image Upload] Processing image before S3 upload: ${s3Key}`,
      );

      const result = await this.imageProcessingService.normalizeForWhatsApp(
        buffer,
        mimeType,
        true, // Always force processing for images
      );

      if (result.wasProcessed) {
        finalBuffer = result.buffer;
        finalMimeType = result.mimeType;
        wasProcessed = true;

        this.logger.log(
          `[Image Upload] Image normalized: ${buffer.length} -> ${finalBuffer.length} bytes, ` +
            `${mimeType} -> ${finalMimeType}`,
        );
      } else {
        this.logger.warn(
          `[Image Upload] Image normalization returned wasProcessed=false. ` +
            `This may indicate an issue with the image processing pipeline.`,
        );
      }
    }

    // Upload to S3
    await this.s3Service.uploadFile(s3Key, finalBuffer, finalMimeType);
    this.logger.log(
      `[S3 Upload] Uploaded to S3: ${s3Key} (${finalBuffer.length} bytes, ${finalMimeType})`,
    );

    return {
      buffer: finalBuffer,
      mimeType: finalMimeType,
      fileSize: finalBuffer.length,
      wasProcessed,
    };
  }

  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: KnowledgeBaseStorageService,
    private readonly s3Service: S3Service,
    private readonly imageProcessingService: ImageProcessingService,
    private readonly kbThumbnailService: KbThumbnailService,
    private readonly compressionQueueService: CompressionQueueService,
    private readonly lambdaCompressionService: LambdaCompressionService,
  ) {}

  // ============================================================================
  // MEDIA COUNT VALIDATION
  // ============================================================================

  /**
   * Get the current media count for an object
   */
  async getObjectMediaCount(objectId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(kbObjectMedia)
      .where(eq(kbObjectMedia.objectId, objectId));

    return result[0]?.count ?? 0;
  }

  /**
   * Validate that an object hasn't reached its media limit
   *
   * @throws BadRequestException if limit is reached
   */
  private async validateMediaLimit(objectId: string): Promise<void> {
    const currentCount = await this.getObjectMediaCount(objectId);

    if (currentCount >= KB_OBJECT_MEDIA_LIMIT) {
      throw new BadRequestException(
        `Maximum media limit reached. Each object can have at most ${KB_OBJECT_MEDIA_LIMIT} media items. ` +
          `Please delete some media before uploading new files.`,
      );
    }
  }

  // ============================================================================
  // MEDIA UPLOAD
  // ============================================================================

  /**
   * Initiate a media upload - validates and creates media record with presigned URL
   */
  async initiateUpload(
    userId: number,
    dto: InitiateMediaUploadDto,
  ): Promise<{
    mediaId: string;
    uploadUrl: string;
    uploadUrlExpires: string;
  }> {
    // Validate the object exists and belongs to user
    const object = await db.query.kbObjects.findFirst({
      where: eq(kbObjects.id, dto.objectId),
    });

    if (!object) {
      throw new NotFoundException(`Object ${dto.objectId} not found`);
    }

    if (object.userId !== userId) {
      throw new ForbiddenException('Access denied to this object');
    }

    // Validate media count limit before allowing upload
    await this.validateMediaLimit(dto.objectId);

    // Validate field if specified
    if (dto.fieldId) {
      const field = await db.query.kbTemplateFields.findFirst({
        where: and(
          eq(kbTemplateFields.id, dto.fieldId),
          eq(kbTemplateFields.templateId, object.templateId),
        ),
      });

      if (!field) {
        throw new NotFoundException(
          `Field ${dto.fieldId} not found in template`,
        );
      }

      if (field.fieldType !== 'media' && field.fieldType !== 'file') {
        throw new BadRequestException(
          `Field ${dto.fieldId} is not a media or file field`,
        );
      }
    }

    // Validate MIME type against role
    if (!isValidMimeTypeForRole(dto.mediaRole as MediaRole, dto.mimeType)) {
      const roleMetadata = getMediaRoleMetadata(dto.mediaRole as MediaRole);
      throw new BadRequestException(
        `MIME type ${dto.mimeType} is not allowed for role ${dto.mediaRole}. ` +
          `Allowed types: ${roleMetadata?.allowedMimeTypes.join(', ')}`,
      );
    }

    // Validate caption is meaningful (required for AI)
    if (!dto.caption || dto.caption.trim().length < 10) {
      throw new BadRequestException(
        'Caption must be at least 10 characters to describe the media purpose',
      );
    }

    // Validate against WhatsApp media limits (for initiateUpload)
    // This ensures uploaded media can actually be sent via WhatsApp
    const whatsAppValidation = validateWhatsAppMedia(
      dto.mimeType,
      dto.fileSize,
      dto.fileName,
    );

    if (!whatsAppValidation.isValid) {
      this.logger.warn(
        `[KB Media] WhatsApp validation failed for ${dto.fileName}: ${whatsAppValidation.errors.join('; ')}`,
      );
      throw new BadRequestException(
        `Media cannot be used with WhatsApp: ${whatsAppValidation.errors.join(' ')}`,
      );
    }

    // Log warnings if file is close to limits
    if (whatsAppValidation.warnings.length > 0) {
      this.logger.warn(
        `[KB Media] WhatsApp warnings for ${dto.fileName}: ${whatsAppValidation.warnings.join('; ')}`,
      );
    }

    // Generate S3 path
    const s3Path = this.storageService.generateObjectMediaPath(
      userId,
      dto.objectId,
      dto.mimeType,
      dto.fileName,
    );

    // Build AI permission JSON
    const aiPermission: MediaAiPermission = {
      aiEnabled: dto.aiEnabled,
      aiPermissionSetBy: userId,
      aiPermissionSetAt: new Date().toISOString(),
      allowedLanguages: dto.allowedLanguages || [],
    };

    // Create media record
    const mediaId = uuidv4();
    const mediaRecord: NewKbObjectMedia = {
      id: mediaId,
      objectId: dto.objectId,
      fieldId: dto.fieldId || null,
      fileName: s3Path.key.split('/').pop()!,
      originalFileName: dto.fileName,
      mimeType: dto.mimeType,
      fileSize: dto.fileSize,
      s3Bucket: s3Path.bucket,
      s3Key: s3Path.key,
      mediaType: dto.mediaRole,
      altText: dto.altText || null,
      caption: dto.caption,
      sortOrder: dto.sortOrder || 0,
      extractionStatus: 'pending',
    };

    await db.insert(kbObjectMedia).values(mediaRecord);

    // Store AI permission in a metadata field (using altText temporarily or add to field_config)
    // We'll update this after schema extension

    // Generate presigned URL for upload using shared S3Service
    const presignedResult =
      await this.s3Service.generatePresignedUploadUrlForKey(
        s3Path.key,
        dto.mimeType,
      );

    // Update object media count
    await db
      .update(kbObjects)
      .set({
        mediaCount: sql`${kbObjects.mediaCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(kbObjects.id, dto.objectId));

    this.logger.log(
      `Initiated upload for media ${mediaId} to object ${dto.objectId}`,
    );

    return {
      mediaId,
      uploadUrl: presignedResult.url,
      uploadUrlExpires: new Date(
        Date.now() + presignedResult.expiresIn * 1000,
      ).toISOString(),
    };
  }

  /**
   * Confirm media upload completion and update dimensions/duration.
   * For images, this also normalizes the image to be WhatsApp-compatible.
   * For videos exceeding WhatsApp limits, queues for compression.
   * Generates thumbnails for images, videos, and PDFs.
   */
  async confirmUpload(
    userId: number,
    dto: ConfirmMediaUploadDto,
  ): Promise<MediaWithObject> {
    const media = await this.getMediaById(dto.mediaId);

    if (!media) {
      throw new NotFoundException(`Media ${dto.mediaId} not found`);
    }

    // Verify ownership
    const object = await db.query.kbObjects.findFirst({
      where: eq(kbObjects.id, media.objectId),
    });

    if (!object || object.userId !== userId) {
      throw new ForbiddenException('Access denied to this media');
    }

    // Process image for WhatsApp compatibility if it's an image
    await this.processImageForWhatsApp(media);

    // Update media with dimensions/duration
    await db
      .update(kbObjectMedia)
      .set({
        width: dto.width || null,
        height: dto.height || null,
        duration: dto.duration || null,
        updatedAt: new Date(),
      })
      .where(eq(kbObjectMedia.id, dto.mediaId));

    // Generate thumbnail synchronously so it's included in response
    await this.generateThumbnailSync(dto.mediaId, media.s3Key, media.mimeType);

    // Queue video compression if needed (async - doesn't block response)
    await this.queueVideoCompressionIfNeeded(
      dto.mediaId,
      media.s3Key,
      media.s3Bucket,
      media.fileSize,
      media.mimeType,
      media.fileName,
      userId,
      media.objectId,
    );

    this.logger.log(`Confirmed upload for media ${dto.mediaId}`);

    return this.getMediaWithObject(dto.mediaId);
  }

  /**
   * Queue video for compression if it exceeds WhatsApp's send limit.
   * Uses Lambda compression if configured, otherwise falls back to local BullMQ.
   * This is non-blocking - the video can still be used while compression runs.
   */
  private async queueVideoCompressionIfNeeded(
    mediaId: string,
    s3Key: string,
    s3Bucket: string,
    fileSize: number,
    mimeType: string,
    fileName: string,
    userId: number,
    objectId: string,
  ): Promise<void> {
    // Check if this video needs compression
    if (!videoNeedsCompression(mimeType, fileSize)) {
      return;
    }

    try {
      let jobId: string | null = null;

      // Try Lambda compression first (if configured)
      const lambdaEnabled =
        this.lambdaCompressionService.isLambdaCompressionEnabled();
      if (lambdaEnabled) {
        this.logger.debug(
          `[Video Compression] Attempting Lambda compression for ${fileName}`,
        );

        jobId = await this.lambdaCompressionService.queueCompression({
          mediaId,
          s3Key,
          s3Bucket,
          fileSize,
          mimeType,
          fileName,
          userId,
          objectId,
          mediaType: 'video',
        });

        if (jobId) {
          this.logger.log(
            `[Lambda Compression] ✓ Queued job ${jobId} for media ${mediaId} ` +
              `(${(fileSize / 1024 / 1024).toFixed(2)}MB video)`,
          );
        } else {
          this.logger.warn(
            `[Lambda Compression] Returned null for ${fileName}, falling back to local compression`,
          );
        }
      } else {
        this.logger.debug(
          `[Video Compression] Lambda compression not enabled, using local compression`,
        );
      }

      // Fallback to local BullMQ compression if Lambda not available or failed
      if (!jobId) {
        jobId = await this.compressionQueueService.queueCompression({
          mediaId,
          s3Key,
          s3Bucket,
          fileSize,
          mimeType,
          fileName,
          userId,
          objectId,
        });

        if (jobId) {
          this.logger.log(
            `[Local Compression] Queued job ${jobId} for media ${mediaId} ` +
              `(${(fileSize / 1024 / 1024).toFixed(2)}MB video) ` +
              `[Lambda enabled: ${lambdaEnabled}]`,
          );
        }
      }

      if (jobId) {
        // Calculate the expected compressed S3 key (same logic as Lambda uses)
        const expectedCompressedKey =
          this.lambdaCompressionService.generateCompressedKey(s3Key);

        // Update media record to indicate compression is pending
        // Store the expected compressed key so we can poll S3 if webhook fails
        await db
          .update(kbObjectMedia)
          .set({
            compressionStatus: 'pending',
            originalFileSize: fileSize,
            compressedS3Key: expectedCompressedKey,
            updatedAt: new Date(),
          })
          .where(eq(kbObjectMedia.id, mediaId));
      }
    } catch (error) {
      // Log but don't fail the upload - video can still be used (just not sent via WhatsApp)
      this.logger.error(
        `[Video Compression] Failed to queue compression for ${mediaId}: ${error.message}`,
      );
    }
  }

  /**
   * Generate thumbnail synchronously
   *
   * Waits for thumbnail generation to complete so the response includes
   * the thumbnail URL. Errors are logged but don't fail the upload.
   */
  private async generateThumbnailSync(
    mediaId: string,
    s3Key: string,
    mimeType: string,
  ): Promise<void> {
    try {
      const result = await this.kbThumbnailService.generateThumbnail(
        mediaId,
        s3Key,
        mimeType,
      );

      if (result.success && result.thumbnailS3Key) {
        this.logger.log(`[Thumbnail] Generated thumbnail for media ${mediaId}`);
      } else if (!result.success && result.error) {
        this.logger.warn(
          `[Thumbnail] Failed for media ${mediaId}: ${result.error}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[Thumbnail] Unexpected error for media ${mediaId}: ${error.message}`,
      );
    }
  }

  /**
   * Process an image to ensure it's WhatsApp-compatible.
   * Downloads from S3, converts to sRGB/8-bit JPEG if needed, and re-uploads.
   *
   * WhatsApp Image Requirements:
   * - JPG/JPEG: RGB/RGBA, 8 bit/channels
   * - PNG: RGB/RGBA, up to 8 bit/channel
   */
  private async processImageForWhatsApp(media: MediaWithObject): Promise<{
    wasProcessed: boolean;
    error?: string;
  }> {
    // Only process images
    if (!media.mimeType.startsWith('image/')) {
      return { wasProcessed: false };
    }

    this.logger.debug(
      `[Image Processing] Checking image ${media.id} (${media.fileName}) for WhatsApp compatibility`,
    );

    try {
      // Download the image from S3
      const imageBuffer = await this.s3Service.downloadFile(media.s3Key);

      if (!imageBuffer) {
        this.logger.warn(
          `[Image Processing] Could not download image ${media.s3Key} for processing`,
        );
        return {
          wasProcessed: false,
          error: 'Could not download image from S3',
        };
      }

      // Normalize the image for WhatsApp
      const result = await this.imageProcessingService.normalizeForWhatsApp(
        imageBuffer,
        media.mimeType,
      );

      // If the image was processed, upload the normalized version
      if (result.wasProcessed) {
        this.logger.log(
          `[Image Processing] Uploading normalized image for ${media.id}: ` +
            `${imageBuffer.length} -> ${result.buffer.length} bytes`,
        );

        // Upload the processed image to the same S3 key (overwrite)
        await this.s3Service.uploadFile(
          media.s3Key,
          result.buffer,
          result.mimeType,
        );

        // Update the media record with the new MIME type and file size
        await db
          .update(kbObjectMedia)
          .set({
            mimeType: result.mimeType,
            fileSize: result.buffer.length,
            updatedAt: new Date(),
          })
          .where(eq(kbObjectMedia.id, media.id));

        this.logger.log(
          `[Image Processing] Successfully normalized image ${media.id} for WhatsApp compatibility. ` +
            `Original: ${result.originalMetadata.colorSpace || 'unknown'} ${result.originalMetadata.depth || 'unknown'} -> JPEG sRGB 8-bit`,
        );

        return { wasProcessed: true };
      } else {
        this.logger.debug(
          `[Image Processing] Image ${media.id} already WhatsApp-compatible, no processing needed`,
        );
        return { wasProcessed: false };
      }
    } catch (error) {
      // Log error but don't fail the upload confirmation
      this.logger.error(
        `[Image Processing] Failed to process image ${media.id}: ${error.message}`,
        error.stack,
      );
      return { wasProcessed: false, error: error.message };
    }
  }

  /**
   * Re-process an existing image to ensure WhatsApp compatibility.
   * Useful for fixing images that were uploaded before the normalization fix.
   *
   * @param mediaId - The media ID to re-process
   * @param userId - User ID for ownership verification
   * @returns Result of the re-processing operation
   */
  async reprocessImage(
    mediaId: string,
    userId: number,
  ): Promise<{
    success: boolean;
    wasProcessed: boolean;
    message: string;
  }> {
    const media = await this.getMediaById(mediaId);

    if (!media) {
      return {
        success: false,
        wasProcessed: false,
        message: `Media ${mediaId} not found`,
      };
    }

    // Verify ownership
    const object = await db.query.kbObjects.findFirst({
      where: eq(kbObjects.id, media.objectId),
    });

    if (!object || object.userId !== userId) {
      return {
        success: false,
        wasProcessed: false,
        message: 'Access denied to this media',
      };
    }

    if (!media.mimeType.startsWith('image/')) {
      return {
        success: false,
        wasProcessed: false,
        message: 'Media is not an image',
      };
    }

    const result = await this.processImageForWhatsApp(media);

    if (result.error) {
      return {
        success: false,
        wasProcessed: false,
        message: `Processing failed: ${result.error}`,
      };
    }

    return {
      success: true,
      wasProcessed: result.wasProcessed,
      message: result.wasProcessed
        ? 'Image was successfully normalized for WhatsApp'
        : 'Image was already WhatsApp-compatible, no changes needed',
    };
  }

  // ============================================================================
  // MEDIA RETRIEVAL
  // ============================================================================

  /**
   * Get single media by ID
   */
  async getMediaById(mediaId: string): Promise<MediaWithObject | null> {
    const result = await db
      .select()
      .from(kbObjectMedia)
      .where(eq(kbObjectMedia.id, mediaId))
      .limit(1);

    if (!result[0]) {
      return null;
    }

    // Map nullable aiEnabled to boolean with default
    return {
      ...result[0],
      aiEnabled: result[0].aiEnabled ?? true,
    };
  }

  /**
   * Check and update compression status by polling S3
   *
   * This is a fallback mechanism for when the Lambda webhook fails
   * (e.g., when running locally and Lambda can't reach localhost).
   *
   * Checks if the expected compressed file exists in S3, and if so,
   * updates the database to mark compression as complete.
   *
   * @returns Updated compression status info
   */
  async checkCompressionStatus(mediaId: string): Promise<{
    status: string;
    compressedFileSize?: number;
    originalFileSize?: number;
    compressionRatio?: number;
    updated: boolean;
  }> {
    const media = await this.getMediaById(mediaId);

    if (!media) {
      throw new NotFoundException(`Media not found: ${mediaId}`);
    }

    // If already completed or failed, return current status
    if (
      media.compressionStatus === 'completed' ||
      media.compressionStatus === 'failed' ||
      media.compressionStatus === 'none'
    ) {
      return {
        status: media.compressionStatus || 'none',
        compressedFileSize: media.compressedFileSize || undefined,
        originalFileSize: media.originalFileSize || undefined,
        compressionRatio:
          media.originalFileSize && media.compressedFileSize
            ? media.originalFileSize / media.compressedFileSize
            : undefined,
        updated: false,
      };
    }

    // For pending/processing status, check S3 for the compressed file
    // If compressedS3Key is not stored (older uploads), generate it
    let compressedS3Key = media.compressedS3Key;
    if (!compressedS3Key && media.s3Key) {
      // Generate the expected compressed key using the same logic as Lambda
      compressedS3Key = this.lambdaCompressionService.generateCompressedKey(
        media.s3Key,
      );
      this.logger.debug(
        `[Compression Status] Generated expected key for ${mediaId}: ${compressedS3Key}`,
      );
    }

    if (!compressedS3Key) {
      // Still no key - can't poll
      return {
        status: media.compressionStatus || 'pending',
        updated: false,
      };
    }

    try {
      // Check if compressed file exists in S3 by trying to get metadata
      // getFileMetadata returns null if file doesn't exist
      const fileMetadata =
        await this.s3Service.getFileMetadata(compressedS3Key);

      if (fileMetadata) {
        // File exists - compression is complete
        const compressedFileSize = fileMetadata.size || 0;
        const originalFileSize = media.originalFileSize || media.fileSize || 0;
        const compressionRatio =
          originalFileSize > 0 && compressedFileSize > 0
            ? originalFileSize / compressedFileSize
            : 1;

        // Update database to mark compression as complete
        await db
          .update(kbObjectMedia)
          .set({
            compressionStatus: 'completed',
            compressedS3Key, // Store the key for future reference
            compressedFileSize,
            // Update main s3Key to point to compressed file
            s3Key: compressedS3Key,
            fileSize: compressedFileSize,
            updatedAt: new Date(),
          })
          .where(eq(kbObjectMedia.id, mediaId));

        this.logger.log(
          `[Compression Status] Detected completed compression for ${mediaId}: ` +
            `${originalFileSize} -> ${compressedFileSize} bytes ` +
            `(ratio: ${compressionRatio.toFixed(2)}x)`,
        );

        return {
          status: 'completed',
          compressedFileSize,
          originalFileSize,
          compressionRatio,
          updated: true,
        };
      }

      // File doesn't exist yet - still processing
      return {
        status: media.compressionStatus || 'pending',
        updated: false,
      };
    } catch (error) {
      this.logger.error(
        `[Compression Status] Error checking S3 for ${mediaId}: ${error.message}`,
      );
      return {
        status: media.compressionStatus || 'pending',
        updated: false,
      };
    }
  }

  /**
   * Get media with parent object info
   *
   * Returns media with presigned thumbnail URL for display.
   */
  async getMediaWithObject(mediaId: string): Promise<MediaWithObject> {
    const result = await db
      .select({
        id: kbObjectMedia.id,
        objectId: kbObjectMedia.objectId,
        fieldId: kbObjectMedia.fieldId,
        fileName: kbObjectMedia.fileName,
        originalFileName: kbObjectMedia.originalFileName,
        mimeType: kbObjectMedia.mimeType,
        fileSize: kbObjectMedia.fileSize,
        s3Bucket: kbObjectMedia.s3Bucket,
        s3Key: kbObjectMedia.s3Key,
        s3Url: kbObjectMedia.s3Url,
        mediaType: kbObjectMedia.mediaType,
        width: kbObjectMedia.width,
        height: kbObjectMedia.height,
        duration: kbObjectMedia.duration,
        thumbnailS3Key: kbObjectMedia.thumbnailS3Key,
        thumbnailUrl: kbObjectMedia.thumbnailUrl,
        // Compression fields
        compressionStatus: kbObjectMedia.compressionStatus,
        compressedS3Key: kbObjectMedia.compressedS3Key,
        compressedFileSize: kbObjectMedia.compressedFileSize,
        originalFileSize: kbObjectMedia.originalFileSize,
        compressionError: kbObjectMedia.compressionError,
        extractedContent: kbObjectMedia.extractedContent,
        extractionStatus: kbObjectMedia.extractionStatus,
        extractionError: kbObjectMedia.extractionError,
        sortOrder: kbObjectMedia.sortOrder,
        altText: kbObjectMedia.altText,
        caption: kbObjectMedia.caption,
        createdAt: kbObjectMedia.createdAt,
        updatedAt: kbObjectMedia.updatedAt,
        // AI fields
        aiEnabled: kbObjectMedia.aiEnabled,
        aiInstructions: kbObjectMedia.aiInstructions,
        // Join fields
        objectName: kbObjects.name,
        objectStatus: kbObjects.status,
        templateId: kbObjects.templateId,
      })
      .from(kbObjectMedia)
      .innerJoin(kbObjects, eq(kbObjectMedia.objectId, kbObjects.id))
      .where(eq(kbObjectMedia.id, mediaId))
      .limit(1);

    if (!result[0]) {
      throw new NotFoundException(`Media ${mediaId} not found`);
    }

    const media = {
      ...result[0],
      objectStatus: result[0].objectStatus ?? undefined,
      aiEnabled: result[0].aiEnabled ?? true,
    };

    // Enrich with presigned thumbnail URL
    const [enriched] = await this.enrichMediaWithThumbnailUrls([media]);
    return enriched;
  }

  /**
   * Get all media for an object
   *
   * Returns media with presigned thumbnail URLs for display.
   */
  async getMediaByObject(
    userId: number,
    objectId: string,
  ): Promise<MediaWithObject[]> {
    // Verify ownership
    const object = await db.query.kbObjects.findFirst({
      where: eq(kbObjects.id, objectId),
    });

    if (!object) {
      throw new NotFoundException(`Object ${objectId} not found`);
    }

    if (object.userId !== userId) {
      throw new ForbiddenException('Access denied to this object');
    }

    const results = await db
      .select()
      .from(kbObjectMedia)
      .where(eq(kbObjectMedia.objectId, objectId))
      .orderBy(kbObjectMedia.sortOrder);

    // Map nullable aiEnabled to boolean with default and enrich with thumbnails
    const mappedResults = results.map((result) => ({
      ...result,
      aiEnabled: result.aiEnabled ?? true,
    }));

    return this.enrichMediaWithThumbnailUrls(mappedResults);
  }

  /**
   * Enrich media items with presigned thumbnail URLs
   *
   * Generates presigned URLs for thumbnails so they can be displayed in the frontend.
   * URLs are generated with a 1-hour expiry by default.
   */
  private async enrichMediaWithThumbnailUrls<
    T extends { thumbnailS3Key: string | null; thumbnailUrl: string | null },
  >(mediaItems: T[]): Promise<T[]> {
    // Generate thumbnail URLs in parallel for performance
    const enriched = await Promise.all(
      mediaItems.map(async (media) => {
        if (media.thumbnailS3Key) {
          try {
            const thumbnailUrl = await this.kbThumbnailService.getThumbnailUrl(
              media.thumbnailS3Key,
            );
            return { ...media, thumbnailUrl };
          } catch (error) {
            this.logger.warn(
              `Failed to generate thumbnail URL for ${media.thumbnailS3Key}: ${error.message}`,
            );
            return media;
          }
        }
        return media;
      }),
    );

    return enriched;
  }

  // ============================================================================
  // MEDIA UPDATE
  // ============================================================================

  /**
   * Update media metadata
   */
  async updateMedia(
    userId: number,
    mediaId: string,
    dto: UpdateMediaDto,
  ): Promise<MediaWithObject> {
    const media = await this.getMediaWithObject(mediaId);

    // Verify ownership
    const object = await db.query.kbObjects.findFirst({
      where: eq(kbObjects.id, media.objectId),
    });

    if (!object || object.userId !== userId) {
      throw new ForbiddenException('Access denied to this media');
    }

    // Validate caption if being updated
    if (dto.caption !== undefined && dto.caption.trim().length < 10) {
      throw new BadRequestException(
        'Caption must be at least 10 characters to describe the media purpose',
      );
    }

    // Build update object
    const updateData: Partial<typeof kbObjectMedia.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.caption !== undefined) updateData.caption = dto.caption;
    if (dto.altText !== undefined) updateData.altText = dto.altText;
    if (dto.mediaRole !== undefined) updateData.mediaType = dto.mediaRole;
    if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;
    if (dto.aiEnabled !== undefined) updateData.aiEnabled = dto.aiEnabled;
    if (dto.aiInstructions !== undefined)
      updateData.aiInstructions = dto.aiInstructions;

    await db
      .update(kbObjectMedia)
      .set(updateData)
      .where(eq(kbObjectMedia.id, mediaId));

    this.logger.log(`Updated media ${mediaId}`);

    return this.getMediaWithObject(mediaId);
  }

  /**
   * Update AI permission settings for media
   */
  async updateAiPermission(
    userId: number,
    mediaId: string,
    dto: UpdateMediaAiPermissionDto,
  ): Promise<MediaWithObject> {
    const media = await this.getMediaWithObject(mediaId);

    // Verify ownership
    const object = await db.query.kbObjects.findFirst({
      where: eq(kbObjects.id, media.objectId),
    });

    if (!object || object.userId !== userId) {
      throw new ForbiddenException('Access denied to this media');
    }

    // If enabling AI, caption is required
    if (dto.aiEnabled && !media.caption) {
      throw new BadRequestException(
        'Cannot enable AI for media without a caption. Please add a caption first.',
      );
    }

    // Build update object for AI-specific fields
    const updateData: Partial<typeof kbObjectMedia.$inferInsert> = {
      updatedAt: new Date(),
      aiEnabled: dto.aiEnabled,
    };

    // Add optional AI settings
    if (dto.aiInstructions !== undefined) {
      updateData.aiInstructions = dto.aiInstructions;
    }

    // Update the database
    await db
      .update(kbObjectMedia)
      .set(updateData)
      .where(eq(kbObjectMedia.id, mediaId));

    this.logger.log(
      `Updated AI permission for media ${mediaId}: enabled=${dto.aiEnabled}`,
    );

    return this.getMediaWithObject(mediaId);
  }

  // ============================================================================
  // MEDIA DELETE
  // ============================================================================

  /**
   * Delete media
   */
  async deleteMedia(userId: number, mediaId: string): Promise<void> {
    const media = await this.getMediaById(mediaId);

    if (!media) {
      throw new NotFoundException(`Media ${mediaId} not found`);
    }

    // Verify ownership
    const object = await db.query.kbObjects.findFirst({
      where: eq(kbObjects.id, media.objectId),
    });

    if (!object || object.userId !== userId) {
      throw new ForbiddenException('Access denied to this media');
    }

    // Delete from S3
    try {
      await this.s3Service.deleteFile(media.s3Key);

      // Delete thumbnail if exists
      if (media.thumbnailS3Key) {
        await this.s3Service.deleteFile(media.thumbnailS3Key);
      }
    } catch (error) {
      this.logger.warn(`Failed to delete S3 object: ${error.message}`);
    }

    // Delete from database
    await db.delete(kbObjectMedia).where(eq(kbObjectMedia.id, mediaId));

    // Update object media count
    await db
      .update(kbObjects)
      .set({
        mediaCount: sql`GREATEST(${kbObjects.mediaCount} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(kbObjects.id, media.objectId));

    this.logger.log(`Deleted media ${mediaId}`);
  }

  /**
   * Delete all media for an object, including S3 files and thumbnails.
   * Used when deleting an entire KB object.
   *
   * @param objectId - The ID of the object whose media should be deleted
   * @returns Count of media items deleted
   */
  async deleteAllMediaByObject(objectId: string): Promise<number> {
    // Get all media for this object
    const mediaItems = await db
      .select({
        id: kbObjectMedia.id,
        s3Key: kbObjectMedia.s3Key,
        thumbnailS3Key: kbObjectMedia.thumbnailS3Key,
      })
      .from(kbObjectMedia)
      .where(eq(kbObjectMedia.objectId, objectId));

    if (mediaItems.length === 0) {
      this.logger.debug(`No media found for object ${objectId}`);
      return 0;
    }

    this.logger.log(
      `Deleting ${mediaItems.length} media items for object ${objectId}`,
    );

    // Delete S3 files
    const s3Errors: string[] = [];
    for (const media of mediaItems) {
      try {
        // Delete main file
        await this.s3Service.deleteFile(media.s3Key);

        // Delete thumbnail if exists
        if (media.thumbnailS3Key) {
          await this.s3Service.deleteFile(media.thumbnailS3Key);
        }
      } catch (error) {
        // Log but don't fail - S3 cleanup is best effort
        const errorMsg = `Failed to delete S3 files for media ${media.id}: ${error.message}`;
        s3Errors.push(errorMsg);
        this.logger.warn(errorMsg);
      }
    }

    // Delete all media records from database
    const deleted = await db
      .delete(kbObjectMedia)
      .where(eq(kbObjectMedia.objectId, objectId))
      .returning({ id: kbObjectMedia.id });

    if (s3Errors.length > 0) {
      this.logger.warn(
        `Completed media deletion for object ${objectId} with ${s3Errors.length} S3 errors`,
      );
    } else {
      this.logger.log(
        `Successfully deleted ${deleted.length} media items for object ${objectId}`,
      );
    }

    return deleted.length;
  }

  // ============================================================================
  // AI ELIGIBILITY CHECK
  // ============================================================================

  /**
   * Check if media is eligible for AI sending
   * This is the core validation that enforces all media requirements
   */
  async checkAiEligibility(
    mediaId: string,
    chatId: string,
    chatLanguage?: string,
    checkWindowStatus?: boolean,
  ): Promise<MediaEligibilityResult> {
    const failures: MediaEligibilityFailure[] = [];

    const media = await this.getMediaWithObject(mediaId);

    // Check 1: Caption is required
    if (!media.caption || media.caption.trim().length < 10) {
      failures.push('missing_caption');
    }

    // Check 2: Object must be indexed (not draft/archived/error)
    if (
      !media.objectStatus ||
      !['indexed', 'pending', 'indexing'].includes(media.objectStatus)
    ) {
      if (media.objectStatus === 'archived') {
        failures.push('object_archived');
      } else {
        failures.push('object_not_indexed');
      }
    }

    // Check 3: MIME type must be WhatsApp-supported
    if (!isWhatsAppSupportedMimeType(media.mimeType)) {
      failures.push('invalid_media_type');
    }

    // Check 4: Content extraction should be complete (for documents)
    if (media.mimeType.includes('pdf') || media.mimeType.includes('document')) {
      if (media.extractionStatus === 'pending') {
        failures.push('extraction_pending');
      }
    }

    // Check 5: Language match (if language is specified in request)
    if (chatLanguage) {
      const mediaLanguage = this.inferMediaLanguage(
        media.fileName,
        media.caption,
      );

      if (!this.languagesMatch(mediaLanguage, chatLanguage)) {
        this.logger.warn(
          `[Language Filter] Media ${mediaId} (${media.fileName}) language (${mediaLanguage}) doesn't match chat language (${chatLanguage})`,
        );
        failures.push('language_mismatch');
      }
    }

    // Check 6: Check if already sent in this chat
    // This requires querying the media_decision_audit table or messages

    // Build result
    const isEligible = failures.length === 0;

    return {
      isEligible,
      failureReasons: failures,
      explanation: isEligible
        ? 'Media is eligible for AI sending'
        : `Media not eligible: ${failures.join(', ')}`,
      confidenceScore: isEligible ? 1 : 0,
    };
  }

  /**
   * Get presigned URL for media download
   *
   * If the media has been compressed and the compressed file exists,
   * returns URL for the compressed version. Otherwise returns original.
   */
  async getPresignedDownloadUrl(
    userId: number,
    mediaId: string,
  ): Promise<{ url: string; expiresAt: string; isCompressed: boolean }> {
    const media = await this.getMediaWithObject(mediaId);

    // Verify ownership
    const object = await db.query.kbObjects.findFirst({
      where: eq(kbObjects.id, media.objectId),
    });

    if (!object || object.userId !== userId) {
      throw new ForbiddenException('Access denied to this media');
    }

    // Prefer compressed file if available
    const s3Key = this.getPreferredS3Key(media);
    const isCompressed = s3Key !== media.s3Key && !!media.compressedS3Key;

    const presignedResult =
      await this.s3Service.generatePresignedDownloadUrl(s3Key);

    return {
      url: presignedResult.url,
      expiresAt: new Date(
        Date.now() + presignedResult.expiresIn * 1000,
      ).toISOString(),
      isCompressed,
    };
  }

  /**
   * Get the preferred S3 key for a media item.
   * Returns compressed key if available and compression completed,
   * otherwise returns the original key.
   */
  private getPreferredS3Key(media: MediaWithObject): string {
    // Use compressed file if compression completed and compressed key exists
    if (media.compressionStatus === 'completed' && media.compressedS3Key) {
      return media.compressedS3Key;
    }

    return media.s3Key;
  }

  // ============================================================================
  // PROXY UPLOAD (CORS-FREE)
  // ============================================================================

  /**
   * Upload media directly through the backend (bypasses S3 CORS issues)
   *
   * This method handles the complete upload flow:
   * 1. Validates object ownership and metadata
   * 2. Uploads file buffer directly to S3
   * 3. Creates media record in database
   * 4. Returns the created media
   *
   * Use this when presigned URL uploads fail due to CORS.
   */
  async proxyUpload(
    userId: number,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
    dto: {
      objectId: string;
      fieldId?: string;
      mediaRole: string;
      caption: string;
      altText?: string;
      aiEnabled: boolean;
      allowedLanguages?: string[];
      width?: number;
      height?: number;
      duration?: number;
    },
  ): Promise<MediaWithObject> {
    // Validate the object exists and belongs to user
    const object = await db.query.kbObjects.findFirst({
      where: eq(kbObjects.id, dto.objectId),
    });

    if (!object) {
      throw new NotFoundException(`Object ${dto.objectId} not found`);
    }

    if (object.userId !== userId) {
      throw new ForbiddenException('Access denied to this object');
    }

    // Validate media count limit before allowing upload
    await this.validateMediaLimit(dto.objectId);

    // Validate field if specified
    if (dto.fieldId) {
      const field = await db.query.kbTemplateFields.findFirst({
        where: and(
          eq(kbTemplateFields.id, dto.fieldId),
          eq(kbTemplateFields.templateId, object.templateId),
        ),
      });

      if (!field) {
        throw new NotFoundException(
          `Field ${dto.fieldId} not found in template`,
        );
      }

      if (field.fieldType !== 'media' && field.fieldType !== 'file') {
        throw new BadRequestException(
          `Field ${dto.fieldId} is not a media or file field`,
        );
      }
    }

    // Validate MIME type against role
    if (!isValidMimeTypeForRole(dto.mediaRole as MediaRole, file.mimetype)) {
      const roleMetadata = getMediaRoleMetadata(dto.mediaRole as MediaRole);
      throw new BadRequestException(
        `MIME type ${file.mimetype} is not allowed for role ${dto.mediaRole}. ` +
          `Allowed types: ${roleMetadata?.allowedMimeTypes.join(', ')}`,
      );
    }

    // Validate caption is meaningful (required for AI)
    if (!dto.caption || dto.caption.trim().length < 10) {
      throw new BadRequestException(
        'Caption must be at least 10 characters to describe the media purpose',
      );
    }

    // Validate against WhatsApp media limits (for proxyUpload)
    // This ensures uploaded media can actually be sent via WhatsApp
    const whatsAppValidation = validateWhatsAppMedia(
      file.mimetype,
      file.size,
      file.originalname,
    );

    if (!whatsAppValidation.isValid) {
      this.logger.warn(
        `[KB Media] WhatsApp validation failed for ${file.originalname}: ${whatsAppValidation.errors.join('; ')}`,
      );
      throw new BadRequestException(
        `Media cannot be used with WhatsApp: ${whatsAppValidation.errors.join(' ')}`,
      );
    }

    // Log warnings if file is close to limits
    if (whatsAppValidation.warnings.length > 0) {
      this.logger.warn(
        `[KB Media] WhatsApp warnings for ${file.originalname}: ${whatsAppValidation.warnings.join('; ')}`,
      );
    }

    // Generate S3 path
    const s3Path = this.storageService.generateObjectMediaPath(
      userId,
      dto.objectId,
      file.mimetype,
      file.originalname,
    );

    // Normalize image (if applicable) and upload to S3
    let uploadResult: {
      buffer: Buffer;
      mimeType: string;
      fileSize: number;
      wasProcessed: boolean;
    };

    try {
      uploadResult = await this.normalizeAndUploadToS3(
        file.buffer,
        file.mimetype,
        s3Path.key,
      );
    } catch (error) {
      this.logger.error(`Failed to upload to S3: ${error.message}`, error);
      throw new BadRequestException(`Failed to upload file: ${error.message}`);
    }

    // Build AI permission JSON
    const aiPermission: MediaAiPermission = {
      aiEnabled: dto.aiEnabled,
      aiPermissionSetBy: userId,
      aiPermissionSetAt: new Date().toISOString(),
      allowedLanguages: dto.allowedLanguages || [],
    };

    // Create media record with normalized file info
    const mediaId = uuidv4();
    const mediaRecord: NewKbObjectMedia = {
      id: mediaId,
      objectId: dto.objectId,
      fieldId: dto.fieldId || null,
      fileName: s3Path.key.split('/').pop()!,
      originalFileName: file.originalname,
      mimeType: uploadResult.mimeType, // Use normalized mime type
      fileSize: uploadResult.fileSize, // Use normalized file size
      s3Bucket: s3Path.bucket,
      s3Key: s3Path.key,
      mediaType: dto.mediaRole,
      altText: dto.altText || null,
      caption: dto.caption,
      sortOrder: 0,
      width: dto.width || null,
      height: dto.height || null,
      duration: dto.duration || null,
      extractionStatus: 'pending',
    };

    await db.insert(kbObjectMedia).values(mediaRecord);

    // Update object media count
    await db
      .update(kbObjects)
      .set({
        mediaCount: sql`${kbObjects.mediaCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(kbObjects.id, dto.objectId));

    this.logger.log(
      `Proxy upload completed for media ${mediaId} to object ${dto.objectId}` +
        (uploadResult.wasProcessed
          ? ' (image was normalized for WhatsApp)'
          : ''),
    );

    // Generate thumbnail synchronously so it's included in response
    await this.generateThumbnailSync(
      mediaId,
      s3Path.key,
      uploadResult.mimeType,
    );

    // Queue video compression if needed (async - doesn't block response)
    await this.queueVideoCompressionIfNeeded(
      mediaId,
      s3Path.key,
      s3Path.bucket,
      uploadResult.fileSize,
      uploadResult.mimeType,
      file.originalname,
      userId,
      dto.objectId,
    );

    return this.getMediaWithObject(mediaId);
  }

  /**
   * Infer language from media filename or caption
   * Looks for language codes in filename patterns like "-spa-", "-eng-", "-pt-", etc.
   */
  private inferMediaLanguage(
    fileName: string,
    caption: string | null,
  ): string | null {
    // Language code patterns in filenames
    const languagePatterns: Record<string, string[]> = {
      es: ['spa', '-es-', '-es_'],
      en: ['eng', '-en-', '-en_'],
      pt: ['pt', '-pt-', '-pt_', 'português', 'portugues'],
      fr: ['fr', '-fr-', '-fr_', 'français', 'francais'],
      de: ['de', '-de-', '-de_', 'deutsch'],
      it: ['it', '-it-', '-it_', 'italiano'],
      ja: ['jp', 'ja', '-jp-', '-ja-'],
      zh: ['cn', 'zh', '-cn-', '-zh-', 'chinese'],
      ru: ['ru', '-ru-', '-ru_', 'russian'],
      ar: ['ar', '-ar-', '-ar_', 'arabic'],
    };

    // Check filename first (case-insensitive)
    const lowerFileName = fileName.toLowerCase();
    for (const [lang, patterns] of Object.entries(languagePatterns)) {
      for (const pattern of patterns) {
        if (lowerFileName.includes(pattern)) {
          return lang;
        }
      }
    }

    // Check caption if available
    if (caption) {
      const lowerCaption = caption.toLowerCase();
      for (const [lang, patterns] of Object.entries(languagePatterns)) {
        for (const pattern of patterns) {
          if (lowerCaption.includes(pattern)) {
            return lang;
          }
        }
      }
    }

    return null;
  }

  /**
   * Normalize language codes for comparison
   */
  private normalizeLanguageCode(language: string | undefined): string | null {
    if (!language) return null;
    const normalized = language.substring(0, 2).toLowerCase();
    return normalized === '??' ? null : normalized;
  }

  /**
   * Check if two language codes are compatible
   */
  private languagesMatch(
    mediaLanguage: string | null,
    chatLanguage: string | null,
  ): boolean {
    if (!mediaLanguage || !chatLanguage) {
      return true; // Allow if either is unknown
    }

    const normalizedMedia = this.normalizeLanguageCode(mediaLanguage);
    const normalizedChat = this.normalizeLanguageCode(chatLanguage);

    if (!normalizedMedia || !normalizedChat) {
      return true; // Allow if normalization failed
    }

    return normalizedMedia === normalizedChat;
  }
}
