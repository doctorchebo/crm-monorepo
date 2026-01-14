/**
 * Media Staging Service
 *
 * Handles pre-upload staging of media files for thumbnail pre-generation.
 *
 * Architecture:
 * - Files are uploaded to a staging prefix in S3 before being "committed" to a message
 * - Thumbnails are generated immediately upon staging
 * - Staged files can be cleaned up if the user cancels without sending
 * - When sending, staged files are "promoted" to the message path (renamed in S3)
 *
 * Flow:
 * 1. User selects files → Frontend calls stageFile()
 * 2. File uploaded to S3 staging path, thumbnail queued
 * 3. User edits/previews while thumbnail generates
 * 4. User sends → promoteStagedFile() moves file to message path
 * 5. User cancels → cleanupStagedFile() deletes from S3
 *
 * IMPORTANT: Thumbnail Race Condition Handling
 * Since thumbnails are generated asynchronously, they may not be ready when the user
 * clicks send. The promotion flow handles this by:
 * 1. Checking if thumbnail EXISTS in S3 (not just DB status)
 * 2. If thumbnail exists → copy it immediately
 * 3. If thumbnail doesn't exist yet → mark record as "promoted" with final path info
 * 4. Thumbnail callback checks for "promoted" records and copies to final path
 * 5. Cleanup happens only after both files are confirmed in final location
 *
 * Benefits:
 * - Thumbnails ready by the time user sends
 * - No wasted processing if user cancels
 * - Clean separation of staging vs committed files
 * - No race conditions with thumbnail generation
 */

import { db } from '@database/db.connection';
import { messages, stagedMedia } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { S3Service } from '@shared/services/s3.service';
import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { ThumbnailQueueService } from '../../thumbnail/thumbnail-queue.service';
import { supportsThumbnail } from '../../thumbnail/thumbnail.types';
import { getMediaTypeFromMimeType } from '../types/media.types';

/**
 * Staging prefix in S3 bucket
 * All staged files go here before being committed to messages
 */
const STAGING_PREFIX = 'staging';

/**
 * How long staged files remain valid (24 hours)
 * After this, they're eligible for cleanup
 */
const STAGING_TTL_HOURS = 24;

/**
 * Result of staging a file
 */
export interface StagedFileResult {
  /** Unique identifier for the staged file */
  stagingId: string;
  /** S3 key where file is stored */
  s3Key: string;
  /** S3 key where thumbnail will be generated */
  thumbnailKey: string;
  /** Media type (image, video, audio, document) */
  mediaType: 'image' | 'video' | 'audio' | 'document';
  /** File size in bytes */
  size: number;
  /** Original filename */
  fileName: string;
  /** MIME type */
  mimeType: string;
  /** Whether thumbnail generation was queued */
  thumbnailQueued: boolean;
}

/**
 * Result of promoting a staged file to a message
 */
export interface PromotedFileResult {
  /** The staging ID that was promoted */
  stagingId: string;
  /** New S3 key in the message path */
  s3Key: string;
  /** Thumbnail S3 key (if exists) */
  thumbnailKey?: string;
  /** Thumbnail status */
  thumbnailStatus: 'pending' | 'ready' | 'failed' | 'not-applicable';
}

@Injectable()
export class MediaStagingService {
  private readonly logger = new Logger(MediaStagingService.name);
  private thumbnailQueueService: ThumbnailQueueService | null = null;

  constructor(private readonly s3Service: S3Service) {}

  /**
   * Set the thumbnail queue service (called during module initialization)
   * Avoids circular dependency issues
   */
  setThumbnailQueueService(service: ThumbnailQueueService): void {
    this.thumbnailQueueService = service;
    this.logger.log('ThumbnailQueueService injected into MediaStagingService');
  }

