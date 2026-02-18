/**
 * Calendar API Types and Client
 * Comprehensive calendar system for CRM with scheduling, booking, and external sync
 */
import { apiClient } from "./client";

// ==================== Calendar Types ====================

export type CalendarProvider = "google" | "outlook" | "apple";
export type CalendarEventStatus = "confirmed" | "tentative" | "cancelled";
export type AttendeeStatus = "pending" | "accepted" | "declined" | "tentative";
export type ReminderType = "email" | "push" | "sms";
export type BookingLinkStatus = "active" | "paused" | "archived";
export type RoundRobinMode =
  | "equal_distribution"
  | "availability_first"
  | "least_recently_booked";
export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";
export type SyncDirection =
  | "one_way_to_external"
  | "one_way_from_external"
  | "two_way";
export type SyncFrequency =
  | "realtime"
  | "every_5_minutes"
  | "every_15_minutes"
  | "every_hour"
  | "manual";
export type AiCalendarPermission =
  | "suggest_only"
  | "create_with_approval"
  | "full_autonomy";
export type BookingStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

// ==================== Calendar Interfaces ====================

export interface Calendar {
  id: number;
  calendarId: string;
  teamId: number;
  name: string;
  description: string | null;
  color: string | null;
  timezone: string;
  isDefault: boolean;
  isShared: boolean;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEvent {
  id: number;
  eventId: string;
  calendarId: number;
  title: string;
  description: string | null;
  location: string | null;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  status: CalendarEventStatus;
  recurrenceRule: string | null;
  recurrenceEnd: string | null;
  videoConferenceUrl: string | null;
  videoConferenceProvider: string | null;
  relatedContactId: number | null;
  relatedChatId: string | null;
  bookingId: number | null;
  externalEventId: string | null;
  externalCalendarId: string | null;
  metadata: Record<string, unknown> | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  // Relations
  attendees?: EventAttendee[];
  reminders?: EventReminder[];
  contact?: {
    contactId: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phoneNumber: string;
  } | null;
}

export interface EventAttendee {
  id: number;
  eventId: number;
  email: string;
  name: string | null;
  status: AttendeeStatus;
  isOrganizer: boolean;
  responseTime: string | null;
  createdAt: string;
}

export interface EventReminder {
  id: number;
  eventId: number;
  reminderType: ReminderType;
  minutesBefore: number;
  isSent: boolean;
  sentAt: string | null;
  createdAt: string;
}

export interface CalendarShare {
  id: number;
  shareId: string;
  calendarId: number;
  sharedWithUserId: number | null;
  sharedWithTeamId: number | null;
  canEdit: boolean;
  canDelete: boolean;
  canInvite: boolean;
  sharedBy: number;
  createdAt: string;
  // Relations
  sharedWithUser?: { id: number; name: string; email: string };
}

export interface BookingLink {
  id: number;
  bookingLinkId: string;
  teamId: number;
  calendarId: number;
  slug: string;
  name: string;
  description: string | null;
  duration: number;
  bufferBefore: number;
  bufferAfter: number;
  minNotice: number;
  maxAdvance: number;
  status: BookingLinkStatus;
  isRoundRobin: boolean;
  roundRobinMode: RoundRobinMode | null;
  requiresApproval: boolean;
  confirmationEmailTemplate: string | null;
  reminderEmailTemplate: string | null;
  customFields: Array<{
    name: string;
    label: string;
    type: "text" | "email" | "phone" | "select" | "textarea";
    required: boolean;
    options?: string[];
  }>;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  // Computed
  publicUrl?: string;
  // Relations
  members?: BookingLinkMember[];
  calendar?: Calendar;
}

export interface BookingLinkMember {
  id: number;
  bookingLinkId: number;
  userId: number;
  priority: number;
  isActive: boolean;
  createdAt: string;
  // Relations
  user?: { id: number; name: string; email: string };
}

export interface AvailabilityRule {
  id: number;
  ruleId: string;
  teamId: number;
  userId: number | null;
  bookingLinkId: number | null;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilityOverride {
  id: number;
  overrideId: string;
  teamId: number;
  userId: number | null;
  bookingLinkId: number | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  isAvailable: boolean;
  reason: string | null;
  createdAt: string;
}

export interface Booking {
  id: number;
  bookingId: string;
  bookingLinkId: number;
  eventId: number | null;
  contactId: number | null;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  scheduledStartTime: string;
  scheduledEndTime: string;
  status: BookingStatus;
  assignedUserId: number | null;
  notes: string | null;
  customFieldValues: Record<string, unknown>;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  // Relations
  bookingLink?: BookingLink;
  event?: CalendarEvent;
  contact?: {
    contactId: string;
    firstName: string;
    lastName: string | null;
  };
  assignedUser?: { id: number; name: string; email: string };
}

export interface CalendarSyncConnection {
  id: number;
  connectionId: string;
  teamId: number;
  userId: number;
  calendarId: number;
  provider: CalendarProvider;
  externalAccountId: string;
  externalCalendarId: string | null;
  syncDirection: SyncDirection;
  syncFrequency: SyncFrequency;
  isActive: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarAiSettings {
  id: number;
  teamId: number;
  userId: number | null;
  calendarId: number | null;
  isEnabled: boolean;
  permissionLevel: AiCalendarPermission;
  canCreateEvents: boolean;
  canModifyEvents: boolean;
  canDeleteEvents: boolean;
  canManageBookings: boolean;
  autoScheduleEnabled: boolean;
  preferredMeetingDuration: number;
  workingHoursStart: string | null;
  workingHoursEnd: string | null;
  workingDays: DayOfWeek[];
  createdAt: string;
  updatedAt: string;
}

// ==================== DTOs ====================

export interface CreateCalendarDto {
  name: string;
  description?: string;
  color?: string;
  timezone?: string;
  isDefault?: boolean;
}

export interface UpdateCalendarDto {
  name?: string;
  description?: string;
  color?: string;
  timezone?: string;
  isDefault?: boolean;
}

export interface CreateEventDto {
  calendarId?: string;
  title: string;
  description?: string;
  location?: string;
  startTime: string;
  endTime: string;
  isAllDay?: boolean;
  status?: CalendarEventStatus;
  recurrenceRule?: string;
  recurrenceEnd?: string;
  videoConferenceUrl?: string;
  videoConferenceProvider?: string;
  relatedContactId?: number;
  relatedChatId?: string;
  attendees?: Array<{
    email: string;
    name?: string;
    isOrganizer?: boolean;
  }>;
  reminders?: Array<{
    type: ReminderType;
    minutesBefore: number;
  }>;
}

export interface UpdateEventDto extends Partial<CreateEventDto> {}

export interface EventQueryParams {
  calendarId?: string;
  startDate?: string;
  endDate?: string;
  status?: CalendarEventStatus;
  contactId?: number;
  chatId?: string;
  includeAttendees?: boolean;
  includeReminders?: boolean;
  page?: number;
  take?: number;
}

export interface CreateBookingLinkDto {
  calendarId: string;
  slug: string;
  name: string;
  description?: string;
  duration: number;
  bufferBefore?: number;
  bufferAfter?: number;
  minNotice?: number;
  maxAdvance?: number;
  isRoundRobin?: boolean;
  roundRobinMode?: RoundRobinMode;
  requiresApproval?: boolean;
  customFields?: BookingLink["customFields"];
  memberIds?: number[];
}

export interface UpdateBookingLinkDto extends Partial<
  Omit<CreateBookingLinkDto, "slug">
> {
  status?: BookingLinkStatus;
}

export interface CreateBookingDto {
  bookingLinkId: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  scheduledStartTime: string;
  notes?: string;
  customFieldValues?: Record<string, unknown>;
}

export interface AvailabilitySlot {
  start: string;
  end: string;
}

export interface AvailabilityQueryParams {
  bookingLinkId?: string;
  userId?: number;
  startDate: string;
  endDate: string;
  duration?: number;
}

export interface SetAvailabilityDto {
  userId?: number;
  bookingLinkId?: number;
  rules: Array<{
    dayOfWeek: DayOfWeek;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
  }>;
}

export interface SetAvailabilityOverrideDto {
  userId?: number;
  bookingLinkId?: number;
  date: string;
  startTime?: string;
  endTime?: string;
  isAvailable: boolean;
  reason?: string;
}

export interface CreateSyncConnectionDto {
  calendarId: string;
  provider: CalendarProvider;
  authCode: string;
  syncDirection?: SyncDirection;
  syncFrequency?: SyncFrequency;
}

export interface UpdateAiSettingsDto {
  calendarId?: number;
  isEnabled?: boolean;
  permissionLevel?: AiCalendarPermission;
  canCreateEvents?: boolean;
  canModifyEvents?: boolean;
  canDeleteEvents?: boolean;
  canManageBookings?: boolean;
  autoScheduleEnabled?: boolean;
  preferredMeetingDuration?: number;
  workingHoursStart?: string;
  workingHoursEnd?: string;
  workingDays?: DayOfWeek[];
}

export interface ShareCalendarDto {
  calendarId: string;
  sharedWithUserId?: number;
  sharedWithTeamId?: number;
  canEdit?: boolean;
  canDelete?: boolean;
  canInvite?: boolean;
}

// ==================== Response Types ====================

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AvailabilityResponse {
  slots: AvailabilitySlot[];
  timezone: string;
  bookingLink?: {
    name: string;
    duration: number;
    bufferBefore: number;
    bufferAfter: number;
  };
}

export interface SyncOAuthUrlResponse {
  url: string;
  state: string;
}

// ==================== Calendar API Client ====================

export const calendarApi = {
  // Calendar CRUD
  calendars: {
    list: (): Promise<Calendar[]> => apiClient.get("/calendar/calendars"),

    get: (calendarId: string): Promise<Calendar> =>
      apiClient.get(`/calendar/calendars/${calendarId}`),

    create: (data: CreateCalendarDto): Promise<Calendar> =>
      apiClient.post("/calendar/calendars", data),

    update: (calendarId: string, data: UpdateCalendarDto): Promise<Calendar> =>
      apiClient.patch(`/calendar/calendars/${calendarId}`, data),

    delete: (calendarId: string): Promise<{ success: boolean }> =>
      apiClient.delete(`/calendar/calendars/${calendarId}`),

    // Sharing
    share: (data: ShareCalendarDto): Promise<CalendarShare> =>
      apiClient.post("/calendar/calendars/share", data),

    removeShare: (shareId: string): Promise<{ success: boolean }> =>
      apiClient.delete(`/calendar/calendars/shares/${shareId}`),

    getShares: (calendarId: string): Promise<CalendarShare[]> =>
      apiClient.get(`/calendar/calendars/${calendarId}/shares`),
  },

  // Events CRUD
  events: {
    list: (
      params?: EventQueryParams,
    ): Promise<PaginatedResponse<CalendarEvent>> => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            searchParams.append(key, String(value));
          }
        });
      }
      return apiClient.get(`/calendar/events?${searchParams.toString()}`);
    },

    get: (eventId: string): Promise<CalendarEvent> =>
      apiClient.get(`/calendar/events/${eventId}`),

    create: (data: CreateEventDto): Promise<CalendarEvent> =>
      apiClient.post("/calendar/events", data),

    update: (eventId: string, data: UpdateEventDto): Promise<CalendarEvent> =>
      apiClient.patch(`/calendar/events/${eventId}`, data),

    delete: (eventId: string): Promise<{ success: boolean }> =>
      apiClient.delete(`/calendar/events/${eventId}`),

    // Attendee management
    addAttendee: (
      eventId: string,
      data: { email: string; name?: string },
    ): Promise<EventAttendee> =>
      apiClient.post(`/calendar/events/${eventId}/attendees`, data),

    removeAttendee: (
      eventId: string,
      attendeeId: number,
    ): Promise<{ success: boolean }> =>
      apiClient.delete(`/calendar/events/${eventId}/attendees/${attendeeId}`),

    updateAttendeeStatus: (
      eventId: string,
      attendeeId: number,
      status: AttendeeStatus,
    ): Promise<EventAttendee> =>
      apiClient.patch(`/calendar/events/${eventId}/attendees/${attendeeId}`, {
        status,
      }),
  },

  // Booking Links
  bookingLinks: {
    list: (): Promise<BookingLink[]> =>
      apiClient.get("/calendar/booking-links"),

    get: (bookingLinkId: string): Promise<BookingLink> =>
      apiClient.get(`/calendar/booking-links/${bookingLinkId}`),

    getBySlug: (slug: string): Promise<BookingLink> =>
      apiClient.get(`/calendar/booking-links/slug/${slug}`),

    create: (data: CreateBookingLinkDto): Promise<BookingLink> =>
      apiClient.post("/calendar/booking-links", data),

    update: (
      bookingLinkId: string,
      data: UpdateBookingLinkDto,
    ): Promise<BookingLink> =>
      apiClient.patch(`/calendar/booking-links/${bookingLinkId}`, data),

    delete: (bookingLinkId: string): Promise<{ success: boolean }> =>
      apiClient.delete(`/calendar/booking-links/${bookingLinkId}`),

    // Members (round-robin)
    addMember: (
      bookingLinkId: string,
      userId: number,
      priority?: number,
    ): Promise<BookingLinkMember> =>
      apiClient.post(`/calendar/booking-links/${bookingLinkId}/members`, {
        userId,
        priority,
      }),

    removeMember: (
      bookingLinkId: string,
      memberId: number,
    ): Promise<{ success: boolean }> =>
      apiClient.delete(
        `/calendar/booking-links/${bookingLinkId}/members/${memberId}`,
      ),

    updateMemberPriority: (
      bookingLinkId: string,
      memberId: number,
      priority: number,
    ): Promise<BookingLinkMember> =>
      apiClient.patch(
        `/calendar/booking-links/${bookingLinkId}/members/${memberId}`,
        { priority },
      ),
  },

  // Bookings
  bookings: {
    list: (params?: {
      bookingLinkId?: string;
      status?: BookingStatus;
      startDate?: string;
      endDate?: string;
      page?: number;
      take?: number;
    }): Promise<PaginatedResponse<Booking>> => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            searchParams.append(key, String(value));
          }
        });
      }
      return apiClient.get(`/calendar/bookings?${searchParams.toString()}`);
    },

    get: (bookingId: string): Promise<Booking> =>
      apiClient.get(`/calendar/bookings/${bookingId}`),

    // Public endpoint for guests to create bookings
    create: (data: CreateBookingDto): Promise<Booking> =>
      apiClient.post("/calendar/bookings", data),

    confirm: (bookingId: string): Promise<Booking> =>
      apiClient.post(`/calendar/bookings/${bookingId}/confirm`),

    cancel: (bookingId: string, reason?: string): Promise<Booking> =>
      apiClient.post(`/calendar/bookings/${bookingId}/cancel`, { reason }),

    reschedule: (bookingId: string, newStartTime: string): Promise<Booking> =>
      apiClient.post(`/calendar/bookings/${bookingId}/reschedule`, {
        scheduledStartTime: newStartTime,
      }),

    markNoShow: (bookingId: string): Promise<Booking> =>
      apiClient.post(`/calendar/bookings/${bookingId}/no-show`),

    markCompleted: (bookingId: string): Promise<Booking> =>
      apiClient.post(`/calendar/bookings/${bookingId}/complete`),
  },

  // Availability
  availability: {
    getSlots: (
      params: AvailabilityQueryParams,
    ): Promise<AvailabilityResponse> => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      return apiClient.get(
        `/calendar/availability/slots?${searchParams.toString()}`,
      );
    },

    getRules: (params?: {
      userId?: number;
      bookingLinkId?: number;
    }): Promise<AvailabilityRule[]> => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            searchParams.append(key, String(value));
          }
        });
      }
      return apiClient.get(
        `/calendar/availability/rules?${searchParams.toString()}`,
      );
    },

    setRules: (data: SetAvailabilityDto): Promise<AvailabilityRule[]> =>
      apiClient.post("/calendar/availability/rules", data),

    getOverrides: (params?: {
      userId?: number;
      bookingLinkId?: number;
      startDate?: string;
      endDate?: string;
    }): Promise<AvailabilityOverride[]> => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            searchParams.append(key, String(value));
          }
        });
      }
      return apiClient.get(
        `/calendar/availability/overrides?${searchParams.toString()}`,
      );
    },

    setOverride: (
      data: SetAvailabilityOverrideDto,
    ): Promise<AvailabilityOverride> =>
      apiClient.post("/calendar/availability/overrides", data),

    deleteOverride: (overrideId: string): Promise<{ success: boolean }> =>
      apiClient.delete(`/calendar/availability/overrides/${overrideId}`),
  },

  // External Calendar Sync
  sync: {
    getConnections: (): Promise<CalendarSyncConnection[]> =>
      apiClient.get("/calendar/sync/connections"),

    getOAuthUrl: (provider: CalendarProvider): Promise<SyncOAuthUrlResponse> =>
      apiClient.get(`/calendar/sync/oauth/${provider}`),

    connect: (data: CreateSyncConnectionDto): Promise<CalendarSyncConnection> =>
      apiClient.post("/calendar/sync/connect", data),

    disconnect: (connectionId: string): Promise<{ success: boolean }> =>
      apiClient.delete(`/calendar/sync/connections/${connectionId}`),

    triggerSync: (
      connectionId: string,
    ): Promise<{ success: boolean; message: string }> =>
      apiClient.post(`/calendar/sync/connections/${connectionId}/sync`),

    getSyncLogs: (
      connectionId: string,
      params?: { page?: number; take?: number },
    ): Promise<
      PaginatedResponse<{
        id: number;
        action: string;
        status: string;
        eventsProcessed: number;
        errorMessage: string | null;
        startedAt: string;
        completedAt: string | null;
      }>
    > => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            searchParams.append(key, String(value));
          }
        });
      }
      return apiClient.get(
        `/calendar/sync/connections/${connectionId}/logs?${searchParams.toString()}`,
      );
    },
  },

  // AI Settings
  aiSettings: {
    get: (): Promise<CalendarAiSettings | null> =>
      apiClient.get("/calendar/ai-settings"),

    update: (data: UpdateAiSettingsDto): Promise<CalendarAiSettings> =>
      apiClient.patch("/calendar/ai-settings", data),
  },
};

export default calendarApi;
