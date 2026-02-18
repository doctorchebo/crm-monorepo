import { Injectable } from '@nestjs/common';
import {
  Booking,
  BookingLink,
  Calendar,
  CalendarEvent,
} from '../../../database/calendar.schema';
import {
  AiCancelEventDto,
  AiFindAvailabilityDto,
  AiRescheduleEventDto,
  AiScheduleEventDto,
  BookingQueryDto,
  BulkAvailabilityDto,
  CalendarQueryDto,
  CreateBookingDto,
  CreateBookingLinkDto,
  CreateCalendarDto,
  CreateEventDto,
  EventQueryDto,
  ShareCalendarDto,
  UpdateBookingLinkDto,
  UpdateCalendarAiSettingsDto,
  UpdateCalendarDto,
  UpdateEventDto,
} from '../dto';
import { AvailabilityService } from './availability.service';
import { BookingLinksService } from './booking-links.service';
import { BookingsService } from './bookings.service';
import { CalendarAiService } from './calendar-ai.service';
import { CalendarCrudService } from './calendar-crud.service';
import { CalendarShareService } from './calendar-share.service';
import { CalendarSyncService } from './calendar-sync.service';
import { EventAttendeesService } from './event-attendees.service';
import { EventRemindersService } from './event-reminders.service';
import { EventsService } from './events.service';

/**
 * CalendarService - Facade service for all calendar operations
 *
 * This service acts as the main entry point for calendar functionality,
 * delegating to specialized sub-services for specific operations.
 */
@Injectable()
export class CalendarService {
  constructor(
    private readonly calendarCrudService: CalendarCrudService,
    private readonly calendarShareService: CalendarShareService,
    private readonly eventsService: EventsService,
    private readonly eventAttendeesService: EventAttendeesService,
    private readonly eventRemindersService: EventRemindersService,
    private readonly bookingLinksService: BookingLinksService,
    private readonly bookingsService: BookingsService,
    private readonly availabilityService: AvailabilityService,
    private readonly calendarSyncService: CalendarSyncService,
    private readonly calendarAiService: CalendarAiService,
  ) {}

  // ============================================================
  // Calendar CRUD Operations
  // ============================================================

  async createCalendar(
    userId: number,
    teamId: number,
    dto: CreateCalendarDto,
  ): Promise<Calendar> {
    return this.calendarCrudService.create(userId, teamId, dto);
  }

  async getCalendars(
    userId: number,
    teamId: number,
    query?: CalendarQueryDto,
  ): Promise<Calendar[]> {
    return this.calendarCrudService.findAllForUser(userId, teamId, query);
  }

  async getCalendar(calendarId: string, userId: number): Promise<Calendar> {
    return this.calendarCrudService.findOneWithAccess(calendarId, userId);
  }

  async updateCalendar(
    calendarId: string,
    userId: number,
    dto: UpdateCalendarDto,
  ): Promise<Calendar> {
    return this.calendarCrudService.update(calendarId, userId, dto);
  }

  async deleteCalendar(calendarId: string, userId: number): Promise<void> {
    return this.calendarCrudService.delete(calendarId, userId);
  }

  async getOrCreateDefaultCalendar(
    userId: number,
    teamId: number,
  ): Promise<Calendar> {
    return this.calendarCrudService.getOrCreateDefaultCalendar(userId, teamId);
  }

  // ============================================================
  // Calendar Sharing
  // ============================================================

  async shareCalendar(
    calendarId: string,
    userId: number,
    dto: ShareCalendarDto,
  ) {
    return this.calendarShareService.shareCalendar(calendarId, userId, dto);
  }

  async unshareCalendar(
    calendarId: string,
    userId: number,
    sharedWithUserId: number,
  ) {
    return this.calendarShareService.unshareCalendar(
      calendarId,
      userId,
      sharedWithUserId,
    );
  }

  async getCalendarShares(calendarId: string, userId: number) {
    return this.calendarShareService.getCalendarShares(calendarId, userId);
  }

