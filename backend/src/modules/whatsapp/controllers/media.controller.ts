/**
 * Media Controller
 * Handles API endpoints for media upload, download, and attachment management
 */

import { db } from '@database/db.connection';
import { senders } from '@database/schema';
import { JwtAuthGuard } from '@modules/auth/auth.guard';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, eq } from 'drizzle-orm';
import {
  DownloadUrlResponseDto,
  PresignedUrlResponseDto,
  RequestPresignedUrlDto,
  UploadCompletedDto,
} from '../dto/media.dto';
import { MediaService } from '../services/media.service';

@Controller('whatsapp/media')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(private mediaService: MediaService) {}

  /**
   * Request presigned URL for file upload
   * POST /whatsapp/media/presigned-url
   *
   * Request body:
   * {
   *   "fileName": "photo.jpg",
   *   "mimeType": "image/jpeg",
   *   "fileSize": 2048576
   * }
   *
   * Response:
   * {
   *   "uploadId": "uuid",
   *   "url": "https://s3-presigned-url...",
   *   "expiresIn": 300,
   *   "s3Key": "123/456/msg-789/original.jpg",
   *   "maxFileSize": 2048576
   * }
   */
  @Post('presigned-url')
  @UseGuards(JwtAuthGuard)
  async requestPresignedUrl(
    @Body() dto: RequestPresignedUrlDto,
    @Req() req: any,
    @Query('senderId') senderId?: string,
    @Query('contactId') contactId?: string,
  ): Promise<PresignedUrlResponseDto> {
    try {
      // Get user ID from JWT token
      const userId = req.user?.userId;
      if (!userId) {
        throw new BadRequestException('User not authenticated');
      }

      // Get sender ID from query or default to first sender
      let sender: any;
      if (senderId) {
        // Verify sender belongs to user
        sender = await db.query.senders.findFirst({
          where: and(
            eq(senders.id, parseInt(senderId)),
            eq(senders.userId, userId),
          ),
        });
        if (!sender) {
          throw new BadRequestException('Sender not found');
        }
      } else {
        // Get first sender for user
        sender = await db.query.senders.findFirst({
          where: eq(senders.userId, userId),
        });
        if (!sender) {
          throw new BadRequestException('No senders configured');
        }
      }

      // Get contact ID
      if (!contactId) {
        throw new BadRequestException('Contact ID is required');
      }

      // Log the presigned URL request
      this.logger.log(
        `Presigned URL requested by user ${userId}: fileName=${dto.fileName}, fileSize=${dto.fileSize}, contactId=${contactId}`,
      );

      return this.mediaService.requestPresignedUrl(dto, sender.id, contactId);
    } catch (error) {
      this.logger.error(
        `Error requesting presigned URL: ${error.message}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Upload file directly to S3 (server-side proxy)
   * POST /whatsapp/media/upload
   *
   * This endpoint avoids CORS issues by uploading files through the backend
   * instead of directly from the browser to S3.
   *
   * Form data:
   * - file: binary file data
   * - senderId: sender ID (query param)
   * - contactId: contact ID (query param)
   * - messageId: message ID for attachment (query param, optional)
   */
  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
    }),
  )
  async uploadFile(
    @UploadedFile() file: any,
    @Req() req: any,
    @Query('senderId') senderId?: string,
    @Query('contactId') contactId?: string,
    @Query('messageId') messageId?: string,
    @Query('attachmentId') attachmentId?: string,
  ): Promise<{
    success: boolean;
    uploadId: string;
    s3Key: string;
    attachment: any;
  }> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new BadRequestException('User not authenticated');
      }

      if (!file) {
        throw new BadRequestException('No file provided');
      }

      if (!senderId || !contactId) {
        throw new BadRequestException('senderId and contactId are required');
      }

      this.logger.log(
        `File upload started: ${file.originalname} (${file.size} bytes), senderId=${senderId}, attachmentId=${attachmentId}`,
      );

      const result = await this.mediaService.uploadFileToS3(
        file,
        parseInt(senderId),
        contactId,
        messageId,
        userId,
        attachmentId,
      );

      return {
        success: true,
        uploadId: result.id,
        s3Key: result.s3Key,
        attachment: result,
      };
    } catch (error) {
      this.logger.error(`Error uploading file: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Notify backend of completed upload
   * POST /whatsapp/media/upload-completed
   *
   * Request body:
   * {
   *   "uploadId": "uuid",
   *   "fileName": "photo.jpg",
   *   "mimeType": "image/jpeg",
   *   "fileSize": 2048576,
   *   "s3Key": "123/456/msg-789/original.jpg",
   *   "duration": 120 (optional, for audio/video)
   * }
   */
  @Post('upload-completed')
  @UseGuards(JwtAuthGuard)
  async uploadCompleted(
    @Body() dto: UploadCompletedDto,
    @Req() req: any,
    @Query('messageId') messageId?: string,
  ): Promise<{ success: boolean; attachment: any }> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new BadRequestException('User not authenticated');
      }

      if (!messageId) {
        throw new BadRequestException('Message ID is required');
      }

      this.logger.log(
        `Upload completed: uploadId=${dto.uploadId}, fileName=${dto.fileName}`,
      );

      const attachment = await this.mediaService.registerUploadCompletion(
        dto,
        messageId,
      );

      return {
        success: true,
        attachment,
      };
    } catch (error) {
      this.logger.error(
        `Error registering upload completion: ${error.message}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get Cloud API media stream
   * GET /whatsapp/media/cloud-api/:mediaId
   *
   * Returns the media file from Meta's Cloud API
   * MUST be before generic :messageId routes to match correctly
   */
  @Get('cloud-api/:mediaId')
  @UseGuards(JwtAuthGuard)
  async getCloudAPIMedia(
    @Param('mediaId') mediaId: string,
    @Req() req: any,
    @Res() res: any,
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new BadRequestException('User not authenticated');
      }

      this.logger.log(`Fetching Cloud API media: ${mediaId}`);

      const mediaBuffer = await this.mediaService.fetchCloudAPIMedia(mediaId);

      // Set appropriate headers
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      res.send(mediaBuffer);
    } catch (error) {
      this.logger.error(
        `Error fetching Cloud API media: ${error.message}`,
        error,
      );
      throw new BadRequestException(`Failed to fetch media: ${error.message}`);
    }
  }

  /**
   * Download/stream media file from S3
   * GET /whatsapp/media/:messageId/:attachmentId/stream
   *
   * This endpoint proxies S3 downloads to avoid CORS issues
   * Streams the file directly to the browser for download
   */
  @Get(':messageId/:attachmentId/stream')
  @UseGuards(JwtAuthGuard)
  async streamMedia(
    @Param('messageId') messageId: string,
    @Param('attachmentId') attachmentId: string,
    @Req() req: any,
    @Res() res: any,
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new BadRequestException('User not authenticated');
      }

      this.logger.log(
        `Media stream requested: messageId=${messageId}, attachmentId=${attachmentId}`,
      );

      const { buffer, mimeType, fileName } =
        await this.mediaService.getMediaStream(messageId, attachmentId);

      // Set appropriate headers for download/streaming
      res.setHeader('Content-Type', mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', buffer.length);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName || 'download'}"`,
      );
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours

      res.send(buffer);
    } catch (error) {
      this.logger.error(`Error streaming media: ${error.message}`, error);
      throw new BadRequestException(`Failed to stream media: ${error.message}`);
    }
  }

  /**
   * Get download URL for attachment
   * GET /whatsapp/media/:messageId/:attachmentId/download-url
   *
   * Query params:
   * - expiresIn: URL expiry in seconds (default: 3600)
   *
   * Response:
   * {
   *   "url": "https://s3-presigned-download-url...",
   *   "expiresIn": 3600,
   *   "fileName": "photo.jpg",
   *   "fileSize": 2048576,
   *   "mimeType": "image/jpeg"
   * }
   */
  @Get(':messageId/:attachmentId/download-url')
  @UseGuards(JwtAuthGuard)
  async getDownloadUrl(
    @Param('messageId') messageId: string,
    @Param('attachmentId') attachmentId: string,
    @Req() req: any,
    @Query('expiresIn') expiresIn?: number,
  ): Promise<DownloadUrlResponseDto> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new BadRequestException('User not authenticated');
      }

      this.logger.log(
        `Download URL requested: messageId=${messageId}, attachmentId=${attachmentId}`,
      );

      return this.mediaService.getDownloadUrl(
        messageId,
        attachmentId,
        expiresIn || 3600,
      );
    } catch (error) {
      this.logger.error(`Error getting download URL: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Get thumbnail URL (if available)
   * GET /whatsapp/media/:messageId/:attachmentId/thumbnail-url
   */
  @Get(':messageId/:attachmentId/thumbnail-url')
  @UseGuards(JwtAuthGuard)
  async getThumbnailUrl(
    @Param('messageId') messageId: string,
    @Param('attachmentId') attachmentId: string,
    @Req() req: any,
    @Query('expiresIn') expiresIn?: number,
  ): Promise<{ url: string | null }> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new BadRequestException('User not authenticated');
      }

      this.logger.log(
        `Thumbnail URL requested: messageId=${messageId}, attachmentId=${attachmentId}`,
      );

      const url = await this.mediaService.getThumbnailUrl(
        messageId,
        attachmentId,
        expiresIn || 3600,
      );

      return { url };
    } catch (error) {
      this.logger.error(`Error getting thumbnail URL: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Get all attachments for a message
   * GET /whatsapp/media/:messageId/attachments
   */
  @Get(':messageId/attachments')
  @UseGuards(JwtAuthGuard)
  async getMessageAttachments(
    @Param('messageId') messageId: string,
    @Req() req: any,
  ): Promise<{ attachments: any[] }> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new BadRequestException('User not authenticated');
      }

      this.logger.log(`Fetching attachments for message: ${messageId}`);

      const attachments =
        await this.mediaService.getMessageAttachments(messageId);

      return { attachments };
    } catch (error) {
      this.logger.error(
        `Error retrieving message attachments: ${error.message}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Delete attachment from message
   * DELETE /whatsapp/media/:messageId/:attachmentId
   */
  @Delete(':messageId/:attachmentId')
  @UseGuards(JwtAuthGuard)
  async deleteAttachment(
    @Param('messageId') messageId: string,
    @Param('attachmentId') attachmentId: string,
    @Req() req: any,
  ): Promise<{ success: boolean }> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new BadRequestException('User not authenticated');
      }

      this.logger.log(
        `Delete attachment requested: messageId=${messageId}, attachmentId=${attachmentId}`,
      );

      await this.mediaService.removeAttachmentFromMessage(
        messageId,
        attachmentId,
      );

      return { success: true };
    } catch (error) {
      this.logger.error(`Error deleting attachment: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Delete all attachments for a message
   * DELETE /whatsapp/media/:messageId
   */
  @Delete(':messageId')
  async deleteAllAttachments(
    @Param('messageId') messageId: string,
    @Req() req: any,
  ): Promise<{ success: boolean }> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new BadRequestException('User not authenticated');
      }

      this.logger.log(
        `Delete all attachments requested for message: ${messageId}`,
      );

      await this.mediaService.deleteMessageAttachments(messageId);

      return { success: true };
    } catch (error) {
      this.logger.error(
        `Error deleting message attachments: ${error.message}`,
        error,
      );
      throw error;
    }
  }
}
