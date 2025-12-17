/**
 * Reply Types
 * Types for message reply functionality
 */

/**
 * Media information stored in reply preview
 */
export interface ReplyMediaPreview {
  url?: string; // Signed or cached URL for thumbnail
  mimeType: string;
  thumbnailUrl?: string; // Small preview thumbnail URL
  fileName?: string; // For documents
}

/**
 * Reply preview payload stored as JSONB snapshot
 * This prevents broken UI if original message changes or media expires
 */
export interface ReplyPreview {
  messageId: string; // Original message ID
  senderType: 'customer' | 'agent'; // Who sent the original message
  senderName: string; // Display name (e.g., "John Doe" or "You")
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'contacts';
  text?: string; // Short text excerpt (1-2 lines, max ~100 chars)
  media?: ReplyMediaPreview;
  unavailable?: boolean; // True if original message is deleted/missing
}

/**
 * DTO for sending a message with reply
 */
export interface SendReplyDto {
  to: string;
  body?: string;
  senderId?: number;
  replyToMessageId: string; // Message ID to reply to
  attachments?: Array<{
    id: string;
    type: string;
    fileName: string;
    mimeType: string;
    size: number;
    s3Key: string;
    thumbnailKey?: string;
    duration?: number;
    uploadedAt: string;
    status: string;
    errorMessage?: string;
  }>;
}

/**
 * Context for WhatsApp Cloud API reply
 */
export interface CloudAPIReplyContext {
  message_id: string; // wamid of the message being replied to
}

/**
 * Incoming reply context from webhook
 */
export interface InboundReplyContext {
  from?: string; // Sender of original message
  id?: string; // Message ID being replied to
  referred_product?: {
    catalog_id: string;
    product_retailer_id: string;
  };
}

/**
 * Generate a reply preview from an existing message
 */
export function generateReplyPreview(
  originalMessage: {
    messageId: string;
    text?: string | null;
    type: string;
    direction: 'inbound' | 'outbound';
    sender: string;
    attachments?: any[];
    isDeleted?: boolean;
  },
  senderName: string,
): ReplyPreview {
  // Handle deleted messages
  if (originalMessage.isDeleted) {
    return {
      messageId: originalMessage.messageId,
      senderType:
        originalMessage.direction === 'outbound' ? 'agent' : 'customer',
      senderName,
      type: 'text',
      text: 'Message unavailable',
      unavailable: true,
    };
  }

  const preview: ReplyPreview = {
    messageId: originalMessage.messageId,
    senderType: originalMessage.direction === 'outbound' ? 'agent' : 'customer',
    senderName,
    type: originalMessage.type as ReplyPreview['type'],
  };

  // Add text preview (truncated to ~100 chars)
  if (originalMessage.text) {
    preview.text =
      originalMessage.text.length > 100
        ? originalMessage.text.substring(0, 97) + '...'
        : originalMessage.text;
  }

  // Add media preview for media types
  if (originalMessage.attachments && originalMessage.attachments.length > 0) {
    const firstAttachment = originalMessage.attachments[0];
    preview.media = {
      mimeType: firstAttachment.mimeType || 'application/octet-stream',
      thumbnailUrl: firstAttachment.thumbnailKey,
      fileName: firstAttachment.fileName,
    };

    // Set type-specific text if no caption
    if (!preview.text) {
      const mediaCount = originalMessage.attachments.length;
      switch (originalMessage.type) {
        case 'image':
          preview.text =
            mediaCount > 1 ? `📷 ${mediaCount} photos` : '📷 Photo';
          break;
        case 'video':
          preview.text =
            mediaCount > 1 ? `🎬 ${mediaCount} videos` : '🎬 Video';
          break;
        case 'audio':
          preview.text = '🎵 Audio message';
          break;
        case 'document':
          preview.text = firstAttachment.fileName
            ? `📄 ${firstAttachment.fileName}`
            : '📄 Document';
          break;
      }
    }
  }

  // Handle contacts type
  if (originalMessage.type === 'contacts' && !preview.text) {
    preview.text = '👤 Contact';
  }

  return preview;
}

/**
 * Check if a message type supports replies
 */
export function canReplyToMessage(messageType: string): boolean {
  const replyableTypes = [
    'text',
    'image',
    'video',
    'audio',
    'document',
    'contacts',
  ];
  return replyableTypes.includes(messageType);
}

/**
 * Check if message is a system message (not replyable)
 */
export function isSystemMessage(messageType: string): boolean {
  const systemTypes = ['system', 'notification', 'ephemeral', 'reaction'];
  return systemTypes.includes(messageType);
}
