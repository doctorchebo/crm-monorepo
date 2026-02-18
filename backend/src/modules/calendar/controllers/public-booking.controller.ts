import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PublicBookingDto } from '../dto';
import { AvailabilityService } from '../services/availability.service';
import { BookingLinksService } from '../services/booking-links.service';
import { BookingsService } from '../services/bookings.service';

/**
 * Public Booking Controller
 *
 * Handles public (unauthenticated) booking requests.
 * These endpoints are accessible without login for external users
 * to book appointments through shared booking links.
 *
 * Security:
 * - Booking links can be paused/archived to disable access
 * - Rate limiting should be applied at the API gateway level
 * - Honeypot/captcha can be added for spam prevention
 */
@Controller('public/booking')
export class PublicBookingController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly bookingLinksService: BookingLinksService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  /**
   * Get booking link details by slug
   * GET /public/booking/:teamId/:slug
   *
   * Returns public booking link information for display
   * on the booking page (name, description, duration, etc.)
   */
  @Get(':teamId/:slug')
  async getBookingLink(
    @Param('teamId') teamId: string,
    @Param('slug') slug: string,
  ) {
    const link = await this.bookingLinksService.findBySlug(
      Number(teamId),
      slug,
    );

    if (!link || link.status !== 'active') {
      return {
        error: 'not_found',
        message: 'This booking link is not available',
      };
    }

    // Return only public-safe fields
    return {
      bookingLinkId: link.id,
      teamId: link.teamId,
      name: link.name,
      description: link.description,
      duration: link.duration,
      bufferBefore: link.bufferBeforeMinutes,
      bufferAfter: link.bufferAfterMinutes,
      maxAdvanceDays: link.maxFutureDays,
      minNoticeMinutes: link.minNoticeMinutes,
      requiresConfirmation: link.requiresApproval,
      collectPhone: true, // Default to collecting phone
      collectNotes: true, // Default to collecting notes
      customQuestions: link.customQuestions,
      // Theming
      color: link.color,
    };
  }

  /**
   * Get available time slots for a booking link
   * GET /public/booking/:teamId/:slug/slots?date=YYYY-MM-DD
   *
   * Returns available time slots for the given date
   */
  @Get(':teamId/:slug/slots')
  async getAvailableSlots(
    @Param('teamId') teamId: string,
    @Param('slug') slug: string,
    @Query('date') dateStr: string,
  ) {
    // Get booking link
    const link = await this.bookingLinksService.findBySlug(
      Number(teamId),
      slug,
    );

    if (!link || link.status !== 'active') {
      return {
        error: 'not_found',
        message: 'This booking link is not available',
      };
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return {
        error: 'invalid_date',
        message: 'Invalid date format. Use YYYY-MM-DD',
      };
    }

    // Check if date is within allowed range
    const now = new Date();
    const minNoticeTime = new Date(
      now.getTime() + (link.minNoticeMinutes || 60) * 60 * 1000,
    );
    const maxAdvanceTime = new Date(
      now.getTime() + (link.maxFutureDays || 60) * 24 * 60 * 60 * 1000,
    );

    if (date < new Date(now.toDateString())) {
      return {
        error: 'past_date',
        message: 'Cannot book dates in the past',
      };
    }

    if (date > maxAdvanceTime) {
      return {
        error: 'too_far_ahead',
        message: `Cannot book more than ${link.maxFutureDays} days in advance`,
      };
    }

    // Get available slots
    const slots = await this.availabilityService.getAvailableSlots(
      link.id,
      date,
      link.duration,
    );

    // Filter out slots that don't meet minimum notice and format response
    const filteredSlots = slots
      .filter((slot) => slot.start >= minNoticeTime)
      .map((slot) => ({
        startTime: slot.start.toISOString(),
        endTime: slot.end.toISOString(),
        available: true,
      }));

    return {
      date: dateStr,
      slots: filteredSlots,
      timezone: 'UTC',
    };
  }

  /**
   * Get available dates for a booking link (month view)
   * GET /public/booking/:teamId/:slug/dates?month=YYYY-MM
   *
   * Returns dates with available slots for the given month
   */
  @Get(':teamId/:slug/dates')
  async getAvailableDates(
    @Param('teamId') teamId: string,
    @Param('slug') slug: string,
    @Query('month') monthStr: string,
  ) {
    // Get booking link
    const link = await this.bookingLinksService.findBySlug(
      Number(teamId),
      slug,
    );

    if (!link || link.status !== 'active') {
      return {
        error: 'not_found',
        message: 'This booking link is not available',
      };
    }

    // Parse month (YYYY-MM format)
    const [year, month] = monthStr.split('-').map(Number);
    if (!year || !month || month < 1 || month > 12) {
      return {
        error: 'invalid_month',
        message: 'Invalid month format. Use YYYY-MM',
      };
    }

    // Get dates with availability
    const availableDates =
      await this.availabilityService.getAvailableDatesInMonth(
        link.id,
        year,
        month,
        link.duration,
      );

    return {
      month: monthStr,
      availableDates,
    };
  }

  /**
   * Create a new public booking
   * POST /public/booking/:teamId/:slug
   *
   * Creates a booking from the public booking page
   */
  @Post(':teamId/:slug')
  async createBooking(
    @Param('teamId') teamId: string,
    @Param('slug') slug: string,
    @Body() dto: PublicBookingDto,
  ) {
    // Get booking link
    const link = await this.bookingLinksService.findBySlug(
      Number(teamId),
      slug,
    );

    if (!link || link.status !== 'active') {
      return {
        error: 'not_found',
        message: 'This booking link is not available',
      };
    }

    // Validate required fields
    if (!dto.guestName || !dto.guestEmail) {
      return {
        error: 'missing_fields',
        message: 'Name and email are required',
      };
    }

    // Validate time slot
    const slotTime = new Date(dto.startTime);
    if (isNaN(slotTime.getTime())) {
      return {
        error: 'invalid_time',
        message: 'Invalid start time',
      };
    }

    const endTime = new Date(slotTime.getTime() + link.duration * 60 * 1000);

    // Check slot is still available
    const isAvailable = await this.availabilityService.isSlotAvailable(
      link.id,
      slotTime,
      endTime,
    );

    if (!isAvailable) {
      return {
        error: 'slot_unavailable',
        message:
          'This time slot is no longer available. Please select another time.',
      };
    }

    // Create the booking
    try {
      const booking = await this.bookingsService.createPublicBooking({
        bookingLinkId: link.id,
        startTime: slotTime,
        endTime,
        guestName: dto.guestName,
        guestEmail: dto.guestEmail,
        guestPhone: dto.guestPhone,
        guestNotes: dto.notes,
        customAnswers: dto.customAnswers,
        timezone: dto.timezone || 'UTC',
        status: link.requiresApproval ? 'pending' : 'confirmed',
      });

      return {
        success: true,
        bookingId: booking.id,
        status: booking.status,
        requiresConfirmation: link.requiresApproval,
        message: link.requiresApproval
          ? 'Your booking request has been submitted and is pending confirmation.'
          : 'Your booking has been confirmed!',
        details: {
          startTime: booking.scheduledStart,
          endTime: booking.scheduledEnd,
          duration: link.duration,
        },
      };
    } catch (error) {
      return {
        error: 'booking_failed',
        message: 'Failed to create booking. Please try again.',
      };
    }
  }

  /**
   * Get booking status by confirmation code
   * GET /public/booking/status/:code
   *
   * Allows guests to check their booking status
   */
  @Get('status/:code')
  async getBookingStatus(@Param('code') confirmationCode: string) {
    const booking =
      await this.bookingsService.getByConfirmationCode(confirmationCode);

    if (!booking) {
      return {
        error: 'not_found',
        message: 'Booking not found',
      };
    }

    return {
      confirmationCode: booking.confirmationCode,
      status: booking.status,
      startTime: booking.scheduledStart,
      endTime: booking.scheduledEnd,
      guestName: booking.bookerName,
      guestEmail: booking.bookerEmail,
      meetingLink: booking.status === 'confirmed' ? booking.meetingLink : null,
    };
  }

  /**
   * Cancel a booking by confirmation code
   * POST /public/booking/cancel/:code
   *
   * Allows guests to cancel their own booking
   */
  @Post('cancel/:code')
  async cancelBooking(
    @Param('code') confirmationCode: string,
    @Body('reason') reason?: string,
  ) {
    const booking =
      await this.bookingsService.getByConfirmationCode(confirmationCode);

    if (!booking) {
      return {
        error: 'not_found',
        message: 'Booking not found',
      };
    }

    if (booking.status === 'cancelled') {
      return {
        error: 'already_cancelled',
        message: 'This booking has already been cancelled',
      };
    }

    // Check if cancellation is allowed (e.g., minimum notice)
    const now = new Date();
    const bookingStart = new Date(booking.scheduledStart);
    const hoursUntilBooking =
      (bookingStart.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilBooking < 1) {
      return {
        error: 'too_late',
        message:
          'Bookings cannot be cancelled less than 1 hour before the scheduled time',
      };
    }

    await this.bookingsService.cancelByConfirmationCode(
      confirmationCode,
      reason || 'Cancelled by guest',
    );

    return {
      success: true,
      message: 'Your booking has been cancelled',
    };
  }
}
