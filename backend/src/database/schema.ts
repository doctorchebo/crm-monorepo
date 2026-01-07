import { relations } from 'drizzle-orm';
import {
  boolean,
  customType,
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
 * Custom pgvector type for storing vector embeddings
 * Supports any dimension size
 */
const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    // Parse pgvector format: [1,2,3,...]
    return value
      .slice(1, -1)
      .split(',')
      .map((v) => parseFloat(v));
  },
});

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
    // Last activity tracking - enables "Reacted 👍 to: <message>" previews in chat list
    lastActivityType: varchar('last_activity_type', { length: 20 }).default(
      'message',
    ), // 'message' or 'reaction'
    lastReactionEmoji: varchar('last_reaction_emoji', { length: 50 }), // Emoji when last activity was a reaction
    lastReactionIsOwn: boolean('last_reaction_is_own').default(false), // true = CRM user reacted, false = customer
    lastReactedMessagePreview: text('last_reacted_message_preview'), // Preview of the reacted-to message
    unreadCount: integer('unread_count').default(0).notNull(), // Count of unread inbound messages
    isActive: boolean('is_active').default(true),
    isArchived: boolean('is_archived').default(false), // Whether the chat is archived
    archivedAt: timestamp('archived_at'), // When the chat was archived
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    chatIdUnique: unique().on(table.chatId),
    isArchivedIndex: index('idx_chats_is_archived').on(table.isArchived),
    lastActivityTypeIndex: index('idx_chats_last_activity_type').on(
      table.lastActivityType,
    ),
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
    // AI generation tracking
    isAiGenerated: boolean('is_ai_generated').default(false), // Whether message was generated by AI
    aiGeneratedAt: timestamp('ai_generated_at'), // When AI generated this message
    aiModel: varchar('ai_model', { length: 100 }), // Model used for generation (e.g., 'gpt-4o-mini')
    aiProvider: varchar('ai_provider', { length: 50 }), // Provider used (e.g., 'openai')
    aiUsageLogId: uuid('ai_usage_log_id'), // Reference to AI usage log for billing
    wasManuallyOverridden: boolean('was_manually_overridden').default(false), // Human edited AI-generated message
  },
  (table) => ({
    messageIdUnique: unique().on(table.messageId),
    isDeletedIndex: index().on(table.isDeleted), // Index for efficient queries on deleted messages
    replyToMessageIdIndex: index().on(table.replyToMessageId), // Index for reply lookups
    isAiGeneratedIndex: index('idx_messages_is_ai_generated').on(
      table.isAiGenerated,
    ), // Index for AI message queries
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

// Contact Attributes table - custom key-value profile fields (chat-specific)
// Attributes are now per-chat, allowing the same contact to have different
// attribute values in different chats (e.g., different order IDs per sender)
export const contactAttributes = pgTable(
  'contact_attributes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.contactId, { onDelete: 'cascade' }),
    chatId: varchar('chat_id', { length: 255 }), // Chat-specific attributes
    key: varchar('key', { length: 100 }).notNull(),
    value: text('value'),
    valueType: varchar('value_type', { length: 20 }).default('string'), // 'string', 'number', 'date', 'phone', 'email'
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    contactIdIndex: index().on(table.contactId),
    chatIdIndex: index().on(table.chatId),
    keyIndex: index().on(table.key),
    uniqueContactChatKey: unique().on(table.contactId, table.chatId, table.key),
  }),
);

export type ContactAttribute = typeof contactAttributes.$inferSelect;
export type NewContactAttribute = typeof contactAttributes.$inferInsert;

/**
 * Senders table - WhatsApp Business phone numbers
 *
 * Phone numbers are managed through the system's single WABA (configured via META_WABA_ID).
 * Users can manually add phone numbers or sync them from the WABA via Meta Cloud API.
 *
 * Status Flow:
 * - PENDING: Phone added manually, not yet verified with Meta
 * - CONNECTED: Phone synced from WABA and verified
 * - DISCONNECTED: Phone removed from WABA or deactivated
 * - BANNED: Phone banned by Meta
 */
export const senders = pgTable(
  'senders',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(), // Owner of this sender number
    phoneNumber: varchar('phone_number').notNull(), // WhatsApp Business phone (e.g., +14144557966)
    phoneNumberId: varchar('phone_number_id'), // Meta Cloud API phone number ID (from WABA sync)
    displayName: varchar('display_name'), // User-friendly display name (e.g., 'Main Office')
    verifiedName: varchar('verified_name'), // Meta-verified business name
    codeVerificationStatus: varchar('code_verification_status', { length: 20 }), // 'NOT_VERIFIED', 'VERIFIED'
    qualityRating: varchar('quality_rating', { length: 20 }), // 'GREEN', 'YELLOW', 'RED', 'NA'
    messagingLimit: varchar('messaging_limit', { length: 50 }), // e.g., 'TIER_1K', 'TIER_10K', etc.
    status: varchar('status', { length: 20 }).default('PENDING'), // 'PENDING', 'CONNECTED', 'DISCONNECTED', 'BANNED'
    nameStatus: varchar('name_status', { length: 50 }), // Display name approval status
    isActive: boolean('is_active').default(true),
    isOfficialBusinessAccount: boolean('is_official_business_account').default(
      false,
    ), // OBA status (blue checkmark)
    lastUsedAt: timestamp('last_used_at'), // When this sender was last used
    registeredAt: timestamp('registered_at'), // When the phone number was registered with Meta
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    phoneNumberUnique: unique().on(table.phoneNumber),
    phoneNumberIdIndex: index('sender_phone_number_id_idx').on(
      table.phoneNumberId,
    ),
  }),
);

export type Sender = typeof senders.$inferSelect;
export type NewSender = typeof senders.$inferInsert;

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
  reactions: many(messageReactions),
}));

// ==================== Message Reactions ====================

/**
 * Message Reactions table - stores emoji reactions on messages
 * Each user can have one reaction per message (similar to WhatsApp)
 */
export const messageReactions = pgTable(
  'message_reactions',
  {
    id: serial('id').primaryKey(),
    messageId: varchar('message_id').notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: varchar('emoji', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    uniqueUserMessageReaction: unique().on(table.messageId, table.userId),
    messageIdIndex: index('idx_reactions_message_id').on(table.messageId),
    userIdIndex: index('idx_reactions_user_id').on(table.userId),
  }),
);

