/**
 * Calendar Schema
 *
 * Defines database tables for calendar and scheduling functionality:
 *
 * CORE CALENDAR:
 * - calendars: User/team calendars with visibility settings
 * - calendarEvents: Events with recurrence, reminders, attendees
 * - eventAttendees: Junction table for event participants
 * - eventReminders: Configurable reminders (email, push, WhatsApp)
 * - calendarShares: Share calendars between team members
 *
 * SCHEDULING & BOOKING:
 * - bookingLinks: Public booking pages (Calendly-style)
 * - availabilityRules: Weekly recurring availability windows
 * - availabilityOverrides: Date-specific availability exceptions
 * - bookingSettings: Buffer time, notice period, max bookings
 *
 * EXTERNAL SYNC:
 * - calendarSyncConnections: OAuth tokens for Google/Outlook/Apple
 * - syncedExternalEvents: Cached external events with sync metadata
 * - calendarSyncLogs: Track sync operations for debugging
 *
 * AI INTEGRATION:
 * - calendarAiActions: Audit log of AI calendar operations
 * - calendarAiSettings: Per-user/team AI calendar autonomy settings
 *
 * Design Decisions:
 * - All times stored in UTC, timezone stored separately for display
 * - RRULE format (RFC 5545) for recurrence rules
 * - Team-scoped calendars with user-level visibility override
 * - Soft-delete pattern for events (deletedAt timestamp)
 */

import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { chats, contacts, teams, users } from './schema';

// ==================== Enums & Types ====================

/**
 * Calendar visibility levels
 */
export type CalendarVisibility = 'private' | 'team' | 'public';

/**
 * Event types for categorization
 */
export type CalendarEventType =
  | 'meeting'
  | 'call'
  | 'follow_up'
  | 'reminder'
  | 'task'
  | 'out_of_office'
  | 'booking'
  | 'other';

/**
 * Event status
 */
export type CalendarEventStatus = 'confirmed' | 'tentative' | 'cancelled';

/**
 * Attendee RSVP status
 */
export type AttendeeResponseStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'tentative';

/**
 * Attendee type (internal user or external contact)
 */
export type AttendeeType = 'user' | 'contact' | 'external';

/**
 * Reminder delivery method
 */
export type ReminderMethod = 'email' | 'push' | 'whatsapp' | 'in_app';

/**
 * External calendar provider
 */
export type CalendarProvider = 'google' | 'outlook' | 'apple' | 'ical';

/**
 * Sync connection status
 */
export type SyncConnectionStatus = 'active' | 'expired' | 'revoked' | 'error';

/**
 * Booking link status
 */
export type BookingLinkStatus = 'active' | 'paused' | 'archived';

/**
 * Availability rule type
 */
export type AvailabilityRuleType = 'available' | 'unavailable';

/**
 * AI calendar action types
 */
export type CalendarAiActionType =
  | 'check_availability'
  | 'create_event'
  | 'update_event'
  | 'cancel_event'
  | 'reschedule_event'
  | 'suggest_times'
  | 'create_booking_link'
  | 'send_reminder';

// ==================== Core Calendar Tables ====================

/**
 * Calendars table - user/team calendars
 *
 * Each user can have multiple calendars (personal, work, etc.)
 * Calendars can be team-owned or user-owned
 */
export const calendars = pgTable(
  'calendars',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Ownership - either teamId OR userId is set, not both
    teamId: integer('team_id').references(() => teams.id, {
      onDelete: 'cascade',
    }),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    // Calendar details
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    color: varchar('color', { length: 20 }).notNull().default('#3b82f6'), // Hex color
    // Visibility and access
    visibility: varchar('visibility', { length: 20 })
      .notNull()
      .default('private'), // 'private', 'team', 'public'
    isDefault: boolean('is_default').default(false), // Default calendar for new events
    // Timezone for display (events stored in UTC)
    timezone: varchar('timezone', { length: 50 }).notNull().default('UTC'), // IANA timezone
    // Settings
    showWeekNumbers: boolean('show_week_numbers').default(false),
    weekStartsOn: integer('week_starts_on').default(0), // 0 = Sunday, 1 = Monday
    defaultEventDuration: integer('default_event_duration').default(30), // Minutes
    // Sync with external calendars
    syncEnabled: boolean('sync_enabled').default(false),
    lastSyncedAt: timestamp('last_synced_at'),
    // Status
    isActive: boolean('is_active').default(true),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    teamIdIndex: index('idx_calendars_team_id').on(table.teamId),
    userIdIndex: index('idx_calendars_user_id').on(table.userId),
    isDefaultIndex: index('idx_calendars_is_default').on(table.isDefault),
    isActiveIndex: index('idx_calendars_is_active').on(table.isActive),
  }),
);

export type Calendar = typeof calendars.$inferSelect;
export type NewCalendar = typeof calendars.$inferInsert;

