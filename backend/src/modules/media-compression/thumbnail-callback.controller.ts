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
 */

import { db } from '@database/db.connection';
import { kbObjectMedia } from '@database/knowledge-base.schema';
import { messages } from '@database/schema';
import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
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

    if (payload.success && payload.thumbnailKey) {
      // Update the attachment's thumbnail info
      attachments[attachmentIndex] = {
        ...attachments[attachmentIndex],
        thumbnailKey: payload.thumbnailKey,
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
          `${payload.thumbnailKey} (${payload.width}x${payload.height})`,
      );

      // Emit WebSocket event for real-time UI update
      if (whatsAppGatewayInstance) {
        try {
          whatsAppGatewayInstance.emitThumbnailReady({
            messageId,
            attachmentId,
            thumbnailKey: payload.thumbnailKey,
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
}
