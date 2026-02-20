/**
 * Stages Controller
 * REST API endpoints for pipeline stage management (Kanban board)
 *
 * NOTE: Uses '/workflow' prefix temporarily for backward compatibility
 * with the frontend. Will be migrated to '/stages' or '/ai/stages' in Phase 6.
 */

import { AuditQueryService } from '@modules/audit/audit-query.service';
import { AuditEntityType } from '@modules/audit/audit.types';
import { JwtAuthGuard } from '@modules/auth/auth.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ProfilePictureUrlService } from '@shared/services/profile-picture-url.service';
import {
  BulkTransitionChatsDto,
  CreateStageDto,
  GetChatsByStageDto,
  ReorderStagesDto,
  TransitionChatDto,
  UpdateStageDto,
} from './dto/stages.dto';
import { StageService } from './services/stage.service';

@Controller('workflow')
@UseGuards(JwtAuthGuard)
export class StagesController {
  constructor(
    private readonly stageService: StageService,
    private readonly profilePictureUrlService: ProfilePictureUrlService,
    private readonly auditQueryService: AuditQueryService,
  ) {}

  // ==========================================================================
  // Stage Management
  // ==========================================================================

  @Get('stages')
  async getStages(@Req() req: any) {
    const userId = req.user.userId;
    return this.stageService.getStages(userId);
  }

  @Get('stages/:stageId')
  async getStage(@Param('stageId') stageId: string) {
    return this.stageService.getStageById(stageId);
  }

  @Post('stages')
  @HttpCode(HttpStatus.CREATED)
  async createStage(@Req() req: any, @Body() dto: CreateStageDto) {
    const userId = req.user.userId;
    return this.stageService.createStage(userId, dto);
  }

  @Patch('stages/:stageId')
  async updateStage(
    @Req() req: any,
    @Param('stageId') stageId: string,
    @Body() dto: UpdateStageDto,
  ) {
    const userId = req.user.userId;
    return this.stageService.updateStage(stageId, userId, dto);
  }

  @Delete('stages/:stageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteStage(@Req() req: any, @Param('stageId') stageId: string) {
    const userId = req.user.userId;
    await this.stageService.deleteStage(stageId, userId);
  }

  @Post('stages/reorder')
  @HttpCode(HttpStatus.OK)
  async reorderStages(@Req() req: any, @Body() dto: ReorderStagesDto) {
    const userId = req.user.userId;
    await this.stageService.reorderStages(userId, dto.stageIds);
    return { success: true, message: 'Stages reordered' };
  }

  @Post('stages/initialize-defaults')
  @HttpCode(HttpStatus.CREATED)
  async initializeDefaultStages(@Req() req: any) {
    const userId = req.user.userId;
    await this.stageService.initializeDefaultStages(userId);
    return { success: true, message: 'Default stages created' };
  }

  @Get('stages/:stageId/chats')
  async getChatsByStage(
    @Req() req: any,
    @Param('stageId') stageId: string,
    @Query() query: GetChatsByStageDto,
  ) {
    const userId = req.user.userId;
    const chatsList = await this.stageService.getChatsByStage(
      stageId,
      userId,
      query.limit,
      query.offset,
    );

    return this.profilePictureUrlService.transformArrayWithUrls(
      chatsList,
      'assignedToProfilePictureKey',
      'assignedToProfilePictureUrl',
    );
  }

  // ==========================================================================
  // Chat Transitions
  // ==========================================================================

  @Post('chat/transition')
  @HttpCode(HttpStatus.OK)
  async transitionChat(@Req() req: any, @Body() dto: TransitionChatDto) {
    const userId = req.user.userId;
    await this.stageService.transitionChat(
      dto.chatId,
      userId,
      dto.toStageId,
      dto.reason || 'Manual transition',
      dto.metadata,
    );
    return { success: true, message: 'Chat transitioned' };
  }

  @Post('chat/bulk-transition')
  @HttpCode(HttpStatus.OK)
  async bulkTransitionChats(
    @Req() req: any,
    @Body() dto: BulkTransitionChatsDto,
  ) {
    const userId = req.user.userId;
    const results = await Promise.allSettled(
      dto.chatIds.map((chatId) =>
        this.stageService.transitionChat(
          chatId,
          userId,
          dto.toStageId,
          dto.reason || 'Bulk transition',
          { reasonKey: 'bulk_transition', manual: true },
        ),
      ),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    return {
      success: failed === 0,
      message: `Transitioned ${succeeded}/${dto.chatIds.length} chats`,
      succeeded,
      failed,
    };
  }

  // ==========================================================================
  // Stage History
  // ==========================================================================

  @Get('chat/:chatId/history')
  async getChatStageHistory(@Param('chatId') chatId: string) {
    return this.stageService.getStageHistory(chatId);
  }

  @Get('chat/:chatId/history/enriched')
  async getEnrichedChatStageHistory(
    @Param('chatId') chatId: string,
    @Query('limit') limit?: number,
  ) {
    return this.stageService.getEnrichedStageHistory(chatId, limit || 50);
  }

  @Get('history/global')
  async getGlobalStageHistory(@Req() req: any, @Query('limit') limit?: number) {
    const userId = req.user.userId;
    return this.stageService.getGlobalStageHistory(userId, limit || 50);
  }

  // ==========================================================================
  // Activity Logs (pipeline-scoped)
  // ==========================================================================

  @Get('activity-logs')
  async getActivityLogs(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('activityTypes') activityTypes?: string,
    @Query('entityType') entityType?: string,
    @Query('chatId') chatId?: string,
  ) {
    const userId = req.user.userId;

    const parsedStartDate = startDate ? new Date(startDate) : undefined;
    const parsedEndDate = endDate ? new Date(endDate) : undefined;

    return this.auditQueryService.getAuditLogs(
      userId,
      page || 1,
      pageSize || 20,
      {
        category: 'pipeline',
        entityType: entityType as AuditEntityType | undefined,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        chatId: chatId || undefined,
      },
    );
  }
}
