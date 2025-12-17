/**
 * WhatsApp Cloud API Type Definitions
 * Structures for message requests, webhooks, and API responses
 */

// ============================================================
// MESSAGE REQUEST TYPES
// ============================================================

/**
 * Text message request to Cloud API
 */
export interface CloudAPITextMessage {
  messaging_product: 'whatsapp';
  to: string; // Recipient phone number (without +)
  type: 'text';
  text: {
    preview_url?: boolean;
    body: string;
  };
}

/**
 * Media message request (image, video, audio, document)
 */
export interface CloudAPIMediaMessage {
  messaging_product: 'whatsapp';
  to: string;
  type: 'image' | 'video' | 'audio' | 'document';
  [key: string]: any; // Dynamically keyed with media type
}

/**
 * Template message request (for approval workflows)
 */
export interface CloudAPITemplateMessage {
  messaging_product: 'whatsapp';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: {
      code: string;
    };
    components?: Array<{
      type: 'body' | 'header' | 'footer';
      parameters?: Array<{
        type: 'text' | 'currency' | 'date_time';
        [key: string]: any;
      }>;
    }>;
  };
}

/**
 * Interactive message request (buttons, list selections)
 */
export interface CloudAPIInteractiveMessage {
  messaging_product: 'whatsapp';
  to: string;
  type: 'interactive';
  interactive: {
    type: 'button' | 'list';
    body?: {
      text: string;
    };
    action: {
      buttons?: Array<{
        type: 'reply';
        reply: {
          id: string;
          title: string;
        };
      }>;
      button?: string;
      sections?: Array<{
        title: string;
        rows: Array<{
          id: string;
          title: string;
          description?: string;
        }>;
      }>;
    };
  };
}

/**
 * Union type for all Cloud API messages
 */
export type CloudAPIMessage =
  | CloudAPITextMessage
  | CloudAPIMediaMessage
  | CloudAPITemplateMessage
  | CloudAPIInteractiveMessage;

// ============================================================
// WEBHOOK EVENT TYPES
// ============================================================

/**
 * Webhook entry from Meta Cloud API
 * Contains messages, statuses, and other events
 */
export interface CloudAPIWebhookEntry {
  id: string;
  changes: CloudAPIWebhookChange[];
}

/**
 * Individual change within a webhook entry
 */
export interface CloudAPIWebhookChange {
  value: {
    messaging_product?: string;
    metadata: {
      display_phone_number: string;
      phone_number_id: string;
    };
    messages?: CloudAPIInboundMessage[];
    statuses?: CloudAPIMessageStatus[];
    contacts?: CloudAPIContactInfo[];
    errors?: CloudAPIError[];
  };
  field: string;
}

/**
 * Inbound message from Cloud API webhook
 */
export interface CloudAPIInboundMessage {
  from: string; // Sender's phone number
  id: string; // Message ID (wamid)
  timestamp: string; // Unix timestamp as string
  type:
    | 'text'
    | 'image'
    | 'video'
    | 'audio'
    | 'document'
    | 'button'
    | 'interactive'
    | 'location'
    | 'contacts'
    | 'reaction'
    | 'unknown';
  // Reply context - present when this message is a reply to another message
  context?: {
    from?: string; // Phone number of sender of original message
    id?: string; // Message ID (wamid) of the message being replied to
    referred_product?: {
      catalog_id: string;
      product_retailer_id: string;
    };
  };
  text?: {
    body: string;
  };
  image?: {
    caption?: string;
    mime_type: string;
    sha256: string;
    id: string; // Media object ID for download
  };
  video?: {
    caption?: string;
    mime_type: string;
    sha256: string;
    id: string;
  };
  audio?: {
    mime_type: string;
    sha256: string;
    id: string;
  };
  document?: {
    caption?: string;
    filename: string;
    mime_type: string;
    sha256: string;
    id: string;
  };
  button?: {
    text: string;
    payload: string;
  };
  interactive?: {
    type: 'button_reply' | 'list_reply' | 'nfm_reply';
    button_reply?: {
      id: string;
      title: string;
    };
    list_reply?: {
      id: string;
      title: string;
      description: string;
    };
    nfm_reply?: {
      response_json: string;
    };
  };
  location?: {
    latitude: number;
    longitude: number;
  };
  contacts?: Array<{
    phones: Array<{
      phone: string;
      type?: string;
      wa_id?: string;
    }>;
    emails?: Array<{
      email: string;
      type?: string;
    }>;
    name: {
      formatted_name: string;
      first_name?: string;
      last_name?: string;
    };
  }>;
  reaction?: {
    message_id: string;
    emoji: string;
  };
  referral?: {
    source_url?: string;
    source_type?: string;
    source_id?: string;
    headline?: string;
    body?: string;
    media_type?: string;
    image_url?: string;
    video_url?: string;
    thumbnail_url?: string;
  };
}