/**
 * Calendar Events table - individual calendar entries
 *
 * Supports:
 * - Single and recurring events (RRULE format)
 * - All-day events
 * - Video conference links (external providers)
 * - Location (physical or virtual)
 * - Linked to chats/contacts for CRM integration
 */
export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    calendarId: uuid('calendar_id')
      .notNull()
      .references(() => calendars.id, { onDelete: 'cascade' }),
    // Event details
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    eventType: varchar('event_type', { length: 30 })
      .notNull()
      .default('meeting'),
    status: varchar('status', { length: 20 }).notNull().default('confirmed'),
    // Timing (stored in UTC)
    startTime: timestamp('start_time').notNull(),
    endTime: timestamp('end_time').notNull(),
    isAllDay: boolean('is_all_day').default(false),
    timezone: varchar('timezone', { length: 50 }).notNull().default('UTC'),
    // Recurrence (RFC 5545 RRULE format)
    // Example: "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10"
    recurrenceRule: text('recurrence_rule'),
    recurrenceExceptions: jsonb('recurrence_exceptions').default('[]'), // Array of excluded dates
    recurringEventId: uuid('recurring_event_id'), // Parent event ID for recurring instances
    isRecurringInstance: boolean('is_recurring_instance').default(false),
    originalStartTime: timestamp('original_start_time'), // For modified recurring instances
    // Location
    location: text('location'), // Physical address or room name
    locationUrl: text('location_url'), // Map link or virtual location URL
    isOnline: boolean('is_online').default(false),
    // Video conferencing (external links)
    videoConferenceUrl: text('video_conference_url'), // Zoom, Meet, Teams link
    videoConferenceProvider: varchar('video_conference_provider', {
      length: 30,
    }), // 'zoom', 'google_meet', 'teams', etc.
    videoConferenceId: varchar('video_conference_id', { length: 100 }), // Meeting ID
    videoConferencePassword: varchar('video_conference_password', {
      length: 50,
    }),
    // CRM Integration
    relatedChatId: varchar('related_chat_id').references(() => chats.chatId, {
      onDelete: 'set null',
    }),
    relatedContactId: uuid('related_contact_id').references(
      () => contacts.contactId,
      { onDelete: 'set null' },
    ),
    // Booking link reference (if created from booking)
    bookingLinkId: uuid('booking_link_id'),
    bookingId: uuid('booking_id'), // Unique booking reference
    // Organizer
    organizerId: integer('organizer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Visibility
    visibility: varchar('visibility', { length: 20 }).default(
      'calendar_default',
    ), // 'public', 'private', 'calendar_default'
    showAsBusy: boolean('show_as_busy').default(true), // Free/Busy status
    // External sync
    externalEventId: varchar('external_event_id', { length: 255 }), // ID in external calendar
    externalCalendarId: varchar('external_calendar_id', { length: 255 }), // External calendar ID
    syncProvider: varchar('sync_provider', { length: 20 }), // 'google', 'outlook', 'apple'
    lastSyncedAt: timestamp('last_synced_at'),
    syncEtag: varchar('sync_etag', { length: 100 }), // For sync conflict detection
    // Metadata
    metadata: jsonb('metadata').default({}), // Custom fields
    // Soft delete
    deletedAt: timestamp('deleted_at'),
    deletedBy: integer('deleted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    createdBy: integer('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => ({
    calendarIdIndex: index('idx_calendar_events_calendar_id').on(
      table.calendarId,
    ),
    startTimeIndex: index('idx_calendar_events_start_time').on(table.startTime),
    endTimeIndex: index('idx_calendar_events_end_time').on(table.endTime),
    organizerIdIndex: index('idx_calendar_events_organizer_id').on(
      table.organizerId,
    ),
    recurringEventIdIndex: index('idx_calendar_events_recurring_event_id').on(
      table.recurringEventId,
    ),
    relatedChatIdIndex: index('idx_calendar_events_related_chat_id').on(
      table.relatedChatId,
    ),
    relatedContactIdIndex: index('idx_calendar_events_related_contact_id').on(
      table.relatedContactId,
    ),
    externalEventIdIndex: index('idx_calendar_events_external_event_id').on(
      table.externalEventId,
    ),
    deletedAtIndex: index('idx_calendar_events_deleted_at').on(table.deletedAt),
    // Composite index for date range queries
    calendarDateRangeIndex: index('idx_calendar_events_calendar_date_range').on(
      table.calendarId,
      table.startTime,
      table.endTime,
    ),
  }),
);

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type NewCalendarEvent = typeof calendarEvents.$inferInsert;

/**
 * Event Attendees table - participants in calendar events
 *
 * Supports:
 * - Internal users (CRM team members)
 * - Contacts (customers from contacts table)
 * - External emails (not in system)
 */
export const eventAttendees = pgTable(
  'event_attendees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => calendarEvents.id, { onDelete: 'cascade' }),
    // Attendee identification (one of these must be set)
    attendeeType: varchar('attendee_type', { length: 20 }).notNull(), // 'user', 'contact', 'external'
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    contactId: uuid('contact_id').references(() => contacts.contactId, {
      onDelete: 'cascade',
    }),
    externalEmail: varchar('external_email', { length: 255 }), // For external attendees
    externalName: varchar('external_name', { length: 100 }), // Display name for external
    // RSVP
    responseStatus: varchar('response_status', { length: 20 })
      .notNull()
      .default('pending'), // 'pending', 'accepted', 'declined', 'tentative'
    respondedAt: timestamp('responded_at'),
    responseNote: text('response_note'), // Optional message with response
    // Role
    isOrganizer: boolean('is_organizer').default(false),
    isOptional: boolean('is_optional').default(false), // Optional vs required attendee
    // Notifications
    notificationSent: boolean('notification_sent').default(false),
    notificationSentAt: timestamp('notification_sent_at'),
    reminderSent: boolean('reminder_sent').default(false),
    reminderSentAt: timestamp('reminder_sent_at'),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    eventIdIndex: index('idx_event_attendees_event_id').on(table.eventId),
    userIdIndex: index('idx_event_attendees_user_id').on(table.userId),
    contactIdIndex: index('idx_event_attendees_contact_id').on(table.contactId),
    responseStatusIndex: index('idx_event_attendees_response_status').on(
      table.responseStatus,
    ),
    // Unique attendee per event
    uniqueEventUser: unique('uq_event_attendees_user').on(
      table.eventId,
      table.userId,
    ),
    uniqueEventContact: unique('uq_event_attendees_contact').on(
      table.eventId,
      table.contactId,
    ),
    uniqueEventExternal: unique('uq_event_attendees_external').on(
      table.eventId,
      table.externalEmail,
    ),
  }),
);

