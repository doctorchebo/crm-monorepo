import { db } from '@database/db.connection';
import { templateMedia } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageProcessingService } from '@shared/services/image-processing.service';
import { S3Service } from '@shared/services/s3.service';
import * as crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { TEMPLATE_LIMITS } from '../types';

/**
 * Upload session for resumable uploads
 */
export interface UploadSession {
  uploadSessionId: string;
  fileOffset: number;
}

/**
 * Result of media upload to Meta and S3
 */
export interface MediaUploadResult {
  success: boolean;
  assetHandle?: string;
  mediaId?: string;
  /** Public URL for displaying the media (from S3) */
  url?: string;
  /** S3 key for the uploaded file */
  s3Key?: string;
  error?: string;
}

/**
 * Media file information
 */
export interface MediaFileInfo {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  fileSize: number;
}

/**
 * Service for handling media uploads to Meta's Resumable Upload API and S3
 *
 * This service handles dual-upload:
 * 1. Upload to Meta's Resumable Upload API for template submission
 * 2. Upload to S3 for persistent storage and display in edit mode
 *
 * @see https://developers.facebook.com/docs/graph-api/guides/upload
 */
@Injectable()
export class MediaUploadService {
  private readonly logger = new Logger(MediaUploadService.name);
  private readonly apiVersion = 'v21.0';
  private readonly baseUrl = 'https://graph.facebook.com';

  constructor(
    private readonly configService: ConfigService,
    private readonly s3Service: S3Service,
    private readonly imageProcessingService: ImageProcessingService,
  ) {}

  /**
   * Generate S3 key for template media thumbnail
   * Path: templates/media/{localeId}/{componentType}/{uniqueFilename}_thumb.jpg
   *
   * Always uses .jpg extension since thumbnails are always JPEG
   */
  private generateS3Key(
    localeId: string,
    componentType: string,
    filename: string,
  ): string {
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    // Extract base filename without extension
    const baseName = filename.includes('.')
      ? filename.substring(0, filename.lastIndexOf('.'))
      : filename;
    const sanitizedFilename = baseName.replace(/[^a-zA-Z0-9.-]/g, '_');
    // Thumbnails are always JPEG
    const thumbnailFilename = `${timestamp}-${randomSuffix}-${sanitizedFilename}_thumb.jpg`;

    return `templates/media/${localeId}/${componentType}/${thumbnailFilename}`;
  }

  /**
   * Generate presigned URL for viewing an S3 object
   * Uses presigned URLs instead of direct public URLs for security
   *
   * @param s3Key - The S3 key of the object
   * @param expiresIn - URL expiration in seconds (default: 7 days)
   */
  private async getViewableUrl(
    s3Key: string,
    expiresIn: number = 7 * 24 * 60 * 60,
  ): Promise<string> {
    const result = await this.s3Service.generatePresignedDownloadUrl(s3Key, {
      expiresIn,
    });
    return result.url;
  }