/**
 * Message status update from Cloud API webhook
 */
export interface CloudAPIMessageStatus {
  id: string; // Message ID (wamid)
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id?: string;
  errors?: CloudAPIError[];
}

/**
 * Contact info from webhook (when available)
 */
export interface CloudAPIContactInfo {
  profile: {
    name: string;
  };
  wa_id: string;
}

/**
 * Error object from Cloud API
 */
export interface CloudAPIError {
  code: number;
  title: string;
  message: string;
  error_data?: any;
}

/**
 * Full webhook payload from Meta
 */
export interface CloudAPIWebhookPayload {
  object: 'whatsapp_business_account';
  entry: CloudAPIWebhookEntry[];
}

// ============================================================
// API RESPONSE TYPES
// ============================================================

/**
 * Cloud API message send response
 */
export interface CloudAPISendMessageResponse {
  messaging_product: string;
  contacts: Array<{
    input: string;
    wa_id: string;
  }>;
  messages: Array<{
    id: string;
    message_status: string;
  }>;
}

/**
 * Cloud API media upload response
 */
export interface CloudAPIMediaUploadResponse {
  h: string;
  mime_type: string;
  sha256: string;
  file_size: number;
  id: string;
  media_type: string;
}

/**
 * Cloud API media download response
 * Note: The actual URL must be downloaded with authorization header
 */
export interface CloudAPIMediaDownloadResponse {
  url: string;
  mime_type: string;
  file_size?: number;
  file_name?: string;
}

// ============================================================
// SIGNATURE VERIFICATION TYPES
// ============================================================

/**
 * Webhook signature verification parameters
 * Used to verify that webhook comes from Meta
 */
export interface CloudAPIWebhookSignatureVerification {
  x_hub_signature: string;
  x_hub_signature_256: string;
  access_token: string;
  expectedToken: string;
}

// ============================================================
// HELPER TYPES
// ============================================================

/**
 * Media metadata stored in database
 * Extracted from inbound message
 */
export interface MediaMetadata {
  type: 'image' | 'video' | 'audio' | 'document';
  mimeType: string;
  sha256: string;
  mediaId: string;
  caption?: string;
  filename?: string; // For documents
  fileSize?: number;
  downloadUrl?: string; // Generated URL for secure download
}

/**
 * Message metadata for database storage
 * Normalized from Cloud API format
 */
export interface NormalizedCloudAPIMessage {
  waMessageId: string; // Cloud API message ID (wamid)
  chatId: string;
  source: 'whatsapp';
  sender: string;
  type: string;
  text?: string;
  mediaMetadata?: MediaMetadata;
  contactsData?: {
    type: 'contacts';
    contacts: Array<{
      name: {
        formatted_name?: string;
        first_name?: string;
        last_name?: string;
        middle_name?: string;
        prefix?: string;
        suffix?: string;
      };
      phones?: Array<{
        phone: string;
        type?: string;
        wa_id?: string;
      }>;
      emails?: any[];
      addresses?: any[];
      org?: any;
      birthday?: string;
      urls?: any[];
    }>;
  };
  direction: 'inbound' | 'outbound';
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'pending';
  timestamp: Date;
  waPhoneNumberId?: string;
  conversationId?: string;
  // Reply context for inbound messages that are replies
  replyToMessageId?: string;
  replyPreview?: {
    messageId: string;
    senderType: 'customer' | 'agent';
    senderName: string;
    type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'contacts';
    text?: string;
    media?: {
      url?: string;
      mimeType: string;
      thumbnailUrl?: string;
      fileName?: string;
    };
    unavailable?: boolean;
  };
}