export type EventAttendee = typeof eventAttendees.$inferSelect;
export type NewEventAttendee = typeof eventAttendees.$inferInsert;

/**
 * Event Reminders table - configurable reminders for events
 *
 * Users can set multiple reminders per event with different
 * timing and delivery methods
 */
export const eventReminders = pgTable(
  'event_reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => calendarEvents.id, { onDelete: 'cascade' }),
    // Reminder configuration
    reminderMethod: varchar('reminder_method', { length: 20 })
      .notNull()
      .default('push'), // 'email', 'push', 'whatsapp', 'in_app'
    minutesBefore: integer('minutes_before').notNull().default(15), // Minutes before event
    // Status
    isSent: boolean('is_sent').default(false),
    sentAt: timestamp('sent_at'),
    errorMessage: text('error_message'),
    // For specific attendee (null = organizer)
    attendeeId: uuid('attendee_id').references(() => eventAttendees.id, {
      onDelete: 'cascade',
    }),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    eventIdIndex: index('idx_event_reminders_event_id').on(table.eventId),
    attendeeIdIndex: index('idx_event_reminders_attendee_id').on(
      table.attendeeId,
    ),
    isSentIndex: index('idx_event_reminders_is_sent').on(table.isSent),
  }),
);

export type EventReminder = typeof eventReminders.$inferSelect;
export type NewEventReminder = typeof eventReminders.$inferInsert;

/**
 * Calendar Shares table - sharing calendars between team members
 *
 * Allows users to share their calendars with specific team members
 * with different permission levels
 */
export const calendarShares = pgTable(
  'calendar_shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    calendarId: uuid('calendar_id')
      .notNull()
      .references(() => calendars.id, { onDelete: 'cascade' }),
    // Shared with (user or entire team)
    sharedWithUserId: integer('shared_with_user_id').references(
      () => users.id,
      {
        onDelete: 'cascade',
      },
    ),
    sharedWithTeamId: integer('shared_with_team_id').references(
      () => teams.id,
      {
        onDelete: 'cascade',
      },
    ),
    // Permission level
    permissionLevel: varchar('permission_level', { length: 20 })
      .notNull()
      .default('view'), // 'view', 'edit', 'manage'
    // Can see event details or just free/busy
    canSeeDetails: boolean('can_see_details').default(true),
    // Shared by
    sharedBy: integer('shared_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    calendarIdIndex: index('idx_calendar_shares_calendar_id').on(
      table.calendarId,
    ),
    sharedWithUserIdIndex: index('idx_calendar_shares_shared_with_user_id').on(
      table.sharedWithUserId,
    ),
    sharedWithTeamIdIndex: index('idx_calendar_shares_shared_with_team_id').on(
      table.sharedWithTeamId,
    ),
    // Unique share per calendar + user/team
    uniqueCalendarUser: unique('uq_calendar_shares_user').on(
      table.calendarId,
      table.sharedWithUserId,
    ),
    uniqueCalendarTeam: unique('uq_calendar_shares_team').on(
      table.calendarId,
      table.sharedWithTeamId,
    ),
  }),
);

export type CalendarShare = typeof calendarShares.$inferSelect;
export type NewCalendarShare = typeof calendarShares.$inferInsert;

