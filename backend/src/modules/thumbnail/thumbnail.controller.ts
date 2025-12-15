/**
 * Thumbnail Controller
 * REST API endpoints for thumbnail operations
 */

import { JwtAuthGuard } from '@modules/auth/auth.guard';
import {
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
   * Get queue statistics
   * GET /api/whatsapp/thumbnails/queue/stats
   */
  @Get('queue/stats')
  async getQueueStats() {
    const stats = await this.thumbnailQueueService.getQueueStats();
    const healthy = await this.thumbnailQueueService.isHealthy();

    return {
      ...stats,
      healthy,
    };
  }
}