export type MessageReaction = typeof messageReactions.$inferSelect;
export type NewMessageReaction = typeof messageReactions.$inferInsert;

// Message Reactions relations
export const messageReactionsRelations = relations(
  messageReactions,
  ({ one }) => ({
    user: one(users, {
      fields: [messageReactions.userId],
      references: [users.id],
    }),
  }),
);

// ==================== Pinned Messages ====================

/**
 * Pinned Messages table - stores pinned messages per chat
 * Each chat can have up to 3 pinned messages at a time
 * Pins have an expiration time (24h, 7d, or 30d from creation)
 */
export const pinnedMessages = pgTable(
  'pinned_messages',
  {
    id: serial('id').primaryKey(),
    messageId: varchar('message_id').notNull(),
    chatId: varchar('chat_id').notNull(),
    pinnedBy: integer('pinned_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    pinnedAt: timestamp('pinned_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    // Each message can only be pinned once per chat
    uniqueMessagePin: unique().on(table.messageId, table.chatId),
    chatIdIndex: index('idx_pinned_messages_chat_id').on(table.chatId),
    messageIdIndex: index('idx_pinned_messages_message_id').on(table.messageId),
    expiresAtIndex: index('idx_pinned_messages_expires_at').on(table.expiresAt),
  }),
);

export type PinnedMessage = typeof pinnedMessages.$inferSelect;
export type NewPinnedMessage = typeof pinnedMessages.$inferInsert;

// Pinned Messages relations
export const pinnedMessagesRelations = relations(pinnedMessages, ({ one }) => ({
  user: one(users, {
    fields: [pinnedMessages.pinnedBy],
    references: [users.id],
  }),
  chat: one(chats, {
    fields: [pinnedMessages.chatId],
    references: [chats.chatId],
  }),
  message: one(messages, {
    fields: [pinnedMessages.messageId],
    references: [messages.messageId],
  }),
}));

// ==================== Customer Reactions ====================

/**
 * Customer Reactions table - stores reactions from WhatsApp customers
 *
 * These are different from CRM user reactions (messageReactions table).
 * Customers can react to ANY message in the conversation (both inbound and outbound).
 * Each customer can have one reaction per message (WhatsApp behavior).
 *
 * IMPORTANT: WhatsApp wamid encoding differs between sender and receiver.
 * When we send a message, the wamid encodes the customer's phone.
 * When the customer reacts, their reaction references a wamid with our business phone.
 * We store our internal messageId (from messages table) to enable frontend lookups.
 */
export const customerReactions = pgTable(
  'customer_reactions',
  {
    id: serial('id').primaryKey(),
    // Our internal message ID (matches messages.message_id) - used for frontend lookups
    messageId: varchar('message_id').notNull(),
    // The WhatsApp wamid from the reaction webhook (may differ from stored message wamid due to phone encoding)
    waMessageId: varchar('wa_message_id'),
    // Chat ID for filtering
    chatId: varchar('chat_id').notNull(),
    // Customer's phone number who reacted
    senderPhone: varchar('sender_phone').notNull(),
    // The emoji reaction (null if removed)
    emoji: varchar('emoji', { length: 50 }),
    // Whether the reaction is currently active (false if removed)
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    // Each customer can have one reaction per message
    uniqueCustomerMessageReaction: unique().on(
      table.messageId,
      table.senderPhone,
    ),
    messageIdIndex: index('idx_customer_reactions_message_id').on(
      table.messageId,
    ),
    chatIdIndex: index('idx_customer_reactions_chat_id').on(table.chatId),
    senderPhoneIndex: index('idx_customer_reactions_sender_phone').on(
      table.senderPhone,
    ),
  }),
);

export type CustomerReaction = typeof customerReactions.$inferSelect;
export type NewCustomerReaction = typeof customerReactions.$inferInsert;

// ==================== AI Memory Tables ====================

/**
 * AI Memories table - stores vector embeddings using pgvector
 * Links to existing chats and messages tables as source of truth
 * Vector similarity search is performed directly in PostgreSQL
 */
export const aiMemories = pgTable(
  'ai_memories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // References to source data
    chatId: varchar('chat_id').notNull(),
    messageId: varchar('message_id'), // Nullable if memory is derived from uploaded content
    // Vector embedding stored directly in PostgreSQL using pgvector (1536 dims for HNSW indexing)
    embedding: vector('embedding', { dimensions: 1536 }),
    // Content used for embedding generation
    content: text('content').notNull(),
    contentHash: varchar('content_hash', { length: 64 }), // SHA-256 hash
    // Metadata for filtering and context
    metadata: jsonb('metadata').notNull().default({}),
    // Embedding metadata
    embeddingModel: varchar('embedding_model', { length: 100 })
      .notNull()
      .default('text-embedding-3-large'),
    embeddingDimensions: integer('embedding_dimensions')
      .notNull()
      .default(1536),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    chatIdIndex: index('idx_ai_memories_chat_id').on(table.chatId),
    messageIdIndex: index('idx_ai_memories_message_id').on(table.messageId),
    contentHashIndex: index('idx_ai_memories_content_hash').on(
      table.contentHash,
    ),
    createdAtIndex: index('idx_ai_memories_created_at').on(table.createdAt),
    // Note: Vector index (HNSW) is created in migration SQL, not here
    // as Drizzle doesn't natively support pgvector index types
  }),
);

export type AiMemory = typeof aiMemories.$inferSelect;
export type NewAiMemory = typeof aiMemories.$inferInsert;

/**
 * AI Uploaded Content table - stores embeddings for user-uploaded content
 * Supports documents, images, audio, and video with extracted text content
 * Vector similarity search is performed directly in PostgreSQL
 */
