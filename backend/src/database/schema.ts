import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
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

// User Settings table - stores user preferences with flexible JSONB values
// Uses category/key pattern for extensibility (notifications, appearance, chat, etc.)
export const userSettings = pgTable(
  'user_settings',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: varchar('category', { length: 50 }).notNull(), // 'notifications', 'appearance', 'chat', etc.
    key: varchar('key', { length: 100 }).notNull(), // Setting key within category
    value: jsonb('value').notNull().default({}), // Flexible value storage
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    userSettingUnique: unique().on(table.userId, table.category, table.key),
    userIdIndex: index().on(table.userId),
    categoryIndex: index().on(table.category),
  }),
);

export type UserSetting = typeof userSettings.$inferSelect;
export type NewUserSetting = typeof userSettings.$inferInsert;

// Chats table - stores conversations with phone numbers
export const chats = pgTable(
  'chats',
  {
    id: serial('id').primaryKey(),
    chatId: varchar('chat_id').notNull().unique(),
    userId: integer('user_id'), // Foreign key to users (through senders relationship)
    senderId: integer('sender_id').notNull(), // Foreign key to senders - which sender number initiated this chat
    participantPhone: varchar('participant_phone').notNull(), // Phone number of participant (recipient)
    businessPhone: varchar('business_phone').notNull(), // Twilio WhatsApp Business number
    participantName: varchar('participant_name'), // Name of the participant (from Twilio or custom)
    lastMessage: text('last_message'), // Preview of last message
    lastMessageType: varchar('last_message_type'), // 'text', 'image', 'video', 'audio', 'gif', 'sticker', etc
    lastMessageTime: timestamp('last_message_time'),
    unreadCount: integer('unread_count').default(0).notNull(), // Count of unread inbound messages
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
    type: varchar('type').notNull(), // 'text', 'image', 'video', 'audio', 'document', etc
    text: text('text'),
    mediaUrl: text('media_url'), // Legacy: single media URL, deprecated in favor of attachments
    attachments: jsonb('attachments').default('[]'), // Array of attachment metadata objects
    direction: varchar('direction').notNull(), // 'inbound' or 'outbound'
    status: varchar('status').default('pending'), // 'pending', 'sent', 'delivered', 'read', 'failed'
    sentAt: timestamp('sent_at'), // Timestamp when message was successfully sent to WhatsApp
    deliveredAt: timestamp('delivered_at'), // Timestamp when message was delivered to recipient device
    readAt: timestamp('read_at'), // Timestamp when message was read by recipient
    failedReason: text('failed_reason'), // Error reason if status is 'failed'
    timestamp: timestamp('timestamp').notNull(), // Original message timestamp
    updatedAt: timestamp('updated_at').defaultNow(), // Track last status update
    // Edit and delete tracking (new fields)
    editedAt: timestamp('edited_at'), // Timestamp when message was edited (null = not edited)
    isDeleted: boolean('is_deleted').default(false), // Soft delete flag
    deletedAt: timestamp('deleted_at'), // Timestamp when message was deleted
    originalText: text('original_text'), // Original text before first edit (for audit trail)
    // Reply support fields
    replyToMessageId: varchar('reply_to_message_id'), // References the message_id of the original message being replied to
    replyPreview: jsonb('reply_preview'), // Cached snapshot of the original message for fast rendering
  },
  (table) => ({
    messageIdUnique: unique().on(table.messageId),
    isDeletedIndex: index().on(table.isDeleted), // Index for efficient queries on deleted messages
    replyToMessageIdIndex: index().on(table.replyToMessageId), // Index for reply lookups
  }),
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

// Notes table - multiple users can add notes to each message or chat
// Note: Either messageId OR chatId should be set, but not both (enforced at application level)
export const notes = pgTable(
  'notes',
  {
    id: serial('id').primaryKey(),
    messageId: varchar('message_id'), // Foreign key to messages.message_id (optional)
    chatId: varchar('chat_id'), // Foreign key to chats.chat_id (optional)
    userId: integer('user_id').notNull(), // User who created the note
    note: text('note').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    messageIdIndex: index().on(table.messageId),
    chatIdIndex: index().on(table.chatId),
  }),
);

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
    email: varchar('email'), // Contact email address
    language: varchar('language', { length: 10 }), // Preferred language code (e.g., 'en', 'es', 'pt')
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

// Contact Attributes table - custom key-value profile fields
export const contactAttributes = pgTable(
  'contact_attributes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.contactId, { onDelete: 'cascade' }),
    key: varchar('key', { length: 100 }).notNull(),
    value: text('value'),
    valueType: varchar('value_type', { length: 20 }).default('string'), // 'string', 'number', 'date', 'phone', 'email'
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    contactIdIndex: index().on(table.contactId),
    keyIndex: index().on(table.key),
    uniqueContactKey: unique().on(table.contactId, table.key),
  }),
);

export type ContactAttribute = typeof contactAttributes.$inferSelect;
export type NewContactAttribute = typeof contactAttributes.$inferInsert;

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
    phoneNumberId: varchar('phone_number_id'), // Meta Cloud API phone number ID
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

