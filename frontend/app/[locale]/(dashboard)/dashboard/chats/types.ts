import { Attachment } from "@/lib/media/types";

export interface Template {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  isVisible: boolean;
  locales?: Array<{
    id: string;
    locale: string;
    body: string;
    header?: string;
    footer?: string;
    exampleVars?: Record<string, any>;
    approvalStatus?: string;
  }>;
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
  unreadCount: number;
  isActive: boolean;
  isArchived?: boolean;
  archivedAt?: string | null;
  senderId: number;
  userId?: number;
  createdAt?: string;
  updatedAt?: string;
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
    | "gif";
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
}

export interface InboundMessage {
  messageId: string;
  chatId: string;
  sender: string;
  text: string;
  type: string;
  timestamp: string;
  attachments?: Array<{
    type: string;
    mediaId: string;
  }>;
  replyToMessageId?: string;
  replyPreview?: ReplyPreview;
}

export interface GroupedMessage {
  type: "single" | "group";
  messages: Message[];
  id: string;
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