// ==================== Booking & Scheduling Tables ====================

/**
 * Booking Links table - public booking pages (Calendly-style)
 *
 * Allows customers to book meetings directly through a public URL
 * - Configurable event type, duration, and availability
 * - Round-robin assignment among team members
 * - Custom questions and confirmation messages
 */
export const bookingLinks = pgTable(
  'booking_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Ownership
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // URL configuration
    slug: varchar('slug', { length: 100 }).notNull(), // URL slug: /book/{slug}
    // Event configuration
    name: varchar('name', { length: 100 }).notNull(), // "30-minute Meeting"
    description: text('description'),
    eventType: varchar('event_type', { length: 30 })
      .notNull()
      .default('meeting'),
    duration: integer('duration').notNull().default(30), // Minutes
    // Location options
    locationType: varchar('location_type', { length: 30 })
      .notNull()
      .default('video'), // 'video', 'phone', 'in_person', 'custom'
    locationDetails: text('location_details'), // Address or custom text
    videoProvider: varchar('video_provider', { length: 30 }), // 'zoom', 'google_meet', 'teams'
    // Availability
    calendarId: uuid('calendar_id').references(() => calendars.id, {
      onDelete: 'set null',
    }), // Calendar to check for conflicts
    // Scheduling rules
    minNoticeMinutes: integer('min_notice_minutes').default(60), // Minimum booking notice (1 hour default)
    maxFutureDays: integer('max_future_days').default(60), // How far in advance can book
    bufferBeforeMinutes: integer('buffer_before_minutes').default(0), // Buffer before event
    bufferAfterMinutes: integer('buffer_after_minutes').default(0), // Buffer after event
    maxBookingsPerDay: integer('max_bookings_per_day'), // Null = unlimited
    // Round-robin settings
    isRoundRobin: boolean('is_round_robin').default(false),
    roundRobinMode: varchar('round_robin_mode', { length: 20 }), // 'availability', 'equal_distribution'
    // Team members who can be assigned (for round-robin or single owner)
    assignedUserIds: jsonb('assigned_user_ids').default('[]'), // Array of user IDs
    // Confirmation settings
    confirmationMessage: text('confirmation_message'),
    requiresApproval: boolean('requires_approval').default(false),
    // Customization
    color: varchar('color', { length: 20 }).default('#3b82f6'),
    // Custom questions for booker
    customQuestions: jsonb('custom_questions').default('[]'), // Array of { id, type, label, required }
    // Status
    status: varchar('status', { length: 20 }).notNull().default('active'), // 'active', 'paused', 'archived'
    // Analytics
    totalBookings: integer('total_bookings').default(0),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    teamIdIndex: index('idx_booking_links_team_id').on(table.teamId),
    createdByIndex: index('idx_booking_links_created_by').on(table.createdBy),
    statusIndex: index('idx_booking_links_status').on(table.status),
    // Slug must be unique within team
    uniqueTeamSlug: unique('uq_booking_links_team_slug').on(
      table.teamId,
      table.slug,
    ),
  }),
);

export type BookingLink = typeof bookingLinks.$inferSelect;
export type NewBookingLink = typeof bookingLinks.$inferInsert;

/**
 * Booking Link Members - users assigned to a booking link
 *
 * For round-robin and assignment tracking
 */
export const bookingLinkMembers = pgTable(
  'booking_link_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingLinkId: uuid('booking_link_id')
      .notNull()
      .references(() => bookingLinks.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Round-robin tracking
    isActive: boolean('is_active').default(true), // Can receive bookings
    priority: integer('priority').default(0), // Higher = preferred
    lastAssignedAt: timestamp('last_assigned_at'), // For equal distribution
    totalAssignments: integer('total_assignments').default(0),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    bookingLinkIdIndex: index('idx_booking_link_members_booking_link_id').on(
      table.bookingLinkId,
    ),
    userIdIndex: index('idx_booking_link_members_user_id').on(table.userId),
    uniqueBookingMember: unique('uq_booking_link_members').on(
      table.bookingLinkId,
      table.userId,
    ),
  }),
);

export type BookingLinkMember = typeof bookingLinkMembers.$inferSelect;
export type NewBookingLinkMember = typeof bookingLinkMembers.$inferInsert;

/**
 * Availability Rules table - weekly recurring availability
 *
 * Defines when a user is available for bookings
 * Each rule represents a time window on specific days of the week
 */
