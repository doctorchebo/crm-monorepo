/**
 * Media Service
 * Handles media message operations and file management
 */

import { db } from '@database/db.connection';
import { messages } from '@database/schema';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaCloudAPIConfigService } from '@shared/services/meta-cloud-api.config';
import { S3Service } from '@shared/services/s3.service';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { ThumbnailQueueService } from '../../thumbnail/thumbnail-queue.service';
import {
  ThumbnailJobData,
  supportsThumbnail,
} from '../../thumbnail/thumbnail.types';
import {
  DownloadUrlResponseDto,
  PresignedUrlResponseDto,
  RequestPresignedUrlDto,
  UploadCompletedDto,
} from '../dto/media.dto';
import {
  AttachmentMetadata,
  getMediaTypeFromMimeType,
  validateFileUpload,
} from '../types/media.types';
import {
  MediaAnalysisResult,
  MediaAnalyzerService,
} from './media-analyzer.service';

/**
 * Result of downloading and caching media with optional analysis
 */
export interface MediaCacheResult {
  /** S3 key where the media was cached (empty string if caching failed) */
  s3Key: string;

  /** Media analysis result (only for video content) */
  analysis?: MediaAnalysisResult;

  /** Whether the video was detected as a GIF */
  isGif?: boolean;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private thumbnailQueueService: ThumbnailQueueService | null = null;
  private mediaAnalyzerService: MediaAnalyzerService | null = null;

  constructor(
    private s3Service: S3Service,
    private configService: ConfigService,
    private metaCloudAPIConfig: MetaCloudAPIConfigService,
  ) {}

  /**
   * Set the thumbnail queue service (called during module initialization)
   * This avoids circular dependency issues
   */
  setThumbnailQueueService(service: ThumbnailQueueService): void {
    this.thumbnailQueueService = service;
  }

  /**
   * Set the media analyzer service (called during module initialization)
   * This avoids circular dependency issues
   */
  setMediaAnalyzerService(service: MediaAnalyzerService): void {
    this.mediaAnalyzerService = service;
    this.logger.log('MediaAnalyzerService injected into MediaService');
  }

