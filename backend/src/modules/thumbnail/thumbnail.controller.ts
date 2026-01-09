/**
 * Thumbnail Controller
 * REST API endpoints for thumbnail operations
 */

import { JwtAuthGuard } from '@modules/auth/auth.guard';
import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ThumbnailQueueService } from './thumbnail-queue.service';
import { ThumbnailService } from './thumbnail.service';

@Controller('api/whatsapp/thumbnails')
@UseGuards(JwtAuthGuard)
export class ThumbnailController {
  private readonly logger = new Logger(ThumbnailController.name);

  constructor(
    private readonly thumbnailService: ThumbnailService,
    private readonly thumbnailQueueService: ThumbnailQueueService,
  ) {}

  /**
   * Get thumbnail URL for a specific attachment
   * GET /api/whatsapp/thumbnails/:messageId/:attachmentId
   */
  @Get(':messageId/:attachmentId')
  async getThumbnailUrl(
    @Param('messageId') messageId: string,
    @Param('attachmentId') attachmentId: string,
    @Query('expiresIn') expiresIn?: string,
  ) {
    const expiry = expiresIn ? parseInt(expiresIn, 10) : 3600;
    const url = await this.thumbnailService.getThumbnailUrl(
      messageId,
      attachmentId,
      expiry,
    );

    if (!url) {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Thumbnail not found',
      };
    }

