/**
 * Media Thumbnail Callback Controller
 *
 * Handles webhook callbacks from the Lambda thumbnail generation service.
 * When Lambda finishes generating a thumbnail, it calls this endpoint
 * to notify the backend of the result.
 *
 * The callback updates the database with:
 * - Thumbnail S3 key
 * - Image dimensions (width/height)
 * - Blurhash for progressive loading
 * - Any error messages
 *
 * Also emits WebSocket events for real-time UI updates.
 *
 * For staged media (pre-upload preview), this controller handles late
 * thumbnail promotions inline when thumbnails arrive after the main
 * file has already been promoted. This avoids circular dependencies
 * with MediaStagingService.
 */

import { db } from '@database/db.connection';
import { kbObjectMedia } from '@database/knowledge-base.schema';
import { messages, stagedMedia } from '@database/schema';
import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { S3Service } from '@shared/services/s3.service';
import { eq } from 'drizzle-orm';
import { whatsAppGatewayInstance } from '../whatsapp/whatsapp.gateway';

/**
 * Callback payload from Lambda thumbnail generation
 */
interface ThumbnailCallbackPayload {
  success: boolean;
  jobId: string;
  jobType: 'thumbnail';
  error?: string;
  thumbnailKey?: string;
  width?: number;
  height?: number;
  blurhash?: string;
  duration?: number;
  processingTimeMs?: number;
  outputLocation?: {
    bucket: string;
    key: string;
  };
  context?: 'kb-media' | 'message-attachment';
  entityIds?: {
    mediaId?: string;
    attachmentId?: string;
    messageId?: string;
    chatId?: string;
  };
}

@Controller('api/v1/media/thumbnail')
export class ThumbnailCallbackController {
  private readonly logger = new Logger(ThumbnailCallbackController.name);

  // UUID regex for validation
  private readonly UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  constructor(private readonly s3Service: S3Service) {}

  /**
   * Extract stagingId (UUID) from a staging path
   * Path format: staging/{userId}/{stagingId}/{filename}
   *
   * @param path - The S3 path
   * @returns The stagingId if found and valid UUID, null otherwise
   */
  private extractStagingIdFromPath(path: string): string | null {
    if (!path.startsWith('staging/')) {
      return null;
    }

    const parts = path.split('/');
    // Format: staging/{userId}/{stagingId}/{filename}
    // parts[0] = 'staging', parts[1] = userId, parts[2] = stagingId
    if (parts.length >= 4) {
      const potentialStagingId = parts[2];
      if (this.UUID_REGEX.test(potentialStagingId)) {
        return potentialStagingId;
      }
    }

    return null;
  }

  /**
   * Webhook endpoint called by Lambda when thumbnail generation completes
   */
  @Post('callback')
  @HttpCode(200)
  async handleThumbnailCallback(
    @Body() payload: ThumbnailCallbackPayload,
  ): Promise<{ received: boolean }> {
    this.logger.log(
      `[Thumbnail Callback] Received callback for job ${payload.jobId}: ` +
        `${payload.success ? 'SUCCESS' : 'FAILED'} (context: ${payload.context})`,
    );

    try {
      // Route based on context
      switch (payload.context) {
        case 'kb-media':
          await this.handleKbMediaThumbnail(payload);
          break;
        case 'message-attachment':
          await this.handleMessageThumbnail(payload);
          break;
        default:
          this.logger.warn(
            `[Thumbnail Callback] Unknown context: ${payload.context}`,
          );
      }
    } catch (error) {
      this.logger.error(
        `[Thumbnail Callback] Error processing callback for job ${payload.jobId}: ${error.message}`,
        error.stack,
      );
    }

    // Always return success to Lambda to avoid retries
    return { received: true };
  }

