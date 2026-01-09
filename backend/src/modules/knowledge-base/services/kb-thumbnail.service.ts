/**
 * KB Media Thumbnail Service
 *
 * Handles thumbnail generation for Knowledge Base media files.
 *
 * Architecture:
 * - ALL thumbnails generated via AWS Lambda (no local fallback)
 * - PDFs supported via Chromium + pdf.js Lambda layer
 * - Safety mechanisms prevent infinite loops and runaway costs
 *
 * Flow:
 * 1. Queue thumbnail job to Lambda via SQS
 * 2. Lambda generates thumbnail and uploads to S3
 * 3. Lambda calls callback endpoint to update DB
 * 4. WebSocket event emitted for real-time UI update
 *
 * Thumbnail Storage Path:
 * knowledge-base/{userId}/{category}/{objectId}/{mediaType}/thumbnails/thumb-{filename}
 */

import { db } from '@database/db.connection';
import { kbObjectMedia } from '@database/knowledge-base.schema';
import { supportsThumbnail } from '@modules/thumbnail/thumbnail.types';
import { Injectable, Logger } from '@nestjs/common';
import { LambdaThumbnailService } from '@shared/services/lambda-thumbnail.service';
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
  /** Whether thumbnail was queued to Lambda (async) vs generated locally (sync) */
  isAsync?: boolean;
  /** Lambda job ID if queued */
  jobId?: string;
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
    private readonly storageService: KnowledgeBaseStorageService,
    private readonly lambdaThumbnailService: LambdaThumbnailService,
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
   * Generate thumbnail for KB media via AWS Lambda
   *
   * ALL thumbnails are generated in AWS Lambda (images, videos, PDFs).
   * No local fallback - if Lambda fails, thumbnail is not generated.
   *
   * Flow:
   * 1. Validate media type supports thumbnails
   * 2. Queue to Lambda via SQS
   * 3. Lambda generates thumbnail asynchronously
   * 4. Lambda calls callback to update DB and emit WebSocket event
   *
   * @param mediaId - The KB media record ID
   * @param s3Key - S3 key of the original file
   * @param mimeType - MIME type of the file
   * @param options - Additional options
   * @returns Thumbnail generation result (async - thumbnail not ready yet)
   */
  async generateThumbnail(
    mediaId: string,
    s3Key: string,
    mimeType: string,
    options?: {
      userId?: number;
      objectId?: string;
      s3Bucket?: string;
    },
  ): Promise<KbThumbnailResult> {
    const mediaType = this.getMediaType(mimeType);

    // Check if this media type supports thumbnails
    if (!this.supportsThumbnail(mediaType, mimeType)) {
      this.logger.debug(
        `[KB Thumbnail] Media type ${mediaType} (${mimeType}) does not support thumbnails`,
      );
      return { success: true }; // Not an error, just no thumbnail needed
    }

    // Check if Lambda is enabled
    if (!this.lambdaThumbnailService.isLambdaThumbnailEnabled()) {
      this.logger.error(
        `[KB Thumbnail] Lambda not configured - thumbnail will NOT be generated for ${mediaId}`,
      );
      return {
        success: false,
        error: 'Lambda thumbnail service not configured',
      };
    }

    this.logger.log(
      `[KB Thumbnail] Queueing thumbnail generation for ${mediaId} (${mediaType}: ${mimeType})`,
    );

    try {
      // Generate the target thumbnail S3 key
      const thumbnailPath = this.storageService.generateThumbnailPath(s3Key);
      const thumbnailS3Key = thumbnailPath.key;

      const jobId = await this.lambdaThumbnailService.queueKbMediaThumbnail({
        mediaId,
        s3Key,
        mimeType,
        thumbnailS3Key,
        s3Bucket: options?.s3Bucket,
        userId: options?.userId,
        objectId: options?.objectId,
      });

      if (!jobId) {
        // This should only happen if mimeType is not supported
        this.logger.warn(
          `[KB Thumbnail] Unsupported type ${mimeType} for ${mediaId} - no thumbnail will be generated`,
        );
        return {
          success: false,
          error: `Unsupported MIME type for thumbnail: ${mimeType}`,
        };
      }

      this.logger.log(
        `[KB Thumbnail] Queued Lambda thumbnail job ${jobId} for ${mediaId}`,
      );

      return {
        success: true,
        isAsync: true,
        jobId,
        thumbnailS3Key, // Return expected key so callers know where it will be
      };
    } catch (error) {
      this.logger.error(
        `[KB Thumbnail] Failed to queue Lambda job for ${mediaId}: ${error.message}`,
        error.stack,
      );

      // NO FALLBACK - thumbnail will not be generated
      return {
        success: false,
        error: `Failed to queue Lambda thumbnail job: ${error.message}`,
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
   * Deletes existing thumbnail and queues new generation via Lambda.
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

    // Generate new thumbnail via Lambda
    return this.generateThumbnail(mediaId, media.s3Key, media.mimeType);
  }
}