export const aiUploadedContent = pgTable(
  'ai_uploaded_content',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Owner reference
    userId: integer('user_id').notNull(),
    // Optional chat context
    chatId: varchar('chat_id'),
    // Content type classification
    type: varchar('type', { length: 50 }).notNull(), // 'document', 'image', 'audio', 'video'
    // Original file information
    fileName: varchar('file_name', { length: 500 }),
    fileUrl: text('file_url'),
    fileSize: integer('file_size'),
    mimeType: varchar('mime_type', { length: 100 }),
    // Vector embedding stored directly in PostgreSQL using pgvector (1536 dims for HNSW indexing)
    embedding: vector('embedding', { dimensions: 1536 }),
    // Extracted content for embedding
    extractedContent: text('extracted_content').notNull(),
    contentHash: varchar('content_hash', { length: 64 }),
    // Processing metadata
    metadata: jsonb('metadata').notNull().default({}),
    // Embedding metadata
    embeddingModel: varchar('embedding_model', { length: 100 })
      .notNull()
      .default('text-embedding-3-large'),
    embeddingDimensions: integer('embedding_dimensions')
      .notNull()
      .default(1536),
    // Status tracking
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    errorMessage: text('error_message'),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    userIdIndex: index('idx_ai_uploaded_content_user_id').on(table.userId),
    chatIdIndex: index('idx_ai_uploaded_content_chat_id').on(table.chatId),
    typeIndex: index('idx_ai_uploaded_content_type').on(table.type),
    statusIndex: index('idx_ai_uploaded_content_status').on(table.status),
    // Note: Vector index (HNSW) is created in migration SQL, not here
  }),
);

export type AiUploadedContent = typeof aiUploadedContent.$inferSelect;
export type NewAiUploadedContent = typeof aiUploadedContent.$inferInsert;

/**
 * AI Memory Logs table - audit and tracking for all AI memory operations
 * Used for debugging, billing, and monitoring
 */
export const aiMemoryLogs = pgTable(
  'ai_memory_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Operation tracking
    operation: varchar('operation', { length: 50 }).notNull(), // 'embed', 'store', 'retrieve', 'update', 'delete'
    status: varchar('status', { length: 20 }).notNull(), // 'success', 'failed', 'partial'
    // Context references
    userId: integer('user_id'),
    chatId: varchar('chat_id'),
    memoryId: uuid('memory_id'),
    uploadedContentId: uuid('uploaded_content_id'),
    // Operation details
    requestMetadata: jsonb('request_metadata').default({}),
    responseMetadata: jsonb('response_metadata').default({}),
    // Error tracking
    errorCode: varchar('error_code', { length: 50 }),
    errorMessage: text('error_message'),
    errorStack: text('error_stack'),
    // Performance metrics
    latencyMs: integer('latency_ms'),
    tokensUsed: integer('tokens_used'),
    // Billing tracking
    costUsd: varchar('cost_usd', { length: 20 }), // Store as string for precision
    // Timestamp
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    operationIndex: index('idx_ai_memory_logs_operation').on(table.operation),
    statusIndex: index('idx_ai_memory_logs_status').on(table.status),
    userIdIndex: index('idx_ai_memory_logs_user_id').on(table.userId),
    chatIdIndex: index('idx_ai_memory_logs_chat_id').on(table.chatId),
    createdAtIndex: index('idx_ai_memory_logs_created_at').on(table.createdAt),
  }),
);

export type AiMemoryLog = typeof aiMemoryLogs.$inferSelect;
export type NewAiMemoryLog = typeof aiMemoryLogs.$inferInsert;

// AI Memory Relations
export const aiMemoriesRelations = relations(aiMemories, ({ one }) => ({
  chat: one(chats, {
    fields: [aiMemories.chatId],
    references: [chats.chatId],
  }),
  message: one(messages, {
    fields: [aiMemories.messageId],
    references: [messages.messageId],
  }),
}));

export const aiUploadedContentRelations = relations(
  aiUploadedContent,
  ({ one }) => ({
    user: one(users, {
      fields: [aiUploadedContent.userId],
      references: [users.id],
    }),
    chat: one(chats, {
      fields: [aiUploadedContent.chatId],
      references: [chats.chatId],
    }),
  }),
);

export const aiMemoryLogsRelations = relations(aiMemoryLogs, ({ one }) => ({
  user: one(users, {
    fields: [aiMemoryLogs.userId],
    references: [users.id],
  }),
  memory: one(aiMemories, {
    fields: [aiMemoryLogs.memoryId],
    references: [aiMemories.id],
  }),
  uploadedContent: one(aiUploadedContent, {
    fields: [aiMemoryLogs.uploadedContentId],
    references: [aiUploadedContent.id],
  }),
}));

// ==================== Workflow & Pipeline Tables ====================

/**
 * Workflow Stages table - defines pipeline stages (e.g., Lead, Interested, Negotiating, Closed)
 * Each user can have their own set of stages
 */
export const workflowStages = pgTable(
  'workflow_stages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    color: varchar('color', { length: 20 }).default('#3b82f6'), // Hex color for UI
    icon: varchar('icon', { length: 50 }), // Icon identifier
    sortOrder: integer('sort_order').notNull().default(0),
    isDefault: boolean('is_default').default(false), // Default stage for new chats
    isFinal: boolean('is_final').default(false), // Marks closed/completed stages
    isActive: boolean('is_active').default(true),
    // AI behavior settings for this stage
    aiAutoReply: boolean('ai_auto_reply').default(true), // Whether AI can auto-reply
    aiHandoffRequired: boolean('ai_handoff_required').default(false), // Require human review
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    userIdIndex: index('idx_workflow_stages_user_id').on(table.userId),
    sortOrderIndex: index('idx_workflow_stages_sort_order').on(table.sortOrder),
  }),
);

export type WorkflowStage = typeof workflowStages.$inferSelect;
export type NewWorkflowStage = typeof workflowStages.$inferInsert;

/**
 * Workflow Rules table - defines conditions for automatic stage transitions
 * Rules can be based on message content, sentiment, keywords, or custom conditions
 */
export const workflowRules = pgTable(
  'workflow_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    // Source and target stages
    fromStageId: uuid('from_stage_id').references(() => workflowStages.id, {
      onDelete: 'cascade',
    }), // null means any stage
    toStageId: uuid('to_stage_id')
      .notNull()
      .references(() => workflowStages.id, { onDelete: 'cascade' }),
    // Rule conditions (evaluated in order of priority)
    conditionType: varchar('condition_type', { length: 50 }).notNull(), // 'keyword', 'sentiment', 'category', 'intent', 'custom'
    conditions: jsonb('conditions').notNull().default({}), // Condition configuration
    // AI classification settings
    useAiClassification: boolean('use_ai_classification').default(true),
    aiPrompt: text('ai_prompt'), // Custom prompt for AI evaluation
    confidenceThreshold: integer('confidence_threshold').default(70), // Min confidence 0-100
    // Rule behavior
    priority: integer('priority').default(0), // Higher = evaluated first
    isActive: boolean('is_active').default(true),
    requiresHumanApproval: boolean('requires_human_approval').default(false),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    userIdIndex: index('idx_workflow_rules_user_id').on(table.userId),
    priorityIndex: index('idx_workflow_rules_priority').on(table.priority),
    conditionTypeIndex: index('idx_workflow_rules_condition_type').on(
      table.conditionType,
    ),
  }),
);

