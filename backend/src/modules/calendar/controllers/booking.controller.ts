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
  BookingQueryDto,
  CreateBookingDto,
  CreateBookingLinkDto,
  GetAvailableSlotsDto,
  RescheduleBookingDto,
  UpdateBookingLinkDto,
} from '../dto';
import { CalendarService } from '../services';

@Controller('calendar/booking')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BookingController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly teamService: TeamService,
  ) {}

  // ============================================================
  // Booking Links
  // ============================================================

  /**
   * Create a new booking link
   * POST /calendar/booking/links
   */
  @Post('links')
  @RequirePermission('calendar.booking.manage')
  async createLink(@Req() req: any, @Body() dto: CreateBookingLinkDto) {
    const userId = Number(req.user.userId);
    const teams = await this.teamService.getUserTeams(userId);
    const teamId = teams[0]?.id;

    if (!teamId) {
      throw new Error('User does not belong to any team');
    }

    return this.calendarService.createBookingLink(userId, teamId, dto);
  }

  /**
   * Get all booking links
   * GET /calendar/booking/links
   */
  @Get('links')
  @RequirePermission('calendar.view')
  async getLinks(@Req() req: any) {
    const userId = Number(req.user.userId);
    const teams = await this.teamService.getUserTeams(userId);
    const teamId = teams[0]?.id;

    if (!teamId) {
      return [];
    }

    return this.calendarService.getBookingLinks(userId, teamId);
  }

  /**
   * Get a specific booking link
   * GET /calendar/booking/links/:id
   */
  @Get('links/:id')
  @RequirePermission('calendar.view')
  async getLink(@Req() req: any, @Param('id') id: string) {
    const userId = Number(req.user.userId);
    const teams = await this.teamService.getUserTeams(userId);
    const teamId = teams[0]?.id;

    if (!teamId) {
      throw new Error('User does not belong to any team');
    }

    return this.calendarService.getBookingLink(id, userId, teamId);
  }

  /**
   * Update a booking link
   * PATCH /calendar/booking/links/:id
   */
  @Patch('links/:id')
  @RequirePermission('calendar.booking.manage')
  async updateLink(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateBookingLinkDto,
  ) {
    const userId = Number(req.user.userId);
    const teams = await this.teamService.getUserTeams(userId);
    const teamId = teams[0]?.id;

    if (!teamId) {
      throw new Error('User does not belong to any team');
    }

    return this.calendarService.updateBookingLink(id, userId, teamId, dto);
  }

  /**
   * Delete a booking link
   * DELETE /calendar/booking/links/:id
   */
  @Delete('links/:id')
  @RequirePermission('calendar.booking.manage')
  async deleteLink(@Req() req: any, @Param('id') id: string) {
    const userId = Number(req.user.userId);
    const teams = await this.teamService.getUserTeams(userId);
    const teamId = teams[0]?.id;

    if (!teamId) {
      throw new Error('User does not belong to any team');
    }

    await this.calendarService.deleteBookingLink(id, userId, teamId);
    return { success: true };
  }

  /**
   * Toggle booking link active status
   * POST /calendar/booking/links/:id/toggle
   */
  @Post('links/:id/toggle')
  @RequirePermission('calendar.booking.manage')
  async toggleLink(@Req() req: any, @Param('id') id: string) {
    const userId = Number(req.user.userId);
    const teams = await this.teamService.getUserTeams(userId);
    const teamId = teams[0]?.id;

    if (!teamId) {
      throw new Error('User does not belong to any team');
    }

    return this.calendarService.toggleBookingLinkActive(id, userId, teamId);
  }

  // ============================================================
  // Public Booking Page (no auth required for some endpoints)
  // ============================================================

  /**
   * Get booking link by slug (for public booking page)
   * GET /calendar/booking/public/:teamId/:slug
   * Note: This endpoint may need to be public (no auth)
   */
  @Get('public/:teamId/:slug')
  async getPublicLink(
    @Param('teamId') teamId: string,
    @Param('slug') slug: string,
  ) {
    return this.calendarService.getBookingLinkBySlug(Number(teamId), slug);
  }

  /**
   * Get available slots for a booking link
   * GET /calendar/booking/slots
   */
  @Get('slots')
  async getAvailableSlots(@Query() query: GetAvailableSlotsDto) {
    return this.calendarService.getAvailableSlots(
      query.bookingLinkId,
      new Date(query.date),
    );
  }

  // ============================================================
  // Bookings
  // ============================================================

  /**
   * Create a new booking
   * POST /calendar/booking/bookings
   */
  @Post('bookings')
  @RequirePermission('calendar.view')
  async createBooking(@Body() dto: CreateBookingDto) {
    return this.calendarService.createBooking(dto);
  }

  /**
   * Get bookings
   * GET /calendar/booking/bookings
   */
  @Get('bookings')
  @RequirePermission('calendar.view')
  async getBookings(@Req() req: any, @Query() query: BookingQueryDto) {
    const userId = Number(req.user.userId);
    return this.calendarService.getBookings(userId, query);
  }

  /**
   * Get bookings for a contact
   * GET /calendar/booking/bookings/contact/:contactId
   */
  @Get('bookings/contact/:contactId')
  @RequirePermission('calendar.view')
  async getContactBookings(@Param('contactId') contactId: string) {
    return this.calendarService.getContactBookings(contactId);
  }

  /**
   * Get a specific booking
   * GET /calendar/booking/bookings/:id
   */
  @Get('bookings/:id')
  @RequirePermission('calendar.view')
  async getBooking(@Param('id') id: string) {
    return this.calendarService.getBooking(id);
  }

  /**
   * Confirm a booking
   * POST /calendar/booking/bookings/:id/confirm
   */
  @Post('bookings/:id/confirm')
  @RequirePermission('calendar.booking.manage')
  async confirmBooking(@Req() req: any, @Param('id') id: string) {
    const userId = Number(req.user.userId);
    return this.calendarService.confirmBooking(id, userId);
  }

  /**
   * Cancel a booking
   * POST /calendar/booking/bookings/:id/cancel
   */
  @Post('bookings/:id/cancel')
  @RequirePermission('calendar.booking.manage')
  async cancelBooking(
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.calendarService.cancelBooking(id, reason);
  }

  /**
   * Reschedule a booking
   * POST /calendar/booking/bookings/:id/reschedule
   */
  @Post('bookings/:id/reschedule')
  @RequirePermission('calendar.booking.manage')
  async rescheduleBooking(
    @Param('id') id: string,
    @Body() dto: RescheduleBookingDto,
  ) {
    return this.calendarService.rescheduleBooking(
      id,
      dto.newStartTime,
      dto.reason,
    );
  }
}