export const availabilityRules = pgTable(
  'availability_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Rule type
    ruleType: varchar('rule_type', { length: 20 })
      .notNull()
      .default('available'), // 'available', 'unavailable'
    // Days of week (array of 0-6, where 0 = Sunday)
    daysOfWeek: jsonb('days_of_week').notNull().default('[1,2,3,4,5]'), // Default: Mon-Fri
    // Time window (stored as minutes from midnight in user's timezone)
    startMinutes: integer('start_minutes').notNull().default(540), // 9:00 AM (9 * 60)
    endMinutes: integer('end_minutes').notNull().default(1020), // 5:00 PM (17 * 60)
    // Timezone
    timezone: varchar('timezone', { length: 50 }).notNull().default('UTC'),
    // Scope - applies to specific booking link or all
    bookingLinkId: uuid('booking_link_id').references(() => bookingLinks.id, {
      onDelete: 'cascade',
    }),
    // Status
    isActive: boolean('is_active').default(true),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    userIdIndex: index('idx_availability_rules_user_id').on(table.userId),
    bookingLinkIdIndex: index('idx_availability_rules_booking_link_id').on(
      table.bookingLinkId,
    ),
    isActiveIndex: index('idx_availability_rules_is_active').on(table.isActive),
  }),
);

export type AvailabilityRule = typeof availabilityRules.$inferSelect;
export type NewAvailabilityRule = typeof availabilityRules.$inferInsert;

/**
 * Availability Overrides table - date-specific availability exceptions
 *
 * Allows users to override their regular availability for specific dates
 * (e.g., holidays, vacations, special availability)
 */
export const availabilityOverrides = pgTable(
  'availability_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Date (UTC, covers full day)
    date: timestamp('date').notNull(),
    // Override type
    overrideType: varchar('override_type', { length: 20 })
      .notNull()
      .default('unavailable'), // 'unavailable', 'available', 'custom'
    // For 'custom' type - specific time windows
    customWindows: jsonb('custom_windows').default('[]'), // Array of { startMinutes, endMinutes }
    // Reason (optional)
    reason: varchar('reason', { length: 200 }), // "Holiday", "Vacation", etc.
    // Scope
    bookingLinkId: uuid('booking_link_id').references(() => bookingLinks.id, {
      onDelete: 'cascade',
    }),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    userIdIndex: index('idx_availability_overrides_user_id').on(table.userId),
    dateIndex: index('idx_availability_overrides_date').on(table.date),
    userDateIndex: index('idx_availability_overrides_user_date').on(
      table.userId,
      table.date,
    ),
  }),
);

export type AvailabilityOverride = typeof availabilityOverrides.$inferSelect;
export type NewAvailabilityOverride = typeof availabilityOverrides.$inferInsert;

/**
 * Bookings table - actual bookings made through booking links
 *
 * Tracks all bookings with booker information and status
 */
export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingLinkId: uuid('booking_link_id')
      .notNull()
      .references(() => bookingLinks.id, { onDelete: 'cascade' }),
    // Event reference (created after booking)
    eventId: uuid('event_id').references(() => calendarEvents.id, {
      onDelete: 'set null',
    }),
    // Assigned host
    assignedUserId: integer('assigned_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Booker information
    bookerContactId: uuid('booker_contact_id').references(
      () => contacts.contactId,
      { onDelete: 'set null' },
    ),
    bookerName: varchar('booker_name', { length: 100 }).notNull(),
    bookerEmail: varchar('booker_email', { length: 255 }).notNull(),
    bookerPhone: varchar('booker_phone', { length: 30 }),
    bookerTimezone: varchar('booker_timezone', { length: 50 }),
    // Booking details
    scheduledStart: timestamp('scheduled_start').notNull(),
    scheduledEnd: timestamp('scheduled_end').notNull(),
    // Custom question responses
    questionResponses: jsonb('question_responses').default('{}'),
    // Notes from booker
    bookerNotes: text('booker_notes'),
    // Confirmation code for guest access
    confirmationCode: varchar('confirmation_code', { length: 20 }).unique(),
    // Video meeting link
    meetingLink: text('meeting_link'),
    // Status
    status: varchar('status', { length: 20 }).notNull().default('confirmed'), // 'pending', 'confirmed', 'cancelled', 'completed', 'no_show'
    cancelledAt: timestamp('cancelled_at'),
    cancelledBy: varchar('cancelled_by', { length: 20 }), // 'booker', 'host', 'system'
    cancellationReason: text('cancellation_reason'),
    // Reminders
    reminderSentAt: timestamp('reminder_sent_at'),
    // Source tracking
    utmSource: varchar('utm_source', { length: 100 }),
    utmMedium: varchar('utm_medium', { length: 100 }),
    utmCampaign: varchar('utm_campaign', { length: 100 }),
    referrer: text('referrer'),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    bookingLinkIdIndex: index('idx_bookings_booking_link_id').on(
      table.bookingLinkId,
    ),
    eventIdIndex: index('idx_bookings_event_id').on(table.eventId),
    assignedUserIdIndex: index('idx_bookings_assigned_user_id').on(
      table.assignedUserId,
    ),
    statusIndex: index('idx_bookings_status').on(table.status),
    scheduledStartIndex: index('idx_bookings_scheduled_start').on(
      table.scheduledStart,
    ),
    bookerEmailIndex: index('idx_bookings_booker_email').on(table.bookerEmail),
  }),
);

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;

// ==================== External Sync Tables ====================

