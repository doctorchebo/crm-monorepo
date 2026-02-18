import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
  CalendarQueryDto,
  CreateCalendarDto,
  ShareCalendarDto,
  UpdateCalendarDto,
} from '../dto';
import { CalendarService } from '../services';

@Controller('calendar/calendars')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CalendarController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly teamService: TeamService,
  ) {}

  /**
   * Create a new calendar
   * POST /calendar/calendars
   */
  @Post()
  @RequirePermission('calendar.create')
  async create(@Req() req: any, @Body() dto: CreateCalendarDto) {
    const userId = Number(req.user.userId);
    const teams = await this.teamService.getUserTeams(userId);
    const teamId = teams[0]?.id;

    if (!teamId) {
      throw new Error('User does not belong to any team');
    }

    return this.calendarService.createCalendar(userId, teamId, dto);
  }

  /**
   * Get all calendars for the user
   * GET /calendar/calendars
   */
  @Get()
  @RequirePermission('calendar.view')
  async findAll(@Req() req: any, @Query() query: CalendarQueryDto) {
    const userId = Number(req.user.userId);
    const teams = await this.teamService.getUserTeams(userId);
    const teamId = query.teamId ? Number(query.teamId) : teams[0]?.id;

    if (!teamId) {
      return [];
    }

    return this.calendarService.getCalendars(userId, teamId, query);
  }

  /**
   * Get the user's default calendar (create if doesn't exist)
   * GET /calendar/calendars/default
   */
  @Get('default')
  @RequirePermission('calendar.view')
  async getDefault(@Req() req: any) {
    const userId = Number(req.user.userId);
    const teams = await this.teamService.getUserTeams(userId);
    const teamId = teams[0]?.id;

    if (!teamId) {
      throw new Error('User does not belong to any team');
    }

    return this.calendarService.getOrCreateDefaultCalendar(userId, teamId);
  }

  /**
   * Get a specific calendar
   * GET /calendar/calendars/:id
   */
  @Get(':id')
  @RequirePermission('calendar.view')
  async findOne(@Req() req: any, @Param('id') id: string) {
    const userId = Number(req.user.userId);
    return this.calendarService.getCalendar(id, userId);
  }

  /**
   * Update a calendar
   * PATCH /calendar/calendars/:id
   */
  @Patch(':id')
  @RequirePermission('calendar.edit')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCalendarDto,
  ) {
    const userId = Number(req.user.userId);
    return this.calendarService.updateCalendar(id, userId, dto);
  }

  /**
   * Delete a calendar
   * DELETE /calendar/calendars/:id
   */
  @Delete(':id')
  @RequirePermission('calendar.delete')
  async delete(@Req() req: any, @Param('id') id: string) {
    const userId = Number(req.user.userId);
    await this.calendarService.deleteCalendar(id, userId);
    return { success: true };
  }

  /**
   * Share a calendar with another user
   * POST /calendar/calendars/:id/share
   */
  @Post(':id/share')
  @RequirePermission('calendar.edit')
  async share(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ShareCalendarDto,
  ) {
    const userId = Number(req.user.userId);
    return this.calendarService.shareCalendar(id, userId, dto);
  }

  /**
   * Get calendar shares
   * GET /calendar/calendars/:id/shares
   */
  @Get(':id/shares')
  @RequirePermission('calendar.view')
  async getShares(@Req() req: any, @Param('id') id: string) {
    const userId = Number(req.user.userId);
    return this.calendarService.getCalendarShares(id, userId);
  }

  /**
   * Remove calendar share
   * DELETE /calendar/calendars/:id/share/:userId
   */
  @Delete(':id/share/:sharedUserId')
  @RequirePermission('calendar.edit')
  async unshare(
    @Req() req: any,
    @Param('id') id: string,
    @Param('sharedUserId') sharedUserId: string,
  ) {
    const userId = Number(req.user.userId);
    await this.calendarService.unshareCalendar(
      id,
      userId,
      Number(sharedUserId),
    );
    return { success: true };
  }
}
