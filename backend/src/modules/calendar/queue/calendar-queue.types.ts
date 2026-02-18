/**
 * Calendar Queue Types
 *
 * Type definitions for calendar-related BullMQ queues.
 * Used for async processing of:
 * - Calendar sync jobs (Google, Outlook, Apple)
 * - Event reminder notifications
 */

// Queue names
export const CALENDAR_SYNC_QUEUE_NAME = 'calendar-sync';
export const CALENDAR_REMINDER_QUEUE_NAME = 'calendar-reminders';

// Job names
export const CALENDAR_SYNC_JOB_NAME = 'sync-calendar';
export const CALENDAR_REMINDER_JOB_NAME = 'send-reminder';

/**
 * Sync job statuses
 */
export type SyncJobStatus =
  | 'pending'
  | 'syncing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Sync directions
 */
export type SyncDirection =
  | 'bidirectional'
  | 'external_to_local'
  | 'local_to_external';

/**
 * Data for calendar sync job
 */
export interface CalendarSyncJobData {
  /** Connection ID to sync */
  connectionId: string;
  /** User ID owning the connection */
  userId: number;
  /** Provider type */
  provider: 'google' | 'outlook' | 'apple';
  /** Local calendar ID */
  calendarId: string;
  /** Whether to do a full sync (vs incremental) */
  fullSync: boolean;
  /** Sync direction */
  syncDirection: SyncDirection;
  /** Sync token from previous sync (for incremental) */
  syncToken?: string;
  /** External calendar ID */
  externalCalendarId?: string;
}

/**
 * Result of a calendar sync job
 */
export interface CalendarSyncJobResult {
  /** Job status */
  status: 'success' | 'partial' | 'failed';
  /** Number of events imported */
  eventsImported: number;
  /** Number of events exported */
  eventsExported: number;
  /** Number of events updated */
  eventsUpdated: number;
  /** Number of events deleted */
  eventsDeleted: number;
  /** New sync token for incremental sync */
  syncToken?: string;
  /** Error message if failed */
  error?: string;
  /** Errors for individual events */
  eventErrors?: Array<{
    eventId: string;
    error: string;
  }>;
}

/**
 * Reminder methods
 */
export type ReminderMethod = 'email' | 'push' | 'whatsapp' | 'in_app';

/**
 * Data for event reminder job
 */
export interface CalendarReminderJobData {
  /** Reminder record ID */
  reminderId: string;
  /** Event ID */
  eventId: string;
  /** User ID to notify */
  userId: number;
  /** Reminder method */
  reminderMethod: ReminderMethod;
  /** Event title */
  eventTitle: string;
  /** Event start time */
  eventStartTime: Date;
  /** Event location (optional) */
  eventLocation?: string;
  /** Meeting link (optional) */
  meetingLink?: string;
  /** Attendee emails for notification context */
  attendeeEmails?: string[];
}

/**
 * Result of a reminder job
 */
export interface CalendarReminderJobResult {
  /** Whether reminder was sent successfully */
  success: boolean;
  /** Method used */
  method: ReminderMethod;
  /** Error message if failed */
  error?: string;
  /** Timestamp when sent */
  sentAt?: Date;
}

/**
 * Sync frequency options
 */
export type SyncFrequency =
  | 'realtime'
  | 'every_5_minutes'
  | 'every_15_minutes'
  | 'every_hour'
  | 'manual';

/**
 * Get delay in milliseconds for sync frequency
 */
export function getSyncDelayMs(frequency: SyncFrequency): number {
  switch (frequency) {
    case 'realtime':
      return 0; // Handled by webhooks
    case 'every_5_minutes':
      return 5 * 60 * 1000;
    case 'every_15_minutes':
      return 15 * 60 * 1000;
    case 'every_hour':
      return 60 * 60 * 1000;
    case 'manual':
      return -1; // No automatic scheduling
    default:
      return 15 * 60 * 1000; // Default to 15 minutes
  }
}

/**
 * Job options for sync queue
 */
export const SYNC_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 30000, // 30 seconds initial delay
  },
  removeOnComplete: {
    age: 86400, // 24 hours
    count: 200,
  },
  removeOnFail: {
    age: 604800, // 7 days
  },
  timeout: 300000, // 5 minute timeout
};

/**
 * Job options for reminder queue
 */
export const REMINDER_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 10000, // 10 seconds initial delay
  },
  removeOnComplete: {
    age: 3600, // 1 hour
    count: 500,
  },
  removeOnFail: {
    age: 86400, // 24 hours
  },
  timeout: 60000, // 1 minute timeout
};

/**
 * WebSocket events for sync status
 */
export const SYNC_EVENTS = {
  SYNC_STARTED: 'calendar:sync:started',
  SYNC_PROGRESS: 'calendar:sync:progress',
  SYNC_COMPLETED: 'calendar:sync:completed',
  SYNC_FAILED: 'calendar:sync:failed',
} as const;

/**
 * WebSocket events for reminders
 */
export const REMINDER_EVENTS = {
  REMINDER_SENT: 'calendar:reminder:sent',
  REMINDER_FAILED: 'calendar:reminder:failed',
} as const;