/**
 * Calendar Sync Connections table - OAuth connections to external calendars
 *
 * Stores OAuth tokens for Google, Outlook, and Apple Calendar
 */
export const calendarSyncConnections = pgTable(
  'calendar_sync_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Provider info
    provider: varchar('provider', { length: 20 }).notNull(), // 'google', 'outlook', 'apple'
    providerAccountId: varchar('provider_account_id', { length: 255 }), // User ID from provider
    providerEmail: varchar('provider_email', { length: 255 }), // Email from provider
    // OAuth tokens (encrypted in production)
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    tokenType: varchar('token_type', { length: 50 }).default('Bearer'),
    expiresAt: timestamp('expires_at'),
    scope: text('scope'), // OAuth scopes granted
    // Sync configuration
    syncDirection: varchar('sync_direction', { length: 20 })
      .notNull()
      .default('bidirectional'), // 'import_only', 'export_only', 'bidirectional'
    syncCalendarIds: jsonb('sync_calendar_ids').default('[]'), // Which external calendars to sync
    // CRM calendar to sync with
    linkedCalendarId: uuid('linked_calendar_id').references(
      () => calendars.id,
      { onDelete: 'set null' },
    ),
    // Sync status
    status: varchar('status', { length: 20 }).notNull().default('active'), // 'active', 'expired', 'revoked', 'error'
    lastSyncAt: timestamp('last_sync_at'),
    lastSyncError: text('last_sync_error'),
    syncToken: text('sync_token'), // Incremental sync token for Google/Outlook
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    userIdIndex: index('idx_calendar_sync_connections_user_id').on(
      table.userId,
    ),
    providerIndex: index('idx_calendar_sync_connections_provider').on(
      table.provider,
    ),
    statusIndex: index('idx_calendar_sync_connections_status').on(table.status),
    // One connection per provider per user
    uniqueUserProvider: unique('uq_calendar_sync_connections').on(
      table.userId,
      table.provider,
    ),
  }),
);

export type CalendarSyncConnection =
  typeof calendarSyncConnections.$inferSelect;
export type NewCalendarSyncConnection =
  typeof calendarSyncConnections.$inferInsert;

/**
 * Calendar Sync Logs table - track sync operations for debugging
 */
export const calendarSyncLogs = pgTable(
  'calendar_sync_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => calendarSyncConnections.id, { onDelete: 'cascade' }),
    // Operation details
    operation: varchar('operation', { length: 30 }).notNull(), // 'full_sync', 'incremental_sync', 'push', 'webhook'
    direction: varchar('direction', { length: 20 }).notNull(), // 'import', 'export'
    // Results
    status: varchar('status', { length: 20 }).notNull(), // 'success', 'partial', 'failed'
    eventsCreated: integer('events_created').default(0),
    eventsUpdated: integer('events_updated').default(0),
    eventsDeleted: integer('events_deleted').default(0),
    conflictsResolved: integer('conflicts_resolved').default(0),
    // Error details
    errorCode: varchar('error_code', { length: 50 }),
    errorMessage: text('error_message'),
    errorDetails: jsonb('error_details'),
    // Performance
    durationMs: integer('duration_ms'),
    // Timestamp
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    connectionIdIndex: index('idx_calendar_sync_logs_connection_id').on(
      table.connectionId,
    ),
    statusIndex: index('idx_calendar_sync_logs_status').on(table.status),
    createdAtIndex: index('idx_calendar_sync_logs_created_at').on(
      table.createdAt,
    ),
  }),
);

export type CalendarSyncLog = typeof calendarSyncLogs.$inferSelect;
export type NewCalendarSyncLog = typeof calendarSyncLogs.$inferInsert;

// ==================== AI Integration Tables ====================

/**
 * Calendar AI Settings table - per-user AI calendar autonomy settings
 *
 * Controls what the AI can do with calendars
 */
export const calendarAiSettings = pgTable(
  'calendar_ai_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Feature toggles
    aiEnabled: boolean('ai_enabled').default(true),
    canCheckAvailability: boolean('can_check_availability').default(true),
    canCreateEvents: boolean('can_create_events').default(true),
    canUpdateEvents: boolean('can_update_events').default(true),
    canCancelEvents: boolean('can_cancel_events').default(false), // Default: requires confirmation
    canSuggestTimes: boolean('can_suggest_times').default(true),
    canSendReminders: boolean('can_send_reminders').default(true),
    // Autonomy level
    autonomyLevel: varchar('autonomy_level', { length: 20 })
      .notNull()
      .default('suggest'), // 'suggest', 'confirm', 'autonomous'
    // Which calendars AI can access
    allowedCalendarIds: jsonb('allowed_calendar_ids').default('[]'), // Empty = all
    // Restrictions
    maxEventsPerDay: integer('max_events_per_day').default(5), // Max AI-created events per day
    minNoticeMintues: integer('min_notice_minutes').default(60), // Minimum notice for AI bookings
    blockedTimeRanges: jsonb('blocked_time_ranges').default('[]'), // Times AI should never book
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    userIdIndex: index('idx_calendar_ai_settings_user_id').on(table.userId),
  }),
);

