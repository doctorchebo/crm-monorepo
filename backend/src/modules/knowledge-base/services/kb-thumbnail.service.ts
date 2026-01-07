/**
 * KB Media Thumbnail Service
 *
 * Handles thumbnail generation for Knowledge Base media files.
 * Integrates with the existing ThumbnailProcessorService for actual generation.
 *
 * Features:
 * - Synchronous thumbnail generation (called after upload)
 * - Supports images, videos, and PDFs
 * - Updates KB media records with thumbnail info
 * - Uses KnowledgeBaseStorageService for consistent S3 path structure
 *
 * Thumbnail Storage Path:
 * knowledge-base/{userId}/{category}/{objectId}/{mediaType}/thumbnails/thumb-{filename}
 */

import { db } from '@database/db.connection';
import { kbObjectMedia } from '@database/knowledge-base.schema';
import { ThumbnailProcessorService } from '@modules/thumbnail/thumbnail-processor.service';
import { supportsThumbnail } from '@modules/thumbnail/thumbnail.types';
import { Injectable, Logger } from '@nestjs/common';
import { S3Service } from '@shared/services/s3.service';
import { eq } from 'drizzle-orm';
import { KnowledgeBaseStorageService } from './storage.service';

/**
 * Media type classification for thumbnail generation
 */
export type KbMediaType = 'image' | 'video' | 'audio' | 'document';

/**
 * Result of KB thumbnail generation
 */
export interface KbThumbnailResult {
  success: boolean;
  thumbnailS3Key?: string;
  width?: number;
  height?: number;
  blurhash?: string;
  duration?: number;
  error?: string;
}

/**
 * Thumbnail metadata for KB media
 */
export interface KbThumbnailMetadata {
  thumbnailS3Key: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
}

@Injectable()
export class KbThumbnailService {
  private readonly logger = new Logger(KbThumbnailService.name);

  constructor(
    private readonly s3Service: S3Service,
    private readonly thumbnailProcessor: ThumbnailProcessorService,
    private readonly storageService: KnowledgeBaseStorageService,
  ) {}

  /**
   * Determine media type from MIME type
   */
  getMediaType(mimeType: string): KbMediaType {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
  }

  /**
   * Check if the given media type and MIME type support thumbnail generation
   */
  supportsThumbnail(mediaType: KbMediaType, mimeType: string): boolean {
    return supportsThumbnail(mediaType, mimeType);
  }