  /**
   * Upload a media file to Meta and S3
   *
   * This method performs dual-upload:
   * 1. Uploads ORIGINAL to Meta's Resumable Upload API for template submission (assetHandle)
   * 2. Uploads THUMBNAIL to S3 for persistent storage and display in edit mode (cdnUrl)
   *
   * The original file is stored on Meta's servers, so we only store a compressed
   * thumbnail in S3 for UI display purposes, saving storage costs.
   *
   * Uses the Resumable Upload API for reliable uploads to Meta
   */
  async uploadMedia(
    localeId: string,
    componentType: string,
    file: MediaFileInfo,
  ): Promise<MediaUploadResult> {
    try {
      // Validate file type and size
      const validation = this.validateFile(file);
      if (!validation.isValid) {
        return { success: false, error: validation.error };
      }

      // Generate S3 key for persistent storage (thumbnail)
      const s3Key = this.generateS3Key(localeId, componentType, file.filename);

      // Prepare thumbnail for S3 (compressed version for UI display)
      // Only generate thumbnails for images, other media types are stored as-is
      let thumbnailBuffer: Buffer;
      let thumbnailMimeType: string;
      let thumbnailSize: number;

      if (file.mimeType.startsWith('image/')) {
        const thumbnail = await this.imageProcessingService.generateThumbnail(
          file.buffer,
          { maxWidth: 400, maxHeight: 400, quality: 80 },
        );
        thumbnailBuffer = thumbnail.buffer;
        thumbnailMimeType = thumbnail.mimeType;
        thumbnailSize = thumbnail.thumbnailSize;

        this.logger.log(
          `Thumbnail generated: ${file.filename} (${file.fileSize} bytes -> ${thumbnailSize} bytes, ${Math.round((1 - thumbnailSize / file.fileSize) * 100)}% reduction)`,
        );
      } else {
        // For non-image media (video, document), store as-is
        thumbnailBuffer = file.buffer;
        thumbnailMimeType = file.mimeType;
        thumbnailSize = file.fileSize;
      }

      // Create tracking record
      const [mediaRecord] = await db
        .insert(templateMedia)
        .values({
          localeId,
          componentType,
          mediaType: this.getMediaType(file.mimeType),
          originalFilename: file.filename,
          fileSizeBytes: file.fileSize,
          mimeType: file.mimeType,
          s3Key,
          uploadStatus: 'uploading',
        })
        .returning();

      try {
        // Upload THUMBNAIL to S3 for persistent storage and display
        await this.s3Service.uploadFile(
          s3Key,
          thumbnailBuffer,
          thumbnailMimeType,
        );
        const cdnUrl = await this.getViewableUrl(s3Key);

        this.logger.log(
          `Thumbnail uploaded to S3: ${file.filename} -> ${s3Key}`,
        );

        // Start Meta upload session with ORIGINAL file
        const session = await this.createUploadSession(
          file.fileSize,
          file.mimeType,
        );

        // Upload ORIGINAL file data to Meta
        const assetHandle = await this.uploadFileData(
          session.uploadSessionId,
          file.buffer,
        );

        // Calculate Meta asset handle expiration (30 days from now)
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        // Update record with success - include both Meta asset handle and S3 URL
        await db
          .update(templateMedia)
          .set({
            assetHandle,
            assetHandleExpiresAt: expiresAt,
            cdnUrl,
            uploadStatus: 'completed',
            updatedAt: new Date(),
          })
          .where(eq(templateMedia.id, mediaRecord.id));

        this.logger.log(
          `Media uploaded successfully: ${file.filename} -> Meta: ${assetHandle}, S3: ${cdnUrl}`,
        );

        return {
          success: true,
          assetHandle,
          mediaId: mediaRecord.id,
          url: cdnUrl,
          s3Key,
        };
      } catch (error) {
        // Update record with failure
        await db
          .update(templateMedia)
          .set({
            uploadStatus: 'failed',
            errorMessage: error.message,
            updatedAt: new Date(),
          })
          .where(eq(templateMedia.id, mediaRecord.id));

        // Try to clean up S3 on failure
        try {
          await this.s3Service.deleteFile(s3Key);
        } catch (cleanupError) {
          this.logger.warn(
            `Failed to clean up S3 file after error: ${cleanupError.message}`,
          );
        }

        throw error;
      }
    } catch (error) {
      this.logger.error(`Media upload failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Upload media directly to Meta and S3 without storing in database
   * Used for temporary uploads before template/locale is created
   *
   * Returns the asset handle for Meta API and a URL for display.
   * The S3 file uses a temporary path and should be moved/deleted later.
   *
   * Uploads ORIGINAL to Meta, THUMBNAIL to S3
   */
  async uploadMediaTemporary(file: MediaFileInfo): Promise<MediaUploadResult> {
    // Generate a temporary S3 key (will be moved when template is saved)
    const tempId = crypto.randomBytes(8).toString('hex');
    const s3Key = this.generateS3Key('temp', tempId, file.filename);

    try {
      // Validate file type and size
      const validation = this.validateFile(file);
      if (!validation.isValid) {
        return { success: false, error: validation.error };
      }

      // Prepare thumbnail for S3 (compressed version for UI display)
      // Only generate thumbnails for images, other media types are stored as-is
      let thumbnailBuffer: Buffer;
      let thumbnailMimeType: string;
      let thumbnailSize: number;

      if (file.mimeType.startsWith('image/')) {
        const thumbnail = await this.imageProcessingService.generateThumbnail(
          file.buffer,
          { maxWidth: 400, maxHeight: 400, quality: 80 },
        );
        thumbnailBuffer = thumbnail.buffer;
        thumbnailMimeType = thumbnail.mimeType;
        thumbnailSize = thumbnail.thumbnailSize;

        this.logger.log(
          `Thumbnail generated for temp upload: ${file.filename} (${file.fileSize} bytes -> ${thumbnailSize} bytes, ${Math.round((1 - thumbnailSize / file.fileSize) * 100)}% reduction)`,
        );
      } else {
        // For non-image media (video, document), store as-is
        thumbnailBuffer = file.buffer;
        thumbnailMimeType = file.mimeType;
        thumbnailSize = file.fileSize;
      }

      // Upload THUMBNAIL to S3 first for immediate display
      await this.s3Service.uploadFile(
        s3Key,
        thumbnailBuffer,
        thumbnailMimeType,
      );
      const cdnUrl = await this.getViewableUrl(s3Key);

      this.logger.log(
        `Temporary thumbnail uploaded to S3: ${file.filename} -> ${s3Key}`,
      );

      // Start Meta upload session with ORIGINAL file
      const session = await this.createUploadSession(
        file.fileSize,
        file.mimeType,
      );

      // Upload ORIGINAL file data to Meta
      const assetHandle = await this.uploadFileData(
        session.uploadSessionId,
        file.buffer,
      );

      this.logger.log(
        `Temporary media uploaded successfully: ${file.filename} -> Meta: ${assetHandle}, S3 (thumbnail): ${cdnUrl}`,
      );

      return {
        success: true,
        assetHandle,
        url: cdnUrl,
        s3Key,
      };
    } catch (error) {
      // Try to clean up S3 on failure
      try {
        await this.s3Service.deleteFile(s3Key);
      } catch (cleanupError) {
        this.logger.warn(
          `Failed to clean up temporary S3 file after error: ${cleanupError.message}`,
        );
      }

      this.logger.error(`Temporary media upload failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get asset handle for a locale's media component
   * Checks if handle is still valid
   */
  async getAssetHandle(
    localeId: string,
    componentType: string,
  ): Promise<string | null> {
    const media = await db.query.templateMedia.findFirst({
      where: and(
        eq(templateMedia.localeId, localeId),
        eq(templateMedia.componentType, componentType),
        eq(templateMedia.uploadStatus, 'completed'),
      ),
      orderBy: (tm, { desc }) => [desc(tm.createdAt)],
    });

    if (!media) {
      return null;
    }

    // Check if handle is expired
    if (
      media.assetHandleExpiresAt &&
      new Date(media.assetHandleExpiresAt) < new Date()
    ) {
      this.logger.warn(`Asset handle expired for ${localeId}/${componentType}`);
      return null;
    }

    return media.assetHandle;
  }

  /**
   * Check if asset handle is still valid (not expired)
   */
  async isAssetHandleValid(
    localeId: string,
    componentType: string,
  ): Promise<boolean> {
    const handle = await this.getAssetHandle(localeId, componentType);
    return handle !== null;
  }

  /**
   * Get all media for a locale
   */
  async getMediaForLocale(localeId: string) {
    return db.query.templateMedia.findMany({
      where: eq(templateMedia.localeId, localeId),
      orderBy: (tm, { asc }) => [asc(tm.componentType)],
    });
  }

  /**
   * Delete media record
   */
  async deleteMedia(mediaId: string): Promise<void> {
    await db.delete(templateMedia).where(eq(templateMedia.id, mediaId));
  }

  /**
   * Create an upload session with Meta
   */
  private async createUploadSession(
    fileSize: number,
    mimeType: string,
  ): Promise<UploadSession> {
    const accessToken = this.getAccessToken();
    const appId = this.configService.get('META_APP_ID');

    if (!appId) {
      throw new Error('META_APP_ID is not configured');
    }

    const url = `${this.baseUrl}/${this.apiVersion}/${appId}/uploads`;

    this.logger.debug(
      `Creating upload session for ${fileSize} bytes, type: ${mimeType}`,
    );

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file_length: fileSize,
        file_type: mimeType,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      this.logger.error(
        `Failed to create upload session: ${JSON.stringify(data)}`,
      );
      throw new Error(data.error?.message || 'Failed to create upload session');
    }

    return {
      uploadSessionId: data.id,
      fileOffset: 0,
    };
  }

  /**
   * Upload file data to the session
   */
  private async uploadFileData(
    sessionId: string,
    buffer: Buffer,
  ): Promise<string> {
    const accessToken = this.getAccessToken();

    const url = `${this.baseUrl}/${this.apiVersion}/${sessionId}`;

    this.logger.debug(
      `Uploading ${buffer.length} bytes to session ${sessionId}`,
    );

    // Get ArrayBuffer from Buffer for fetch body compatibility
    // Buffer shares memory with its underlying ArrayBuffer, so we slice to get a clean copy
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${accessToken}`,
        file_offset: '0',
        'Content-Type': 'application/octet-stream',
      },
      // Cast to unknown first to work around strict TypeScript typings
      body: arrayBuffer as unknown as BodyInit,
    });

    const data = await response.json();

    if (!response.ok) {
      this.logger.error(`Failed to upload file data: ${JSON.stringify(data)}`);
      throw new Error(data.error?.message || 'Failed to upload file data');
    }

    // 'h' is the asset handle
    return data.h;
  }

  /**
   * Validate file type and size
   */
  private validateFile(file: MediaFileInfo): {
    isValid: boolean;
    error?: string;
  } {
    const { mimeType, fileSize } = file;

    // Check mime type
    const isImage = (
      TEMPLATE_LIMITS.SUPPORTED_IMAGE_TYPES as readonly string[]
    ).includes(mimeType);
    const isVideo = (
      TEMPLATE_LIMITS.SUPPORTED_VIDEO_TYPES as readonly string[]
    ).includes(mimeType);
    const isDocument = (
      TEMPLATE_LIMITS.SUPPORTED_DOCUMENT_TYPES as readonly string[]
    ).includes(mimeType);

    if (!isImage && !isVideo && !isDocument) {
      return {
        isValid: false,
        error: `Unsupported file type: ${mimeType}. Supported: JPEG, PNG, WebP (images), MP4, 3GP (video), PDF (documents)`,
      };
    }

    // Check file size
    const maxSizeMb = isImage
      ? TEMPLATE_LIMITS.IMAGE_MAX_SIZE_MB
      : isVideo
        ? TEMPLATE_LIMITS.VIDEO_MAX_SIZE_MB
        : TEMPLATE_LIMITS.DOCUMENT_MAX_SIZE_MB;

    const maxSizeBytes = maxSizeMb * 1024 * 1024;

    if (fileSize > maxSizeBytes) {
      return {
        isValid: false,
        error: `File too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB. Maximum: ${maxSizeMb}MB`,
      };
    }

    return { isValid: true };
  }

  /**
   * Get media type from mime type
   */
  private getMediaType(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType === 'application/pdf') return 'document';
    return 'unknown';
  }

  /**
   * Get the Meta API access token
   */
  private getAccessToken(): string {
    const token = this.configService.get('META_ACCESS_TOKEN');
    if (!token) {
      throw new Error('META_ACCESS_TOKEN is not configured');
    }
    return token;
  }
}