export type CalendarAiSetting = typeof calendarAiSettings.$inferSelect;
export type NewCalendarAiSetting = typeof calendarAiSettings.$inferInsert;

/**
 * Calendar AI Actions table - audit log of AI calendar operations
 *
 * Tracks all actions the AI takes related to calendars
 */
export const calendarAiActions = pgTable(
  'calendar_ai_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Context
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    chatId: varchar('chat_id').references(() => chats.chatId, {
      onDelete: 'set null',
    }),
    // Action details
    actionType: varchar('action_type', { length: 30 }).notNull(), // From CalendarAiActionType
    actionStatus: varchar('action_status', { length: 20 }).notNull(), // 'success', 'failed', 'pending_confirmation', 'rejected'
    // Related entities
    eventId: uuid('event_id').references(() => calendarEvents.id, {
      onDelete: 'set null',
    }),
    bookingId: uuid('booking_id').references(() => bookings.id, {
      onDelete: 'set null',
    }),
    // Request/Response
    aiRequest: jsonb('ai_request'), // What the AI was asked to do
    aiResponse: jsonb('ai_response'), // What the AI responded
    // Execution details
    executedAction: jsonb('executed_action'), // Actual action taken
    // User confirmation (if required)
    requiredConfirmation: boolean('required_confirmation').default(false),
    confirmedAt: timestamp('confirmed_at'),
    confirmedBy: integer('confirmed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    rejectedAt: timestamp('rejected_at'),
    rejectionReason: text('rejection_reason'),
    // Error details
    errorMessage: text('error_message'),
    // Performance
    latencyMs: integer('latency_ms'),
    // Timestamp
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    userIdIndex: index('idx_calendar_ai_actions_user_id').on(table.userId),
    chatIdIndex: index('idx_calendar_ai_actions_chat_id').on(table.chatId),
    actionTypeIndex: index('idx_calendar_ai_actions_action_type').on(
      table.actionType,
    ),
    actionStatusIndex: index('idx_calendar_ai_actions_action_status').on(
      table.actionStatus,
    ),
    createdAtIndex: index('idx_calendar_ai_actions_created_at').on(
      table.createdAt,
    ),
  }),
);

export type CalendarAiAction = typeof calendarAiActions.$inferSelect;
export type NewCalendarAiAction = typeof calendarAiActions.$inferInsert;

// ==================== Relations ====================

