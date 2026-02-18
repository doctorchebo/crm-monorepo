import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/auth.guard';
import {
  PermissionsGuard,
  RequirePermission,
} from '../../auth/guards/permissions.guard';
import { TeamService } from '../../team/team.service';
import {
  AiCalendarQueryDto,
  AiCancelEventDto,
  AiFindAvailabilityDto,
  AiRescheduleEventDto,
  AiScheduleEventDto,
  InitiateOAuthDto,
  ManualSyncDto,
  OAuthCallbackDto,
  UpdateCalendarAiSettingsDto,
  UpdateSyncConnectionDto,
} from '../dto';
import {
  CalendarAiService,
  CalendarService,
  CalendarSyncService,
} from '../services';

@Controller('calendar/sync')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CalendarSyncController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly calendarSyncService: CalendarSyncService,
    private readonly calendarAiService: CalendarAiService,
    private readonly teamService: TeamService,
  ) {}

  // ============================================================
  // Sync Connections
  // ============================================================

  /**
   * Get all sync connections
   * GET /calendar/sync/connections
   */
  @Get('connections')
  @RequirePermission('calendar.sync.manage')
  async getConnections(@Req() req: any) {
    const userId = req.user.userId;
    return this.calendarSyncService.getConnections(userId);
  }

  /**
   * Get a specific sync connection
   * GET /calendar/sync/connections/:id
   */
  @Get('connections/:id')
  @RequirePermission('calendar.sync.manage')
  async getConnection(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.userId;
    return this.calendarSyncService.getConnection(id, userId);
  }

  /**
   * Update a sync connection
   * PATCH /calendar/sync/connections/:id
   */
  @Post('connections/:id')
  @RequirePermission('calendar.sync.manage')
  async updateConnection(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateSyncConnectionDto,
  ) {
    const userId = req.user.userId;
    return this.calendarSyncService.updateConnection(id, userId, dto);
  }

  /**
   * Delete a sync connection
   * DELETE /calendar/sync/connections/:id
   */
  @Delete('connections/:id')
  @RequirePermission('calendar.sync.manage')
  async deleteConnection(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.userId;
    await this.calendarSyncService.deleteConnection(id, userId);
    return { success: true };
  }

  /**
   * Get sync logs for a connection
   * GET /calendar/sync/connections/:id/logs
   */
  @Get('connections/:id/logs')
  @RequirePermission('calendar.sync.manage')
  async getSyncLogs(
    @Req() req: any,
    @Param('id') id: string,
    @Query('limit') limit?: number,
  ) {
    const userId = req.user.userId;
    return this.calendarSyncService.getSyncLogs(id, userId, limit);
  }

  // ============================================================
  // OAuth Flow
  // ============================================================

  /**
   * Initiate OAuth flow for a provider
   * POST /calendar/sync/oauth/initiate
   */
  @Post('oauth/initiate')
  @RequirePermission('calendar.sync.manage')
  async initiateOAuth(@Req() req: any, @Body() dto: InitiateOAuthDto) {
    const userId = req.user.userId;
    const authUrl = this.calendarSyncService.generateAuthUrl(dto, userId);
    return { authUrl };
  }

  /**
   * Handle OAuth callback
   * POST /calendar/sync/oauth/callback
   */
  @Post('oauth/callback')
  @RequirePermission('calendar.sync.manage')
  async handleOAuthCallback(@Req() req: any, @Body() dto: OAuthCallbackDto) {
    const userId = req.user.userId;
    return this.calendarSyncService.handleOAuthCallback(dto, userId);
  }

  // ============================================================
  // Manual Sync
  // ============================================================

  /**
   * Trigger manual sync
   * POST /calendar/sync/trigger
   */
  @Post('trigger')
  @RequirePermission('calendar.sync.manage')
  async triggerSync(@Req() req: any, @Body() dto: ManualSyncDto) {
    const userId = req.user.userId;
    await this.calendarSyncService.triggerSync(userId, dto);
    return { success: true, message: 'Sync triggered' };
  }

  // ============================================================
  // AI Settings & Operations
  // ============================================================

  /**
   * Get AI calendar settings
   * GET /calendar/sync/ai/settings
   */
  @Get('ai/settings')
  @RequirePermission('calendar.ai.manage')
  async getAiSettings(@Req() req: any) {
    const userId = req.user.userId;
    return this.calendarAiService.getSettings(userId);
  }

  /**
   * Update AI calendar settings
   * PATCH /calendar/sync/ai/settings
   */
  @Post('ai/settings')
  @RequirePermission('calendar.ai.manage')
  async updateAiSettings(
    @Req() req: any,
    @Body() dto: UpdateCalendarAiSettingsDto,
  ) {
    const userId = req.user.userId;
    return this.calendarAiService.updateSettings(userId, dto);
  }

  /**
   * AI calendar query - suggest available times
   * POST /calendar/sync/ai/query
   */
  @Post('ai/query')
  @RequirePermission('calendar.view')
  async aiQuery(@Req() req: any, @Body() dto: AiCalendarQueryDto) {
    const userId = req.user.userId;
    const teams = await this.teamService.getUserTeams(userId);
    const teamId = teams[0]?.id;

    if (!teamId) {
      throw new Error('User does not belong to any team');
    }

    // Use suggestTimes for natural language calendar queries
    return this.calendarAiService.suggestTimes(
      userId,
      teamId,
      { durationMinutes: 30 },
      dto.chatId,
    );
  }

  /**
   * AI schedule event
   * POST /calendar/sync/ai/schedule
   */
  @Post('ai/schedule')
  @RequirePermission('calendar.create')
  async aiSchedule(@Req() req: any, @Body() dto: AiScheduleEventDto) {
    const userId = req.user.userId;
    const teams = await this.teamService.getUserTeams(userId);
    const teamId = teams[0]?.id;

    if (!teamId) {
      throw new Error('User does not belong to any team');
    }

    return this.calendarAiService.createEvent(userId, teamId, dto);
  }

  /**
   * AI reschedule event
   * POST /calendar/sync/ai/reschedule
   */
  @Post('ai/reschedule')
  @RequirePermission('calendar.edit')
  async aiReschedule(@Req() req: any, @Body() dto: AiRescheduleEventDto) {
    const userId = req.user.userId;
    return this.calendarAiService.rescheduleEvent(userId, dto);
  }

  /**
   * AI cancel event
   * POST /calendar/sync/ai/cancel
   */
  @Post('ai/cancel')
  @RequirePermission('calendar.delete')
  async aiCancel(@Req() req: any, @Body() dto: AiCancelEventDto) {
    const userId = req.user.userId;
    return this.calendarAiService.cancelEvent(userId, dto);
  }

  /**
   * AI find availability
   * POST /calendar/sync/ai/availability
   */
  @Post('ai/availability')
  @RequirePermission('calendar.view')
  async aiFindAvailability(
    @Req() req: any,
    @Body() dto: AiFindAvailabilityDto,
  ) {
    const userId = req.user.userId;
    const teams = await this.teamService.getUserTeams(userId);
    const teamId = teams[0]?.id;

    if (!teamId) {
      throw new Error('User does not belong to any team');
    }

    return this.calendarAiService.checkAvailability(userId, teamId, dto);
  }

  /**
   * Get AI action history
   * GET /calendar/sync/ai/history
   */
  @Get('ai/history')
  @RequirePermission('calendar.ai.manage')
  async getAiHistory(@Req() req: any, @Query('limit') limit?: number) {
    const userId = req.user.userId;
    return this.calendarAiService.getActionHistory(userId, limit);
  }
}