  /**
   * Stage a file for preview/editing before committing to a message
   *
   * Uploads file to staging area and queues thumbnail generation
   *
   * @param file - Uploaded file from multer
   * @param senderId - Sender ID for path organization
   * @param contactId - Contact ID for path organization
   * @param userId - User ID who uploaded the file
   * @returns StagedFileResult with staging details
   */
  async stageFile(
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
    senderId: number,
    contactId: string,
    userId: number,
  ): Promise<StagedFileResult> {
    const stagingId = uuidv4();
    const mediaType = getMediaTypeFromMimeType(file.mimetype);

    if (!mediaType) {
      throw new Error(`Unsupported media type: ${file.mimetype}`);
    }

    // Generate staging S3 key
    // Format: staging/{userId}/{stagingId}/{filename}
    const s3Key = `${STAGING_PREFIX}/${userId}/${stagingId}/${file.originalname}`;

    // Generate thumbnail key (same structure but with _thumb suffix)
    const fileNameWithoutExt = file.originalname.replace(/\.[^.]+$/, '');
    const thumbnailKey = `${STAGING_PREFIX}/${userId}/${stagingId}/${fileNameWithoutExt}_thumb.jpg`;

    try {
      // Upload file to S3 staging area
      await this.s3Service.uploadFile(s3Key, file.buffer, file.mimetype);

      this.logger.log(
        `[Staging] Uploaded ${file.originalname} to ${s3Key} (${file.size} bytes)`,
      );

      // Record in database for tracking
      await db.insert(stagedMedia).values({
        stagingId,
        userId,
        senderId,
        contactId,
        s3Key,
        thumbnailKey,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        mediaType,
        thumbnailStatus: supportsThumbnail(mediaType, file.mimetype)
          ? 'pending'
          : 'not-applicable',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + STAGING_TTL_HOURS * 60 * 60 * 1000),
      });

      // Queue thumbnail generation if supported
      let thumbnailQueued = false;
      if (
        this.thumbnailQueueService &&
        supportsThumbnail(mediaType, file.mimetype)
      ) {
        try {
          await this.thumbnailQueueService.queueThumbnailGeneration({
            messageId: stagingId, // Use stagingId as pseudo-messageId
            attachmentId: stagingId,
            s3Key,
            mediaType,
            mimeType: file.mimetype,
            chatId: contactId,
            pathPrefix: STAGING_PREFIX,
            contactId: String(userId),
            thumbnailS3Key: thumbnailKey,
          });
          thumbnailQueued = true;
          this.logger.log(
            `[Staging] Queued thumbnail generation for ${stagingId}`,
          );
        } catch (error) {
          this.logger.warn(
            `[Staging] Failed to queue thumbnail: ${error.message}`,
          );
          // Don't fail - thumbnail is optional
        }
      }

      return {
        stagingId,
        s3Key,
        thumbnailKey,
        mediaType,
        size: file.size,
        fileName: file.originalname,
        mimeType: file.mimetype,
        thumbnailQueued,
      };
    } catch (error) {
      this.logger.error(`[Staging] Failed to stage file: ${error.message}`);
      // Clean up any partial upload
      try {
        await this.s3Service.deleteFile(s3Key);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Get staging status including thumbnail progress
   *
   * @param stagingId - The staging ID to check
   * @returns Staging record or null if not found
   */
  async getStagingStatus(stagingId: string): Promise<{
    stagingId: string;
    s3Key: string;
    thumbnailKey: string;
    thumbnailStatus: string;
    mediaType: string;
  } | null> {
    const record = await db.query.stagedMedia.findFirst({
      where: eq(stagedMedia.stagingId, stagingId),
    });

    if (!record) {
      return null;
    }

    return {
      stagingId: record.stagingId,
      s3Key: record.s3Key,
      thumbnailKey: record.thumbnailKey || '',
      thumbnailStatus: record.thumbnailStatus || 'pending',
      mediaType: record.mediaType,
    };
  }

  /**
   * Promote a staged file to a message
   *
   * This method handles the race condition between async thumbnail generation
   * and user clicking send. The flow is:
   *
   * 1. Copy main file to final destination (always succeeds)
   * 2. Check if thumbnail EXISTS in S3 (not just DB status)
   * 3. If thumbnail exists → copy it to final path, mark fully promoted
   * 4. If thumbnail doesn't exist → store promoted path info for late-copy
   * 5. Update message attachment with new paths
   * 6. Thumbnail callback will check for "promoted" records and copy late thumbnails
   *
   * @param stagingId - The staging ID to promote
   * @param messageId - The message ID to associate with
   * @param senderId - Sender ID for the destination path
   * @param contactId - Contact ID for the destination path
   * @param attachmentId - Optional attachment ID to update in the message
   * @returns PromotedFileResult with new S3 locations
   */
  async promoteStagedFile(
    stagingId: string,
    messageId: string,
    senderId: number,
    contactId: string,
    attachmentId?: string,
  ): Promise<PromotedFileResult> {
    this.logger.log(
      `[Staging] promoteStagedFile called: stagingId=${stagingId}, messageId=${messageId}, senderId=${senderId}, contactId=${contactId}, attachmentId=${attachmentId}`,
    );

    const record = await db.query.stagedMedia.findFirst({
      where: eq(stagedMedia.stagingId, stagingId),
    });

    if (!record) {
      this.logger.error(
        `[Staging] Staged file not found in database: ${stagingId}. ` +
          `This may occur if the file was cleaned up or never uploaded.`,
      );
      throw new Error(`Staged file not found: ${stagingId}`);
    }

    this.logger.log(
      `[Staging] Found staging record: s3Key=${record.s3Key}, fileName=${record.fileName}, thumbnailStatus=${record.thumbnailStatus}`,
    );

    // Generate new S3 key in message path
    // Format: {senderId}/{contactId}/{messageId}/{filename}
    const newS3Key = `${senderId}/${contactId}/${messageId}/${record.fileName}`;

    // Generate new thumbnail key
    const fileNameWithoutExt = record.fileName.replace(/\.[^.]+$/, '');
    const newThumbnailKey = `${senderId}/${contactId}/${messageId}/${fileNameWithoutExt}_thumb.jpg`;

    try {
      // =========================================================
      // STEP 1: Copy main file to final destination
      // =========================================================
      await this.s3Service.copyFile(record.s3Key, newS3Key);
      this.logger.log(
        `[Staging] Copied main file: ${record.s3Key} → ${newS3Key}`,
      );

      // Verify the copy succeeded
      const destMetadata = await this.s3Service.getFileMetadata(newS3Key);
      if (!destMetadata) {
        throw new Error(
          `Copy verification failed: destination file ${newS3Key} does not exist after copy`,
        );
      }
      this.logger.log(
        `[Staging] ✅ Verified main file exists: ${newS3Key} (${destMetadata.size} bytes)`,
      );

      // =========================================================
      // STEP 2: Check if thumbnail EXISTS in S3 (not just DB status)
      // This handles the race condition where thumbnail generation
      // completes but DB hasn't been updated yet
      // =========================================================
      let thumbnailCopied = false;
      let thumbnailExistsInStaging = false;

      if (record.thumbnailKey) {
        // Check if thumbnail file actually exists in S3
        const stagingThumbMetadata = await this.s3Service.getFileMetadata(
          record.thumbnailKey,
        );
        thumbnailExistsInStaging = !!stagingThumbMetadata;

        if (thumbnailExistsInStaging) {
          this.logger.log(
            `[Staging] Thumbnail exists in staging: ${record.thumbnailKey} (${stagingThumbMetadata?.size} bytes)`,
          );

          try {
            await this.s3Service.copyFile(record.thumbnailKey, newThumbnailKey);

            // Verify thumbnail copy
            const thumbDestMetadata =
              await this.s3Service.getFileMetadata(newThumbnailKey);
            if (thumbDestMetadata) {
              thumbnailCopied = true;
              this.logger.log(
                `[Staging] ✅ Copied thumbnail: ${record.thumbnailKey} → ${newThumbnailKey} (${thumbDestMetadata.size} bytes)`,
              );
            } else {
              this.logger.warn(
                `[Staging] Thumbnail copy reported success but verification failed: ${newThumbnailKey}`,
              );
            }
          } catch (error) {
            this.logger.warn(
              `[Staging] Thumbnail copy failed: ${error.message}`,
            );
          }
        } else {
          this.logger.log(
            `[Staging] Thumbnail not yet in staging (still generating): ${record.thumbnailKey}`,
          );
        }
      }

      // =========================================================
      // STEP 3: Update staging record with promotion info
      // If thumbnail wasn't copied, keep record for late-copy by callback
      // =========================================================
      const now = new Date();

      await db
        .update(stagedMedia)
        .set({
          promotedAt: now,
          promotedMessageId: messageId,
          promotedS3Key: newS3Key,
          promotedThumbnailKey: newThumbnailKey,
          thumbnailPromotedAt: thumbnailCopied ? now : null,
        })
        .where(eq(stagedMedia.stagingId, stagingId));

      this.logger.log(
        `[Staging] Updated staging record: promotedAt=${now.toISOString()}, thumbnailCopied=${thumbnailCopied}`,
      );

      // =========================================================
      // STEP 4: Update message attachment with new paths
      // =========================================================
      const message = await db.query.messages.findFirst({
        where: eq(messages.messageId, messageId),
      });

      if (!message) {
        throw new Error(
          `Message not found during promotion: ${messageId}. S3 files were copied but database update failed.`,
        );
      }

      if (!message.attachments || !Array.isArray(message.attachments)) {
        throw new Error(
          `Message ${messageId} has no attachments array. S3 files were copied but database update failed.`,
        );
      }

      const currentAttachments = message.attachments as any[];

      // Find the attachment to update
      let attachmentFound = false;
      const updatedAttachments = currentAttachments.map((att: any) => {
        const shouldUpdate = attachmentId
          ? att.id === attachmentId
          : att.stagingId === stagingId;

        if (shouldUpdate) {
          attachmentFound = true;
          this.logger.log(
            `[Staging] Updating attachment ${att.id}: s3Key ${att.s3Key} → ${newS3Key}`,
          );
          return {
            ...att,
            s3Key: newS3Key,
            // Set thumbnailKey to promoted path if thumbnail was copied,
            // otherwise keep staging path (callback will update later)
            thumbnailKey: thumbnailCopied ? newThumbnailKey : att.thumbnailKey,
            // Clear stagingId only if thumbnail was also copied
            // Otherwise keep it so callback can find and update
            stagingId: thumbnailCopied ? undefined : att.stagingId,
          };
        }
        return att;
      });

      if (!attachmentFound) {
        throw new Error(
          `Attachment not found in message ${messageId}. ` +
            `Looking for attachmentId=${attachmentId} or stagingId=${stagingId}. ` +
            `Available attachments: ${currentAttachments.map((a) => `id=${a.id}, stagingId=${a.stagingId}`).join('; ')}`,
        );
      }

      await db
        .update(messages)
        .set({ attachments: updatedAttachments })
        .where(eq(messages.messageId, messageId));

      // Verify the update
      const verifyMessage = await db.query.messages.findFirst({
        where: eq(messages.messageId, messageId),
      });
      const verifyAttachments = (verifyMessage?.attachments as any[]) || [];
      const verifyAtt = verifyAttachments.find((a) =>
        attachmentId ? a.id === attachmentId : a.s3Key === newS3Key,
      );

      if (!verifyAtt || verifyAtt.s3Key !== newS3Key) {
        this.logger.error(
          `[Staging] ❌ Verification failed! Expected s3Key=${newS3Key}, got s3Key=${verifyAtt?.s3Key}`,
        );
        throw new Error(
          `Database update verification failed. s3Key was not saved correctly.`,
        );
      }

      this.logger.log(
        `[Staging] ✅ Verified: message ${messageId} attachment s3Key updated to ${newS3Key}`,
      );

      // =========================================================
      // STEP 5: Cleanup staging files only if thumbnail was also copied
      // If thumbnail wasn't copied, keep staging for callback to find
      // =========================================================
      if (thumbnailCopied || record.thumbnailStatus === 'not-applicable') {
        // Both files copied (or no thumbnail needed), safe to cleanup
        await this.cleanupStagedFileFromS3(stagingId);
        this.logger.log(
          `[Staging] ✅ Promotion complete, cleaned up staging files`,
        );
      } else {
        // Thumbnail not yet ready - only delete main file, keep record for callback
        try {
          await this.s3Service.deleteFile(record.s3Key);
          this.logger.log(
            `[Staging] Deleted staged main file (keeping thumbnail for late-copy): ${record.s3Key}`,
          );
        } catch (error) {
          this.logger.warn(
            `[Staging] Failed to delete staged main file: ${error.message}`,
          );
        }
        this.logger.log(
          `[Staging] ⏳ Thumbnail pending - keeping staging record for late-copy`,
        );
      }

      return {
        stagingId,
        s3Key: newS3Key,
        thumbnailKey: thumbnailCopied ? newThumbnailKey : undefined,
        thumbnailStatus: record.thumbnailStatus as
          | 'pending'
          | 'ready'
          | 'failed'
          | 'not-applicable',
      };
    } catch (error) {
      this.logger.error(`[Staging] Failed to promote file: ${error.message}`);
      throw error;
    }
  }

  /**
   * Complete a pending thumbnail promotion
   *
   * Called by thumbnail callback when a thumbnail arrives for a promoted file.
   * Copies the thumbnail from staging to the final path and updates the message.
   *
   * @param stagingId - The staging ID to complete
   * @returns true if thumbnail was successfully promoted, false otherwise
   */
  async completeThumbnailPromotion(stagingId: string): Promise<boolean> {
    const record = await db.query.stagedMedia.findFirst({
      where: eq(stagedMedia.stagingId, stagingId),
    });

    if (!record) {
      this.logger.debug(
        `[Staging] No record found for thumbnail promotion: ${stagingId}`,
      );
      return false;
    }

    // Check if this is a promoted record awaiting thumbnail
    if (!record.promotedAt || !record.promotedThumbnailKey) {
      this.logger.debug(
        `[Staging] Record ${stagingId} is not promoted or doesn't need thumbnail`,
      );
      return false;
    }

    // Check if thumbnail was already promoted
    if (record.thumbnailPromotedAt) {
      this.logger.debug(
        `[Staging] Thumbnail already promoted for ${stagingId}`,
      );
      return true;
    }

    // Check if thumbnail exists in staging
    if (!record.thumbnailKey) {
      this.logger.warn(
        `[Staging] No thumbnail key for promoted record ${stagingId}`,
      );
      return false;
    }

    const thumbMetadata = await this.s3Service.getFileMetadata(
      record.thumbnailKey,
    );
    if (!thumbMetadata) {
      this.logger.warn(
        `[Staging] Thumbnail not found in staging: ${record.thumbnailKey}`,
      );
      return false;
    }

    try {
      // Copy thumbnail to final path
      await this.s3Service.copyFile(
        record.thumbnailKey,
        record.promotedThumbnailKey,
      );

      // Verify copy
      const destThumbMetadata = await this.s3Service.getFileMetadata(
        record.promotedThumbnailKey,
      );
      if (!destThumbMetadata) {
        this.logger.error(
          `[Staging] Late thumbnail copy verification failed: ${record.promotedThumbnailKey}`,
        );
        return false;
      }

      this.logger.log(
        `[Staging] ✅ Late thumbnail copied: ${record.thumbnailKey} → ${record.promotedThumbnailKey}`,
      );

      // Update message attachment with new thumbnail path
      if (record.promotedMessageId) {
        const message = await db.query.messages.findFirst({
          where: eq(messages.messageId, record.promotedMessageId),
        });

        if (message && Array.isArray(message.attachments)) {
          const attachments = message.attachments as any[];
          const updatedAttachments = attachments.map((att) => {
            if (att.stagingId === stagingId) {
              return {
                ...att,
                thumbnailKey: record.promotedThumbnailKey,
                stagingId: undefined, // Clear staging reference now
              };
            }
            return att;
          });

          await db
            .update(messages)
            .set({ attachments: updatedAttachments })
            .where(eq(messages.messageId, record.promotedMessageId));

          this.logger.log(
            `[Staging] Updated message ${record.promotedMessageId} with late thumbnail`,
          );
        }
      }

      // Mark thumbnail as promoted and cleanup
      await db
        .update(stagedMedia)
        .set({ thumbnailPromotedAt: new Date() })
        .where(eq(stagedMedia.stagingId, stagingId));

      // Now safe to cleanup staging files
      await this.cleanupStagedFileFromS3(stagingId);

      return true;
    } catch (error) {
      this.logger.error(
        `[Staging] Failed to complete thumbnail promotion: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Delete staging files from S3 and database record
   *
   * @param stagingId - The staging ID to clean up
   */
  private async cleanupStagedFileFromS3(stagingId: string): Promise<void> {
    const record = await db.query.stagedMedia.findFirst({
      where: eq(stagedMedia.stagingId, stagingId),
    });

    if (!record) {
      return;
    }

    // Delete main file from S3
    try {
      await this.s3Service.deleteFile(record.s3Key);
      this.logger.log(`[Staging] Deleted staged file: ${record.s3Key}`);
    } catch (error) {
      this.logger.warn(
        `[Staging] Failed to delete staged file: ${error.message}`,
      );
    }

    // Delete thumbnail from S3 if it exists
    if (record.thumbnailKey) {
      try {
        await this.s3Service.deleteFile(record.thumbnailKey);
        this.logger.log(
          `[Staging] Deleted staged thumbnail: ${record.thumbnailKey}`,
        );
      } catch (error) {
        this.logger.debug(
          `[Staging] Thumbnail delete failed (might not exist): ${error.message}`,
        );
      }
    }

    // Delete database record
    await db.delete(stagedMedia).where(eq(stagedMedia.stagingId, stagingId));
    this.logger.log(`[Staging] Cleaned up staging record: ${stagingId}`);
  }

  /**
   * Clean up a staged file (user cancelled or file expired)
   *
   * Public method for cleaning up files that were never promoted.
   * Also handles cleanup of promoted records whose thumbnails have
   * been copied.
   *
   * @param stagingId - The staging ID to clean up
   */
  async cleanupStagedFile(stagingId: string): Promise<void> {
    await this.cleanupStagedFileFromS3(stagingId);
  }

  /**
   * Clean up multiple staged files at once (batch operation)
   *
   * @param stagingIds - Array of staging IDs to clean up
   */
  async cleanupMultipleStagedFiles(stagingIds: string[]): Promise<void> {
    await Promise.all(stagingIds.map((id) => this.cleanupStagedFile(id)));
  }

  /**
   * Clean up expired staged files (called periodically)
   *
   * Removes files older than STAGING_TTL_HOURS
   */
  async cleanupExpiredStagedFiles(): Promise<number> {
    const expiredRecords = await db.query.stagedMedia.findMany({
      where: lt(stagedMedia.expiresAt, new Date()),
    });

    if (expiredRecords.length === 0) {
      return 0;
    }

    this.logger.log(
      `[Staging] Cleaning up ${expiredRecords.length} expired staged files`,
    );

    await Promise.all(
      expiredRecords.map((record) => this.cleanupStagedFile(record.stagingId)),
    );

    return expiredRecords.length;
  }

  /**
   * Update thumbnail status for a staged file
   * Called by thumbnail callback when generation completes
   *
   * @param stagingId - The staging ID to update
   * @param status - New thumbnail status
   */
  async updateThumbnailStatus(
    stagingId: string,
    status: 'ready' | 'failed',
  ): Promise<void> {
    await db
      .update(stagedMedia)
      .set({ thumbnailStatus: status })
      .where(eq(stagedMedia.stagingId, stagingId));

    this.logger.log(
      `[Staging] Updated thumbnail status for ${stagingId}: ${status}`,
    );
  }

  /**
   * Get presigned URL for a staged file's thumbnail
   *
   * @param stagingId - The staging ID
   * @returns Presigned URL or null if thumbnail not ready
   */
  async getStagedThumbnailUrl(stagingId: string): Promise<string | null> {
    const record = await db.query.stagedMedia.findFirst({
      where: eq(stagedMedia.stagingId, stagingId),
    });

    if (!record || record.thumbnailStatus !== 'ready' || !record.thumbnailKey) {
      return null;
    }

    try {
      const { url } = await this.s3Service.generatePresignedDownloadUrl(
        record.thumbnailKey,
        { expiresIn: 3600 },
      );
      return url;
    } catch (error) {
      this.logger.warn(
        `[Staging] Failed to generate thumbnail URL: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Clean up old promoted records that are stuck (thumbnail never arrived)
   *
   * This is a failsafe cleanup for records that:
   * 1. Were promoted more than 1 hour ago
   * 2. Never received their thumbnail callback
   *
   * These records can't be cleaned up normally because we're waiting
   * for the thumbnail callback that never came.
   *
   * @param maxAgeMinutes - Maximum age of promoted records to clean up (default: 60 minutes)
   * @returns Number of records cleaned up
   */
  async cleanupStuckPromotedRecords(
    maxAgeMinutes: number = 60,
  ): Promise<number> {
    const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

    // Find records that:
    // 1. Have been promoted (promotedAt is set)
    // 2. Were promoted more than maxAgeMinutes ago
    // 3. Thumbnail was never promoted (thumbnailPromotedAt is null)
    const stuckRecords = await db.query.stagedMedia.findMany({
      where: and(
        isNotNull(stagedMedia.promotedAt),
        lt(stagedMedia.promotedAt, cutoffTime),
      ),
    });

    // Filter to only those without thumbnail promoted
    const recordsToCleanup = stuckRecords.filter((r) => !r.thumbnailPromotedAt);

    if (recordsToCleanup.length === 0) {
      return 0;
    }

    this.logger.log(
      `[Staging] Cleaning up ${recordsToCleanup.length} stuck promoted records (promoted > ${maxAgeMinutes}min ago, no thumbnail)`,
    );

    await Promise.all(
      recordsToCleanup.map((record) =>
        this.cleanupStagedFileFromS3(record.stagingId),
      ),
    );

    return recordsToCleanup.length;
  }
}
