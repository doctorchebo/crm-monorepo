import { db } from '@database/db.connection';
import { templateMedia } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageProcessingService } from '@shared/services/image-processing.service';
import { LambdaThumbnailService } from '@shared/services/lambda-thumbnail.service';
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
  /** Temp ID for matching WebSocket thumbnail events (temp uploads only) */
  tempId?: string;
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
    private readonly lambdaThumbnailService: LambdaThumbnailService,
  ) {}

  /**
   * Generate S3 key for template media (original file)
   * Path: templates/media/{localeId}/{componentType}/{uniqueFilename}.{ext}
   *
   * Preserves the original file extension
   */
  private generateOriginalS3Key(
    localeId: string,
    componentType: string,
    filename: string,
    mimeType: string,
  ): string {
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    // Extract base filename and extension
    const lastDotIndex = filename.lastIndexOf('.');
    const baseName =
      lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename;
    const extension =
      lastDotIndex > 0
        ? filename.substring(lastDotIndex)
        : this.getExtensionFromMimeType(mimeType);
    const sanitizedFilename = baseName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const finalFilename = `${timestamp}-${randomSuffix}-${sanitizedFilename}${extension}`;

    return `templates/media/${localeId}/${componentType}/${finalFilename}`;
  }

  /**
   * Generate S3 key for template media thumbnail
   * Path: templates/media/{localeId}/{componentType}/{uniqueFilename}_thumb.jpg
   *
   * Thumbnails are always JPEG for consistency
   */
  private generateThumbnailS3Key(
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
   * Get file extension from MIME type
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'video/3gpp': '.3gp',
      'application/pdf': '.pdf',
    };
    return mimeToExt[mimeType] || '';
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
   * 2. Handles S3 storage based on media type:
   *    - Images: Generates thumbnail locally with Sharp, stores only thumbnail
   *    - Videos/Documents: Stores original file, queues Lambda for async thumbnail generation
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

      const isImage = file.mimeType.startsWith('image/');
      const isVideo = file.mimeType.startsWith('video/');
      const isDocument = file.mimeType === 'application/pdf';

      // ── S3 storage strategy ──────────────────────────────────────────
      // For ALL media types we store the original file permanently in S3
      // because Meta downloads it from the URL each time a template
      // message is sent. Additionally we store a thumbnail for UI
      // preview (generated locally for images, async-via-Lambda for
      // videos/documents).
      //
      //   originalS3Key → original file (permanent, used at send time)
      //   s3Key          → thumbnail    (used for UI preview)
      //
      // For images the thumbnail is generated locally with Sharp.
      // For videos/documents Lambda generates it asynchronously.

      const originalS3Key = this.generateOriginalS3Key(
        localeId,
        componentType,
        file.filename,
        file.mimeType,
      );

      let s3Key: string; // will point to thumbnail
      let thumbnailS3Key: string | undefined;

      if (isImage) {
        // Generate thumbnail locally for images
        const thumbnail = await this.imageProcessingService.generateThumbnail(
          file.buffer,
          { maxWidth: 400, maxHeight: 400, quality: 80 },
        );

        s3Key = this.generateThumbnailS3Key(
          localeId,
          componentType,
          file.filename,
        );

        // Upload ORIGINAL image to S3 (permanent)
        await this.s3Service.uploadFile(
          originalS3Key,
          file.buffer,
          file.mimeType,
        );

        // Upload thumbnail to S3
        await this.s3Service.uploadFile(
          s3Key,
          thumbnail.buffer,
          thumbnail.mimeType,
        );

        this.logger.log(
          `Image uploaded: original -> ${originalS3Key}, ` +
            `thumbnail -> ${s3Key} ` +
            `(${file.fileSize} -> ${thumbnail.thumbnailSize} bytes, ` +
            `${Math.round((1 - thumbnail.thumbnailSize / file.fileSize) * 100)}% reduction)`,
        );
      } else {
        // For videos/documents: store original, queue Lambda for thumbnail
        s3Key = originalS3Key; // will be overwritten to thumbnail by Lambda callback
        thumbnailS3Key =
          this.lambdaThumbnailService.generateThumbnailKey(originalS3Key);

        this.logger.log(
          `Storing original ${isVideo ? 'video' : 'document'}: ${file.filename} (${file.fileSize} bytes)`,
        );
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
          originalS3Key,
          uploadStatus: isImage ? 'uploading' : 'uploading',
        })
        .returning();

      try {
        // Upload to S3 (for videos/documents only — images already uploaded above)
        if (!isImage) {
          await this.s3Service.uploadFile(s3Key, file.buffer, file.mimeType);
        }
        const cdnUrl = await this.getViewableUrl(s3Key);

        this.logger.log(
          `${isImage ? 'Image' : 'Original'} uploaded to S3: ${file.filename} -> ${s3Key}`,
        );

        // Queue Lambda thumbnail job for videos/documents
        if ((isVideo || isDocument) && thumbnailS3Key) {
          await this.queueTemplateThumbnailJob({
            localeId,
            mediaRecordId: mediaRecord.id,
            s3Key: originalS3Key,
            thumbnailS3Key,
            mimeType: file.mimeType,
          });
        }

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

        // Update record with success
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
   * Queue a Lambda thumbnail job for template media (videos/documents)
   */
  private async queueTemplateThumbnailJob(params: {
    localeId: string;
    mediaRecordId: string;
    s3Key: string;
    thumbnailS3Key: string;
    mimeType: string;
  }): Promise<void> {
    if (!this.lambdaThumbnailService.isLambdaThumbnailEnabled()) {
      this.logger.warn(
        `Lambda thumbnails disabled - no thumbnail will be generated for ${params.s3Key}`,
      );
      return;
    }

    try {
      const jobId =
        await this.lambdaThumbnailService.queueTemplateMediaThumbnail({
          mediaId: params.mediaRecordId,
          localeId: params.localeId,
          s3Key: params.s3Key,
          thumbnailS3Key: params.thumbnailS3Key,
          mimeType: params.mimeType,
        });

      if (jobId) {
        this.logger.log(
          `Queued Lambda thumbnail job ${jobId} for template media: ${params.s3Key}`,
        );
      }
    } catch (error) {
      // Don't fail the upload if thumbnail queuing fails - it's not critical
      this.logger.warn(
        `Failed to queue thumbnail job for ${params.s3Key}: ${error.message}`,
      );
    }
  }

  /**
   * Upload media directly to Meta and S3 without storing in database
   * Used for temporary uploads before template/locale is created
   *
   * Returns the asset handle for Meta API and a URL for display.
   * The S3 file uses a temporary path and should be moved/deleted later.
   *
   * Handles media types:
   * - Images: Generates thumbnail locally with Sharp, stores only thumbnail
   * - Videos/Documents: Stores original file, queues Lambda for async thumbnail
   */
  async uploadMediaTemporary(file: MediaFileInfo): Promise<MediaUploadResult> {
    const tempId = crypto.randomBytes(8).toString('hex');

    try {
      // Validate file type and size
      const validation = this.validateFile(file);
      if (!validation.isValid) {
        return { success: false, error: validation.error };
      }

      const isImage = file.mimeType.startsWith('image/');
      const isVideo = file.mimeType.startsWith('video/');
      const isDocument = file.mimeType === 'application/pdf';

      // Determine S3 storage strategy based on media type
      let s3Key: string;
      let s3Buffer: Buffer;
      let s3MimeType: string;
      let thumbnailS3Key: string | undefined;

      if (isImage) {
        // For images: generate thumbnail locally and store only the thumbnail
        const thumbnail = await this.imageProcessingService.generateThumbnail(
          file.buffer,
          { maxWidth: 400, maxHeight: 400, quality: 80 },
        );

        s3Key = this.generateThumbnailS3Key('temp', tempId, file.filename);
        s3Buffer = thumbnail.buffer;
        s3MimeType = thumbnail.mimeType;

        this.logger.log(
          `Thumbnail generated for temp upload: ${file.filename} ` +
            `(${file.fileSize} bytes -> ${thumbnail.thumbnailSize} bytes, ` +
            `${Math.round((1 - thumbnail.thumbnailSize / file.fileSize) * 100)}% reduction)`,
        );
      } else {
        // For videos/documents: store original file, queue Lambda for thumbnail
        s3Key = this.generateOriginalS3Key(
          'temp',
          tempId,
          file.filename,
          file.mimeType,
        );
        s3Buffer = file.buffer;
        s3MimeType = file.mimeType;
        thumbnailS3Key =
          this.lambdaThumbnailService.generateThumbnailKey(s3Key);

        this.logger.log(
          `Storing original ${isVideo ? 'video' : 'document'} for temp upload: ` +
            `${file.filename} (${file.fileSize} bytes)`,
        );
      }

      // Upload to S3
      await this.s3Service.uploadFile(s3Key, s3Buffer, s3MimeType);

      // For videos/documents, queue Lambda thumbnail job (async)
      // The original file will be deleted after thumbnail is ready
      // We return the thumbnail URL path to the frontend - Lambda will create it
      let displayUrl: string;

      if ((isVideo || isDocument) && thumbnailS3Key) {
        // Queue Lambda to generate thumbnail (fire and forget)
        // Lambda will create the thumbnail and delete the original
        this.queueTempThumbnailJob(
          s3Key,
          thumbnailS3Key,
          file.mimeType,
          tempId,
        );

        // Return the original URL for now - the file exists immediately
        // In future: could return thumbnail URL and have frontend retry
        displayUrl = await this.getViewableUrl(s3Key);

        this.logger.log(
          `Temporary original uploaded to S3: ${file.filename} -> ${s3Key}`,
        );
      } else {
        displayUrl = await this.getViewableUrl(s3Key);
        this.logger.log(
          `Temporary thumbnail uploaded to S3: ${file.filename} -> ${s3Key}`,
        );
      }

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
        `Temporary media uploaded successfully: ${file.filename} -> ` +
          `Meta: ${assetHandle}, S3: ${displayUrl}`,
      );

      // Return tempId for videos/documents so frontend can match WebSocket thumbnail events
      const returnTempId = isVideo || isDocument ? tempId : undefined;

      return {
        success: true,
        assetHandle,
        url: displayUrl,
        s3Key,
        tempId: returnTempId,
      };
    } catch (error) {
      // Try to clean up S3 on failure (we don't know the exact key, but try with temp pattern)
      this.logger.error(`Temporary media upload failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Queue Lambda thumbnail job for temporary uploads (fire-and-forget)
   *
   * For temporary uploads, there's no database record to update.
   * The callback will just delete the original file after the thumbnail is ready.
   * We use a "temp-" prefix on the mediaId to signal this to the callback handler.
   */
  private queueTempThumbnailJob(
    originalS3Key: string,
    thumbnailS3Key: string,
    mimeType: string,
    tempId: string,
  ): void {
    if (!this.lambdaThumbnailService.isLambdaThumbnailEnabled()) {
      this.logger.warn(
        `Lambda thumbnails disabled - no thumbnail for temp file ${originalS3Key}`,
      );
      return;
    }

    // Fire and forget - don't await, don't block the response
    this.lambdaThumbnailService
      .queueTemplateMediaThumbnail({
        mediaId: `temp-${tempId}`, // Prefix indicates no DB record exists
        localeId: 'temp',
        s3Key: originalS3Key,
        thumbnailS3Key,
        mimeType,
      })
      .then((jobId) => {
        if (jobId) {
          this.logger.log(
            `Queued Lambda thumbnail job ${jobId} for temp upload: ${originalS3Key}`,
          );
        }
      })
      .catch((error) => {
        this.logger.warn(
          `Failed to queue thumbnail for temp upload ${originalS3Key}: ${error.message}`,
        );
      });
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
   * Upload file data to the session with retry logic
   *
   * Meta's Resumable Upload API can return transient errors, especially for large files.
   * This method implements exponential backoff retry for retriable errors.
   *
   * @see https://developers.facebook.com/docs/graph-api/guides/upload#uploading
   */
  private async uploadFileData(
    sessionId: string,
    buffer: Buffer,
    maxRetries: number = 3,
  ): Promise<string> {
    const accessToken = this.getAccessToken();
    const url = `${this.baseUrl}/${this.apiVersion}/${sessionId}`;

    // Get ArrayBuffer from Buffer for fetch body compatibility
    // Buffer shares memory with its underlying ArrayBuffer, so we slice to get a clean copy
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: 2s, 4s, 8s
          const delayMs = Math.pow(2, attempt) * 1000;
          this.logger.log(
            `Retry ${attempt}/${maxRetries} for upload to session ${sessionId} after ${delayMs}ms delay`,
          );
          await this.delay(delayMs);
        }

        this.logger.debug(
          `Uploading ${buffer.length} bytes to session ${sessionId} (attempt ${attempt + 1}/${maxRetries + 1})`,
        );

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
          // Check if error is retriable
          const isRetriable =
            data?.debug_info?.retriable === true ||
            data?.error?.is_transient === true ||
            response.status === 503 ||
            response.status === 429 ||
            response.status === 500;

          if (isRetriable && attempt < maxRetries) {
            this.logger.warn(
              `Retriable error on attempt ${attempt + 1}: ${JSON.stringify(data)}`,
            );
            lastError = new Error(
              data.error?.message ||
                data.debug_info?.message ||
                'Transient upload error',
            );
            continue; // Try again
          }

          // Non-retriable or max retries exceeded
          this.logger.error(
            `Failed to upload file data after ${attempt + 1} attempts: ${JSON.stringify(data)}`,
          );
          throw new Error(
            data.error?.message ||
              data.debug_info?.message ||
              'Failed to upload file data',
          );
        }

        // Success - 'h' is the asset handle
        if (attempt > 0) {
          this.logger.log(
            `Upload succeeded on retry ${attempt} for session ${sessionId}`,
          );
        }
        return data.h;
      } catch (error) {
        // Network errors are always retriable
        if (
          error instanceof TypeError &&
          error.message.includes('fetch') &&
          attempt < maxRetries
        ) {
          this.logger.warn(
            `Network error on attempt ${attempt + 1}: ${error.message}`,
          );
          lastError = error;
          continue;
        }

        // For other errors, check if we should retry
        if (attempt < maxRetries && this.isTransientError(error)) {
          lastError = error;
          continue;
        }

        throw error;
      }
    }

    // If we get here, all retries failed
    throw lastError || new Error('Upload failed after all retries');
  }

  /**
   * Check if an error is transient and should be retried
   */
  private isTransientError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('temporary') ||
        message.includes('transient') ||
        message.includes('timeout') ||
        message.includes('econnreset') ||
        message.includes('socket hang up')
      );
    }
    return false;
  }

  /**
   * Delay helper for retry backoff
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
