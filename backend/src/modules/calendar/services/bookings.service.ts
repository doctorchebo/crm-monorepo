import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gte, lte, or } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  bookingLinks,
  bookings,
  calendarEvents,
  type Booking,
  type NewBooking,
  type NewCalendarEvent,
} from '../../../database/calendar.schema';
import * as schema from '../../../database/schema';
import {
  CancelBookingDto,
  CreateBookingDto,
  RescheduleBookingDto,
} from '../dto';
import { AvailabilityService } from './availability.service';
import { BookingLinksService } from './booking-links.service';

@Injectable()
export class BookingsService {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private db: NodePgDatabase<typeof schema>,
    private availabilityService: AvailabilityService,
    private bookingLinksService: BookingLinksService,
  ) {}

  /**
   * Create a new booking
   */
  async create(dto: CreateBookingDto): Promise<Booking> {
    // Get booking link
    const [bookingLink] = await this.db
      .select()
      .from(bookingLinks)
      .where(
        and(
          eq(bookingLinks.id, dto.bookingLinkId),
          eq(bookingLinks.status, 'active'),
        ),
      );

    if (!bookingLink) {
      throw new NotFoundException('Booking link not found or inactive');
    }

    const startTime = new Date(dto.startTime);
    const endTime = new Date(
      startTime.getTime() + bookingLink.duration * 60 * 1000,
    );

    // Validate time slot availability
    const isAvailable = await this.availabilityService.isSlotAvailable(
      dto.bookingLinkId,
      startTime,
      endTime,
    );

    if (!isAvailable) {
      throw new BadRequestException('Selected time slot is not available');
    }

    // Check min notice
    const minNoticeTime = new Date(
      Date.now() + (bookingLink.minNoticeMinutes || 0) * 60 * 1000,
    );
    if (startTime < minNoticeTime) {
      throw new BadRequestException(
        'Booking does not meet minimum notice requirement',
      );
    }

    // Check max future days
    if (bookingLink.maxFutureDays) {
      const maxFutureTime = new Date(
        Date.now() + bookingLink.maxFutureDays * 24 * 60 * 60 * 1000,
      );
      if (startTime > maxFutureTime) {
        throw new BadRequestException('Booking date is too far in the future');
      }
    }

    // Determine assigned user (round-robin or single owner)
    let assignedUserId: number;

    if (bookingLink.isRoundRobin) {
      assignedUserId = await this.selectRoundRobinUser(
        dto.bookingLinkId,
        startTime,
        endTime,
      );
    } else {
      // Use first assigned user or creator
      const assignedUserIds = bookingLink.assignedUserIds as number[];
      assignedUserId = assignedUserIds?.[0] || bookingLink.createdBy;
    }

    // Create booking
    const bookingData: NewBooking = {
      bookingLinkId: dto.bookingLinkId,
      assignedUserId,
      bookerName: dto.guestName || 'Guest',
      bookerEmail: dto.guestEmail || 'guest@example.com',
      bookerPhone: dto.guestPhone,
      bookerTimezone: dto.timezone,
      bookerContactId: dto.contactId, // UUID string
      scheduledStart: startTime,
      scheduledEnd: endTime,
      questionResponses: {},
      bookerNotes: dto.notes,
      status: bookingLink.requiresApproval ? 'pending' : 'confirmed',
    };

    const [booking] = await this.db
      .insert(bookings)
      .values(bookingData)
      .returning();

    // Create calendar event for the booking
    if (booking.status === 'confirmed') {
      await this.createEventForBooking(booking, bookingLink);
    }

    // Increment booking counter
    await this.bookingLinksService.incrementBookingsCount(dto.bookingLinkId);

    return booking;
  }

  /**
   * Select a user for round-robin assignment
   */
  private async selectRoundRobinUser(
    bookingLinkId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<number> {
    const [bookingLink] = await this.db
      .select()
      .from(bookingLinks)
      .where(eq(bookingLinks.id, bookingLinkId));

    const members =
      await this.bookingLinksService.getActiveMembers(bookingLinkId);

    if (members.length === 0) {
      // Fallback to creator
      return bookingLink.createdBy;
    }

    if (members.length === 1) {
      return members[0].userId;
    }

    // Filter members by availability
    const availableMembers: typeof members = [];

    for (const member of members) {
      // Check if member has the slot available
      const isAvailable = await this.checkUserAvailability(
        member.userId,
        startTime,
        endTime,
      );
      if (isAvailable) {
        availableMembers.push(member);
      }
    }

    if (availableMembers.length === 0) {
      throw new BadRequestException(
        'No team members available for this time slot',
      );
    }

    // Round-robin mode selection
    if (bookingLink.roundRobinMode === 'equal_distribution') {
      // Select member with fewest assignments
      const sortedByAssignments = [...availableMembers].sort(
        (a, b) => (a.totalAssignments || 0) - (b.totalAssignments || 0),
      );
      const selected = sortedByAssignments[0];

      // Record assignment
      await this.bookingLinksService.recordAssignment(selected.id);

      return selected.userId;
    } else {
      // Default: availability-based (first available by priority)
      const sortedByPriority = [...availableMembers].sort(
        (a, b) => (a.priority || 0) - (b.priority || 0),
      );
      const selected = sortedByPriority[0];

      await this.bookingLinksService.recordAssignment(selected.id);

      return selected.userId;
    }
  }

  /**
   * Check if a user is available for a time slot
   */
  private async checkUserAvailability(
    userId: number,
    startTime: Date,
    endTime: Date,
  ): Promise<boolean> {
    // Check for conflicting bookings
    const conflictingBookings = await this.db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.assignedUserId, userId),
          lte(bookings.scheduledStart, endTime),
          gte(bookings.scheduledEnd, startTime),
          or(eq(bookings.status, 'pending'), eq(bookings.status, 'confirmed')),
        ),
      );

    if (conflictingBookings.length > 0) {
      return false;
    }

    // Check for conflicting calendar events
    const conflictingEvents = await this.db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.createdBy, userId),
          lte(calendarEvents.startTime, endTime),
          gte(calendarEvents.endTime, startTime),
          eq(calendarEvents.status, 'scheduled'),
        ),
      );

    return conflictingEvents.length === 0;
  }

  /**
   * Create a calendar event for a confirmed booking
   */
  private async createEventForBooking(
    booking: Booking,
    bookingLink: {
      name: string;
      description: string | null;
      calendarId: string | null;
      locationType: string;
      locationDetails: string | null;
      videoProvider: string | null;
    },
  ): Promise<void> {
    if (!bookingLink.calendarId) {
      return; // No calendar linked
    }

    const eventData: NewCalendarEvent = {
      calendarId: bookingLink.calendarId,
      title: `${bookingLink.name} with ${booking.bookerName}`,
      description: bookingLink.description,
      startTime: booking.scheduledStart,
      endTime: booking.scheduledEnd,
      isAllDay: false,
      eventType: 'meeting',
      location: bookingLink.locationDetails,
      isOnline: bookingLink.locationType === 'video',
      videoConferenceProvider: bookingLink.videoProvider,
      status: 'confirmed',
      visibility: 'private',
      organizerId: booking.assignedUserId,
    };

    const [event] = await this.db
      .insert(calendarEvents)
      .values(eventData)
      .returning();

    // Link event to booking
    await this.db
      .update(bookings)
      .set({ eventId: event.id })
      .where(eq(bookings.id, booking.id));
  }

  /**
   * Get a booking by ID
   */
  async findById(bookingId: string): Promise<Booking | null> {
    const [booking] = await this.db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId));

    return booking || null;
  }

  /**
   * Get bookings for a booking link
   */
  async findByBookingLink(
    bookingLinkId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<Booking[]> {
    const conditions = [eq(bookings.bookingLinkId, bookingLinkId)];

    if (startDate) {
      conditions.push(gte(bookings.scheduledStart, startDate));
    }
    if (endDate) {
      conditions.push(lte(bookings.scheduledStart, endDate));
    }

    return this.db
      .select()
      .from(bookings)
      .where(and(...conditions))
      .orderBy(desc(bookings.scheduledStart));
  }

  /**
   * Get bookings for a user (host)
   */
  async findByAssignedUser(
    userId: number,
    startDate?: Date,
    endDate?: Date,
    status?: string,
  ): Promise<Booking[]> {
    const conditions = [eq(bookings.assignedUserId, userId)];

    if (startDate) {
      conditions.push(gte(bookings.scheduledStart, startDate));
    }
    if (endDate) {
      conditions.push(lte(bookings.scheduledStart, endDate));
    }
    if (status) {
      conditions.push(eq(bookings.status, status));
    }

    return this.db
      .select()
      .from(bookings)
      .where(and(...conditions))
      .orderBy(desc(bookings.scheduledStart));
  }

  /**
   * Get bookings by booker email
   */
  async findByBookerEmail(bookerEmail: string): Promise<Booking[]> {
    return this.db
      .select()
      .from(bookings)
      .where(eq(bookings.bookerEmail, bookerEmail))
      .orderBy(desc(bookings.scheduledStart));
  }

  /**
   * Confirm a pending booking
   */
  async confirm(bookingId: string, userId: number): Promise<Booking> {
    const booking = await this.findById(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.assignedUserId !== userId) {
      throw new ForbiddenException('You cannot confirm this booking');
    }

    if (booking.status !== 'pending') {
      throw new BadRequestException('Booking is not pending confirmation');
    }

    const [updated] = await this.db
      .update(bookings)
      .set({ status: 'confirmed', updatedAt: new Date() })
      .where(eq(bookings.id, bookingId))
      .returning();

    // Create calendar event
    const [bookingLink] = await this.db
      .select()
      .from(bookingLinks)
      .where(eq(bookingLinks.id, booking.bookingLinkId));

    if (bookingLink) {
      await this.createEventForBooking(updated, bookingLink);
    }

    return updated;
  }

  /**
   * Reschedule a booking
   */
  async reschedule(
    bookingId: string,
    dto: RescheduleBookingDto,
    cancelledBy: 'booker' | 'host',
  ): Promise<Booking> {
    const booking = await this.findById(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status === 'cancelled' || booking.status === 'completed') {
      throw new BadRequestException('Cannot reschedule this booking');
    }

    const [bookingLink] = await this.db
      .select()
      .from(bookingLinks)
      .where(eq(bookingLinks.id, booking.bookingLinkId));

    if (!bookingLink) {
      throw new NotFoundException('Booking link not found');
    }

    const newStartTime = new Date(dto.newStartTime);
    const newEndTime = new Date(
      newStartTime.getTime() + bookingLink.duration * 60 * 1000,
    );

    // Validate new time slot
    const isAvailable = await this.availabilityService.isSlotAvailable(
      booking.bookingLinkId,
      newStartTime,
      newEndTime,
    );

    if (!isAvailable) {
      throw new BadRequestException('New time slot is not available');
    }

    // Update booking
    const [updated] = await this.db
      .update(bookings)
      .set({
        scheduledStart: newStartTime,
        scheduledEnd: newEndTime,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId))
      .returning();

    // Update linked calendar event
    if (booking.eventId) {
      await this.db
        .update(calendarEvents)
        .set({
          startTime: newStartTime,
          endTime: newEndTime,
          updatedAt: new Date(),
        })
        .where(eq(calendarEvents.id, booking.eventId));
    }

    return updated;
  }

  /**
   * Cancel a booking
   */
  async cancel(
    bookingId: string,
    dto: CancelBookingDto,
    cancelledBy: 'booker' | 'host' | 'system',
  ): Promise<Booking> {
    const booking = await this.findById(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status === 'cancelled') {
      throw new BadRequestException('Booking is already cancelled');
    }

    // Update booking status
    const [updated] = await this.db
      .update(bookings)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy,
        cancellationReason: dto.reason,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId))
      .returning();

    // Cancel linked calendar event
    if (booking.eventId) {
      await this.db
        .update(calendarEvents)
        .set({
          status: 'cancelled',
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(calendarEvents.id, booking.eventId));
    }

    return updated;
  }

  /**
   * Mark a booking as completed
   */
  async markCompleted(bookingId: string, userId: number): Promise<Booking> {
    const booking = await this.findById(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.assignedUserId !== userId) {
      throw new ForbiddenException('You cannot update this booking');
    }

    const [updated] = await this.db
      .update(bookings)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(bookings.id, bookingId))
      .returning();

    // Update linked calendar event
    if (booking.eventId) {
      await this.db
        .update(calendarEvents)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(calendarEvents.id, booking.eventId));
    }

    return updated;
  }

  /**
   * Mark a booking as no-show
   */
  async markNoShow(bookingId: string, userId: number): Promise<Booking> {
    const booking = await this.findById(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.assignedUserId !== userId) {
      throw new ForbiddenException('You cannot update this booking');
    }

    const [updated] = await this.db
      .update(bookings)
      .set({ status: 'no_show', updatedAt: new Date() })
      .where(eq(bookings.id, bookingId))
      .returning();

    return updated;
  }

  /**
   * Record that reminder was sent
   */
  async recordReminderSent(bookingId: string): Promise<void> {
    await this.db
      .update(bookings)
      .set({ reminderSentAt: new Date() })
      .where(eq(bookings.id, bookingId));
  }

  /**
   * Get upcoming bookings that need reminders
   */
  async getBookingsNeedingReminders(
    reminderMinutesBefore: number,
  ): Promise<Booking[]> {
    const reminderTime = new Date(
      Date.now() + reminderMinutesBefore * 60 * 1000,
    );
    const now = new Date();

    return this.db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.status, 'confirmed'),
          lte(bookings.scheduledStart, reminderTime),
          gte(bookings.scheduledStart, now),
          // Only bookings that haven't had reminders sent
          eq(bookings.reminderSentAt, null as unknown as Date),
        ),
      );
  }

  /**
   * Create a booking from public booking page (no authentication)
   */
  async createPublicBooking(data: {
    bookingLinkId: string;
    startTime: Date;
    endTime: Date;
    guestName: string;
    guestEmail: string;
    guestPhone?: string;
    guestNotes?: string;
    customAnswers?: Record<string, string>;
    timezone?: string;
    status: 'pending' | 'confirmed';
  }): Promise<Booking> {
    // Get booking link for assignment
    const [bookingLink] = await this.db
      .select()
      .from(bookingLinks)
      .where(eq(bookingLinks.id, data.bookingLinkId));

    if (!bookingLink) {
      throw new NotFoundException('Booking link not found');
    }

    // Determine assigned user
    let assignedUserId: number;

    if (bookingLink.isRoundRobin) {
      assignedUserId = await this.selectRoundRobinUser(
        data.bookingLinkId,
        data.startTime,
        data.endTime,
      );
    } else {
      const assignedUserIds = bookingLink.assignedUserIds as number[];
      assignedUserId = assignedUserIds?.[0] || bookingLink.createdBy;
    }

    // Generate confirmation code
    const confirmationCode = this.generateConfirmationCode();

    // Create booking
    const bookingData: NewBooking = {
      bookingLinkId: data.bookingLinkId,
      assignedUserId,
      bookerName: data.guestName,
      bookerEmail: data.guestEmail,
      bookerPhone: data.guestPhone,
      bookerTimezone: data.timezone,
      scheduledStart: data.startTime,
      scheduledEnd: data.endTime,
      questionResponses: data.customAnswers || {},
      bookerNotes: data.guestNotes,
      status: data.status,
      confirmationCode,
    };

    const [booking] = await this.db
      .insert(bookings)
      .values(bookingData)
      .returning();

    // Create calendar event for confirmed bookings
    if (booking.status === 'confirmed') {
      await this.createEventForBooking(booking, bookingLink);
    }

    // Increment booking counter
    await this.bookingLinksService.incrementBookingsCount(data.bookingLinkId);

    return booking;
  }

  /**
   * Get booking by confirmation code
   */
  async getByConfirmationCode(
    confirmationCode: string,
  ): Promise<Booking | null> {
    const [booking] = await this.db
      .select()
      .from(bookings)
      .where(eq(bookings.confirmationCode, confirmationCode));

    return booking || null;
  }

  /**
   * Cancel booking by confirmation code (for guest self-cancellation)
   */
  async cancelByConfirmationCode(
    confirmationCode: string,
    reason: string,
  ): Promise<Booking> {
    const [booking] = await this.db
      .select()
      .from(bookings)
      .where(eq(bookings.confirmationCode, confirmationCode));

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const [updated] = await this.db
      .update(bookings)
      .set({
        status: 'cancelled',
        cancellationReason: reason,
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id))
      .returning();

    // Cancel associated calendar event if exists
    if (booking.eventId) {
      await this.db
        .update(calendarEvents)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(calendarEvents.id, booking.eventId));
    }

    return updated;
  }

  /**
   * Generate a unique confirmation code
   */
  private generateConfirmationCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}
