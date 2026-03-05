/**
 * Calendar Hooks
 * React hooks for calendar data fetching and state management
 */
"use client";

import { useNotification } from "@/hooks/use-notification";
import {
  calendarApi,
  type AvailabilityQueryParams,
  type AvailabilityRule,
  type BookingLink,
  type Calendar,
  type CalendarAiSettings,
  type CalendarSyncConnection,
  type CreateBookingLinkDto,
  type CreateEventDto,
  type EventQueryParams,
  type SetAvailabilityDto,
  type UpdateBookingLinkDto,
  type UpdateEventDto,
} from "@/lib/api/calendar";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { useCallback, useMemo, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";

// ==================== View Types ====================

export type CalendarView = "month" | "week" | "day" | "agenda";

// ==================== useCalendars ====================

export function useCalendars() {
  const { addNotification } = useNotification();

  const { data, error, isLoading, mutate } = useSWR<Calendar[]>(
    "calendars",
    () => calendarApi.calendars.list(),
    { revalidateOnFocus: false },
  );

  const createCalendar = useCallback(
    async (input: Parameters<typeof calendarApi.calendars.create>[0]) => {
      try {
        const result = await calendarApi.calendars.create(input);
        await mutate();
        addNotification("Calendar created successfully", "success");
        return result;
      } catch (err) {
        addNotification("Failed to create calendar", "error");
        throw err;
      }
    },
    [mutate, addNotification],
  );

  const updateCalendar = useCallback(
    async (
      calendarId: string,
      input: Parameters<typeof calendarApi.calendars.update>[1],
    ) => {
      try {
        const result = await calendarApi.calendars.update(calendarId, input);
        await mutate();
        addNotification("Calendar updated successfully", "success");
        return result;
      } catch (err) {
        addNotification("Failed to update calendar", "error");
        throw err;
      }
    },
    [mutate, addNotification],
  );

  const deleteCalendar = useCallback(
    async (calendarId: string) => {
      try {
        await calendarApi.calendars.delete(calendarId);
        await mutate();
        addNotification("Calendar deleted successfully", "success");
      } catch (err) {
        addNotification("Failed to delete calendar", "error");
        throw err;
      }
    },
    [mutate, addNotification],
  );

  const defaultCalendar = useMemo(
    () => data?.find((c) => c.isDefault) || data?.[0],
    [data],
  );

  return {
    calendars: data || [],
    defaultCalendar,
    isLoading,
    error,
    createCalendar,
    updateCalendar,
    deleteCalendar,
    mutate,
  };
}

// ==================== useCalendarView ====================

export interface UseCalendarViewOptions {
  initialView?: CalendarView;
  initialDate?: Date;
}

export function useCalendarView(options: UseCalendarViewOptions = {}) {
  const { initialView = "month", initialDate = new Date() } = options;

  const [view, setView] = useState<CalendarView>(initialView);
  const [currentDate, setCurrentDate] = useState<Date>(initialDate);

  const dateRange = useMemo(() => {
    switch (view) {
      case "month": {
        const start = startOfWeek(startOfMonth(currentDate), {
          weekStartsOn: 0,
        });
        const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 });
        return { start, end };
      }
      case "week": {
        const start = startOfWeek(currentDate, { weekStartsOn: 0 });
        const end = endOfWeek(currentDate, { weekStartsOn: 0 });
        return { start, end };
      }
      case "day": {
        return { start: currentDate, end: currentDate };
      }
      case "agenda": {
        // Agenda shows 14 days from current date
        return { start: currentDate, end: addDays(currentDate, 14) };
      }
      default:
        return { start: currentDate, end: currentDate };
    }
  }, [view, currentDate]);

  const goToNext = useCallback(() => {
    switch (view) {
      case "month":
        setCurrentDate((d) => addMonths(d, 1));
        break;
      case "week":
        setCurrentDate((d) => addWeeks(d, 1));
        break;
      case "day":
        setCurrentDate((d) => addDays(d, 1));
        break;
      case "agenda":
        setCurrentDate((d) => addDays(d, 14));
        break;
    }
  }, [view]);

  const goToPrevious = useCallback(() => {
    switch (view) {
      case "month":
        setCurrentDate((d) => subMonths(d, 1));
        break;
      case "week":
        setCurrentDate((d) => subWeeks(d, 1));
        break;
      case "day":
        setCurrentDate((d) => subDays(d, 1));
        break;
      case "agenda":
        setCurrentDate((d) => subDays(d, 14));
        break;
    }
  }, [view]);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const goToDate = useCallback((date: Date) => {
    setCurrentDate(date);
  }, []);

  const title = useMemo(() => {
    switch (view) {
      case "month":
        return format(currentDate, "MMMM yyyy");
      case "week":
        return `${format(dateRange.start, "MMM d")} - ${format(dateRange.end, "MMM d, yyyy")}`;
      case "day":
        return format(currentDate, "EEEE, MMMM d, yyyy");
      case "agenda":
        return `${format(dateRange.start, "MMM d")} - ${format(dateRange.end, "MMM d, yyyy")}`;
      default:
        return "";
    }
  }, [view, currentDate, dateRange]);

  return {
    view,
    setView,
    currentDate,
    setCurrentDate: goToDate,
    dateRange,
    goToNext,
    goToPrevious,
    goToToday,
    title,
  };
}