// Calendar relations
export const calendarsRelations = relations(calendars, ({ one, many }) => ({
  team: one(teams, {
    fields: [calendars.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [calendars.userId],
    references: [users.id],
  }),
  events: many(calendarEvents),
  shares: many(calendarShares),
  bookingLinks: many(bookingLinks),
  syncConnections: many(calendarSyncConnections),
}));

// Calendar Events relations
export const calendarEventsRelations = relations(
  calendarEvents,
  ({ one, many }) => ({
    calendar: one(calendars, {
      fields: [calendarEvents.calendarId],
      references: [calendars.id],
    }),
    organizer: one(users, {
      fields: [calendarEvents.organizerId],
      references: [users.id],
    }),
    creator: one(users, {
      fields: [calendarEvents.createdBy],
      references: [users.id],
      relationName: 'eventCreator',
    }),
    deletedByUser: one(users, {
      fields: [calendarEvents.deletedBy],
      references: [users.id],
      relationName: 'eventDeleter',
    }),
    relatedChat: one(chats, {
      fields: [calendarEvents.relatedChatId],
      references: [chats.chatId],
    }),
    relatedContact: one(contacts, {
      fields: [calendarEvents.relatedContactId],
      references: [contacts.contactId],
    }),
    recurringParent: one(calendarEvents, {
      fields: [calendarEvents.recurringEventId],
      references: [calendarEvents.id],
      relationName: 'recurringInstances',
    }),
    recurringInstances: many(calendarEvents, {
      relationName: 'recurringInstances',
    }),
    attendees: many(eventAttendees),
    reminders: many(eventReminders),
    booking: many(bookings),
    aiActions: many(calendarAiActions),
  }),
);

// Event Attendees relations
export const eventAttendeesRelations = relations(
  eventAttendees,
  ({ one, many }) => ({
    event: one(calendarEvents, {
      fields: [eventAttendees.eventId],
      references: [calendarEvents.id],
    }),
    user: one(users, {
      fields: [eventAttendees.userId],
      references: [users.id],
    }),
    contact: one(contacts, {
      fields: [eventAttendees.contactId],
      references: [contacts.contactId],
    }),
    reminders: many(eventReminders),
  }),
);

// Event Reminders relations
export const eventRemindersRelations = relations(eventReminders, ({ one }) => ({
  event: one(calendarEvents, {
    fields: [eventReminders.eventId],
    references: [calendarEvents.id],
  }),
  attendee: one(eventAttendees, {
    fields: [eventReminders.attendeeId],
    references: [eventAttendees.id],
  }),
}));

// Calendar Shares relations
export const calendarSharesRelations = relations(calendarShares, ({ one }) => ({
  calendar: one(calendars, {
    fields: [calendarShares.calendarId],
    references: [calendars.id],
  }),
  sharedWithUser: one(users, {
    fields: [calendarShares.sharedWithUserId],
    references: [users.id],
    relationName: 'sharedWithUser',
  }),
  sharedWithTeam: one(teams, {
    fields: [calendarShares.sharedWithTeamId],
    references: [teams.id],
  }),
  sharedByUser: one(users, {
    fields: [calendarShares.sharedBy],
    references: [users.id],
    relationName: 'sharedByUser',
  }),
}));

// Booking Links relations
export const bookingLinksRelations = relations(
  bookingLinks,
  ({ one, many }) => ({
    team: one(teams, {
      fields: [bookingLinks.teamId],
      references: [teams.id],
    }),
    creator: one(users, {
      fields: [bookingLinks.createdBy],
      references: [users.id],
    }),
    calendar: one(calendars, {
      fields: [bookingLinks.calendarId],
      references: [calendars.id],
    }),
    members: many(bookingLinkMembers),
    availabilityRules: many(availabilityRules),
    availabilityOverrides: many(availabilityOverrides),
    bookings: many(bookings),
  }),
);

// Booking Link Members relations
export const bookingLinkMembersRelations = relations(
  bookingLinkMembers,
  ({ one }) => ({
    bookingLink: one(bookingLinks, {
      fields: [bookingLinkMembers.bookingLinkId],
      references: [bookingLinks.id],
    }),
    user: one(users, {
      fields: [bookingLinkMembers.userId],
      references: [users.id],
    }),
  }),
);

// Availability Rules relations
export const availabilityRulesRelations = relations(
  availabilityRules,
  ({ one }) => ({
    user: one(users, {
      fields: [availabilityRules.userId],
      references: [users.id],
    }),
    bookingLink: one(bookingLinks, {
      fields: [availabilityRules.bookingLinkId],
      references: [bookingLinks.id],
    }),
  }),
);

// Availability Overrides relations
export const availabilityOverridesRelations = relations(
  availabilityOverrides,
  ({ one }) => ({
    user: one(users, {
      fields: [availabilityOverrides.userId],
      references: [users.id],
    }),
    bookingLink: one(bookingLinks, {
      fields: [availabilityOverrides.bookingLinkId],
      references: [bookingLinks.id],
    }),
  }),
);

// Bookings relations
export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  bookingLink: one(bookingLinks, {
    fields: [bookings.bookingLinkId],
    references: [bookingLinks.id],
  }),
  event: one(calendarEvents, {
    fields: [bookings.eventId],
    references: [calendarEvents.id],
  }),
  assignedUser: one(users, {
    fields: [bookings.assignedUserId],
    references: [users.id],
  }),
  bookerContact: one(contacts, {
    fields: [bookings.bookerContactId],
    references: [contacts.contactId],
  }),
  aiActions: many(calendarAiActions),
}));

// Calendar Sync Connections relations
export const calendarSyncConnectionsRelations = relations(
  calendarSyncConnections,
  ({ one, many }) => ({
    user: one(users, {
      fields: [calendarSyncConnections.userId],
      references: [users.id],
    }),
    linkedCalendar: one(calendars, {
      fields: [calendarSyncConnections.linkedCalendarId],
      references: [calendars.id],
    }),
    logs: many(calendarSyncLogs),
  }),
);

// Calendar Sync Logs relations
export const calendarSyncLogsRelations = relations(
  calendarSyncLogs,
  ({ one }) => ({
    connection: one(calendarSyncConnections, {
      fields: [calendarSyncLogs.connectionId],
      references: [calendarSyncConnections.id],
    }),
  }),
);

// Calendar AI Settings relations
export const calendarAiSettingsRelations = relations(
  calendarAiSettings,
  ({ one }) => ({
    user: one(users, {
      fields: [calendarAiSettings.userId],
      references: [users.id],
    }),
  }),
);

// Calendar AI Actions relations
export const calendarAiActionsRelations = relations(
  calendarAiActions,
  ({ one }) => ({
    user: one(users, {
      fields: [calendarAiActions.userId],
      references: [users.id],
    }),
    chat: one(chats, {
      fields: [calendarAiActions.chatId],
      references: [chats.chatId],
    }),
    event: one(calendarEvents, {
      fields: [calendarAiActions.eventId],
      references: [calendarEvents.id],
    }),
    booking: one(bookings, {
      fields: [calendarAiActions.bookingId],
      references: [bookings.id],
    }),
    confirmedByUser: one(users, {
      fields: [calendarAiActions.confirmedBy],
      references: [users.id],
      relationName: 'confirmedByUser',
    }),
  }),
);
