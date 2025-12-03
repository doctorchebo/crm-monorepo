import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Drizzle ORM Schema
 * Defines all database tables and their relationships
 *
 * Tables:
 * - messages: WhatsApp message metadata
 * - notes: User notes attached to messages
 */

// Messages table - stores WhatsApp message metadata
export const messages = pgTable(
  'messages',
  {
    id: serial('id').primaryKey(),
    messageId: varchar('message_id').notNull(),
    chatId: varchar('chat_id').notNull(),
    source: varchar('source').notNull(), // 'whatsapp', 'messenger', etc
    sender: varchar('sender').notNull(), // WhatsApp phone number
    type: varchar('type').notNull(), // 'text', 'image', 'video', etc
    text: text('text'),
    mediaUrl: text('media_url'),
    timestamp: timestamp('timestamp').notNull(),
  },
  (table) => ({
    messageIdUnique: unique().on(table.messageId),
  }),
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

// Notes table - multiple users can add notes to each message
export const notes = pgTable('notes', {
  id: serial('id').primaryKey(),
  messageId: varchar('message_id').notNull(), // Foreign key to messages.message_id
  userId: integer('user_id').notNull(), // User who created the note
  note: text('note').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;

// Senders table - link between users and WhatsApp business phone numbers
export const senders = pgTable('senders', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  phoneNumber: varchar('phone_number').notNull(), // WhatsApp Business phone (e.g., +14144557966)
  twilioPhoneNumberSid: varchar('twilio_phone_number_sid'), // Twilio's internal ID for this number
  twilioMessagingServiceSid: varchar('twilio_messaging_service_sid'),
  isActive: integer('is_active').default(1), // 1 = active, 0 = inactive
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type Sender = typeof senders.$inferSelect;
export type NewSender = typeof senders.$inferInsert;