// ==================== useCalendarEvents ====================

export interface UseCalendarEventsOptions {
  calendarId?: string;
  startDate?: Date;
  endDate?: Date;
  contactId?: number;
  chatId?: string;
  includeAttendees?: boolean;
  includeReminders?: boolean;
}

export function useCalendarEvents(options: UseCalendarEventsOptions = {}) {
  const { addNotification } = useNotification();
  const {
    calendarId,
    startDate,
    endDate,
    contactId,
    chatId,
    includeAttendees = true,
    includeReminders = false,
  } = options;

  const params: EventQueryParams = useMemo(
    () => ({
      calendarId,
      startDate: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
      endDate: endDate ? format(endDate, "yyyy-MM-dd") : undefined,
      contactId,
      chatId,
      includeAttendees,
      includeReminders,
    }),
    [
      calendarId,
      startDate,
      endDate,
      contactId,
      chatId,
      includeAttendees,
      includeReminders,
    ],
  );

  const cacheKey = useMemo(
    () => ["calendar-events", JSON.stringify(params)],
    [params],
  );

  const { data, error, isLoading, mutate } = useSWR(
    startDate && endDate ? cacheKey : null,
    () => calendarApi.events.list(params),
    { revalidateOnFocus: false },
  );

  const createEvent = useCallback(
    async (input: CreateEventDto) => {
      try {
        const result = await calendarApi.events.create(input);
        await mutate();
        // Also invalidate calendars to update counts
        await globalMutate("calendars");
        addNotification("Event created successfully", "success");
        return result;
      } catch (err) {
        // Show specific error message from API if available
        const errorMessage =
          err instanceof Error ? err.message : "Failed to create event";
        addNotification(errorMessage, "error");
        throw err;
      }
    },
    [mutate, addNotification],
  );

  const updateEvent = useCallback(
    async (eventId: string, input: UpdateEventDto) => {
      try {
        const result = await calendarApi.events.update(eventId, input);
        await mutate();
        addNotification("Event updated successfully", "success");
        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to update event";
        addNotification(errorMessage, "error");
        throw err;
      }
    },
    [mutate, addNotification],
  );

  const deleteEvent = useCallback(
    async (eventId: string) => {
      try {
        await calendarApi.events.delete(eventId);
        await mutate();
        addNotification("Event deleted successfully", "success");
      } catch (err) {
        addNotification("Failed to delete event", "error");
        throw err;
      }
    },
    [mutate, addNotification],
  );

  const getEventsForDate = useCallback(
    (date: Date) => {
      if (!data?.items) return [];
      return data.items.filter((event) => {
        const eventStart = parseISO(event.startTime);
        return isSameDay(eventStart, date);
      });
    },
    [data?.items],
  );

  return {
    events: data?.items || [],
    total: data?.total || 0,
    isLoading,
    error,
    createEvent,
    updateEvent,
    deleteEvent,
    getEventsForDate,
    mutate,
  };
}

