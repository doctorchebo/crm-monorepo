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
  id: string; // UUID
  calendarId: string; // alias for id, mapped in API client
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
  id: string; // UUID
  eventId: string; // alias for id, mapped in API client
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
  id: string; // UUID
  bookingLinkId: string; // alias for id, mapped in API client
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

/** Raw shape returned directly by the backend DB (what the API actually sends) */
interface RawAvailabilityRule {
  id: string;
  userId: number | null;
  bookingLinkId: string | null;
  ruleType: string;
  daysOfWeek: number[];
  startMinutes: number;
  endMinutes: number;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Frontend-friendly availability rule (one entry per day) */
export interface AvailabilityRule {
  id: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  timezone: string;
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
  attendeeEmails?: string[];
  reminders?: Array<{
    type: ReminderType;
    minutesBefore: number;
  }>;
  skipAvailabilityCheck?: boolean;
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
  bookingLinkId?: string;
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

export interface InitiateOAuthDto {
  provider: CalendarProvider;
  calendarId?: string;
  syncDirection?: SyncDirection;
  syncFrequency?: SyncFrequency;
  redirectUri?: string;
}

export interface CompleteOAuthDto {
  code: string;
  state: string;
  provider: CalendarProvider;
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

// ==================== Response Mappers ====================

// The backend returns Drizzle objects where the primary key is `id` (UUID string).
// The frontend interfaces expect `calendarId` / `eventId` as the public identifier.
// These mappers bridge the gap without changing the existing frontend code.

function mapCalendar(raw: Record<string, unknown>): Calendar {
  return { ...(raw as Calendar), calendarId: raw.id as string };
}

function mapCalendarEvent(raw: Record<string, unknown>): CalendarEvent {
  return { ...(raw as CalendarEvent), eventId: raw.id as string };
}

function mapBookingLink(raw: Record<string, unknown>): BookingLink {
  return { ...(raw as BookingLink), bookingLinkId: raw.id as string };
}

// ==================== Calendar API Client ====================

// ==================== Availability helpers ====================
// Backend stores days as numbers (0 = Sunday) and times as minutes-from-midnight.
// These helpers translate between that representation and the frontend DayOfWeek strings.
const DAY_NUM_TO_NAME: Record<number, DayOfWeek> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};
const DAY_NAME_TO_NUM: Record<DayOfWeek, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};
const minutesToTime = (mins: number): string => {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
};
const mapRawAvailabilityRule = (
  raw: RawAvailabilityRule,
): AvailabilityRule[] => {
  // daysOfWeek is JSONB — pg driver normally returns a parsed array, but can
  // return a JSON string in some configurations. Handle both defensively.
  const days: number[] = Array.isArray(raw.daysOfWeek)
    ? (raw.daysOfWeek as number[])
    : typeof raw.daysOfWeek === "string"
      ? (JSON.parse(raw.daysOfWeek) as number[])
      : [];
  return days.map((dayNum) => ({
    id: raw.id,
    dayOfWeek: DAY_NUM_TO_NAME[dayNum],
    startTime: minutesToTime(raw.startMinutes),
    endTime: minutesToTime(raw.endMinutes),
    // Use isActive to determine availability (handles both legacy ruleType and new isActive flag)
    isAvailable: raw.isActive !== false && raw.ruleType !== "unavailable",
    timezone: raw.timezone,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }));
};

export const calendarApi = {
  // Calendar CRUD
  calendars: {
    list: (): Promise<Calendar[]> =>
      apiClient
        .get<Record<string, unknown>[]>("/calendar/calendars")
        .then((items) => items.map(mapCalendar)),

    get: (calendarId: string): Promise<Calendar> =>
      apiClient
        .get<Record<string, unknown>>(`/calendar/calendars/${calendarId}`)
        .then(mapCalendar),

    create: (data: CreateCalendarDto): Promise<Calendar> =>
      apiClient
        .post<Record<string, unknown>>("/calendar/calendars", data)
        .then(mapCalendar),

    update: (calendarId: string, data: UpdateCalendarDto): Promise<Calendar> =>
      apiClient
        .patch<
          Record<string, unknown>
        >(`/calendar/calendars/${calendarId}`, data)
        .then(mapCalendar),

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
      return apiClient
        .get<
          Record<string, unknown>[]
        >(`/calendar/events?${searchParams.toString()}`)
        .then((items) => ({
          items: items.map(mapCalendarEvent),
          total: items.length,
          page: 1,
          pageSize: items.length,
          totalPages: 1,
        }));
    },

    get: (eventId: string): Promise<CalendarEvent> =>
      apiClient
        .get<Record<string, unknown>>(`/calendar/events/${eventId}`)
        .then(mapCalendarEvent),

    create: (data: CreateEventDto): Promise<CalendarEvent> =>
      apiClient
        .post<Record<string, unknown>>("/calendar/events", data)
        .then(mapCalendarEvent),

    update: (eventId: string, data: UpdateEventDto): Promise<CalendarEvent> =>
      apiClient
        .patch<Record<string, unknown>>(`/calendar/events/${eventId}`, data)
        .then(mapCalendarEvent),

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
      apiClient
        .get<Record<string, unknown>[]>("/calendar/booking/links")
        .then((items) => items.map(mapBookingLink)),

    get: (bookingLinkId: string): Promise<BookingLink> =>
      apiClient
        .get<
          Record<string, unknown>
        >(`/calendar/booking/links/${bookingLinkId}`)
        .then(mapBookingLink),

    getBySlug: (slug: string): Promise<BookingLink> =>
      apiClient
        .get<Record<string, unknown>>(`/calendar/booking/links/slug/${slug}`)
        .then(mapBookingLink),

    create: (data: CreateBookingLinkDto): Promise<BookingLink> =>
      apiClient
        .post<Record<string, unknown>>("/calendar/booking/links", data)
        .then(mapBookingLink),

    update: (
      bookingLinkId: string,
      data: UpdateBookingLinkDto,
    ): Promise<BookingLink> =>
      apiClient
        .patch<
          Record<string, unknown>
        >(`/calendar/booking/links/${bookingLinkId}`, data)
        .then(mapBookingLink),

    delete: (bookingLinkId: string): Promise<{ success: boolean }> =>
      apiClient.delete(`/calendar/booking/links/${bookingLinkId}`),

    // Members (round-robin)
    addMember: (
      bookingLinkId: string,
      userId: number,
      priority?: number,
    ): Promise<BookingLinkMember> =>
      apiClient.post(`/calendar/booking/links/${bookingLinkId}/members`, {
        userId,
        priority,
      }),

    removeMember: (
      bookingLinkId: string,
      memberId: number,
    ): Promise<{ success: boolean }> =>
      apiClient.delete(
        `/calendar/booking/links/${bookingLinkId}/members/${memberId}`,
      ),

    updateMemberPriority: (
      bookingLinkId: string,
      memberId: number,
      priority: number,
    ): Promise<BookingLinkMember> =>
      apiClient.patch(
        `/calendar/booking/links/${bookingLinkId}/members/${memberId}`,
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
      return apiClient.get(
        `/calendar/booking/bookings?${searchParams.toString()}`,
      );
    },

    get: (bookingId: string): Promise<Booking> =>
      apiClient.get(`/calendar/booking/bookings/${bookingId}`),

    // Public endpoint for guests to create bookings
    create: (data: CreateBookingDto): Promise<Booking> =>
      apiClient.post("/calendar/booking/bookings", data),

    confirm: (bookingId: string): Promise<Booking> =>
      apiClient.post(`/calendar/booking/bookings/${bookingId}/confirm`),

    cancel: (bookingId: string, reason?: string): Promise<Booking> =>
      apiClient.post(`/calendar/booking/bookings/${bookingId}/cancel`, {
        reason,
      }),

    reschedule: (bookingId: string, newStartTime: string): Promise<Booking> =>
      apiClient.post(`/calendar/booking/bookings/${bookingId}/reschedule`, {
        scheduledStartTime: newStartTime,
      }),

    markNoShow: (bookingId: string): Promise<Booking> =>
      apiClient.post(`/calendar/booking/bookings/${bookingId}/no-show`),

    markCompleted: (bookingId: string): Promise<Booking> =>
      apiClient.post(`/calendar/booking/bookings/${bookingId}/complete`),
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
      return apiClient
        .get<
          RawAvailabilityRule[]
        >(`/calendar/availability/rules?${searchParams.toString()}`)
        .then((raw) => raw.flatMap(mapRawAvailabilityRule));
    },

    setRules: (data: SetAvailabilityDto): Promise<AvailabilityRule[]> => {
      // Convert frontend rule format to the backend's BulkAvailabilityDto.
      // - Include ALL days with their isAvailable status (so "all unavailable" is distinguishable from "first-time user").
      // - Convert string day names to numeric (0=Sunday).
      const weeklySchedule = data.rules.map((r) => ({
        dayOfWeek: DAY_NAME_TO_NUM[r.dayOfWeek],
        slots: [{ startTime: r.startTime, endTime: r.endTime }],
        isAvailable: r.isAvailable,
      }));
      return apiClient
        .post<RawAvailabilityRule[]>("/calendar/availability/weekly", {
          weeklySchedule,
          bookingLinkId: data.bookingLinkId,
        })
        .then((raw) => raw.flatMap(mapRawAvailabilityRule));
    },

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

    initiateOAuth: (data: InitiateOAuthDto): Promise<{ url: string }> =>
      apiClient.post("/calendar/sync/oauth/initiate", data),

    completeOAuth: (data: CompleteOAuthDto): Promise<CalendarSyncConnection> =>
      apiClient.post("/calendar/sync/oauth/callback", data),

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