// Templates table - business-facing templates with friendly placeholders
export const templates = pgTable(
  'templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: integer('owner_id').notNull(), // Foreign key to users or teams (for now, user ID)
    name: varchar('name').notNull(), // Meta-compliant name (lowercase, underscores, e.g., 'invoice_ready')
    displayName: varchar('display_name').notNull(), // User-friendly display name (e.g., 'Invoice Ready')
    description: text('description'), // Template description
    isVisible: boolean('is_visible').default(true), // Whether template is visible in UI
    isActive: boolean('is_active').default(true), // Soft delete flag
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    ownerIdIndex: index().on(table.ownerId),
  }),
);

export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;

// Template Locales - multi-language, multi-platform variants
export const templateLocales = pgTable(
  'template_locales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => templates.id, { onDelete: 'cascade' }),
    locale: varchar('locale', { length: 10 }).notNull(), // 'en', 'es', etc
    type: varchar('type', { length: 20 }).notNull().default('text'), // 'text', 'media', etc
    header: text('header'), // Optional header text or media URL
    body: text('body').notNull(), // Main message body with friendly placeholders {{var_name}}
    footer: text('footer'), // Optional footer text
    exampleVars: jsonb('example_vars').default({}), // Example values for preview: {"customer_name": "John", ...}
    activeVersion: integer('active_version').default(1), // Current approved version
    // Meta Cloud API approval fields
    category: varchar('category', { length: 50 }).default('utility'), // 'authentication', 'marketing', 'utility'
    approvalStatus: varchar('approval_status', { length: 20 }).default('draft'), // 'draft', 'pending', 'approved', 'rejected', 'paused', 'disabled', 'appeal_requested'
    metaTemplateId: varchar('meta_template_id', { length: 100 }), // Template ID from Meta after submission
    rejectionReason: text('rejection_reason'), // Reason if rejected
    qualityRating: varchar('quality_rating', { length: 20 }).default('pending'), // 'pending', 'high', 'medium', 'low'
    submittedAt: timestamp('submitted_at'), // When submitted for approval
    reviewedAt: timestamp('reviewed_at'), // When Meta reviewed
    metaResponse: jsonb('meta_response'), // Full Meta API response
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    templateIdIndex: index().on(table.templateId),
    templateLocaleUnique: unique().on(table.templateId, table.locale),
    approvalStatusIndex: index().on(table.approvalStatus),
    metaTemplateIdIndex: index().on(table.metaTemplateId),
  }),
);

export type TemplateLocale = typeof templateLocales.$inferSelect;
export type NewTemplateLocale = typeof templateLocales.$inferInsert;

// Template Variables - metadata about placeholders used in templates
export const templateVariables = pgTable(
  'template_variables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    localeId: uuid('locale_id')
      .notNull()
      .references(() => templateLocales.id, { onDelete: 'cascade' }),
    varName: varchar('var_name').notNull(), // Variable name (e.g., 'customer_name')
    varType: varchar('var_type', { length: 20 }).default('string'), // 'string', 'currency', 'date', 'phone', 'redacted'
    validator: jsonb('validator').default({}), // Validation rules e.g. {"maxLength": 50, "pattern": "^[a-z]+$"}
    isRequired: boolean('is_required').default(true),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    localeIdIndex: index().on(table.localeId),
  }),
);

export type TemplateVariable = typeof templateVariables.$inferSelect;
export type NewTemplateVariable = typeof templateVariables.$inferInsert;

// Variable Definitions - system-level registry of allowed template variables
// Users cannot create arbitrary variables - they must use registered ones
export const variableDefinitions = pgTable(
  'variable_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    category: varchar('category', { length: 50 }).notNull(), // 'customer', 'chat', 'sender', 'order', 'property', 'custom'
    property: varchar('property', { length: 100 }).notNull(), // 'first_name', 'email', etc.
    displayName: varchar('display_name', { length: 100 }).notNull(), // User-friendly name
    description: text('description'), // Help text for users
    dataType: varchar('data_type', { length: 20 }).notNull().default('string'), // 'string', 'number', 'date', 'phone', 'email', 'currency'
    sourceTable: varchar('source_table', { length: 100 }), // Source table for resolution (e.g., 'contacts', 'chats')
    sourceColumn: varchar('source_column', { length: 100 }), // Column to read from
    fallbackValue: text('fallback_value'), // Default if value is missing
    isRequired: boolean('is_required').default(false), // Whether value must be present to send
    isSystem: boolean('is_system').default(true), // System-defined vs user-defined (for future extensibility)
    isActive: boolean('is_active').default(true),
    sortOrder: integer('sort_order').default(0), // For UI ordering
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    categoryIndex: index().on(table.category),
    categoryPropertyUnique: unique().on(table.category, table.property),
  }),
);

export type VariableDefinition = typeof variableDefinitions.$inferSelect;
export type NewVariableDefinition = typeof variableDefinitions.$inferInsert;