export type WorkflowRule = typeof workflowRules.$inferSelect;
export type NewWorkflowRule = typeof workflowRules.$inferInsert;

/**
 * Chat Stage Assignments table - tracks which stage each chat is in
 * One-to-one relationship with chats
 * Note: stageId is nullable to support stage-less workflow (AI pause without stage)
 */
export const chatStageAssignments = pgTable(
  'chat_stage_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chatId: varchar('chat_id')
      .notNull()
      .unique()
      .references(() => chats.chatId, { onDelete: 'cascade' }),
    stageId: uuid('stage_id').references(() => workflowStages.id, {
      onDelete: 'set null',
    }), // Nullable - chat may not have a stage assigned
    // AI handoff status
    awaitingHandoff: boolean('awaiting_handoff').default(false),
    handoffRequestedAt: timestamp('handoff_requested_at'),
    handoffReason: text('handoff_reason'),
    // AI pause status - prevents AI from sending messages
    aiPaused: boolean('ai_paused').default(false),
    aiPausedAt: timestamp('ai_paused_at'),
    aiPausedBy: integer('ai_paused_by').references(() => users.id),
    aiPauseReason: text('ai_pause_reason'), // Reason for AI pause
    // Timestamps
    assignedAt: timestamp('assigned_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    stageIdIndex: index('idx_chat_stage_assignments_stage_id').on(
      table.stageId,
    ),
    awaitingHandoffIndex: index('idx_chat_stage_assignments_handoff').on(
      table.awaitingHandoff,
    ),
    aiPausedIndex: index('idx_chat_stage_assignments_ai_paused').on(
      table.aiPaused,
    ),
  }),
);

export type ChatStageAssignment = typeof chatStageAssignments.$inferSelect;
export type NewChatStageAssignment = typeof chatStageAssignments.$inferInsert;

/**
 * Chat Stage History table - audit log of all stage transitions
 * Tracks who/what triggered the transition and why
 * Note: toStageId is nullable to support events without stage transition (e.g., handoff requests)
 */
export const chatStageHistory = pgTable(
  'chat_stage_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chatId: varchar('chat_id')
      .notNull()
      .references(() => chats.chatId, { onDelete: 'cascade' }),
    fromStageId: uuid('from_stage_id').references(() => workflowStages.id, {
      onDelete: 'set null',
    }),
    toStageId: uuid('to_stage_id').references(() => workflowStages.id, {
      onDelete: 'set null',
    }), // Nullable - for events that don't involve stage transitions
    // Trigger information
    triggerType: varchar('trigger_type', { length: 20 }).notNull(), // 'ai', 'human', 'system', 'rule'
    triggerMessageId: varchar('trigger_message_id'), // Message that triggered transition
    triggeredBy: integer('triggered_by').references(() => users.id), // User who triggered (for human)
    ruleId: uuid('rule_id').references(() => workflowRules.id, {
      onDelete: 'set null',
    }), // Rule that triggered (for rule/ai)
    // AI classification details
    aiClassification: jsonb('ai_classification'), // AI analysis result
    aiConfidence: integer('ai_confidence'), // 0-100
    // Additional context
    reason: text('reason'), // Human-readable reason
    metadata: jsonb('metadata').default({}), // Additional data
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    chatIdIndex: index('idx_chat_stage_history_chat_id').on(table.chatId),
    triggerTypeIndex: index('idx_chat_stage_history_trigger_type').on(
      table.triggerType,
    ),
    createdAtIndex: index('idx_chat_stage_history_created_at').on(
      table.createdAt,
    ),
  }),
);

export type ChatStageHistory = typeof chatStageHistory.$inferSelect;
export type NewChatStageHistory = typeof chatStageHistory.$inferInsert;

/**
 * LLM Usage Logs table - tracks all LLM API calls for billing and monitoring
 * Provider-agnostic: tracks usage across all providers
 */
export const llmUsageLogs = pgTable(
  'llm_usage_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Context
    userId: integer('user_id').references(() => users.id),
    chatId: varchar('chat_id'),
    // Provider information
    provider: varchar('provider', { length: 50 }).notNull(), // 'openai', 'anthropic', 'cohere', etc.
    model: varchar('model', { length: 100 }).notNull(), // 'gpt-4o-mini', 'claude-3-opus', etc.
    // Operation type
    operationType: varchar('operation_type', { length: 50 }).notNull(), // 'chat', 'embedding', 'classification', 'transcription'
    // Token usage
    inputTokens: integer('input_tokens').default(0),
    outputTokens: integer('output_tokens').default(0),
    totalTokens: integer('total_tokens').default(0),
    // Cost tracking (in USD, stored as string for precision)
    inputCost: varchar('input_cost', { length: 20 }).default('0'),
    outputCost: varchar('output_cost', { length: 20 }).default('0'),
    totalCost: varchar('total_cost', { length: 20 }).default('0'),
    // Performance metrics
    latencyMs: integer('latency_ms'),
    // Request/Response metadata
    requestMetadata: jsonb('request_metadata').default({}),
    responseMetadata: jsonb('response_metadata').default({}),
    // Status
    status: varchar('status', { length: 20 }).notNull().default('success'), // 'success', 'failed', 'rate_limited'
    errorCode: varchar('error_code', { length: 50 }),
    errorMessage: text('error_message'),
    // Timestamp
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    userIdIndex: index('idx_llm_usage_logs_user_id').on(table.userId),
    providerIndex: index('idx_llm_usage_logs_provider').on(table.provider),
    operationTypeIndex: index('idx_llm_usage_logs_operation_type').on(
      table.operationType,
    ),
    createdAtIndex: index('idx_llm_usage_logs_created_at').on(table.createdAt),
    statusIndex: index('idx_llm_usage_logs_status').on(table.status),
  }),
);

export type LlmUsageLog = typeof llmUsageLogs.$inferSelect;
export type NewLlmUsageLog = typeof llmUsageLogs.$inferInsert;

/**
 * Policy Violation Logs table - tracks simulated and real policy violations
 * Used for testing, monitoring, and preventive measures
 */