  /**
   * Handle thumbnail callback for KB media
   */
  private async handleKbMediaThumbnail(
    payload: ThumbnailCallbackPayload,
  ): Promise<void> {
    const mediaId = payload.entityIds?.mediaId;

    if (!mediaId) {
      this.logger.warn(
        `[Thumbnail Callback] No mediaId in KB media callback for job ${payload.jobId}`,
      );
      return;
    }

    if (payload.success && payload.thumbnailKey) {
      // Update KB media record with thumbnail info
      await db
        .update(kbObjectMedia)
        .set({
          thumbnailS3Key: payload.thumbnailKey,
          thumbnailUrl: null, // Will be generated on demand via presigned URL
          width: payload.width || null,
          height: payload.height || null,
          updatedAt: new Date(),
        })
        .where(eq(kbObjectMedia.id, mediaId));

      this.logger.log(
        `[Thumbnail Callback] Updated KB media ${mediaId} with thumbnail: ` +
          `${payload.thumbnailKey} (${payload.width}x${payload.height}, time: ${payload.processingTimeMs}ms)`,
      );
    } else if (payload.error) {
      // Log error but don't fail - thumbnail is optional
      this.logger.warn(
        `[Thumbnail Callback] Thumbnail generation failed for KB media ${mediaId}: ${payload.error}`,
      );
    }
  }

