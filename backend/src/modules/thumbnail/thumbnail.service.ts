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
}