export const policyViolationLogs = pgTable(
  'policy_violation_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Context
    userId: integer('user_id').references(() => users.id),
    chatId: varchar('chat_id'),
    messageId: varchar('message_id'),
    senderId: integer('sender_id'),
    // Violation details
    violationType: varchar('violation_type', { length: 50 }).notNull(), // 'rate_limit', 'window_expired', 'template_unapproved', 'content_blocked', 'ban_risk'
    severity: varchar('severity', { length: 20 }).notNull().default('warning'), // 'info', 'warning', 'critical'
    // Violation specifics
    description: text('description').notNull(),
    details: jsonb('details').default({}), // Additional violation context
    // Action taken
    actionTaken: varchar('action_taken', { length: 50 }).notNull(), // 'blocked', 'warned', 'logged', 'simulated'
    isSimulated: boolean('is_simulated').default(false), // True if this was a test/simulation
    // Resolution
    resolvedAt: timestamp('resolved_at'),
    resolvedBy: integer('resolved_by').references(() => users.id),
    resolution: text('resolution'),
    // Timestamp
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    userIdIndex: index('idx_policy_violation_logs_user_id').on(table.userId),
    violationTypeIndex: index('idx_policy_violation_logs_type').on(
      table.violationType,
    ),
    severityIndex: index('idx_policy_violation_logs_severity').on(
      table.severity,
    ),
    createdAtIndex: index('idx_policy_violation_logs_created_at').on(
      table.createdAt,
    ),
    isSimulatedIndex: index('idx_policy_violation_logs_simulated').on(
      table.isSimulated,
    ),
  }),
);

export type PolicyViolationLog = typeof policyViolationLogs.$inferSelect;
export type NewPolicyViolationLog = typeof policyViolationLogs.$inferInsert;

/**
 * AI Action Logs table - comprehensive tracking of all AI decisions and actions
 * Tracks message text, templates used, variables replaced, embeddings, and predictions
 */
export const aiActionLogs = pgTable(
  'ai_action_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Context
    userId: integer('user_id').references(() => users.id),
    chatId: varchar('chat_id').notNull(),
    messageId: varchar('message_id'),
    senderId: integer('sender_id'),
    // Action details
    actionType: varchar('action_type', { length: 50 }).notNull(), // 'send_message', 'classify', 'transition_stage', 'handoff', 'block'
    actionStatus: varchar('action_status', { length: 20 })
      .notNull()
      .default('success'), // 'success', 'blocked', 'failed', 'pending_approval'
    // Message details (when applicable)
    messageText: text('message_text'), // The actual message text sent or analyzed
    messageDirection: varchar('message_direction', { length: 10 }), // 'inbound' or 'outbound'
    // Template details (when using templates)
    templateId: uuid('template_id'),
    templateName: varchar('template_name'),
    templateVariables: jsonb('template_variables').default({}), // Variables replaced in template
    // AI classification details
    predictedCategory: varchar('predicted_category'),
    predictedIntent: varchar('predicted_intent'),
    predictedSentiment: varchar('predicted_sentiment'),
    confidenceScore: integer('confidence_score'), // 0-100
    // Embedding details
    embeddingModel: varchar('embedding_model'),
    embeddingDimensions: integer('embedding_dimensions'),
    embeddingUsed: boolean('embedding_used').default(false),
    // Guardrail details
    guardrailTriggered: boolean('guardrail_triggered').default(false),
    guardrailType: varchar('guardrail_type', { length: 50 }), // 'rate_limit', 'template_unapproved', 'window_expired', 'media_limit', 'content_blocked'
    guardrailReason: text('guardrail_reason'),
    // Rate limit tracking
    messagesInWindow: integer('messages_in_window'), // Number of messages sent in current window
    windowStartTime: timestamp('window_start_time'), // Start of the rate limit window
    // Additional metadata
    metadata: jsonb('metadata').default({}),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    userIdIndex: index('idx_ai_action_logs_user_id').on(table.userId),
    chatIdIndex: index('idx_ai_action_logs_chat_id').on(table.chatId),
    actionTypeIndex: index('idx_ai_action_logs_action_type').on(
      table.actionType,
    ),
    actionStatusIndex: index('idx_ai_action_logs_action_status').on(
      table.actionStatus,
    ),
    guardrailTriggeredIndex: index('idx_ai_action_logs_guardrail').on(
      table.guardrailTriggered,
    ),
    createdAtIndex: index('idx_ai_action_logs_created_at').on(table.createdAt),
  }),
);

export type AiActionLog = typeof aiActionLogs.$inferSelect;
export type NewAiActionLog = typeof aiActionLogs.$inferInsert;

/**
 * Rate Limit Tracking table - tracks message counts per chat and per sender for rate limiting
 */
export const rateLimitTracking = pgTable(
  'rate_limit_tracking',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Tracking target
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    chatId: varchar('chat_id'), // Per-chat tracking (optional)
    senderId: integer('sender_id'), // Per-sender tracking (optional)
    // Window tracking
    windowType: varchar('window_type', { length: 20 }).notNull(), // 'minute', 'hour', 'day', '24h_session'
    windowStart: timestamp('window_start').notNull(),
    windowEnd: timestamp('window_end').notNull(),
    // Counts
    messageCount: integer('message_count').default(0),
    aiMessageCount: integer('ai_message_count').default(0), // AI-generated messages only
    templateMessageCount: integer('template_message_count').default(0),
    // Last customer message (for 24h window tracking)
    lastCustomerMessageAt: timestamp('last_customer_message_at'),
    // Status
    isBlocked: boolean('is_blocked').default(false),
    blockedAt: timestamp('blocked_at'),
    blockReason: text('block_reason'),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    userIdIndex: index('idx_rate_limit_tracking_user_id').on(table.userId),
    chatIdIndex: index('idx_rate_limit_tracking_chat_id').on(table.chatId),
    windowTypeIndex: index('idx_rate_limit_tracking_window').on(
      table.windowType,
    ),
    windowEndIndex: index('idx_rate_limit_tracking_window_end').on(
      table.windowEnd,
    ),
    uniqueWindow: unique().on(
      table.userId,
      table.chatId,
      table.senderId,
      table.windowType,
      table.windowStart,
    ),
  }),
);

export type RateLimitTracking = typeof rateLimitTracking.$inferSelect;
export type NewRateLimitTracking = typeof rateLimitTracking.$inferInsert;