  /**
   * Handle thumbnail callback for message attachments
   *
   * This method handles two scenarios:
   * 1. Normal callback: Attachment is still in staging or hasn't been promoted
   * 2. Late callback: Attachment was promoted but thumbnail was still generating
   *
   * For late callbacks, we inline the promotion logic to avoid circular
   * dependencies with MediaStagingService.
   */
  private async handleMessageThumbnail(
    payload: ThumbnailCallbackPayload,
  ): Promise<void> {
    const { messageId, attachmentId, chatId } = payload.entityIds || {};

    if (!messageId || !attachmentId) {
      this.logger.warn(
        `[Thumbnail Callback] Missing messageId or attachmentId in callback for job ${payload.jobId}`,
      );
      return;
    }

    // STEP 1: Check if this is a staged media callback that needs promotion
    // For staging files, extract stagingId from the thumbnailKey path (not from messageId)
    // Path format: staging/{userId}/{stagingId}/{filename}
    if (payload.thumbnailKey?.startsWith('staging/')) {
      const stagingId = this.extractStagingIdFromPath(payload.thumbnailKey);

      if (!stagingId) {
        this.logger.warn(
          `[Thumbnail Callback] Could not extract stagingId from path: ${payload.thumbnailKey}`,
        );
        // Fall through to regular message handling
      } else {
        // Query staging record using extracted stagingId (not messageId)
        const stagingRecord = await db.query.stagedMedia.findFirst({
          where: eq(stagedMedia.stagingId, stagingId),
        });

        if (stagingRecord) {
          // Update thumbnail status in staging record
          await db
            .update(stagedMedia)
            .set({
              thumbnailStatus: payload.success ? 'ready' : 'failed',
              thumbnailKey: payload.thumbnailKey,
            })
            .where(eq(stagedMedia.stagingId, stagingId));

          this.logger.log(
            `[Thumbnail Callback] Updated staging record ${stagingId} thumbnail status: ${payload.success ? 'ready' : 'failed'}`,
          );

          // If the staging record has been promoted (main file moved), complete thumbnail promotion
          if (stagingRecord.promotedAt && !stagingRecord.thumbnailPromotedAt) {
            if (payload.success && stagingRecord.promotedThumbnailKey) {
              this.logger.log(
                `[Thumbnail Callback] Completing late thumbnail promotion for ${stagingId}`,
              );

              const promoted = await this.completeThumbnailPromotion(
                stagingId,
                stagingRecord,
                payload,
                attachmentId,
              );

              if (promoted) {
                this.logger.log(
                  `[Thumbnail Callback] ✅ Late thumbnail promotion completed for ${stagingId}`,
                );
                return; // Done - handled everything
              }
            }
          }

          // If not promoted yet, just return - the thumbnail is ready in staging
          // and will be copied when promoteStagedFile is called
          if (!stagingRecord.promotedAt) {
            this.logger.log(
              `[Thumbnail Callback] Thumbnail ready in staging, waiting for promotion: ${stagingId}`,
            );
            return;
          }

          // Staging record was promoted but thumbnail was already handled or failed
          // Fall through to update the message directly if needed
        } else {
          this.logger.debug(
            `[Thumbnail Callback] No staging record found for ${stagingId}, treating as regular message`,
          );
        }
      }
    }

    // STEP 2: Handle regular message attachment thumbnail callback
    // Get the message to update its attachments
    const message = await db.query.messages.findFirst({
      where: eq(messages.messageId, messageId),
    });

    if (!message) {
      this.logger.warn(
        `[Thumbnail Callback] Message not found for thumbnail update: ${messageId}`,
      );
      return;
    }

    const attachments = (message.attachments || []) as any[];
    const attachmentIndex = attachments.findIndex((a) => a.id === attachmentId);

    if (attachmentIndex === -1) {
      this.logger.warn(
        `[Thumbnail Callback] Attachment not found: ${attachmentId} in message ${messageId}`,
      );
      return;
    }

    const currentAttachment = attachments[attachmentIndex];

    if (payload.success && payload.thumbnailKey) {
      // Check if we need to copy a late staging thumbnail to promoted path
      const callbackIsStaging = payload.thumbnailKey.startsWith('staging/');
      const attachmentIsPromoted =
        currentAttachment.s3Key &&
        !currentAttachment.s3Key.startsWith('staging/');

      let finalThumbnailKey = payload.thumbnailKey;

      if (callbackIsStaging && attachmentIsPromoted) {
        // Thumbnail callback arrived after promotion - copy thumbnail to promoted path
        this.logger.log(
          `[Thumbnail Callback] Late thumbnail for promoted attachment ${attachmentId}: ` +
            `copying from ${payload.thumbnailKey} to promoted path`,
        );

        // Derive promoted thumbnail path from the promoted s3Key
        const s3KeyParts = currentAttachment.s3Key.split('/');
        const filename = s3KeyParts.pop();
        const fileNameWithoutExt = filename.replace(/\.[^.]+$/, '');
        const promotedThumbnailKey = [
          ...s3KeyParts,
          `${fileNameWithoutExt}_thumb.jpg`,
        ].join('/');

        try {
          await this.s3Service.copyFile(
            payload.thumbnailKey,
            promotedThumbnailKey,
          );
          finalThumbnailKey = promotedThumbnailKey;
          this.logger.log(
            `[Thumbnail Callback] Copied late thumbnail to promoted path: ${promotedThumbnailKey}`,
          );
        } catch (error) {
          this.logger.error(
            `[Thumbnail Callback] Failed to copy late thumbnail from ${payload.thumbnailKey} ` +
              `to ${promotedThumbnailKey}: ${error.message}`,
          );
        }
      }

      // Update the attachment's thumbnail info
      attachments[attachmentIndex] = {
        ...attachments[attachmentIndex],
        thumbnailKey: finalThumbnailKey,
        thumbnailStatus: 'ready',
        width: payload.width || 0,
        height: payload.height || 0,
        blurhash: payload.blurhash || '',
        ...(payload.duration !== undefined && { duration: payload.duration }),
      };

      await db
        .update(messages)
        .set({ attachments: attachments as any })
        .where(eq(messages.messageId, messageId));

      this.logger.log(
        `[Thumbnail Callback] Updated message ${messageId} attachment ${attachmentId} with thumbnail: ` +
          `${finalThumbnailKey} (${payload.width}x${payload.height})`,
      );

      // Emit WebSocket event for real-time UI update
      if (whatsAppGatewayInstance) {
        try {
          whatsAppGatewayInstance.emitThumbnailReady({
            messageId,
            attachmentId,
            thumbnailKey: finalThumbnailKey,
            width: payload.width || 0,
            height: payload.height || 0,
            blurhash: payload.blurhash || '',
            duration: payload.duration,
          });
          this.logger.debug(
            `[Thumbnail Callback] Emitted thumbnailReady event for message ${messageId}`,
          );
        } catch (error) {
          this.logger.warn(
            `[Thumbnail Callback] Failed to emit WebSocket event: ${error.message}`,
          );
        }
      }
    } else {
      // Update status to failed
      attachments[attachmentIndex] = {
        ...attachments[attachmentIndex],
        thumbnailStatus: 'failed',
        thumbnailError: payload.error || 'Unknown error',
      };

      await db
        .update(messages)
        .set({ attachments: attachments as any })
        .where(eq(messages.messageId, messageId));

      this.logger.warn(
        `[Thumbnail Callback] Thumbnail generation failed for attachment ${attachmentId}: ${payload.error}`,
      );
    }
  }