  /**
   * Generate thumbnail for KB media
   *
   * This is called synchronously after media upload to generate thumbnails
   * for images, videos, and PDFs. The process:
   * 1. Download the original file from S3
   * 2. Generate thumbnail using ThumbnailProcessorService
   * 3. Upload thumbnail to S3 in the appropriate knowledge-base path
   * 4. Update the KB media record with thumbnail info
   *
   * @param mediaId - The KB media record ID
   * @param s3Key - S3 key of the original file
   * @param mimeType - MIME type of the file
   * @returns Thumbnail generation result
   */
  async generateThumbnail(
    mediaId: string,
    s3Key: string,
    mimeType: string,
  ): Promise<KbThumbnailResult> {
    const mediaType = this.getMediaType(mimeType);

    // Check if this media type supports thumbnails
    if (!this.supportsThumbnail(mediaType, mimeType)) {
      this.logger.debug(
        `[KB Thumbnail] Media type ${mediaType} (${mimeType}) does not support thumbnails`,
      );
      return { success: true }; // Not an error, just no thumbnail needed
    }

    this.logger.log(
      `[KB Thumbnail] Generating thumbnail for ${mediaId} (${mediaType}: ${mimeType})`,
    );

    try {
      // Download original from S3
      const originalBuffer = await this.s3Service.downloadFile(s3Key);

      if (!originalBuffer) {
        throw new Error(`Failed to download original from S3: ${s3Key}`);
      }

      this.logger.debug(
        `[KB Thumbnail] Downloaded original: ${originalBuffer.length} bytes`,
      );

      // Generate thumbnail metadata (dimensions, blurhash)
      const result = await this.thumbnailProcessor.generateThumbnail(
        originalBuffer,
        mediaType,
        mimeType,
      );

      if (!result.success) {
        this.logger.warn(
          `[KB Thumbnail] Generation failed for ${mediaId}: ${result.error}`,
        );
        return {
          success: false,
          error: result.error,
        };
      }

      // Generate actual thumbnail buffer
      // Note: audio doesn't support thumbnails, but we already filtered it out above
      const thumbnailMediaType =
        mediaType === 'document' || mediaType === 'audio'
          ? 'document'
          : (mediaType as 'image' | 'video');

      const thumbnailBuffer = await this.thumbnailProcessor.getThumbnailBuffer(
        originalBuffer,
        thumbnailMediaType,
        mimeType,
      );

      // Generate thumbnail S3 key using the storage service
      // This ensures thumbnails are stored in the correct knowledge-base path structure
      const thumbnailPath = this.storageService.generateThumbnailPath(s3Key);
      const thumbnailS3Key = thumbnailPath.key;

      // Upload thumbnail to S3
      await this.s3Service.uploadFile(
        thumbnailS3Key,
        thumbnailBuffer,
        'image/jpeg',
      );

      this.logger.debug(
        `[KB Thumbnail] Uploaded thumbnail to S3: ${thumbnailS3Key}`,
      );

      // Update the KB media record
      await this.updateMediaThumbnail(mediaId, {
        thumbnailS3Key,
        thumbnailUrl: null, // Will be generated on demand via presigned URL
        width: result.width || null,
        height: result.height || null,
      });

      this.logger.log(
        `[KB Thumbnail] Successfully generated thumbnail for ${mediaId}`,
      );

      return {
        success: true,
        thumbnailS3Key,
        width: result.width,
        height: result.height,
        blurhash: result.blurhash,
        duration: result.duration,
      };
    } catch (error) {
      this.logger.error(
        `[KB Thumbnail] Failed to generate thumbnail for ${mediaId}: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update KB media record with thumbnail metadata
   */
  private async updateMediaThumbnail(
    mediaId: string,
    metadata: KbThumbnailMetadata,
  ): Promise<void> {
    await db
      .update(kbObjectMedia)
      .set({
        thumbnailS3Key: metadata.thumbnailS3Key,
        thumbnailUrl: metadata.thumbnailUrl,
        width: metadata.width,
        height: metadata.height,
        updatedAt: new Date(),
      })
      .where(eq(kbObjectMedia.id, mediaId));
  }

  /**
   * Get presigned URL for a thumbnail
   *
   * @param thumbnailS3Key - S3 key of the thumbnail
   * @param expiresIn - URL expiration time in seconds (default: 1 hour)
   * @returns Presigned URL for the thumbnail
   */
  async getThumbnailUrl(
    thumbnailS3Key: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    const { url } = await this.s3Service.generatePresignedDownloadUrl(
      thumbnailS3Key,
      { expiresIn },
    );
    return url;
  }

  /**
   * Regenerate thumbnail for an existing KB media item
   *
   * Useful for fixing thumbnails or updating after processing changes.
   *
   * @param mediaId - The KB media record ID
   * @returns Thumbnail generation result
   */
  async regenerateThumbnail(mediaId: string): Promise<KbThumbnailResult> {
    // Get the media record
    const media = await db.query.kbObjectMedia.findFirst({
      where: eq(kbObjectMedia.id, mediaId),
    });

    if (!media) {
      return {
        success: false,
        error: `Media ${mediaId} not found`,
      };
    }

    // Delete existing thumbnail if present
    if (media.thumbnailS3Key) {
      try {
        await this.s3Service.deleteFile(media.thumbnailS3Key);
        this.logger.debug(
          `[KB Thumbnail] Deleted old thumbnail: ${media.thumbnailS3Key}`,
        );
      } catch (error) {
        this.logger.warn(
          `[KB Thumbnail] Failed to delete old thumbnail: ${error.message}`,
        );
        // Continue anyway - new thumbnail will be created
      }
    }

    // Generate new thumbnail
    return this.generateThumbnail(mediaId, media.s3Key, media.mimeType);
  }
}