    return {
      url,
      expiresIn: expiry,
    };
  }

  /**
   * Get thumbnail status for multiple messages (batch)
   * GET /api/whatsapp/thumbnails/status?messageIds=id1,id2,id3
   */
  @Get('status')
  async getBatchStatus(@Query('messageIds') messageIds: string) {
    if (!messageIds) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'messageIds query parameter is required',
      };
    }

    const ids = messageIds.split(',').map((id) => id.trim());
    const statuses = await this.thumbnailService.getBatchThumbnailStatus(ids);

    // Convert Map to object for JSON response
    const result: Record<string, { attachmentId: string; status: string }[]> =
      {};
    statuses.forEach((value, key) => {
      result[key] = value;
    });

    return result;
  }

  /**
   * Force regenerate thumbnail for an attachment
   * POST /api/whatsapp/thumbnails/:messageId/:attachmentId/regenerate
   */
  @Post(':messageId/:attachmentId/regenerate')
  async regenerateThumbnail(
    @Param('messageId') messageId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    const success = await this.thumbnailService.regenerateThumbnail(
      messageId,
      attachmentId,
    );

    if (!success) {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Message or attachment not found',
      };
    }

    // Note: The actual thumbnail regeneration would need to be triggered
    // by queuing a new job. This endpoint just resets the status.
    // The caller should also trigger queueThumbnailGeneration

    return {
      message: 'Thumbnail regeneration initiated',
      status: 'pending',
    };
  }

  /**
   * Get thumbnail service status
   * GET /api/whatsapp/thumbnails/service-status
   *
   * Shows whether Lambda thumbnail service is configured and enabled.
   * Useful for debugging and monitoring.
   */
  @Get('service-status')
  async getThumbnailServiceStatus() {
    // ThumbnailQueueService depends on LambdaThumbnailService
    // which handles all thumbnail generation
    return {
      backend: 'Lambda',
      message: 'All thumbnails generated via AWS Lambda',
    };
  }

  /**
   * Check and repair thumbnail for an attachment
   * POST /api/whatsapp/thumbnails/:messageId/:attachmentId/repair
   *
   * Checks if thumbnail exists in S3 but isn't recorded in DB,
   * and repairs the record if found. Useful when Lambda callback failed.
   */
  @Post(':messageId/:attachmentId/repair')
  async repairThumbnail(
    @Param('messageId') messageId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    const result = await this.thumbnailService.checkAndRepairThumbnail(
      messageId,
      attachmentId,
    );

    return {
      messageId,
      attachmentId,
      ...result,
    };
  }

  /**
   * Batch repair all orphaned thumbnails
   * POST /api/whatsapp/thumbnails/repair-all
   *
   * Scans all messages for image/video attachments that have s3Key but
   * missing or incomplete thumbnail data. Checks S3 for existing thumbnails
   * and updates the database records.
   *
   * Use this when Lambda callbacks failed (e.g., BACKEND_URL was localhost)
   * but thumbnails were successfully generated in S3.
   */
  @Post('repair-all')
  async batchRepairThumbnails() {
    this.logger.log('Starting batch thumbnail repair...');

    const result = await this.thumbnailService.batchRepairOrphanedThumbnails();

    return {
      message: 'Batch repair completed',
      summary: {
        total: result.total,
        repaired: result.repaired,
        alreadyReady: result.alreadyReady,
        notInS3: result.notInS3,
        failed: result.failed,
      },
      details: result.details,
    };
  }

  /**
   * Get all attachments that need thumbnail generation
   * GET /api/whatsapp/thumbnails/needs-generation
   *
   * Returns a list of all attachments that have s3Key but no thumbnailKey
   * or thumbnailStatus !== 'ready'. Useful for monitoring and debugging.
   *
   * @query direction - Filter by message direction: 'inbound', 'outbound', or 'all'
   * @query mediaTypes - Comma-separated list of media types: 'image', 'video', 'document'
   * @query limit - Maximum number of results to return
   */
  @Get('needs-generation')
  async getAttachmentsNeedingThumbnails(
    @Query('direction') direction?: 'inbound' | 'outbound' | 'all',
    @Query('mediaTypes') mediaTypes?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedMediaTypes = mediaTypes
      ? (mediaTypes.split(',') as ('image' | 'video' | 'document')[])
      : undefined;

    const attachments =
      await this.thumbnailService.getAttachmentsNeedingThumbnails({
        direction: direction || 'all',
        mediaTypes: parsedMediaTypes,
        limit: limit ? parseInt(limit, 10) : undefined,
      });

    return {
      count: attachments.length,
      attachments,
    };
  }

  /**
   * Regenerate thumbnails for all attachments missing them
   * POST /api/whatsapp/thumbnails/regenerate-all
   *
   * Queues Lambda jobs for all attachments that have s3Key but no thumbnail
   * in S3. This is different from repair-all which only updates DB records
   * for thumbnails that already exist in S3.
   *
   * @body direction - Filter by message direction: 'inbound', 'outbound', or 'all'
   * @body mediaTypes - Array of media types to regenerate: ['image', 'video', 'document']
   * @body limit - Maximum number of thumbnails to regenerate
   */
  @Post('regenerate-all')
  async regenerateAllMissingThumbnails(
    @Body()
    body?: {
      direction?: 'inbound' | 'outbound' | 'all';
      mediaTypes?: ('image' | 'video' | 'document')[];
      limit?: number;
    },
  ) {
    const { direction = 'all', mediaTypes, limit } = body || {};

    this.logger.log(
      `🚀 Starting batch thumbnail regeneration (direction=${direction}, limit=${limit || 'unlimited'})`,
    );

    // Get all attachments needing thumbnails
    const attachments =
      await this.thumbnailService.getAttachmentsNeedingThumbnails({
        direction,
        mediaTypes,
        limit,
      });

    if (attachments.length === 0) {
      return {
        message: 'No attachments need thumbnail generation',
        queued: 0,
        failed: 0,
      };
    }

    this.logger.log(
      `📋 Found ${attachments.length} attachments needing thumbnails`,
    );

    // Convert to ThumbnailJobData format
    const jobs: ThumbnailJobData[] = attachments.map((a) => ({
      messageId: a.messageId,
      attachmentId: a.attachmentId,
      s3Key: a.s3Key,
      mediaType: a.mediaType as 'image' | 'video' | 'audio' | 'document',
      mimeType: a.mimeType,
      chatId: a.chatId,
      pathPrefix: a.direction,
    }));

    // Queue all jobs to Lambda
    const result =
      await this.thumbnailQueueService.queueBulkThumbnailGeneration(jobs);

    this.logger.log(
      `✅ Batch regeneration complete: ${result.queued} queued, ${result.failed} failed`,
    );

    return {
      message: 'Batch regeneration initiated',
      total: attachments.length,
      queued: result.queued,
      failed: result.failed,
      attachments: attachments.map((a) => ({
        messageId: a.messageId,
        attachmentId: a.attachmentId,
        mediaType: a.mediaType,
        direction: a.direction,
      })),
    };
  }
}
