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
  CreateEventDto,
  EventQueryDto,
  RespondToEventDto,
  UpdateEventDto,
} from '../dto';
import { CalendarService } from '../services';

@Controller('calendar/events')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EventsController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly teamService: TeamService,
  ) {}

  /**
   * Create a new event
   * POST /calendar/events
   */
  @Post()
  @RequirePermission('calendar.create')
  async create(@Req() req: any, @Body() dto: CreateEventDto) {
    const userId = Number(req.user.userId);
    const teams = await this.teamService.getUserTeams(userId);
    const teamId = teams[0]?.id;

    if (!teamId) {
      throw new Error('User does not belong to any team');
    }

    return this.calendarService.createEvent(userId, teamId, dto);
  }

  /**
   * Get events
   * GET /calendar/events
   */
  @Get()
  @RequirePermission('calendar.view')
  async findAll(@Req() req: any, @Query() query: EventQueryDto) {
    const userId = Number(req.user.userId);
    const teams = await this.teamService.getUserTeams(userId);
    const teamId = teams[0]?.id;

    if (!teamId) {
      return [];
    }

    return this.calendarService.getEvents(userId, teamId, query);
  }

  /**
   * Get events for a specific contact
   * GET /calendar/events/contact/:contactId
   */
  @Get('contact/:contactId')
  @RequirePermission('calendar.view')
  async getContactEvents(
    @Req() req: any,
    @Param('contactId') contactId: string,
  ) {
    const userId = Number(req.user.userId);
    const teams = await this.teamService.getUserTeams(userId);
    const teamId = teams[0]?.id;

    if (!teamId) {
      return [];
    }

    return this.calendarService.getContactEvents(contactId, userId, teamId);
  }

  /**
   * Get events for a specific chat
   * GET /calendar/events/chat/:chatId
   */
  @Get('chat/:chatId')
  @RequirePermission('calendar.view')
  async getChatEvents(@Req() req: any, @Param('chatId') chatId: string) {
    const userId = Number(req.user.userId);
    const teams = await this.teamService.getUserTeams(userId);
    const teamId = teams[0]?.id;

    if (!teamId) {
      return [];
    }

    return this.calendarService.getChatEvents(chatId, userId, teamId);
  }

  /**
   * Get a specific event
   * GET /calendar/events/:id
   */
  @Get(':id')
  @RequirePermission('calendar.view')
  async findOne(@Req() req: any, @Param('id') id: string) {
    const userId = Number(req.user.userId);
    return this.calendarService.getEvent(id, userId);
  }

  /**
   * Update an event
   * PATCH /calendar/events/:id
   */
  @Patch(':id')
  @RequirePermission('calendar.edit')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    const userId = Number(req.user.userId);
    return this.calendarService.updateEvent(id, userId, dto);
  }

  /**
   * Delete an event
   * DELETE /calendar/events/:id
   */
  @Delete(':id')
  @RequirePermission('calendar.delete')
  async delete(@Req() req: any, @Param('id') id: string) {
    const userId = Number(req.user.userId);
    await this.calendarService.deleteEvent(id, userId);
    return { success: true };
  }

  /**
   * Cancel an event
   * POST /calendar/events/:id/cancel
   */
  @Post(':id/cancel')
  @RequirePermission('calendar.edit')
  async cancel(
    @Req() req: any,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    const userId = Number(req.user.userId);
    return this.calendarService.cancelEvent(id, userId, reason);
  }

  /**
   * Get event attendees
   * GET /calendar/events/:id/attendees
   */
  @Get(':id/attendees')
  @RequirePermission('calendar.view')
  async getAttendees(@Param('id') id: string) {
    return this.calendarService.getEventAttendees(id);
  }

  /**
   * Respond to an event invitation
   * POST /calendar/events/:id/respond
   */
  @Post(':id/respond')
  @RequirePermission('calendar.view')
  async respond(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: RespondToEventDto,
  ) {
    const userId = Number(req.user.userId);
    return this.calendarService.respondToEvent(
      id,
      userId,
      dto.response,
      dto.message,
    );
  }

  /**
   * Get event reminders
   * GET /calendar/events/:id/reminders
   */
  @Get(':id/reminders')
  @RequirePermission('calendar.view')
  async getReminders(@Param('id') id: string) {
    return this.calendarService.getEventReminders(id);
  }

  /**
   * Set event reminders
   * PUT /calendar/events/:id/reminders
   */
  @Post(':id/reminders')
  @RequirePermission('calendar.edit')
  async setReminders(
    @Param('id') id: string,
    @Body('reminders')
    reminders: {
      reminderMethod: 'email' | 'push' | 'whatsapp' | 'in_app';
      minutesBefore: number;
    }[],
  ) {
    return this.calendarService.setEventReminders(id, reminders);
  }
}