  // ============================================================
  // Event Operations
  // ============================================================

  async createEvent(
    userId: number,
    teamId: number,
    dto: CreateEventDto,
  ): Promise<CalendarEvent> {
    return this.eventsService.create(dto.calendarId, userId, dto);
  }

  async getEvents(
    userId: number,
    teamId: number,
    query?: EventQueryDto,
  ): Promise<CalendarEvent[]> {
    return this.eventsService.findAll(userId, teamId, query || {});
  }

  async getEvent(eventId: string, userId: number): Promise<CalendarEvent> {
    return this.eventsService.findByIdWithAccess(eventId, userId);
  }

  async updateEvent(
    eventId: string,
    userId: number,
    dto: UpdateEventDto,
  ): Promise<CalendarEvent> {
    return this.eventsService.update(eventId, userId, dto);
  }

  async deleteEvent(eventId: string, userId: number): Promise<void> {
    return this.eventsService.delete(eventId, userId);
  }

  async cancelEvent(
    eventId: string,
    userId: number,
    reason?: string,
  ): Promise<CalendarEvent> {
    return this.eventsService.cancel(eventId, userId, reason);
  }

  async getContactEvents(
    contactId: string,
    userId: number,
    teamId: number,
  ): Promise<CalendarEvent[]> {
    return this.eventsService.getByContact(userId, teamId, contactId);
  }

  async getChatEvents(
    chatId: string,
    userId: number,
    teamId: number,
  ): Promise<CalendarEvent[]> {
    return this.eventsService.getByChat(userId, teamId, chatId);
  }

  // ============================================================
  // Event Attendees
  // ============================================================

  async getEventAttendees(eventId: string) {
    return this.eventAttendeesService.getEventAttendees(eventId);
  }

  async respondToEvent(
    eventId: string,
    userId: number,
    response: 'accepted' | 'declined' | 'tentative',
    message?: string,
  ) {
    return this.eventAttendeesService.updateResponse(
      eventId,
      userId,
      response,
      message,
    );
  }

  // ============================================================
  // Event Reminders
  // ============================================================

  async getEventReminders(eventId: string) {
    return this.eventRemindersService.getEventReminders(eventId);
  }

  async setEventReminders(
    eventId: string,
    reminders: {
      reminderMethod: 'email' | 'push' | 'whatsapp' | 'in_app';
      minutesBefore: number;
    }[],
  ) {
    return this.eventRemindersService.setReminders(eventId, reminders);
  }

  // ============================================================
  // Booking Links
  // ============================================================

  async createBookingLink(
    userId: number,
    teamId: number,
    dto: CreateBookingLinkDto,
  ): Promise<BookingLink> {
    return this.bookingLinksService.create(userId, teamId, dto);
  }

  async getBookingLinks(
    userId: number,
    teamId: number,
  ): Promise<BookingLink[]> {
    return this.bookingLinksService.findAllForTeam(teamId);
  }

  async getBookingLink(
    id: string,
    userId: number,
    teamId: number,
  ): Promise<BookingLink> {
    return this.bookingLinksService.findByIdWithAccess(id, userId, teamId);
  }

  async getBookingLinkBySlug(
    teamId: number,
    slug: string,
  ): Promise<BookingLink | null> {
    return this.bookingLinksService.findBySlug(teamId, slug);
  }

  async updateBookingLink(
    id: string,
    userId: number,
    teamId: number,
    dto: UpdateBookingLinkDto,
  ): Promise<BookingLink> {
    return this.bookingLinksService.update(id, userId, teamId, dto);
  }

  async deleteBookingLink(
    id: string,
    userId: number,
    teamId: number,
  ): Promise<BookingLink> {
    return this.bookingLinksService.archive(id, userId, teamId);
  }

  async toggleBookingLinkActive(
    id: string,
    userId: number,
    teamId: number,
  ): Promise<BookingLink> {
    return this.bookingLinksService.toggleStatus(id, userId, teamId);
  }

  // ============================================================
  // Bookings
  // ============================================================