  /**
   * Fetch media from Meta Cloud API
   *
   * According to Meta's WhatsApp Business Platform documentation:
   * https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media
   *
   * Process:
   * 1. Call GET /{media-id}?phone_number_id=<PHONE_NUMBER_ID> to retrieve media metadata including the download URL
   * 2. Download the actual media file using the provided URL with access token
   *
   * Note: Media URLs expire after 5 minutes, so we must fetch a fresh URL each time
   *
   * @param mediaId - The media ID returned by WhatsApp in the inbound message
   * @returns Buffer containing the media file
   */
  async fetchCloudAPIMedia(mediaId: string): Promise<Buffer> {
    try {
      // Step 1: Get media metadata from Meta Cloud API
      // The token will be sent via Authorization header
      const metadataUrl = this.metaCloudAPIConfig.buildEndpoint(mediaId);

      this.logger.debug(`Fetching media metadata from: ${metadataUrl}`);
      this.logger.log(
        `[Media Fetch] Step 1: Getting metadata for mediaId: ${mediaId}`,
      );

      const metadataResponse = await fetch(metadataUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.metaCloudAPIConfig.getAccessToken()}`,
        },
      });

      this.logger.log(
        `[Media Fetch] Step 1 Response Status: ${metadataResponse.status} ${metadataResponse.statusText}`,
      );

      if (!metadataResponse.ok) {
        const errorText = await metadataResponse.text();
        this.logger.error(
          `[Media Fetch] Meta API error (${metadataResponse.status}): ${errorText}`,
        );

        // Try to parse as JSON for error details
        try {
          const errorJson = JSON.parse(errorText);
          this.logger.error(
            `[Media Fetch] Facebook error response: ${JSON.stringify(errorJson, null, 2)}`,
          );
        } catch {
          this.logger.error(`[Media Fetch] Raw error response: ${errorText}`);
        }

        throw new Error(
          `Failed to get media metadata from Meta API: ${metadataResponse.status} ${metadataResponse.statusText} - ${errorText}`,
        );
      }

      const mediaMetadata = (await metadataResponse.json()) as any;
      this.logger.log(
        `[Media Fetch] Step 1 Success. Metadata: ${JSON.stringify(mediaMetadata, null, 2)}`,
      );

      if (!mediaMetadata.url) {
        this.logger.error(
          `[Media Fetch] No download URL in Meta response. Full response: ${JSON.stringify(mediaMetadata, null, 2)}`,
        );
        throw new Error(
          'Meta API did not return a media download URL. Response: ' +
            JSON.stringify(mediaMetadata),
        );
      }

      // Step 2: Download the actual media file using the URL from metadata
      this.logger.log(
        `[Media Fetch] Step 2: Downloading from URL: ${mediaMetadata.url}`,
      );

      const downloadResponse = await fetch(mediaMetadata.url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.metaCloudAPIConfig.getAccessToken()}`,
        },
      });

      this.logger.log(
        `[Media Fetch] Step 2 Response Status: ${downloadResponse.status} ${downloadResponse.statusText}`,
      );

      if (!downloadResponse.ok) {
        const downloadErrorText = await downloadResponse.text();
        this.logger.error(
          `[Media Fetch] Failed to download media file (${downloadResponse.status}): ${downloadErrorText}`,
        );
        throw new Error(
          `Failed to download media file: ${downloadResponse.status} ${downloadResponse.statusText}`,
        );
      }

      const buffer = await downloadResponse.arrayBuffer();
      this.logger.log(
        `[Media Fetch] Step 2 Success. Downloaded ${buffer.byteLength} bytes for mediaId: ${mediaId}`,
      );

      return Buffer.from(buffer);
    } catch (error) {
      this.logger.error(
        `Error fetching Cloud API media ${mediaId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Download Cloud API media and cache it in S3
   * This is called when receiving inbound messages with media
   *
   * Meta's media URLs expire after 5 minutes, so we must download and cache immediately
   * upon receipt to ensure the media is always accessible
   *
   * For video content, this method also analyzes the media to detect GIFs
   * (which WhatsApp converts to MP4 videos)
   *
   * @param mediaId - The media ID from Meta
   * @param mimeType - The MIME type of the media
   * @param contactId - The contact ID for organizing in S3
   * @param fileName - Optional file name (fallback to mediaId)
   * @returns MediaCacheResult with S3 key and optional analysis for video content
   */
  async downloadAndCacheCloudAPIMedia(
    mediaId: string,
    mimeType: string,
    contactId: string,
    fileName?: string,
  ): Promise<MediaCacheResult> {
    try {
      this.logger.log(
        `[Cache Media] Starting to download and cache Cloud API media: ${mediaId}`,
      );

      // Step 1: Download from Meta Cloud API
      const mediaBuffer = await this.fetchCloudAPIMedia(mediaId);
      this.logger.log(
        `[Cache Media] Downloaded ${mediaBuffer.length} bytes from Meta`,
      );

      // Step 2: Generate S3 key for inbound media
      // Use a special "inbound" sender ID to distinguish from user uploads
      // Format: inbound/{contactId}/{mediaId}/{fileName}
      const fileExtension = fileName?.split('.').pop() || '';
      const finalFileName = fileName || `${mediaId}.media`;
      const s3Key = `inbound/${contactId}/${mediaId}/${finalFileName}`;

      this.logger.log(
        `[Cache Media] Uploading to S3 with key: ${s3Key} (${mediaBuffer.length} bytes, mimeType: ${mimeType})`,
      );

      // Step 3: Upload to S3 for persistent storage
      const result = await this.s3Service.uploadFile(
        s3Key,
        mediaBuffer,
        mimeType,
      );

      this.logger.log(
        `[Cache Media] Successfully cached media to S3: ${result.key}`,
      );

      // Step 4: For video content, analyze to detect GIFs
      // WhatsApp converts GIFs to MP4 videos, so we need to detect them by characteristics
      let analysis: MediaAnalysisResult | undefined;
      let isGif = false;

      if (mimeType.startsWith('video/') && this.mediaAnalyzerService) {
        this.logger.log(
          `[Cache Media] Analyzing video content for GIF detection...`,
        );
        try {
          analysis = await this.mediaAnalyzerService.analyzeBuffer(
            mediaBuffer,
            mimeType,
          );
          isGif = analysis.isLikelyGif;
          this.logger.log(
            `[Cache Media] Video analysis complete: ` +
              `duration=${analysis.duration?.toFixed(2)}s, ` +
              `hasAudio=${analysis.hasAudio}, ` +
              `gifConfidence=${(analysis.gifConfidence * 100).toFixed(1)}%, ` +
              `isGif=${isGif}`,
          );
        } catch (analysisError) {
          this.logger.warn(
            `[Cache Media] Video analysis failed (non-blocking): ${analysisError.message}`,
          );
          // Continue without analysis - better to have the media than fail completely
        }
      }

      return {
        s3Key: result.key,
        analysis,
        isGif,
      };
    } catch (error) {
      this.logger.error(
        `[Cache Media] FAILED to cache Cloud API media ${mediaId}: ${error.message}`,
        error instanceof Error ? error.stack : '',
      );
      // Don't throw - allow message to be stored with cloud-api:// reference as fallback
      this.logger.warn(
        `[Cache Media] Falling back to cloud-api:// reference for media ${mediaId}`,
      );
      return { s3Key: '', isGif: false };
    }
  }

  /**
   * Generate presigned URL for file upload
   * Validates file and returns S3 presigned URL for direct client upload
   */
  async requestPresignedUrl(
    dto: RequestPresignedUrlDto,
    senderId: number,
    contactId: string,
  ): Promise<PresignedUrlResponseDto> {
    try {
      // Validate file upload
      const validation = validateFileUpload(
        dto.fileName,
        dto.mimeType,
        dto.fileSize,
      );

      if (!validation.valid) {
        this.logger.warn(
          `File validation failed: ${validation.errors.join(', ')}`,
        );
        throw new BadRequestException({
          message: 'File validation failed',
          errors: validation.errors,
        });
      }

      // Generate unique message ID if not provided
      const messageId = dto.messageId || `msg-${uuidv4()}`;

      // Generate presigned URL
      const presignedData = await this.s3Service.generatePresignedUploadUrl(
        senderId,
        contactId,
        messageId,
        dto.fileName,
        dto.mimeType,
      );

      this.logger.log(
        `Presigned URL generated for upload: ${dto.fileName} (${(dto.fileSize / 1024 / 1024).toFixed(2)}MB)`,
      );

      return {
        uploadId: presignedData.uploadId,
        url: presignedData.url,
        expiresIn: presignedData.expiresIn,
        s3Key: presignedData.s3Key,
        maxFileSize: dto.fileSize,
      };
    } catch (error) {
      this.logger.error(
        `Error generating presigned URL: ${error.message}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Register completed upload and store attachment metadata
   */
  async registerUploadCompletion(
    dto: UploadCompletedDto,
    messageId: string,
  ): Promise<AttachmentMetadata> {
    try {
      // Validate S3 key format
      if (!dto.s3Key) {
        throw new BadRequestException('S3 key is required');
      }

      // Get file metadata from S3 to verify upload
      const fileMetadata = await this.s3Service.getFileMetadata(dto.s3Key);

      if (!fileMetadata) {
        this.logger.warn(`File not found in S3: ${dto.s3Key}`);
        throw new BadRequestException('File not found in S3');
      }

      // Verify file size matches
      if (fileMetadata.size !== dto.fileSize) {
        this.logger.warn(
          `File size mismatch for ${dto.s3Key}: expected ${dto.fileSize}, got ${fileMetadata.size}`,
        );
        throw new BadRequestException('File size mismatch');
      }

      // Determine media type
      const mediaType = getMediaTypeFromMimeType(dto.mimeType);
      if (!mediaType) {
        throw new BadRequestException(
          `Unsupported media type: ${dto.mimeType}`,
        );
      }

      // Determine thumbnail status
      const thumbnailStatus = supportsThumbnail(mediaType)
        ? 'pending'
        : 'not-applicable';

      // Create attachment metadata
      const attachment: AttachmentMetadata = {
        id: dto.uploadId,
        type: mediaType,
        fileName: dto.fileName,
        mimeType: dto.mimeType,
        size: dto.fileSize,
        s3Key: dto.s3Key,
        thumbnailStatus: thumbnailStatus,
        duration: dto.duration,
        uploadedAt: new Date().toISOString(),
        status: 'success',
      };

      // Update message with the completed attachment
      const message = await db.query.messages.findFirst({
        where: eq(messages.messageId, messageId),
      });

      if (message) {
        const existingAttachments = (message.attachments ||
          []) as AttachmentMetadata[];

        // Find and update the placeholder attachment with the same uploadId
        const updatedAttachments = existingAttachments.map((att) =>
          att.id === dto.uploadId ? attachment : att,
        );

        // If no attachment with this uploadId was found, add it
        if (!updatedAttachments.some((att) => att.id === dto.uploadId)) {
          updatedAttachments.push(attachment);
        }

        // Update the message with the new attachments array
        await db
          .update(messages)
          .set({ attachments: updatedAttachments as any })
          .where(eq(messages.messageId, messageId));

        this.logger.log(
          `Updated message ${messageId} with attachment: ${dto.fileName}`,
        );
      }

      // Queue thumbnail generation for image/video
      if (this.thumbnailQueueService && supportsThumbnail(mediaType)) {
        try {
          // Extract senderId and contactId from S3 key
          // Format: {senderId}/{contactId}/{messageId}/original.{ext}
          const keyParts = dto.s3Key.split('/');
          const senderId = keyParts[0] || '';
          const contactId = keyParts[1] || '';

          const thumbnailJobData: ThumbnailJobData = {
            messageId: messageId,
            attachmentId: dto.uploadId,
            s3Key: dto.s3Key,
            mediaType: mediaType,
            mimeType: dto.mimeType,
            chatId: message?.chatId || '',
            pathPrefix: senderId,
            contactId: contactId,
          };

          await this.thumbnailQueueService.queueThumbnailGeneration(
            thumbnailJobData,
          );
          this.logger.log(
            `[Upload] ✅ Queued thumbnail generation for ${dto.uploadId}`,
          );
        } catch (error) {
          this.logger.warn(
            `[Upload] ⚠️ Failed to queue thumbnail generation: ${error.message}`,
          );
          // Don't fail the upload - thumbnail will remain pending
        }
      }

      this.logger.log(
        `Upload completed and registered: ${dto.fileName} (${attachment.id})`,
      );

      return attachment;
    } catch (error) {
      this.logger.error(`Error registering upload: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Get presigned download URL for attachment
   */
  async getDownloadUrl(
    messageId: string,
    attachmentId: string,
    expiresIn: number = 3600,
  ): Promise<DownloadUrlResponseDto> {
    try {
      // Retrieve message and verify it exists
      const message = await db.query.messages.findFirst({
        where: eq(messages.messageId, messageId),
      });

      if (!message) {
        throw new BadRequestException('Message not found');
      }

      // Get attachments from JSONB
      const attachmentsList = (message.attachments ||
        []) as AttachmentMetadata[];
      const attachment = attachmentsList.find((a) => a.id === attachmentId);

      if (!attachment) {
        throw new BadRequestException('Attachment not found');
      }

      // CRITICAL: Check S3 key first (inbound media cached from Meta)
      // S3 cached media is preferred because Meta URLs expire after 5 minutes
      if (attachment.s3Key) {
        const downloadData = await this.s3Service.generatePresignedDownloadUrl(
          attachment.s3Key,
          { expiresIn },
        );

        this.logger.log(
          `Download URL generated for cached S3 media: ${attachment.fileName} (expires in ${expiresIn}s)`,
        );

        return {
          url: downloadData.url,
          expiresIn: downloadData.expiresIn,
          fileName: attachment.fileName,
          fileSize: attachment.size,
          mimeType: attachment.mimeType,
        };
      }

      // Fallback: Check if this is a Cloud API media (inbound from Meta)
      // Only used if S3 caching failed when message was received
      if (attachment.mediaUrl?.startsWith('cloud-api://')) {
        // For inbound Cloud API media, return the Cloud API reference
        // The client will need to fetch this through our backend endpoint
        // that has access to the Meta access token
        const mediaId = attachment.mediaUrl.replace('cloud-api://', '');

        this.logger.warn(
          `Using Cloud API fallback for media ${attachment.fileName} - S3 cache was not available`,
        );

        return {
          url: `cloud-api://${mediaId}`,
          expiresIn: 3600, // Cloud API URLs expire quickly, set shorter expiry
          fileName: attachment.fileName,
          fileSize: attachment.size,
          mimeType: attachment.mimeType,
        };
      }

      // If neither S3 key nor cloud-api reference is available, throw error
      throw new BadRequestException(
        `Attachment ${attachmentId} has no accessible media source (no S3 key or Cloud API reference)`,
      );
    } catch (error) {
      this.logger.error(
        `Error generating download URL: ${error.message}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get media as buffer for streaming (proxied download)
   * Avoids CORS issues by streaming through the backend
   */
  async getMediaStream(
    messageId: string,
    attachmentId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    try {
      // Retrieve message and verify it exists
      const message = await db.query.messages.findFirst({
        where: eq(messages.messageId, messageId),
      });

      if (!message) {
        throw new BadRequestException('Message not found');
      }

      // Get attachments from JSONB
      const attachmentsList = (message.attachments ||
        []) as AttachmentMetadata[];
      const attachment = attachmentsList.find((a) => a.id === attachmentId);

      if (!attachment) {
        throw new BadRequestException('Attachment not found');
      }

      // Download from S3 if we have a key
      if (attachment.s3Key) {
        const buffer = await this.s3Service.downloadFile(attachment.s3Key);

        if (!buffer) {
          throw new BadRequestException('Failed to download media from S3');
        }

        this.logger.log(
          `Media streamed for: ${attachment.fileName} (${buffer.length} bytes)`,
        );

        return {
          buffer,
          mimeType: attachment.mimeType || 'application/octet-stream',
          fileName: attachment.fileName || 'download',
        };
      }

      // Fallback to Cloud API
      if (attachment.mediaUrl?.startsWith('cloud-api://')) {
        const mediaId = attachment.mediaUrl.replace('cloud-api://', '');
        const buffer = await this.fetchCloudAPIMedia(mediaId);

        return {
          buffer,
          mimeType: attachment.mimeType || 'application/octet-stream',
          fileName: attachment.fileName || 'download',
        };
      }

      throw new BadRequestException(
        `Attachment ${attachmentId} has no accessible media source`,
      );
    } catch (error) {
      this.logger.error(`Error streaming media: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Get thumbnail download URL (if available)
   */
  async getThumbnailUrl(
    messageId: string,
    attachmentId: string,
    expiresIn: number = 3600,
  ): Promise<string | null> {
    try {
      // Retrieve message
      const message = await db.query.messages.findFirst({
        where: eq(messages.messageId, messageId),
      });

      if (!message) {
        this.logger.warn(`getThumbnailUrl: Message not found: ${messageId}`);
        return null;
      }

      // Get attachment
      const attachmentsList = (message.attachments ||
        []) as AttachmentMetadata[];
      const attachment = attachmentsList.find((a) => a.id === attachmentId);

      if (!attachment) {
        this.logger.warn(
          `getThumbnailUrl: Attachment not found: ${attachmentId} in message ${messageId}`,
        );
        return null;
      }

      if (!attachment.thumbnailKey) {
        this.logger.warn(
          `getThumbnailUrl: No thumbnailKey for attachment ${attachmentId}: ${JSON.stringify(attachment)}`,
        );
        return null;
      }

      this.logger.log(
        `getThumbnailUrl: Generating URL for thumbnailKey: ${attachment.thumbnailKey}`,
      );

      // Generate download URL for thumbnail
      const downloadData = await this.s3Service.generatePresignedDownloadUrl(
        attachment.thumbnailKey,
        { expiresIn },
      );

      this.logger.log(
        `getThumbnailUrl: Generated URL successfully for ${attachmentId}`,
      );
      return downloadData.url;
    } catch (error) {
      this.logger.error(`Error generating thumbnail URL: ${error.message}`);
      return null;
    }
  }

  /**
   * Add attachment to message
   */
  async addAttachmentToMessage(
    messageId: string,
    attachment: AttachmentMetadata,
  ): Promise<void> {
    try {
      // Retrieve message
      const message = await db.query.messages.findFirst({
        where: eq(messages.messageId, messageId),
      });

      if (!message) {
        throw new BadRequestException('Message not found');
      }

      // Get existing attachments
      const attachments = (message.attachments || []) as AttachmentMetadata[];

      // Add new attachment
      attachments.push(attachment);

      // Update message with new attachments
      await db
        .update(messages)
        .set({
          attachments: attachments as any,
          updatedAt: new Date(),
        })
        .where(eq(messages.messageId, messageId));

      this.logger.log(
        `Attachment added to message ${messageId}: ${attachment.fileName}`,
      );
    } catch (error) {
      this.logger.error(
        `Error adding attachment to message: ${error.message}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Remove attachment from message
   */
  async removeAttachmentFromMessage(
    messageId: string,
    attachmentId: string,
  ): Promise<void> {
    try {
      // Retrieve message
      const message = await db.query.messages.findFirst({
        where: eq(messages.messageId, messageId),
      });

      if (!message) {
        throw new BadRequestException('Message not found');
      }

      // Get attachments
      const attachments = (message.attachments || []) as AttachmentMetadata[];
      const attachment = attachments.find((a) => a.id === attachmentId);

      if (!attachment) {
        throw new BadRequestException('Attachment not found');
      }

      // Delete from S3
      try {
        await this.s3Service.deleteFile(attachment.s3Key);
        if (attachment.thumbnailKey) {
          await this.s3Service.deleteFile(attachment.thumbnailKey);
        }
      } catch (s3Error) {
        this.logger.warn(
          `Failed to delete S3 files for attachment: ${s3Error.message}`,
        );
        // Continue even if S3 deletion fails
      }

      // Remove from attachments array
      const updatedAttachments = attachments.filter(
        (a) => a.id !== attachmentId,
      );

      // Update message
      await db
        .update(messages)
        .set({
          attachments: updatedAttachments as any,
          updatedAt: new Date(),
        })
        .where(eq(messages.messageId, messageId));

      this.logger.log(
        `Attachment removed from message ${messageId}: ${attachment.fileName}`,
      );
    } catch (error) {
      this.logger.error(`Error removing attachment: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Get all attachments for a message
   */
  async getMessageAttachments(
    messageId: string,
  ): Promise<AttachmentMetadata[]> {
    try {
      const message = await db.query.messages.findFirst({
        where: eq(messages.messageId, messageId),
      });

      if (!message) {
        throw new BadRequestException('Message not found');
      }

      return (message.attachments || []) as AttachmentMetadata[];
    } catch (error) {
      this.logger.error(`Error retrieving attachments: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete all attachments for a message
   */
  async deleteMessageAttachments(messageId: string): Promise<void> {
    try {
      const attachments = await this.getMessageAttachments(messageId);

      // Delete all S3 files
      for (const attachment of attachments) {
        try {
          await this.s3Service.deleteFile(attachment.s3Key);
          if (attachment.thumbnailKey) {
            await this.s3Service.deleteFile(attachment.thumbnailKey);
          }
        } catch (s3Error) {
          this.logger.warn(
            `Failed to delete S3 file: ${attachment.s3Key}`,
            s3Error,
          );
        }
      }

      // Clear attachments from message
      await db
        .update(messages)
        .set({
          attachments: [],
          updatedAt: new Date(),
        })
        .where(eq(messages.messageId, messageId));

      this.logger.log(`All attachments deleted for message: ${messageId}`);
    } catch (error) {
      this.logger.error(
        `Error deleting message attachments: ${error.message}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Upload file directly to S3 (backend-side upload)
   * This avoids CORS issues by proxying the upload through the backend
   */
  async uploadFileToS3(
    file: any,
    senderId: number,
    contactId: string,
    messageId?: string,
    userId?: number,
    attachmentId?: string,
  ): Promise<AttachmentMetadata> {
    try {
      // Use provided attachmentId from frontend, or generate a new one
      const uploadId =
        attachmentId || file.originalname.split('.')[0] + '-' + Date.now();
      const finalMessageId = messageId || `msg-${uuidv4()}`;

      // Generate S3 key
      const s3Key = `${senderId}/${contactId}/${finalMessageId}/${file.originalname}`;

      // Upload file to S3
      await this.s3Service.uploadFile(s3Key, file.buffer, file.mimetype);

      this.logger.log(`File uploaded to S3: ${file.originalname} → ${s3Key}`);

      // Determine media type
      const mediaType = getMediaTypeFromMimeType(file.mimetype);
      if (!mediaType) {
        throw new BadRequestException(
          `Unsupported media type: ${file.mimetype}`,
        );
      }

      // Determine thumbnail status
      const thumbnailStatus = supportsThumbnail(mediaType, file.mimetype)
        ? 'pending'
        : 'not-applicable';

      // Create attachment metadata
      const attachment: AttachmentMetadata = {
        id: uploadId,
        type: mediaType,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        s3Key,
        thumbnailStatus,
        uploadedAt: new Date().toISOString(),
        status: 'success',
      };

      // If messageId was provided, update the message with this attachment
      if (messageId) {
        this.logger.log(
          `Looking up message ${messageId} to update attachment ${uploadId}`,
        );

        const message = await db.query.messages.findFirst({
          where: eq(messages.messageId, messageId),
        });

        if (!message) {
          this.logger.warn(
            `Message ${messageId} not found - cannot update attachment. ` +
              `File was uploaded to S3 at ${s3Key} but message record doesn't exist yet.`,
          );
        } else {
          this.logger.log(
            `Found message ${messageId}, existing attachments: ${JSON.stringify(message.attachments)}`,
          );
        }

        if (message) {
          const existingAttachments = (message.attachments ||
            []) as AttachmentMetadata[];

          // Find existing placeholder attachment to preserve any extra metadata (e.g., isVoiceNote, waveformData)
          const existingPlaceholder = existingAttachments.find(
            (a) => a.id === uploadId && (!a.s3Key || a.s3Key === ''),
          );

          // Remove placeholder attachment with matching ID (more reliable than fileName)
          const filteredAttachments = existingAttachments.filter(
            (a) => a.id !== uploadId || (a.s3Key && a.s3Key !== ''),
          );

          this.logger.log(
            `Placeholder found: ${!!existingPlaceholder}, filtered attachments count: ${filteredAttachments.length}`,
          );

          // Merge placeholder metadata with uploaded attachment (preserve isVoiceNote, waveformData, etc.)
          const mergedAttachment = {
            ...existingPlaceholder,
            ...attachment,
          };

          this.logger.log(
            `Merged attachment s3Key: ${mergedAttachment.s3Key}, id: ${mergedAttachment.id}`,
          );

          // Add the real attachment
          const updatedAttachments = [...filteredAttachments, mergedAttachment];

          await db
            .update(messages)
            .set({ attachments: updatedAttachments as any })
            .where(eq(messages.messageId, messageId));

          this.logger.log(
            `Updated message ${messageId} with attachment: ${file.originalname}, s3Key: ${mergedAttachment.s3Key}`,
          );

          // Emit socket event so frontend can update cached message
          try {
            const { whatsAppGatewayInstance } =
              await import('../whatsapp.gateway.js');
            if (whatsAppGatewayInstance) {
              whatsAppGatewayInstance.emitAttachmentUpdated({
                messageId,
                chatId: message.chatId || '',
                attachmentId: uploadId,
                s3Key: mergedAttachment.s3Key,
                thumbnailStatus: mergedAttachment.thumbnailStatus,
              });
            }
          } catch (gatewayError) {
            this.logger.warn(
              `Could not emit attachment update: ${gatewayError.message}`,
            );
          }

          // Queue thumbnail generation for supported media types
          if (
            this.thumbnailQueueService &&
            supportsThumbnail(mediaType, file.mimetype)
          ) {
            try {
              const thumbnailJobData: ThumbnailJobData = {
                messageId: finalMessageId,
                attachmentId: uploadId,
                s3Key: s3Key,
                mediaType: mediaType,
                mimeType: file.mimetype,
                chatId: message.chatId || '',
                pathPrefix: String(senderId),
                contactId: contactId,
              };

              await this.thumbnailQueueService.queueThumbnailGeneration(
                thumbnailJobData,
              );
              this.logger.log(
                `[Outbound Upload] ✅ Queued thumbnail generation for ${file.originalname}`,
              );
            } catch (error) {
              this.logger.warn(
                `[Outbound Upload] ⚠️ Failed to queue thumbnail generation: ${error.message}`,
              );
              // Don't fail the upload - thumbnail will remain pending
            }
          }
        }
      }

      return attachment;
    } catch (error) {
      this.logger.error(`Error uploading file to S3: ${error.message}`, error);
      throw error;
    }
  }
}
