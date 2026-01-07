/**
 * Knowledge Base Media Controller
 *
 * REST API endpoints for managing media attached to knowledge base objects.
 *
 * Endpoints:
 * - POST /knowledge-base/media/initiate - Start media upload
 * - POST /knowledge-base/media/:id/confirm - Confirm upload complete
 * - GET /knowledge-base/media/:id - Get media details
 * - GET /knowledge-base/media/:id/download - Get download URL
 * - PATCH /knowledge-base/media/:id - Update media metadata
 * - PATCH /knowledge-base/media/:id/ai-permission - Update AI settings
 * - DELETE /knowledge-base/media/:id - Delete media
 * - GET /knowledge-base/objects/:objectId/media - List object media
 * - POST /knowledge-base/media/check-eligibility - Check AI eligibility
 * - POST /knowledge-base/media/check-guardrails - Check guardrails
 * - GET /knowledge-base/media-decisions/:chatId - Get decision audit logs
 * - POST /knowledge-base/media-decisions/:auditId/feedback - Submit feedback
 */

import { JwtAuthGuard } from '@modules/auth/auth.guard';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  getMaxKbUploadLimit,
  KB_OBJECT_MEDIA_LIMIT,
} from '@shared/constants/whatsapp-media-limits';
import {
  CheckMediaEligibilityDto,
  CheckMediaGuardrailsDto,
  ConfirmMediaUploadDto,
  InitiateMediaUploadDto,
  ListMediaQueryDto,
  MediaFeedbackDto,
  ProxyUploadDto,
  QueryMediaDecisionLogsDto,
  UpdateMediaAiPermissionDto,
  UpdateMediaDto,
} from './dto/media.dto';
import {
  KbMediaService,
  KbThumbnailService,
  MediaDecisionAuditService,
  MediaGuardrailsService,
  MediaOrchestratorService,
} from './services';

// Get the maximum upload limit from centralized constants (100MB for videos)
const MAX_UPLOAD_FILE_SIZE = getMaxKbUploadLimit();

@Controller('knowledge-base')
@UseGuards(JwtAuthGuard)
export class KbMediaController {
  constructor(
    private readonly mediaService: KbMediaService,
    private readonly thumbnailService: KbThumbnailService,
    private readonly orchestratorService: MediaOrchestratorService,
    private readonly guardrailsService: MediaGuardrailsService,
    private readonly auditService: MediaDecisionAuditService,
  ) {}

  // ============================================================================
  // MEDIA UPLOAD
  // ============================================================================

  /**
   * Initiate a media upload
   *
   * Returns a presigned URL for uploading to S3.
   */
  @Post('media/initiate')
  async initiateUpload(
    @Request() req: any,
    @Body() dto: InitiateMediaUploadDto,
  ) {
    return this.mediaService.initiateUpload(req.user.userId, dto);
  }

  /**
   * Confirm media upload completion
   *
   * Called after file is uploaded to S3.
   */
  @Post('media/:id/confirm')
  async confirmUpload(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Omit<ConfirmMediaUploadDto, 'mediaId'>,
  ) {
    return this.mediaService.confirmUpload(req.user.userId, {
      mediaId: id,
      ...dto,
    });
  }