  async createBooking(dto: CreateBookingDto): Promise<Booking> {
    return this.bookingsService.create(dto);
  }

  async getBookings(
    userId: number,
    query?: BookingQueryDto,
  ): Promise<Booking[]> {
    return this.bookingsService.findByAssignedUser(
      userId,
      query?.startDate ? new Date(query.startDate) : undefined,
      query?.endDate ? new Date(query.endDate) : undefined,
    );
  }

  async getBooking(id: string): Promise<Booking | null> {
    return this.bookingsService.findById(id);
  }

  async confirmBooking(id: string, userId: number): Promise<Booking> {
    return this.bookingsService.confirm(id, userId);
  }

  async cancelBooking(id: string, reason?: string): Promise<Booking> {
    return this.bookingsService.cancel(id, { reason }, 'host');
  }

  async rescheduleBooking(
    id: string,
    newStartTime: string,
    reason?: string,
  ): Promise<Booking> {
    return this.bookingsService.reschedule(
      id,
      { newStartTime, reason },
      'host',
    );
  }

  async getContactBookings(contactId: string): Promise<Booking[]> {
    // Find bookings by booker contact ID - for now return empty
    // TODO: Add findByContactId method to bookings service
    return [];
  }

  // ============================================================
  // Availability
  // ============================================================

  async getAvailabilityRules(userId: number, bookingLinkId?: string) {
    return this.availabilityService.getRules(userId, bookingLinkId);
  }

  async setWeeklyAvailability(userId: number, dto: BulkAvailabilityDto) {
    return this.availabilityService.setBulkAvailability(userId, dto);
  }

  async getAvailableSlots(
    bookingLinkId: string,
    date: Date,
    durationMinutes?: number,
  ) {
    return this.availabilityService.getAvailableSlots(
      bookingLinkId,
      date,
      durationMinutes || 30, // Default to 30 minutes
    );
  }

  // ============================================================
  // Calendar Sync
  // ============================================================

  async getSyncConnections(userId: number) {
    return this.calendarSyncService.getConnections(userId);
  }

  async initiateSyncOAuth(
    userId: number,
    provider: 'google' | 'outlook' | 'apple',
    calendarId?: string,
  ) {
    return this.calendarSyncService.generateAuthUrl(
      { provider, calendarId },
      userId,
    );
  }

  async triggerSync(userId: number, connectionId?: string) {
    return this.calendarSyncService.triggerSync(userId, { connectionId });
  }

  async deleteSyncConnection(connectionId: string, userId: number) {
    return this.calendarSyncService.deleteConnection(connectionId, userId);
  }

  // ============================================================
  // AI Calendar Operations
  // ============================================================

  async getAiSettings(userId: number) {
    return this.calendarAiService.getSettings(userId);
  }

  async updateAiSettings(userId: number, dto: UpdateCalendarAiSettingsDto) {
    return this.calendarAiService.updateSettings(userId, dto);
  }

  async aiCheckAvailability(
    userId: number,
    teamId: number,
    dto: AiFindAvailabilityDto,
  ) {
    return this.calendarAiService.checkAvailability(userId, teamId, dto);
  }

  async aiScheduleEvent(
    userId: number,
    teamId: number,
    dto: AiScheduleEventDto,
  ) {
    return this.calendarAiService.createEvent(userId, teamId, dto);
  }

  async aiRescheduleEvent(userId: number, dto: AiRescheduleEventDto) {
    return this.calendarAiService.rescheduleEvent(userId, dto);
  }

  async aiCancelEvent(userId: number, dto: AiCancelEventDto) {
    return this.calendarAiService.cancelEvent(userId, dto);
  }

  async aiSuggestTimes(userId: number, teamId: number, durationMinutes = 30) {
    return this.calendarAiService.suggestTimes(userId, teamId, {
      durationMinutes,
    });
  }

  async getAiActionHistory(userId: number, limit?: number) {
    return this.calendarAiService.getActionHistory(userId, limit);
  }
}
