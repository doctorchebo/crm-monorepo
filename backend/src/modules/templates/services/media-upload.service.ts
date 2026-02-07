import { db } from '@database/db.connection';
import { templateMedia } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
 * Result of media upload to Meta
 */
export interface MediaUploadResult {
  success: boolean;
  assetHandle?: string;
  mediaId?: string;
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
 * Service for handling media uploads to Meta's Resumable Upload API
 * @see https://developers.facebook.com/docs/graph-api/guides/upload
 */
@Injectable()
export class MediaUploadService {
  private readonly logger = new Logger(MediaUploadService.name);
  private readonly apiVersion = 'v21.0';
  private readonly baseUrl = 'https://graph.facebook.com';

  constructor(private readonly configService: ConfigService) {}

  /**
   * Upload a media file to Meta and get an asset handle
   * Uses the Resumable Upload API for reliable uploads
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
          uploadStatus: 'uploading',
        })
        .returning();

      try {
        // Start upload session
        const session = await this.createUploadSession(
          file.fileSize,
          file.mimeType,
        );

        // Upload file data
        const assetHandle = await this.uploadFileData(
          session.uploadSessionId,
          file.buffer,
        );

        // Calculate expiration (30 days from now)
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        // Update record with success
        await db
          .update(templateMedia)
          .set({
            assetHandle,
            assetHandleExpiresAt: expiresAt,
            uploadStatus: 'completed',
            updatedAt: new Date(),
          })
          .where(eq(templateMedia.id, mediaRecord.id));

        this.logger.log(
          `Media uploaded successfully: ${file.filename} -> ${assetHandle}`,
        );

        return { success: true, assetHandle, mediaId: mediaRecord.id };
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

        throw error;
      }
    } catch (error) {
      this.logger.error(`Media upload failed: ${error.message}`);
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
