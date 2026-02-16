import { Attachment } from "@/lib/media/types";

export type TemplateSource = "custom" | "library";
export type ParameterFormat = "named" | "positional";

export interface TemplateLocale {
  id: string;
  locale: string;
  body: string;
  header?: string;
  footer?: string;
  exampleVars?: Record<string, any>;
  approvalStatus?: string;
  /** Variable format: named ({{customer.name}}) or positional ({{1}}, {{2}}) */
  parameterFormat?: ParameterFormat;
  /** Type hints for positional parameters, e.g. ["TEXT", "AMOUNT", "DATE"] */
  bodyParamTypes?: string[];
  /** Header media format: TEXT, IMAGE, VIDEO, DOCUMENT, LOCATION */
  headerFormat?: string;
  /** Meta-synced component structure: { header, body, footer, buttons } */
  components?: Record<string, any>;
  /** Buttons array (quick reply, URL, phone, etc.) */
  buttons?: Array<Record<string, any>>;
  /** Carousel cards for carousel templates */
  carouselCards?: Array<Record<string, any>>;
}

export interface Template {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  isVisible: boolean;
  /** Whether this template is custom-created or from the Meta Template Library */
  source?: TemplateSource;
  locales?: TemplateLocale[];
}

export interface Chat {
  id?: number;
  chatId: string;
  participantPhone: string;
  participantName?: string;
  businessPhone?: string;
  lastMessage?: string | null;
  lastMessageType?: string | null;
  lastMessageTime?: string | null;
  // Last activity tracking for reactions
  lastActivityType?: string | null; // 'message' or 'reaction'
  lastReactionEmoji?: string | null;
  lastReactionIsOwn?: boolean | null; // true = CRM user reacted, false = customer
  lastReactedMessagePreview?: string | null;
  unreadCount: number;
  isActive: boolean;
  isArchived?: boolean;
  archivedAt?: string | null;
  senderId: number;
  userId?: number;
  createdAt?: string;
  updatedAt?: string;
  assignedTo?: number | null;
  assignedBy?: number | null;
  assignedAt?: string | null;
  teamId?: number | null;
  // Assignee info for avatar display
  assigneeName?: string | null;
  assigneeEmail?: string | null;
  assigneeProfilePictureUrl?: string | null;
  // Labels
  labels?: Array<{
    id: string;
    name: string;
    color: string;
    emoji?: string | null;
  }>;
}

export interface ReplyPreview {
  messageId: string;
  senderType: "customer" | "agent";
  senderName: string;
  type:
    | "text"
    | "image"
    | "video"
    | "audio"
    | "document"
    | "contacts"
    | "sticker"
    | "gif"
    | "location";
  text?: string;
  media?: {
    url?: string;
    mimeType: string;
    thumbnailUrl?: string;
    fileName?: string;
  };
  unavailable?: boolean;
}

/**
 * Reaction on a message
 */
export interface MessageReaction {
  id: number;
  messageId: string;
  userId: number;
  emoji: string;
  userName?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/**
 * Pin duration options (in hours)
 */
export enum PinDuration {
  HOURS_24 = 24,
  DAYS_7 = 168,
  DAYS_30 = 720,
}

/**
 * Pinned message data
 */
export interface PinnedMessage {
  id: number;
  messageId: string;
  chatId: string;
  pinnedBy: number;
  pinnedByName?: string;
  pinnedAt: string;
  expiresAt: string;
  /** Embedded message data for display */
  message?: {
    messageId: string;
    text?: string | null;
    type: string;
    direction: string;
    timestamp: string;
    sender: string;
    attachments?: Attachment[];
    senderName?: string;
  };
}

/**
 * Pin count response
 */
export interface PinCountInfo {
  chatId: string;
  count: number;
  maxPins: number;
  canPinMore: boolean;
  oldestPin?: PinnedMessage;
}

export interface Message {
  id?: number;
  messageId: string;
  text?: string | null;
  sender: string;
  direction: "inbound" | "outbound";
  timestamp: string;
  type: string;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  attachments?: Attachment[];
  mediaMetadata?: Record<string, any>;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  editedAt?: string;
  replyToMessageId?: string | null;
  replyPreview?: ReplyPreview | null;
  /** Reactions on this message */
  reactions?: MessageReaction[];
  /** AI Generation fields */
  isAiGenerated?: boolean;
  aiGeneratedAt?: string;
  aiModel?: string;
  aiProvider?: string;
  wasManuallyOverridden?: boolean;
  /** Interactive message metadata (buttons, lists, catalogs) */
  metadata?: MessageMetadata | null;
}

/** Catalog item data embedded in messages */
export interface CatalogMessageItem {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  salePrice?: number | null;
  currency: string;
  link?: string | null;
  retailerId?: string | null;
  status: string;
  mainImageUrl?: string | null;
  mainThumbnailUrl?: string | null;
}

/** Location data for location messages */
export interface LocationData {
  latitude: number;
  longitude: number;
  name?: string | null;
  address?: string | null;
  url?: string | null;
}

/** Metadata for interactive messages (buttons, lists, catalogs, locations) and template messages */
export interface MessageMetadata {
  /** Type of interactive message */
  interactiveType?: "button" | "list";
  /** Interactive message data */
  interactiveData?: InteractiveMessageData;
  /** Catalog items for product messages */
  catalogItems?: CatalogMessageItem[];
  /** Location data for location messages */
  location?: LocationData;
  /** Template message fields (present when message.type === 'template') */
  templateId?: string;
  templateName?: string;
  templateDisplayName?: string;
  locale?: string;
  variables?: Record<string, string>;
  source?: "custom" | "library";
  header?: string | null;
  headerFormat?: string | null;
  footer?: string | null;
  buttons?: Array<Record<string, any>>;
  components?: Record<string, any> | null;
}

/** Interactive message button */
export interface InteractiveButton {
  id: string;
  title: string;
}

/** Interactive list section */
export interface InteractiveListSection {
  title?: string;
  rows: Array<{
    id: string;
    title: string;
    description?: string;
  }>;
}

/** Interactive message data structure */
export interface InteractiveMessageData {
  /** Buttons for button messages (max 3) */
  buttons?: InteractiveButton[];
  /** Button text for list messages */
  buttonText?: string;
  /** Sections for list messages */
  sections?: InteractiveListSection[];
  /** Footer text */
  footerText?: string;
  /** Header text */
  headerText?: string;
}

export interface InboundMessage {
  messageId: string;
  chatId: string;
  sender: string;
  text: string;
  type: string;
  timestamp: string;
  direction?: "inbound" | "outbound"; // Direction of the message (defaults to inbound for legacy compatibility)
  status?: string;
  attachments?: Attachment[]; // Use full Attachment type for complete media info
  replyToMessageId?: string;
  replyPreview?: ReplyPreview;
  /** Interactive message metadata (buttons, lists) */
  metadata?: MessageMetadata;
  /** Whether this message was generated by AI */
  isAiGenerated?: boolean;
}

export interface MessagesCacheEntry {
  messages: Message[];
  hasMore: boolean;
  cursor: number;
}

export interface Sender {
  id: number;
  phoneNumber: string;
  displayName?: string | null;
}
