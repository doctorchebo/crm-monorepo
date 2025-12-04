import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Drizzle ORM Schema
 * Defines all database tables and their relationships
 *
 * Tables:
 * - users: User accounts
 * - chats: Conversation metadata linking users and phone numbers
 * - messages: WhatsApp message metadata
 * - notes: User notes attached to messages
 */

// Users table - user accounts for authentication
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email').notNull().unique(),
  name: varchar('name').notNull(),
  passwordHash: varchar('password_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// Chats table - stores conversations with phone numbers
export const chats = pgTable(
  'chats',
  {
    id: serial('id').primaryKey(),
    chatId: varchar('chat_id').notNull().unique(),
    userId: integer('user_id'), // Foreign key to users (through senders relationship)
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
    contactId: uuid('contact_id').notNull().unique().defaultRandom(), // UUID generated on create
    phoneNumberId: integer('phone_number_id'), // Foreign key to senders.id (the WhatsApp Business phone this contact belongs to)
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
    // Note: phoneNumber unique constraint is applied as a conditional index in migrations
    // to allow soft-deleted contacts to be recreated
  }),
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;

// Senders table - link between users and WhatsApp business phone numbers
export const senders = pgTable(
  'senders',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    phoneNumber: varchar('phone_number').notNull(), // WhatsApp Business phone (e.g., +14144557966)
    displayName: varchar('display_name'), // Optional friendly name (e.g., 'Main Office')
    twilioPhoneNumberSid: varchar('twilio_phone_number_sid'), // Twilio's internal ID for this number
    twilioMessagingServiceSid: varchar('twilio_messaging_service_sid'),
    twilioAccountSid: varchar('twilio_account_sid'), // Twilio account for verification
    isActive: boolean('is_active').default(true), // Active status
    isVerified: boolean('is_verified').default(false), // Twilio verification status
    contactCount: integer('contact_count').default(0), // Denormalized count for performance
    lastUsedAt: timestamp('last_used_at'), // When this sender was last used
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    phoneNumberUnique: unique().on(table.phoneNumber),
  }),
);

export type Sender = typeof senders.$inferSelect;
export type NewSender = typeof senders.$inferInsert;

// Contact Senders junction table - Many-to-Many relationship
export const contactSenders = pgTable(
  'contact_senders',
  {
    id: serial('id').primaryKey(),
    contactId: uuid('contact_id').notNull(), // Foreign key to contacts.contact_id
    senderId: integer('sender_id').notNull(), // Foreign key to senders.id
    isPrimary: boolean('is_primary').default(false), // Default sender for this contact
    addedAt: timestamp('added_at').defaultNow(),
  },
  (table) => ({
    contactSenderUnique: unique().on(table.contactId, table.senderId),
  }),
);

export type ContactSender = typeof contactSenders.$inferSelect;
export type NewContactSender = typeof contactSenders.$inferInsert;