/**
 * Guardrail Alerts table - alerts sent to CRM users when guardrails are triggered
 */
export const guardrailAlerts = pgTable(
  'guardrail_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Context
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    chatId: varchar('chat_id'),
    senderId: integer('sender_id'),
    // Alert details
    alertType: varchar('alert_type', { length: 50 }).notNull(), // 'rate_limit_warning', 'rate_limit_blocked', 'template_rejected', 'window_expired', 'ban_risk', 'media_limit'
    severity: varchar('severity', { length: 20 }).notNull().default('warning'), // 'info', 'warning', 'critical'
    title: varchar('title', { length: 200 }).notNull(),
    message: text('message').notNull(),
    // Related action log
    actionLogId: uuid('action_log_id').references(() => aiActionLogs.id),
    // Delivery status
    deliveredVia: varchar('delivered_via', { length: 50 }).default('websocket'), // 'websocket', 'email', 'push', 'in_app'
    deliveredAt: timestamp('delivered_at'),
    // Acknowledgment
    isRead: boolean('is_read').default(false),
    readAt: timestamp('read_at'),
    isDismissed: boolean('is_dismissed').default(false),
    dismissedAt: timestamp('dismissed_at'),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    userIdIndex: index('idx_guardrail_alerts_user_id').on(table.userId),
    alertTypeIndex: index('idx_guardrail_alerts_type').on(table.alertType),
    severityIndex: index('idx_guardrail_alerts_severity').on(table.severity),
    isReadIndex: index('idx_guardrail_alerts_is_read').on(table.isRead),
    createdAtIndex: index('idx_guardrail_alerts_created_at').on(
      table.createdAt,
    ),
  }),
);

export type GuardrailAlert = typeof guardrailAlerts.$inferSelect;
export type NewGuardrailAlert = typeof guardrailAlerts.$inferInsert;

/**
 * AI Usage Logs table - tracks AI token consumption per message for billing
 * Schema matches user requirements exactly:
 * - id UUID PRIMARY KEY
 * - chat_id INTEGER REFERENCES chats(id)
 * - message_id INTEGER REFERENCES messages(id)
 * - provider_name VARCHAR(50)
 * - tokens_used INTEGER
 * - cost NUMERIC(10,2)
 * - created_at TIMESTAMP DEFAULT now()
 */
export const aiUsageLogs = pgTable(
  'ai_usage_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chatId: integer('chat_id').references(() => chats.id), // Per user requirement
    messageId: integer('message_id').references(() => messages.id), // Per user requirement
    providerName: varchar('provider_name', { length: 50 }).notNull(), // Per user requirement
    tokensUsed: integer('tokens_used').notNull().default(0), // Per user requirement
    cost: varchar('cost', { length: 20 }).notNull().default('0.00'), // Stored as string for precision
    // Extended fields for detailed tracking
    userId: integer('user_id').references(() => users.id),
    operationType: varchar('operation_type', { length: 50 }), // 'chat', 'classification', 'embedding'
    model: varchar('model', { length: 100 }), // e.g., 'gpt-4o-mini'
    inputTokens: integer('input_tokens').default(0),
    outputTokens: integer('output_tokens').default(0),
    createdAt: timestamp('created_at').defaultNow(), // Per user requirement
  },
  (table) => ({
    chatIdIndex: index('idx_ai_usage_logs_chat_id').on(table.chatId),
    messageIdIndex: index('idx_ai_usage_logs_message_id').on(table.messageId),
    userIdIndex: index('idx_ai_usage_logs_user_id').on(table.userId),
    providerIndex: index('idx_ai_usage_logs_provider').on(table.providerName),
    createdAtIndex: index('idx_ai_usage_logs_created_at').on(table.createdAt),
  }),
);

export type AiUsageLog = typeof aiUsageLogs.$inferSelect;
export type NewAiUsageLog = typeof aiUsageLogs.$inferInsert;

/**
 * Usage Limits table - defines spending/token limits per user for throttling
 * Supports multiple limit types and time periods
 */
export const usageLimits = pgTable(
  'usage_limits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Limit configuration
    limitType: varchar('limit_type', { length: 30 }).notNull(), // 'tokens', 'cost', 'requests'
    limitPeriod: varchar('limit_period', { length: 20 }).notNull(), // 'daily', 'weekly', 'monthly', 'total'
    limitValue: integer('limit_value').notNull(), // The actual limit (tokens count or cents)
    // Current usage
    currentUsage: integer('current_usage').default(0),
    periodStart: timestamp('period_start').defaultNow(),
    periodEnd: timestamp('period_end'),
    // Status
    isActive: boolean('is_active').default(true),
    warningThreshold: integer('warning_threshold').default(80), // Percentage (80 = 80%)
    // What happens when limit is reached
    actionOnLimit: varchar('action_on_limit', { length: 30 }).default('pause'), // 'pause', 'notify', 'block'
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    userIdIndex: index('idx_usage_limits_user_id').on(table.userId),
    limitTypeIndex: index('idx_usage_limits_type').on(table.limitType),
    isActiveIndex: index('idx_usage_limits_active').on(table.isActive),
    uniqueUserLimit: unique().on(
      table.userId,
      table.limitType,
      table.limitPeriod,
    ),
  }),
);

export type UsageLimit = typeof usageLimits.$inferSelect;
export type NewUsageLimit = typeof usageLimits.$inferInsert;

/**
 * Handoff Notifications table - tracks intervention requests sent to users
 * Used for human-AI handoff notification management
 */