// Template Versions - versioning and provider submission status
export const templateVersions = pgTable(
  'template_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => templates.id, { onDelete: 'cascade' }),
    localeId: uuid('locale_id')
      .notNull()
      .references(() => templateLocales.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    content: jsonb('content').notNull(), // Provider-transformed content with numbered placeholders and metadata
    status: varchar('status', { length: 20 }).default('draft'), // 'draft', 'submitted', 'approved', 'rejected', 'disabled'
    providerId: varchar('provider_id'), // Provider-specific template ID
    providerName: varchar('provider_name', { length: 50 }), // 'twilio', 'meta', etc
    providerResponse: jsonb('provider_response'), // Full provider API response (for debugging rejections)
    platforms: jsonb('platforms').default(['whatsapp']), // Array of platforms this version supports
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    templateIdIndex: index().on(table.templateId),
    statusIndex: index().on(table.status),
  }),
);

export type TemplateVersion = typeof templateVersions.$inferSelect;
export type NewTemplateVersion = typeof templateVersions.$inferInsert;

// Template Tests - test sends via sandbox
export const templateTests = pgTable(
  'template_tests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateVersionId: uuid('template_version_id').references(
      () => templateVersions.id,
      { onDelete: 'cascade' },
    ),
    testerUserId: integer('tester_user_id').notNull(), // User who ran the test
    testPhoneNumber: varchar('test_phone_number').notNull(), // Masked or hashed phone number
    testPayload: jsonb('test_payload').notNull(), // Variables used in test
    testResult: jsonb('test_result'), // Provider response / delivery info
    deliveryStatus: varchar('delivery_status', { length: 20 }), // 'pending', 'sent', 'delivered', 'failed'
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    templateVersionIdIndex: index().on(table.templateVersionId),
    testerUserIdIndex: index().on(table.testerUserId),
  }),
);

export type TemplateTest = typeof templateTests.$inferSelect;
export type NewTemplateTest = typeof templateTests.$inferInsert;

// Template Platforms - configuration for which platforms each template supports
export const templatePlatforms = pgTable(
  'template_platforms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => templates.id, { onDelete: 'cascade' }),
    platformName: varchar('platform_name', { length: 50 }).notNull(), // 'whatsapp', 'messenger', 'instagram'
    isEnabled: boolean('is_enabled').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    templateIdIndex: index().on(table.templateId),
    templatePlatformUnique: unique().on(table.templateId, table.platformName),
  }),
);

export type TemplatePlatform = typeof templatePlatforms.$inferSelect;
export type NewTemplatePlatform = typeof templatePlatforms.$inferInsert;

// Relations for Drizzle ORM
export const templatesRelations = relations(templates, ({ many }) => ({
  locales: many(templateLocales),
  platforms: many(templatePlatforms),
  versions: many(templateVersions),
}));

export const templateLocalesRelations = relations(
  templateLocales,
  ({ one, many }) => ({
    template: one(templates, {
      fields: [templateLocales.templateId],
      references: [templates.id],
    }),
    variables: many(templateVariables),
    versions: many(templateVersions),
  }),
);

export const templateVariablesRelations = relations(
  templateVariables,
  ({ one }) => ({
    locale: one(templateLocales, {
      fields: [templateVariables.localeId],
      references: [templateLocales.id],
    }),
  }),
);

export const templateVersionsRelations = relations(
  templateVersions,
  ({ one, many }) => ({
    template: one(templates, {
      fields: [templateVersions.templateId],
      references: [templates.id],
    }),
    locale: one(templateLocales, {
      fields: [templateVersions.localeId],
      references: [templateLocales.id],
    }),
    tests: many(templateTests),
  }),
);

export const templateTestsRelations = relations(templateTests, ({ one }) => ({
  version: one(templateVersions, {
    fields: [templateTests.templateVersionId],
    references: [templateVersions.id],
  }),
}));

export const templatePlatformsRelations = relations(
  templatePlatforms,
  ({ one }) => ({
    template: one(templates, {
      fields: [templatePlatforms.templateId],
      references: [templates.id],
    }),
  }),
);

// Notes relations
export const notesRelations = relations(notes, ({ one }) => ({
  message: one(messages, {
    fields: [notes.messageId],
    references: [messages.messageId],
  }),
  chat: one(chats, {
    fields: [notes.chatId],
    references: [chats.chatId],
  }),
  user: one(users, {
    fields: [notes.userId],
    references: [users.id],
  }),
}));

// Add relations to chats table for notes
export const chatsRelations = relations(chats, ({ many }) => ({
  notes: many(notes),
}));

// Add relations to messages table for notes
export const messagesRelations = relations(messages, ({ many }) => ({
  notes: many(notes),
}));

// Contact and ContactAttributes relations
export const contactsRelations = relations(contacts, ({ many }) => ({
  attributes: many(contactAttributes),
  contactSenders: many(contactSenders),
}));

export const contactAttributesRelations = relations(
  contactAttributes,
  ({ one }) => ({
    contact: one(contacts, {
      fields: [contactAttributes.contactId],
      references: [contacts.contactId],
    }),
  }),
);

// User Settings relations
export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, {
    fields: [userSettings.userId],
    references: [users.id],
  }),
}));

// Users relations (settings and other user-related data)
export const usersRelations = relations(users, ({ many }) => ({
  settings: many(userSettings),
}));
