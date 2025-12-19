/**
 * Reply Types for Frontend
 * Types for message reply functionality
 */

/**
 * Media information in reply preview
 */
export interface ReplyMediaPreview {
  url?: string;
  mimeType: string;
  thumbnailUrl?: string;
  fileName?: string;
}

/**
 * Reply preview data structure
 * Matches the backend ReplyPreview type
 */
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
  media?: ReplyMediaPreview;
  unavailable?: boolean;
}

/**
 * Reply context for sending a message
 */
export interface ReplyContext {
  messageId: string;
  preview: ReplyPreview;
}

/**
 * Message with reply information
 */
export interface MessageWithReply {
  messageId: string;
  text?: string | null;
  sender: string;
  direction: "inbound" | "outbound";
  timestamp: string;
  type: string;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  attachments?: any[];
  replyToMessageId?: string | null;
  replyPreview?: ReplyPreview | null;
  isDeleted?: boolean;
  editedAt?: string;
  deliveredAt?: string;
  readAt?: string;
}

/**
 * Get the icon for a media type in reply preview
 */
export function getReplyMediaIcon(type: string): string {
  switch (type) {
    case "image":
      return "📷";
    case "video":
      return "🎬";
    case "audio":
      return "🎵";
    case "document":
      return "📄";
    case "contacts":
      return "👤";
    case "sticker":
      return "🎭";
    case "gif":
      return "🎞️";
    default:
      return "";
  }
}

/**
 * Truncate text for reply preview
 */
export function truncateReplyText(
  text: string,
  maxLength: number = 80
): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

/**
 * Check if a message type can be replied to
 */
export function canReplyToMessageType(type: string): boolean {
  const replyableTypes = [
    "text",
    "image",
    "video",
    "audio",
    "document",
    "contacts",
    "media",
    "sticker",
    "gif",
  ];
  return replyableTypes.includes(type);
}