export const handoffNotifications = pgTable(
  'handoff_notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    chatId: varchar('chat_id').notNull(),
    messageId: varchar('message_id'), // The message that triggered handoff
    // Notification details
    notificationType: varchar('notification_type', { length: 50 }).notNull(), // 'intervention_required', 'ai_paused', 'limit_exceeded', 'handoff_request'
    priority: varchar('priority', { length: 20 }).default('medium'), // 'low', 'medium', 'high', 'critical'
    title: varchar('title', { length: 200 }).notNull(),
    message: text('message').notNull(),
    // AI context
    aiReason: text('ai_reason'), // Why AI requested handoff
    aiConfidence: integer('ai_confidence'), // AI's confidence in needing handoff (0-100)
    suggestedAction: text('suggested_action'), // What AI suggests human should do
    // Status tracking
    status: varchar('status', { length: 30 }).default('pending'), // 'pending', 'viewed', 'acknowledged', 'resolved'
    viewedAt: timestamp('viewed_at'),
    acknowledgedAt: timestamp('acknowledged_at'),
    resolvedAt: timestamp('resolved_at'),
    resolvedBy: integer('resolved_by').references(() => users.id),
    resolution: text('resolution'), // How it was resolved
    // Delivery
    deliveredVia: varchar('delivered_via', { length: 50 }), // 'websocket', 'push', 'email'
    deliveredAt: timestamp('delivered_at'),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    userIdIndex: index('idx_handoff_notifications_user_id').on(table.userId),
    chatIdIndex: index('idx_handoff_notifications_chat_id').on(table.chatId),
    statusIndex: index('idx_handoff_notifications_status').on(table.status),
    priorityIndex: index('idx_handoff_notifications_priority').on(
      table.priority,
    ),
    createdAtIndex: index('idx_handoff_notifications_created_at').on(
      table.createdAt,
    ),
  }),
);

export type HandoffNotification = typeof handoffNotifications.$inferSelect;
export type NewHandoffNotification = typeof handoffNotifications.$inferInsert;

// ==================== Workflow Relations ====================

export const workflowStagesRelations = relations(
  workflowStages,
  ({ one, many }) => ({
    user: one(users, {
      fields: [workflowStages.userId],
      references: [users.id],
    }),
    assignments: many(chatStageAssignments),
    rulesFrom: many(workflowRules, { relationName: 'fromStage' }),
    rulesTo: many(workflowRules, { relationName: 'toStage' }),
    historyFrom: many(chatStageHistory, { relationName: 'fromStage' }),
    historyTo: many(chatStageHistory, { relationName: 'toStage' }),
  }),
);

export const workflowRulesRelations = relations(workflowRules, ({ one }) => ({
  user: one(users, {
    fields: [workflowRules.userId],
    references: [users.id],
  }),
  fromStage: one(workflowStages, {
    fields: [workflowRules.fromStageId],
    references: [workflowStages.id],
    relationName: 'fromStage',
  }),
  toStage: one(workflowStages, {
    fields: [workflowRules.toStageId],
    references: [workflowStages.id],
    relationName: 'toStage',
  }),
}));

export const chatStageAssignmentsRelations = relations(
  chatStageAssignments,
  ({ one }) => ({
    chat: one(chats, {
      fields: [chatStageAssignments.chatId],
      references: [chats.chatId],
    }),
    stage: one(workflowStages, {
      fields: [chatStageAssignments.stageId],
      references: [workflowStages.id],
    }),
    pausedByUser: one(users, {
      fields: [chatStageAssignments.aiPausedBy],
      references: [users.id],
    }),
  }),
);

export const chatStageHistoryRelations = relations(
  chatStageHistory,
  ({ one }) => ({
    chat: one(chats, {
      fields: [chatStageHistory.chatId],
      references: [chats.chatId],
    }),
    fromStage: one(workflowStages, {
      fields: [chatStageHistory.fromStageId],
      references: [workflowStages.id],
      relationName: 'fromStage',
    }),
    toStage: one(workflowStages, {
      fields: [chatStageHistory.toStageId],
      references: [workflowStages.id],
      relationName: 'toStage',
    }),
    triggeredByUser: one(users, {
      fields: [chatStageHistory.triggeredBy],
      references: [users.id],
    }),
    rule: one(workflowRules, {
      fields: [chatStageHistory.ruleId],
      references: [workflowRules.id],
    }),
  }),
);

export const llmUsageLogsRelations = relations(llmUsageLogs, ({ one }) => ({
  user: one(users, {
    fields: [llmUsageLogs.userId],
    references: [users.id],
  }),
}));

export const policyViolationLogsRelations = relations(
  policyViolationLogs,
  ({ one }) => ({
    user: one(users, {
      fields: [policyViolationLogs.userId],
      references: [users.id],
    }),
    resolvedByUser: one(users, {
      fields: [policyViolationLogs.resolvedBy],
      references: [users.id],
    }),
  }),
);

export const aiActionLogsRelations = relations(aiActionLogs, ({ one }) => ({
  user: one(users, {
    fields: [aiActionLogs.userId],
    references: [users.id],
  }),
}));

export const rateLimitTrackingRelations = relations(
  rateLimitTracking,
  ({ one }) => ({
    user: one(users, {
      fields: [rateLimitTracking.userId],
      references: [users.id],
    }),
  }),
);

export const guardrailAlertsRelations = relations(
  guardrailAlerts,
  ({ one }) => ({
    user: one(users, {
      fields: [guardrailAlerts.userId],
      references: [users.id],
    }),
    actionLog: one(aiActionLogs, {
      fields: [guardrailAlerts.actionLogId],
      references: [aiActionLogs.id],
    }),
  }),
);

export const aiUsageLogsRelations = relations(aiUsageLogs, ({ one }) => ({
  user: one(users, {
    fields: [aiUsageLogs.userId],
    references: [users.id],
  }),
  chat: one(chats, {
    fields: [aiUsageLogs.chatId],
    references: [chats.id],
  }),
  message: one(messages, {
    fields: [aiUsageLogs.messageId],
    references: [messages.id],
  }),
}));

export const usageLimitsRelations = relations(usageLimits, ({ one }) => ({
  user: one(users, {
    fields: [usageLimits.userId],
    references: [users.id],
  }),
}));

export const handoffNotificationsRelations = relations(
  handoffNotifications,
  ({ one }) => ({
    user: one(users, {
      fields: [handoffNotifications.userId],
      references: [users.id],
    }),
    resolvedByUser: one(users, {
      fields: [handoffNotifications.resolvedBy],
      references: [users.id],
    }),
  }),
);

// ============================================================================
// AI Configuration Tables
// ============================================================================

/**
 * AI Configurations table - user-level AI behavior settings
 * Defines default tone, style, rate limits, and language preferences
 */