  /**
   * Complete a late thumbnail promotion inline
   *
   * This is inlined here instead of calling MediaStagingService to avoid
   * circular module dependencies. It copies the late-arriving thumbnail
   * from staging to the final promoted path.
   *
   * @param stagingId - The staging ID
   * @param stagingRecord - The staging record with promotion info
   * @param payload - The thumbnail callback payload
   * @param attachmentId - The attachment ID
   * @returns true if promotion succeeded
   */
  private async completeThumbnailPromotion(
    stagingId: string,
    stagingRecord: {
      promotedMessageId: string | null;
      promotedThumbnailKey: string | null;
      thumbnailKey: string | null;
      s3Key: string;
    },
    payload: ThumbnailCallbackPayload,
    attachmentId: string,
  ): Promise<boolean> {
    if (!stagingRecord.promotedThumbnailKey) {
      this.logger.warn(
        `[Thumbnail Callback] No promoted thumbnail key for staging ${stagingId}`,
      );
      return false;
    }

    const stagingThumbnailKey = payload.thumbnailKey;
    if (!stagingThumbnailKey) {
      this.logger.warn(
        `[Thumbnail Callback] No thumbnail key in payload for staging ${stagingId}`,
      );
      return false;
    }

    try {
      // Copy thumbnail from staging to promoted path
      await this.s3Service.copyFile(
        stagingThumbnailKey,
        stagingRecord.promotedThumbnailKey,
      );

      // Verify copy succeeded
      const destMetadata = await this.s3Service.getFileMetadata(
        stagingRecord.promotedThumbnailKey,
      );
      if (!destMetadata) {
        this.logger.error(
          `[Thumbnail Callback] Late thumbnail copy verification failed: ${stagingRecord.promotedThumbnailKey}`,
        );
        return false;
      }

      this.logger.log(
        `[Thumbnail Callback] ✅ Late thumbnail copied: ${stagingThumbnailKey} → ${stagingRecord.promotedThumbnailKey}`,
      );

      // Update message attachment with new thumbnail path
      if (stagingRecord.promotedMessageId) {
        const message = await db.query.messages.findFirst({
          where: eq(messages.messageId, stagingRecord.promotedMessageId),
        });

        if (message && Array.isArray(message.attachments)) {
          const attachments = message.attachments as any[];
          const updatedAttachments = attachments.map((att) => {
            if (att.stagingId === stagingId) {
              return {
                ...att,
                thumbnailKey: stagingRecord.promotedThumbnailKey,
                thumbnailStatus: 'ready',
                width: payload.width || att.width || 0,
                height: payload.height || att.height || 0,
                blurhash: payload.blurhash || att.blurhash || '',
                ...(payload.duration !== undefined && {
                  duration: payload.duration,
                }),
                stagingId: undefined, // Clear staging reference now
              };
            }
            return att;
          });

          await db
            .update(messages)
            .set({ attachments: updatedAttachments })
            .where(eq(messages.messageId, stagingRecord.promotedMessageId));

          this.logger.log(
            `[Thumbnail Callback] Updated message ${stagingRecord.promotedMessageId} with late thumbnail`,
          );
        }
      }

      // Mark thumbnail as promoted
      await db
        .update(stagedMedia)
        .set({ thumbnailPromotedAt: new Date() })
        .where(eq(stagedMedia.stagingId, stagingId));

      // Delete staging thumbnail (main file was already deleted during initial promotion)
      try {
        await this.s3Service.deleteFile(stagingThumbnailKey);
        this.logger.log(
          `[Thumbnail Callback] Deleted staging thumbnail: ${stagingThumbnailKey}`,
        );
      } catch (deleteError) {
        this.logger.warn(
          `[Thumbnail Callback] Failed to delete staging thumbnail: ${deleteError.message}`,
        );
      }

      // Delete staging record now that everything is promoted
      await db.delete(stagedMedia).where(eq(stagedMedia.stagingId, stagingId));

      this.logger.log(
        `[Thumbnail Callback] Cleaned up staging record: ${stagingId}`,
      );

      // Emit WebSocket event with the promoted thumbnail path
      if (whatsAppGatewayInstance && stagingRecord.promotedMessageId) {
        try {
          whatsAppGatewayInstance.emitThumbnailReady({
            messageId: stagingRecord.promotedMessageId,
            attachmentId,
            thumbnailKey: stagingRecord.promotedThumbnailKey,
            width: payload.width || 0,
            height: payload.height || 0,
            blurhash: payload.blurhash || '',
            duration: payload.duration,
          });
        } catch (error) {
          this.logger.warn(
            `[Thumbnail Callback] Failed to emit WebSocket event: ${error.message}`,
          );
        }
      }

      return true;
    } catch (error) {
      this.logger.error(
        `[Thumbnail Callback] Failed to complete thumbnail promotion: ${error.message}`,
      );
      return false;
    }
  }
}
