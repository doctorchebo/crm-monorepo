/**
 * Thumbnail Service
 * Main service for thumbnail operations
 * Handles database updates and WebSocket notifications
 */

import { db } from '@database/db.connection';
import { messages } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { S3Service } from '@shared/services/s3.service';
import { eq } from 'drizzle-orm';
import { whatsAppGatewayInstance } from '../whatsapp/whatsapp.gateway';
import {
  ThumbnailMetadata,
  ThumbnailReadyEvent,
  ThumbnailStatus,
} from './thumbnail.types';

@Injectable()
export class ThumbnailService {
  private readonly logger = new Logger(ThumbnailService.name);

  constructor(private readonly s3Service: S3Service) {}

  /**
   * Update thumbnail status in database
   */
  async updateThumbnailStatus(
    messageId: string,
    attachmentId: string,
    status: ThumbnailStatus,
    errorMessage?: string,
  ): Promise<void> {
    try {
      const message = await db.query.messages.findFirst({
        where: eq(messages.messageId, messageId),
      });

      if (!message) {
        this.logger.warn(
          `Message not found for thumbnail update: ${messageId}`,
        );
        return;
      }

      const attachments = (message.attachments || []) as any[];
      const attachmentIndex = attachments.findIndex(
        (a) => a.id === attachmentId,
      );

      if (attachmentIndex === -1) {
        this.logger.warn(
          `Attachment not found: ${attachmentId} in message ${messageId}`,
        );
        return;
      }

      // Update the attachment's thumbnail status
      attachments[attachmentIndex] = {
        ...attachments[attachmentIndex],
        thumbnailStatus: status,
        ...(errorMessage && { thumbnailError: errorMessage }),
      };

      await db
        .update(messages)
        .set({ attachments: attachments as any })
        .where(eq(messages.messageId, messageId));

      this.logger.debug(
        `Updated thumbnail status to ${status} for ${attachmentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update thumbnail status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Update attachment with full thumbnail metadata
   */
  async updateThumbnailMetadata(
    messageId: string,
    attachmentId: string,
    metadata: ThumbnailMetadata,
  ): Promise<void> {
    try {
      const message = await db.query.messages.findFirst({
        where: eq(messages.messageId, messageId),
      });

      if (!message) {
        this.logger.warn(
          `Message not found for thumbnail metadata update: ${messageId}`,
        );
        return;
      }

      const attachments = (message.attachments || []) as any[];
      const attachmentIndex = attachments.findIndex(
        (a) => a.id === attachmentId,
      );

      if (attachmentIndex === -1) {
        this.logger.warn(
          `Attachment not found: ${attachmentId} in message ${messageId}`,
        );
        return;
      }

      const currentAttachment = attachments[attachmentIndex];

      // CRITICAL: Check for stale staging thumbnails
      // If the metadata's thumbnailKey is a staging path but the attachment's s3Key
      // is NOT a staging path (file was promoted), this is a late-arriving update
      // from before promotion - ignore it to prevent overwriting the promoted thumbnailKey.
      const metadataIsStaging = metadata.thumbnailKey?.startsWith('staging/');
      const attachmentIsPromoted =
        currentAttachment.s3Key &&
        !currentAttachment.s3Key.startsWith('staging/');

      if (metadataIsStaging && attachmentIsPromoted) {
        this.logger.log(
          `Ignoring stale staging thumbnail for promoted attachment ${attachmentId}: ` +
            `metadata thumbnailKey=${metadata.thumbnailKey}, attachment s3Key=${currentAttachment.s3Key}`,
        );
        return;
      }

      // Update the attachment with all thumbnail metadata
      attachments[attachmentIndex] = {
        ...attachments[attachmentIndex],
        thumbnailKey: metadata.thumbnailKey,
        thumbnailStatus: metadata.thumbnailStatus,
        width: metadata.width,
        height: metadata.height,
        blurhash: metadata.blurhash,
        thumbnailError: undefined, // Clear any previous error
      };

      await db
        .update(messages)
        .set({ attachments: attachments as any })
        .where(eq(messages.messageId, messageId));

      this.logger.debug(
        `Updated thumbnail metadata for ${attachmentId}: ${metadata.thumbnailKey}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update thumbnail metadata: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Emit WebSocket event when thumbnail is ready
   */
  async emitThumbnailReady(event: ThumbnailReadyEvent): Promise<void> {
    if (whatsAppGatewayInstance) {
      try {
        whatsAppGatewayInstance.emitThumbnailReady(event);
        this.logger.debug(`Emitted thumbnail:ready for ${event.attachmentId}`);
      } catch (error) {
        this.logger.warn(
          `Failed to emit thumbnail:ready event: ${error.message}`,
        );
      }
    } else {
      this.logger.debug('WhatsApp gateway not available for thumbnail event');
    }
  }

  /**
   * Get thumbnail URL for an attachment
   */
  async getThumbnailUrl(
    messageId: string,
    attachmentId: string,
    expiresIn: number = 3600,
  ): Promise<string | null> {
    try {
      const message = await db.query.messages.findFirst({
        where: eq(messages.messageId, messageId),
      });

      if (!message) {
        return null;
      }

      const attachments = (message.attachments || []) as any[];
      const attachment = attachments.find((a) => a.id === attachmentId);

      if (!attachment || !attachment.thumbnailKey) {
        return null;
      }

      const { url } = await this.s3Service.generatePresignedDownloadUrl(
        attachment.thumbnailKey,
        { expiresIn },
      );

      return url;
    } catch (error) {
      this.logger.error(
        `Failed to get thumbnail URL: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * Get thumbnail status for multiple messages (batch)
   */
  async getBatchThumbnailStatus(
    messageIds: string[],
  ): Promise<Map<string, { attachmentId: string; status: ThumbnailStatus }[]>> {
    const result = new Map<
      string,
      { attachmentId: string; status: ThumbnailStatus }[]
    >();

    try {
      // Fetch all messages
      for (const messageId of messageIds) {
        const message = await db.query.messages.findFirst({
          where: eq(messages.messageId, messageId),
        });

        if (message && message.attachments) {
          const attachments = message.attachments as any[];
          const statuses = attachments
            .filter((a) => a.type === 'image' || a.type === 'video')
            .map((a) => ({
              attachmentId: a.id,
              status: (a.thumbnailStatus || 'pending') as ThumbnailStatus,
            }));
          result.set(messageId, statuses);
        }
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to get batch thumbnail status: ${error.message}`,
      );
      return result;
    }
  }

  /**
   * Force regenerate thumbnail for an attachment
   */
  async regenerateThumbnail(
    messageId: string,
    attachmentId: string,
  ): Promise<boolean> {
    try {
      const message = await db.query.messages.findFirst({
        where: eq(messages.messageId, messageId),
      });

      if (!message) {
        return false;
      }

      const attachments = (message.attachments || []) as any[];
      const attachment = attachments.find((a) => a.id === attachmentId);

      if (!attachment || !attachment.s3Key) {
        return false;
      }

      // Reset thumbnail status to pending
      await this.updateThumbnailStatus(messageId, attachmentId, 'pending');

      // The caller should re-queue the thumbnail generation job
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to initiate thumbnail regeneration: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Check if thumbnail exists in S3 and update DB if it does
   * Used to repair orphaned thumbnails (exist in S3 but not recorded in DB)
   *
   * This can happen when Lambda callback fails (e.g., BACKEND_URL not reachable)
   * but Lambda successfully uploads the thumbnail to S3.
   *
   * @param messageId - Message ID to check
   * @param attachmentId - Attachment ID to check
   * @returns Whether the thumbnail was found and DB was updated
   */
  async checkAndRepairThumbnail(
    messageId: string,
    attachmentId: string,
  ): Promise<{ repaired: boolean; thumbnailKey?: string; error?: string }> {
    try {
      const message = await db.query.messages.findFirst({
        where: eq(messages.messageId, messageId),
      });

      if (!message) {
        return { repaired: false, error: 'Message not found' };
      }

      const attachments = (message.attachments || []) as any[];
      const attachmentIndex = attachments.findIndex(
        (a) => a.id === attachmentId,
      );

      if (attachmentIndex === -1) {
        return { repaired: false, error: 'Attachment not found' };
      }

      const attachment = attachments[attachmentIndex];

      // If thumbnail is already ready, nothing to repair
      if (attachment.thumbnailStatus === 'ready' && attachment.thumbnailKey) {
        return {
          repaired: false,
          thumbnailKey: attachment.thumbnailKey,
          error: 'Thumbnail already ready',
        };
      }

      // If no s3Key, can't generate thumbnail key
      if (!attachment.s3Key) {
        return { repaired: false, error: 'No s3Key found for attachment' };
      }

      // Generate expected thumbnail key
      const thumbnailKey = this.generateThumbnailKey(attachment.s3Key);

      // Check if thumbnail exists in S3
      const metadata = await this.s3Service.getFileMetadata(thumbnailKey);

      if (!metadata) {
        return {
          repaired: false,
          error: 'Thumbnail not found in S3. May need to regenerate.',
        };
      }

      // Thumbnail exists in S3! Update the database
      attachments[attachmentIndex] = {
        ...attachment,
        thumbnailKey,
        thumbnailStatus: 'ready',
        // We don't have width/height/blurhash from S3 metadata alone
        // These would need to be re-extracted or stored separately
      };

      await db
        .update(messages)
        .set({ attachments: attachments as any })
        .where(eq(messages.messageId, messageId));

      this.logger.log(
        `✅ Repaired thumbnail for ${attachmentId}: ${thumbnailKey}`,
      );

      // Emit WebSocket event to update frontend
      await this.emitThumbnailReady({
        messageId,
        attachmentId,
        thumbnailKey,
        width: 0, // Unknown - would need image analysis
        height: 0, // Unknown - would need image analysis
        blurhash: '', // Unknown - would need image analysis
      });

      return { repaired: true, thumbnailKey };
    } catch (error) {
      this.logger.error(
        `Failed to check/repair thumbnail: ${error.message}`,
        error.stack,
      );
      return { repaired: false, error: error.message };
    }
  }

  /**
   * Generate expected thumbnail S3 key from original file key
   * Matches the Lambda convention: original_thumb.jpg
   */
  private generateThumbnailKey(originalKey: string): string {
    // Remove extension and add _thumb.jpg
    const lastDot = originalKey.lastIndexOf('.');
    const baseName =
      lastDot > -1 ? originalKey.substring(0, lastDot) : originalKey;
    return `${baseName}_thumb.jpg`;
  }

  /**
   * Batch repair all orphaned thumbnails
   * Finds all messages with image/video attachments that have s3Key but
   * missing thumbnailKey or thumbnailStatus !== 'ready', checks S3 for
   * existing thumbnails, and updates the database.
   *
   * @returns Summary of repair operation
   */
  async batchRepairOrphanedThumbnails(): Promise<{
    total: number;
    repaired: number;
    failed: number;
    alreadyReady: number;
    notInS3: number;
    details: Array<{
      messageId: string;
      attachmentId: string;
      status: 'repaired' | 'failed' | 'already_ready' | 'not_in_s3';
      thumbnailKey?: string;
      error?: string;
    }>;
  }> {
    const result = {
      total: 0,
      repaired: 0,
      failed: 0,
      alreadyReady: 0,
      notInS3: 0,
      details: [] as Array<{
        messageId: string;
        attachmentId: string;
        status: 'repaired' | 'failed' | 'already_ready' | 'not_in_s3';
        thumbnailKey?: string;
        error?: string;
      }>,
    };

    try {
      // Get all messages with attachments
      const allMessages = await db.query.messages.findMany({
        columns: {
          messageId: true,
          attachments: true,
        },
      });

      this.logger.log(
        `🔍 Scanning ${allMessages.length} messages for orphaned thumbnails...`,
      );

      for (const message of allMessages) {
        if (!message.attachments) continue;

        const attachments = message.attachments as any[];

        for (const attachment of attachments) {
          // Only process image/video attachments with s3Key
          if (
            !attachment.s3Key ||
            !['image', 'video'].includes(attachment.type)
          ) {
            continue;
          }

          result.total++;

          // Check if already ready
          if (
            attachment.thumbnailStatus === 'ready' &&
            attachment.thumbnailKey
          ) {
            result.alreadyReady++;
            result.details.push({
              messageId: message.messageId,
              attachmentId: attachment.id,
              status: 'already_ready',
              thumbnailKey: attachment.thumbnailKey,
            });
            continue;
          }

          // Try to repair
          const repairResult = await this.checkAndRepairThumbnail(
            message.messageId,
            attachment.id,
          );

          if (repairResult.repaired) {
            result.repaired++;
            result.details.push({
              messageId: message.messageId,
              attachmentId: attachment.id,
              status: 'repaired',
              thumbnailKey: repairResult.thumbnailKey,
            });
          } else if (
            repairResult.error?.includes('not found in S3') ||
            repairResult.error?.includes('May need to regenerate')
          ) {
            result.notInS3++;
            result.details.push({
              messageId: message.messageId,
              attachmentId: attachment.id,
              status: 'not_in_s3',
              error: repairResult.error,
            });
          } else {
            result.failed++;
            result.details.push({
              messageId: message.messageId,
              attachmentId: attachment.id,
              status: 'failed',
              error: repairResult.error,
            });
          }
        }
      }

      this.logger.log(
        `✅ Batch repair complete: ${result.repaired} repaired, ` +
          `${result.alreadyReady} already ready, ${result.notInS3} not in S3, ` +
          `${result.failed} failed out of ${result.total} total`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to batch repair thumbnails: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get all attachments that need thumbnail generation
   * Returns attachments with s3Key but no thumbnailKey or thumbnailStatus !== 'ready'
   *
   * @param options - Filter options
   * @returns Array of attachments needing thumbnails
   */
  async getAttachmentsNeedingThumbnails(options?: {
    direction?: 'inbound' | 'outbound' | 'all';
    mediaTypes?: ('image' | 'video' | 'document')[];
    limit?: number;
  }): Promise<
    Array<{
      messageId: string;
      attachmentId: string;
      s3Key: string;
      mediaType: 'image' | 'video' | 'document';
      mimeType: string;
      chatId: string;
      direction: 'inbound' | 'outbound';
    }>
  > {
    const {
      direction = 'all',
      mediaTypes = ['image', 'video', 'document'],
      limit,
    } = options || {};

    const needsThumbnail: Array<{
      messageId: string;
      attachmentId: string;
      s3Key: string;
      mediaType: 'image' | 'video' | 'document';
      mimeType: string;
      chatId: string;
      direction: 'inbound' | 'outbound';
    }> = [];

    try {
      // Get all messages with attachments
      const allMessages = await db.query.messages.findMany({
        columns: {
          messageId: true,
          chatId: true,
          direction: true,
          attachments: true,
        },
      });

      for (const message of allMessages) {
        if (!message.attachments || !Array.isArray(message.attachments))
          continue;

        // Filter by direction if specified
        const msgDirection = message.direction as 'inbound' | 'outbound';
        if (direction !== 'all' && msgDirection !== direction) continue;

        const attachments = message.attachments as any[];

        for (const attachment of attachments) {
          // Skip if no s3Key
          if (!attachment.s3Key) continue;

          // Skip if not a supported media type
          const type = attachment.type as string;
          if (!mediaTypes.includes(type as 'image' | 'video' | 'document'))
            continue;

          // Skip if thumbnail is already ready
          if (
            attachment.thumbnailStatus === 'ready' &&
            attachment.thumbnailKey
          ) {
            continue;
          }

          // Skip PDFs unless they have application/pdf mime type
          if (type === 'document' && attachment.mimeType !== 'application/pdf')
            continue;

          needsThumbnail.push({
            messageId: message.messageId,
            attachmentId: attachment.id,
            s3Key: attachment.s3Key,
            mediaType: type as 'image' | 'video' | 'document',
            mimeType: attachment.mimeType || 'application/octet-stream',
            chatId: message.chatId,
            direction: msgDirection,
          });

          // Apply limit if specified
          if (limit && needsThumbnail.length >= limit) {
            return needsThumbnail;
          }
        }
      }

      return needsThumbnail;
    } catch (error) {
      this.logger.error(
        `Failed to get attachments needing thumbnails: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