export const aiConfigurations = pgTable(
  'ai_configurations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Tone and style
    defaultTone: varchar('default_tone', { length: 50 }).default('friendly'), // 'friendly', 'professional', 'casual', 'formal'
    defaultStyle: varchar('default_style', { length: 50 }).default('concise'), // 'concise', 'detailed', 'conversational', 'technical'
    formalityLevel: varchar('formality_level', { length: 30 }).default(
      'balanced',
    ), // 'casual', 'balanced', 'formal', 'very_formal'
    // Rate limiting
    maxMessagesPerHour: integer('max_messages_per_hour').default(5),
    maxMessagesPerDay: integer('max_messages_per_day').default(50),
    minDelayBetweenMessagesMs: integer('min_delay_between_messages_ms').default(
      3000,
    ), // Minimum delay in ms
    // Language preferences
    languagePreference: varchar('language_preference', { length: 10 }), // 'en', 'es', 'pt', etc. or null for auto-detect
    autoTranslateResponses: boolean('auto_translate_responses').default(false),
    // Reply behavior
    allowFreeTextRepliesWithin24h: boolean(
      'allow_free_text_replies_within_24h',
    ).default(true),
    preferTemplatesOver24h: boolean('prefer_templates_over_24h').default(true),
    autoSuggestTemplates: boolean('auto_suggest_templates').default(true),
    // Content restrictions
    maxResponseLength: integer('max_response_length').default(500), // Max characters per response
    avoidTopics: jsonb('avoid_topics').default('[]'), // Array of topics to avoid
    requiredSignature: text('required_signature'), // Signature to append to messages
    // AI model preferences
    preferredModel: varchar('preferred_model', { length: 50 }), // 'gpt-4o', 'gpt-4o-mini', etc.
    temperature: integer('temperature').default(70), // 0-100, mapped to 0.0-1.0
    // Metadata
    metadata: jsonb('metadata').default({}),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    userIdIndex: index('idx_ai_configurations_user_id').on(table.userId),
  }),
);

export type AiConfiguration = typeof aiConfigurations.$inferSelect;
export type NewAiConfiguration = typeof aiConfigurations.$inferInsert;

/**
 * Chat AI Overrides table - per-chat overrides for AI configuration
 * Allows specific chats to have different AI behavior than user defaults
 * Note: chatId is a VARCHAR reference without FK to allow flexibility
 */
export const chatAiOverrides = pgTable(
  'chat_ai_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chatId: varchar('chat_id', { length: 255 }).notNull().unique(), // Reference to chats.chat_id
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Override values (null means inherit from user config or workflow stage)
    tone: varchar('tone', { length: 50 }), // Override tone for this chat
    style: varchar('style', { length: 50 }), // Override style for this chat
    formalityLevel: varchar('formality_level', { length: 30 }),
    maxMessagesPerHour: integer('max_messages_per_hour'), // Override rate limit
    languagePreference: varchar('language_preference', { length: 10 }),
    allowFreeTextReplies: boolean('allow_free_text_replies'),
    maxResponseLength: integer('max_response_length'),
    // Special instructions for this specific chat
    customInstructions: text('custom_instructions'), // Additional context for AI
    avoidTopics: jsonb('avoid_topics'), // Topics to avoid in this chat
    // AI behavior flags
    aiEnabled: boolean('ai_enabled').default(true), // Master switch for AI in this chat
    useTemplatesOnly: boolean('use_templates_only').default(false), // Only use templates, no free text
    // Reason for override
    overrideReason: text('override_reason'),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    chatIdIndex: index('idx_chat_ai_overrides_chat_id').on(table.chatId),
    userIdIndex: index('idx_chat_ai_overrides_user_id').on(table.userId),
    aiEnabledIndex: index('idx_chat_ai_overrides_ai_enabled').on(
      table.aiEnabled,
    ),
  }),
);

export type ChatAiOverride = typeof chatAiOverrides.$inferSelect;
export type NewChatAiOverride = typeof chatAiOverrides.$inferInsert;

/**
 * Workflow Stage AI Settings table - AI behavior per workflow stage
 * Allows different AI behavior based on the stage a chat is in
 * Note: stageId is a VARCHAR reference to allow flexibility with workflow_stages table
 */
export const workflowStageAiSettings = pgTable(
  'workflow_stage_ai_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stageId: varchar('stage_id', { length: 255 }).notNull().unique(), // Reference to workflow_stages.id
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Tone and style for this stage
    tone: varchar('tone', { length: 50 }),
    style: varchar('style', { length: 50 }),
    formalityLevel: varchar('formality_level', { length: 30 }),
    // Rate limiting for this stage
    maxMessagesPerHour: integer('max_messages_per_hour'),
    // Language
    languagePreference: varchar('language_preference', { length: 10 }),
    // Template/reply behavior
    allowFreeTextReplies: boolean('allow_free_text_replies'),
    useTemplatesOnly: boolean('use_templates_only').default(false),
    suggestedTemplateIds: jsonb('suggested_template_ids').default('[]'), // Preferred templates for this stage
    // Response length
    maxResponseLength: integer('max_response_length'),
    // Stage-specific AI instructions
    systemPromptAddition: text('system_prompt_addition'), // Additional context for AI in this stage
    goalDescription: text('goal_description'), // What AI should aim to achieve in this stage
    escalationTriggers: jsonb('escalation_triggers').default('[]'), // Conditions that should trigger escalation
    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    stageIdIndex: index('idx_workflow_stage_ai_settings_stage_id').on(
      table.stageId,
    ),
    userIdIndex: index('idx_workflow_stage_ai_settings_user_id').on(
      table.userId,
    ),
  }),
);

export type WorkflowStageAiSetting =
  typeof workflowStageAiSettings.$inferSelect;
export type NewWorkflowStageAiSetting =
  typeof workflowStageAiSettings.$inferInsert;

// ============================================================================
// AI Configuration Relations
// ============================================================================

export const aiConfigurationsRelations = relations(
  aiConfigurations,
  ({ one }) => ({
    user: one(users, {
      fields: [aiConfigurations.userId],
      references: [users.id],
    }),
  }),
);

export const chatAiOverridesRelations = relations(
  chatAiOverrides,
  ({ one }) => ({
    // Note: chat relation intentionally omitted to avoid FK dependency
    user: one(users, {
      fields: [chatAiOverrides.userId],
      references: [users.id],
    }),
  }),
);

export const workflowStageAiSettingsRelations = relations(
  workflowStageAiSettings,
  ({ one }) => ({
    // Note: stage relation intentionally omitted since workflowStages may not be migrated yet
    user: one(users, {
      fields: [workflowStageAiSettings.userId],
      references: [users.id],
    }),
  }),
);

// Export knowledge base schema
export * from './knowledge-base.schema';
