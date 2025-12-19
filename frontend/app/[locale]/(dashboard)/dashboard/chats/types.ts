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
  }>;
}

export interface Chat {
  id?: number;
  chatId: string;
  participantPhone: string;
  participantName?: string;
  lastMessage?: string;
  lastMessageType?: string;
  lastMessageTime?: string;
  unreadCount: number;
  isActive: boolean;
  senderId: number;
  businessPhone?: string;
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
  displayName?: string;
}