// ==================== useBookingLinks ====================

export function useBookingLinks() {
  const { addNotification } = useNotification();

  const { data, error, isLoading, mutate } = useSWR<BookingLink[]>(
    "booking-links",
    () => calendarApi.bookingLinks.list(),
    { revalidateOnFocus: false },
  );

  const createBookingLink = useCallback(
    async (input: CreateBookingLinkDto) => {
      try {
        const result = await calendarApi.bookingLinks.create(input);
        await mutate();
        addNotification("Booking link created successfully", "success");
        return result;
      } catch (err) {
        addNotification("Failed to create booking link", "error");
        throw err;
      }
    },
    [mutate, addNotification],
  );

  const updateBookingLink = useCallback(
    async (bookingLinkId: string, input: UpdateBookingLinkDto) => {
      try {
        const result = await calendarApi.bookingLinks.update(
          bookingLinkId,
          input,
        );
        await mutate();
        addNotification("Booking link updated successfully", "success");
        return result;
      } catch (err) {
        addNotification("Failed to update booking link", "error");
        throw err;
      }
    },
    [mutate, addNotification],
  );

  const deleteBookingLink = useCallback(
    async (bookingLinkId: string) => {
      try {
        await calendarApi.bookingLinks.delete(bookingLinkId);
        await mutate();
        addNotification("Booking link deleted successfully", "success");
      } catch (err) {
        addNotification("Failed to delete booking link", "error");
        throw err;
      }
    },
    [mutate, addNotification],
  );

  return {
    bookingLinks: data || [],
    isLoading,
    error,
    createBookingLink,
    updateBookingLink,
    deleteBookingLink,
    mutate,
  };
}

// ==================== useBookings ====================

export interface UseBookingsOptions {
  bookingLinkId?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
}

export function useBookings(options: UseBookingsOptions = {}) {
  const { addNotification } = useNotification();
  const { bookingLinkId, status, startDate, endDate } = options;

  const params = useMemo(
    () => ({
      bookingLinkId,
      status: status as any,
      startDate: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
      endDate: endDate ? format(endDate, "yyyy-MM-dd") : undefined,
    }),
    [bookingLinkId, status, startDate, endDate],
  );

  const cacheKey = useMemo(
    () => ["bookings", JSON.stringify(params)],
    [params],
  );

  const { data, error, isLoading, mutate } = useSWR(
    cacheKey,
    () => calendarApi.bookings.list(params),
    { revalidateOnFocus: false },
  );

  const confirmBooking = useCallback(
    async (bookingId: string) => {
      try {
        const result = await calendarApi.bookings.confirm(bookingId);
        await mutate();
        addNotification("Booking confirmed", "success");
        return result;
      } catch (err) {
        addNotification("Failed to confirm booking", "error");
        throw err;
      }
    },
    [mutate, addNotification],
  );

  const cancelBooking = useCallback(
    async (bookingId: string, reason?: string) => {
      try {
        const result = await calendarApi.bookings.cancel(bookingId, reason);
        await mutate();
        addNotification("Booking cancelled", "success");
        return result;
      } catch (err) {
        addNotification("Failed to cancel booking", "error");
        throw err;
      }
    },
    [mutate, addNotification],
  );

  const rescheduleBooking = useCallback(
    async (bookingId: string, newStartTime: string) => {
      try {
        const result = await calendarApi.bookings.reschedule(
          bookingId,
          newStartTime,
        );
        await mutate();
        addNotification("Booking rescheduled", "success");
        return result;
      } catch (err) {
        addNotification("Failed to reschedule booking", "error");
        throw err;
      }
    },
    [mutate, addNotification],
  );

  return {
    bookings: data?.items || [],
    total: data?.total || 0,
    isLoading,
    error,
    confirmBooking,
    cancelBooking,
    rescheduleBooking,
    mutate,
  };
}

