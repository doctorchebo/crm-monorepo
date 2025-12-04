import {
  boolean,
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
 * - chats: Conversation metadata linking users and phone numbers
 * - messages: WhatsApp message metadata
 * - notes: User notes attached to messages
 */

// Chats table - stores conversations with phone numbers
export const chats = pgTable(
  'chats',
  {
    id: serial('id').primaryKey(),
    chatId: varchar('chat_id').notNull().unique(),
    participantPhone: varchar('participant_phone').notNull(), // Phone number of participant (recipient)
    businessPhone: varchar('business_phone').notNull(), // Twilio WhatsApp Business number
    participantName: varchar('participant_name'), // Name of the participant (from Twilio or custom)
    lastMessage: text('last_message'), // Preview of last message
    lastMessageTime: timestamp('last_message_time'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    chatIdUnique: unique().on(table.chatId),
  }),
);

export type Chat = typeof chats.$inferSelect;
export type NewChat = typeof chats.$inferInsert;

// Messages table - stores WhatsApp message metadata
export const messages = pgTable(
  'messages',
  {
    id: serial('id').primaryKey(),
    messageId: varchar('message_id').notNull(),
    chatId: varchar('chat_id').notNull(), // Foreign key to chats.chat_id
    source: varchar('source').notNull(), // 'whatsapp', 'messenger', etc
    sender: varchar('sender').notNull(), // WhatsApp phone number
    type: varchar('type').notNull(), // 'text', 'image', 'video', etc
    text: text('text'),
    mediaUrl: text('media_url'),
    direction: varchar('direction').notNull(), // 'inbound' or 'outbound'
    status: varchar('status').default('sent'), // 'sent', 'delivered', 'read', 'failed'
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

// Contacts table - stores contact information for WhatsApp communications
export const contacts = pgTable(
  'contacts',
  {
    id: serial('id').primaryKey(),
    contactId: varchar('contact_id').notNull().unique(), // Unique identifier (can be from Twilio or generated)
    firstName: varchar('first_name').notNull(),
    lastName: varchar('last_name'),
    countryCode: varchar('country_code').notNull(), // e.g., '+591' for Bolivia
    phoneNumber: varchar('phone_number').notNull(), // Full phone number
    twilioContactId: varchar('twilio_contact_id'), // Contact ID from Twilio if synced
    lastMessageTime: timestamp('last_message_time'), // When last message was exchanged
    lastMessagePreview: text('last_message_preview'), // Preview of last message
    lastMessageType: varchar('last_message_type'), // 'text', 'image', etc
    avatar: text('avatar'), // Avatar URL from Twilio or custom
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    contactIdUnique: unique().on(table.contactId),
    phoneUnique: unique().on(table.phoneNumber),
  }),
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;

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