  /**
   * Upload media directly through the backend (proxy upload)
   *
   * This endpoint avoids CORS issues by uploading files through the backend
   * instead of directly from the browser to S3. Use this when presigned URL
   * uploads fail due to S3 CORS configuration issues.
   *
   * Form data:
   * - file: binary file data
   * - objectId: target object UUID
   * - mediaRole: role type (hero_image, gallery_image, etc.)
   * - caption: descriptive caption (min 10 chars)
   * - fieldId: optional field UUID
   * - altText: optional alt text
   * - aiEnabled: whether AI can use this media (default: true)
   * - allowedLanguages: JSON array of allowed language codes
   */
  @Post('media/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_UPLOAD_FILE_SIZE,
      },
    }),
  )
  async proxyUpload(
    @Request() req: any,
    @UploadedFile() file: any,
    @Body() dto: ProxyUploadDto,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Parse allowedLanguages from JSON string if provided
    const allowedLanguages = dto.allowedLanguages
      ? JSON.parse(dto.allowedLanguages)
      : undefined;

    // Parse boolean from form data string
    const aiEnabled = dto.aiEnabled !== 'false';

    return this.mediaService.proxyUpload(
      req.user.userId,
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
      {
        objectId: dto.objectId,
        fieldId: dto.fieldId,
        mediaRole: dto.mediaRole,
        caption: dto.caption,
        altText: dto.altText,
        aiEnabled,
        allowedLanguages,
        width: dto.width ? parseInt(dto.width, 10) : undefined,
        height: dto.height ? parseInt(dto.height, 10) : undefined,
        duration: dto.duration ? parseInt(dto.duration, 10) : undefined,
      },
    );
  }

  // ============================================================================
  // MEDIA RETRIEVAL
  // ============================================================================

  /**
   * Get media details
   */
  @Get('media/:id')
  async getMedia(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.getMediaWithObject(id);
  }

  /**
   * Get presigned download URL for media
   */
  @Get('media/:id/download')
  async getDownloadUrl(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.mediaService.getPresignedDownloadUrl(req.user.userId, id);
  }

  /**
   * Get presigned thumbnail URL for media
   *
   * Returns a presigned URL for the thumbnail if available,
   * or null if no thumbnail exists (e.g., for audio files).
   */
  @Get('media/:id/thumbnail')
  async getThumbnailUrl(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    // Get media to check ownership and get thumbnail key
    const media = await this.mediaService.getMediaWithObject(id);

    if (!media.thumbnailS3Key) {
      return { url: null, hasThumbnail: false };
    }

    const url = await this.thumbnailService.getThumbnailUrl(
      media.thumbnailS3Key,
    );

    return { url, hasThumbnail: true };
  }

  /**
   * Regenerate thumbnail for media
   *
   * Useful when thumbnail generation failed or needs to be updated.
   */
  @Post('media/:id/regenerate-thumbnail')
  @HttpCode(HttpStatus.OK)
  async regenerateThumbnail(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    // Verify ownership by getting media
    await this.mediaService.getMediaWithObject(id);

    const result = await this.thumbnailService.regenerateThumbnail(id);
    return result;
  }

  /**
   * List media for an object
   */
  @Get('objects/:objectId/media')
  async listObjectMedia(
    @Request() req: any,
    @Param('objectId', ParseUUIDPipe) objectId: string,
    @Query() query: ListMediaQueryDto,
  ) {
    return this.mediaService.getMediaByObject(req.user.userId, objectId);
  }

  /**
   * Get media count and limit for an object
   *
   * Returns current media count and the maximum allowed,
   * useful for UI to show remaining slots and enable/disable upload.
   */
  @Get('objects/:objectId/media-limit')
  async getObjectMediaLimit(
    @Request() req: any,
    @Param('objectId', ParseUUIDPipe) objectId: string,
  ) {
    const count = await this.mediaService.getObjectMediaCount(objectId);
    return {
      currentCount: count,
      maxLimit: KB_OBJECT_MEDIA_LIMIT,
      remaining: Math.max(0, KB_OBJECT_MEDIA_LIMIT - count),
      canUpload: count < KB_OBJECT_MEDIA_LIMIT,
    };
  }

  // ============================================================================
  // MEDIA UPDATE
  // ============================================================================

  /**
   * Update media metadata
   */
  @Patch('media/:id')
  async updateMedia(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMediaDto,
  ) {
    return this.mediaService.updateMedia(req.user.userId, id, dto);
  }

  /**
   * Update media AI permission settings
   */
  @Patch('media/:id/ai-permission')
  async updateAiPermission(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMediaAiPermissionDto,
  ) {
    return this.mediaService.updateAiPermission(req.user.userId, id, dto);
  }

  /**
   * Re-process an image to ensure WhatsApp compatibility.
   * Useful for fixing images that were uploaded before the normalization fix.
   */
  @Post('media/:id/reprocess')
  async reprocessImage(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.mediaService.reprocessImage(id, req.user.userId);
  }

  // ============================================================================
  // MEDIA DELETE
  // ============================================================================

  /**
   * Delete media
   */
  @Delete('media/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMedia(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.mediaService.deleteMedia(req.user.userId, id);
  }

  // ============================================================================
  // AI ELIGIBILITY & GUARDRAILS
  // ============================================================================

  /**
   * Check if media is eligible for AI sending
   */
  @Post('media/check-eligibility')
  async checkEligibility(
    @Request() req: any,
    @Body() dto: CheckMediaEligibilityDto,
  ) {
    return this.mediaService.checkAiEligibility(
      dto.mediaId,
      dto.chatId,
      dto.chatLanguage,
    );
  }

  /**
   * Check guardrails for sending media
   */
  @Post('media/check-guardrails')
  async checkGuardrails(
    @Request() req: any,
    @Body() dto: CheckMediaGuardrailsDto,
  ) {
    return this.guardrailsService.checkGuardrails({
      chatId: dto.chatId,
      userId: req.user.userId,
      isFirstAiMessage: dto.isFirstAiMessage,
      lastMessageHadMedia: dto.lastMessageHadMedia,
      messageCountInConversation: dto.messageCountInConversation,
    });
  }

  /**
   * Get guardrail configuration
   */
  @Get('media/guardrails')
  getGuardrailConfig() {
    return this.guardrailsService.getGuardrailConfig();
  }

  // ============================================================================
  // MEDIA DECISIONS & AUDIT
  // ============================================================================

  /**
   * Get media decision audit logs for a chat
   */
  @Get('media-decisions/:chatId')
  async getDecisionLogs(
    @Request() req: any,
    @Param('chatId') chatId: string,
    @Query() query: QueryMediaDecisionLogsDto,
  ) {
    return this.auditService.queryAuditLogs({
      chatId,
      page: query.page,
      pageSize: query.pageSize,
      mediaSentOnly: query.mediaSentOnly,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });
  }

  /**
   * Get specific audit log
   */
  @Get('media-decisions/audit/:auditId')
  async getAuditLog(
    @Request() req: any,
    @Param('auditId', ParseUUIDPipe) auditId: string,
  ) {
    return this.auditService.getAuditLog(auditId);
  }

  /**
   * Get audit log for a message
   */
  @Get('messages/:messageId/media-decision')
  async getMessageDecision(
    @Request() req: any,
    @Param('messageId') messageId: string,
  ) {
    return this.orchestratorService.getMediaDecisionForMessage(messageId);
  }

  /**
   * Submit feedback on a media decision
   */
  @Post('media-decisions/:auditId/feedback')
  async submitFeedback(
    @Request() req: any,
    @Param('auditId', ParseUUIDPipe) auditId: string,
    @Body() dto: MediaFeedbackDto,
  ) {
    await this.auditService.recordFeedback(
      auditId,
      dto.feedback,
      dto.comment,
      dto.correctMediaId,
    );

    // If marked incorrect, optionally disable media
    if (dto.feedback === 'incorrect' && dto.correctMediaId) {
      // Disable the incorrectly sent media
      const audit = await this.auditService.getAuditLog(auditId);
      if (audit?.selectedMediaId) {
        await this.orchestratorService.disableMediaForAi(
          req.user.userId,
          audit.selectedMediaId,
          dto.comment || 'Marked as incorrect by user',
        );
      }
    }

    return { success: true };
  }

  /**
   * Disable media from AI usage
   */
  @Post('media/:id/disable-ai')
  async disableMediaForAi(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason: string },
  ) {
    await this.orchestratorService.disableMediaForAi(
      req.user.userId,
      id,
      body.reason,
    );
    return { success: true };
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get media decision statistics
   */
  @Get('media-stats')
  async getMediaStats(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.orchestratorService.getMediaStats(
      req.user.userId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }
}