// ==================== useAvailability ====================

export interface UseAvailabilityOptions {
  userId?: number;
  bookingLinkId?: number;
}

export function useAvailability(options: UseAvailabilityOptions = {}) {
  const { addNotification } = useNotification();
  const { userId, bookingLinkId } = options;

  const rulesKey = useMemo(
    () => ["availability-rules", userId, bookingLinkId],
    [userId, bookingLinkId],
  );

  const {
    data: rules,
    error: rulesError,
    isLoading: rulesLoading,
    mutate: mutateRules,
  } = useSWR<AvailabilityRule[]>(
    rulesKey,
    () => calendarApi.availability.getRules({ userId, bookingLinkId }),
    { revalidateOnFocus: false },
  );

  const setRules = useCallback(
    async (input: SetAvailabilityDto) => {
      try {
        const result = await calendarApi.availability.setRules(input);
        await mutateRules();
        addNotification("Availability rules updated", "success");
        return result;
      } catch (err) {
        addNotification("Failed to update availability", "error");
        throw err;
      }
    },
    [mutateRules, addNotification],
  );

  return {
    rules: rules || [],
    isLoading: rulesLoading,
    error: rulesError,
    setRules,
    mutateRules,
  };
}

// ==================== useAvailabilitySlots ====================

export function useAvailabilitySlots(params: AvailabilityQueryParams | null) {
  const cacheKey = useMemo(
    () => (params ? ["availability-slots", JSON.stringify(params)] : null),
    [params],
  );

  const { data, error, isLoading } = useSWR(
    cacheKey,
    () => (params ? calendarApi.availability.getSlots(params) : null),
    { revalidateOnFocus: false },
  );

  return {
    slots: data?.slots || [],
    timezone: data?.timezone,
    bookingLink: data?.bookingLink,
    isLoading,
    error,
  };
}

// ==================== useSyncConnections ====================

export function useSyncConnections() {
  const { addNotification } = useNotification();

  const { data, error, isLoading, mutate } = useSWR<CalendarSyncConnection[]>(
    "sync-connections",
    () => calendarApi.sync.getConnections(),
    { revalidateOnFocus: false },
  );

  const triggerSync = useCallback(
    async (connectionId: string) => {
      try {
        const result = await calendarApi.sync.triggerSync(connectionId);
        await mutate();
        addNotification(result.message || "Sync triggered", "success");
        return result;
      } catch (err) {
        addNotification("Failed to trigger sync", "error");
        throw err;
      }
    },
    [mutate, addNotification],
  );

  const disconnect = useCallback(
    async (connectionId: string) => {
      try {
        await calendarApi.sync.disconnect(connectionId);
        await mutate();
        addNotification("Calendar disconnected", "success");
      } catch (err) {
        addNotification("Failed to disconnect calendar", "error");
        throw err;
      }
    },
    [mutate, addNotification],
  );

  return {
    connections: data || [],
    isLoading,
    error,
    triggerSync,
    disconnect,
    mutate,
  };
}

// ==================== useCalendarAiSettings ====================

export function useCalendarAiSettings() {
  const { addNotification } = useNotification();

  const { data, error, isLoading, mutate } = useSWR<CalendarAiSettings | null>(
    "calendar-ai-settings",
    () => calendarApi.aiSettings.get(),
    { revalidateOnFocus: false },
  );

  const updateSettings = useCallback(
    async (input: Parameters<typeof calendarApi.aiSettings.update>[0]) => {
      try {
        const result = await calendarApi.aiSettings.update(input);
        await mutate();
        addNotification("AI settings updated", "success");
        return result;
      } catch (err) {
        addNotification("Failed to update AI settings", "error");
        throw err;
      }
    },
    [mutate, addNotification],
  );

  return {
    settings: data,
    isLoading,
    error,
    updateSettings,
    mutate,
  };
}
