// Main facade service
export { CalendarService } from './calendar.service';

// Core calendar services
export { CalendarCrudService } from './calendar-crud.service';
export { CalendarShareService } from './calendar-share.service';

// Event services
export { EventAttendeesService } from './event-attendees.service';
export { EventRemindersService } from './event-reminders.service';
export { EventsService } from './events.service';

// Booking services
export { AvailabilityService } from './availability.service';
export type { TimeSlot } from './availability.service';
export { BookingLinksService } from './booking-links.service';
export { BookingsService } from './bookings.service';

// Sync and AI services
export { CalendarAiService } from './calendar-ai.service';
export type { AiActionResult } from './calendar-ai.service';
export { CalendarSyncService } from './calendar-sync.service';
export type {
  OAuthConfig,
  SyncConnectionResponse,
} from './calendar-sync.service';
