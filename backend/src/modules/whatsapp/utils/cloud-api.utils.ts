/**
 * WhatsApp Cloud API Utility Functions
 * Handles API communication, signature verification, and data transformation
 */

import * as crypto from 'crypto';

/**
 * Generate appsecret_proof for Meta Graph API requests
 * This is required when "Require App Secret" is enabled in your Meta app settings.
 * The proof is an HMAC SHA256 hash of the access token using the app secret as the key.
 *
 * @param accessToken - META_ACCESS_TOKEN
 * @param appSecret - META_APP_SECRET
 * @returns HMAC SHA256 hash as hex string
 */
export function generateAppSecretProof(
  accessToken: string,
  appSecret: string,
): string {
  return crypto
    .createHmac('sha256', appSecret)
    .update(accessToken)
    .digest('hex');
}

/**
 * Verify webhook signature from Meta
 * Meta sends X-Hub-Signature-256 header with HMAC SHA256 signature
 *
 * @param payload - Raw request body as string
 * @param signature - X-Hub-Signature-256 header value
 * @param appSecret - META_APP_SECRET from environment
 * @returns true if signature is valid
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  appSecret: string,
): boolean {
  const expectedSignature =
    'sha256=' +
    crypto.createHmac('sha256', appSecret).update(payload).digest('hex');

  return expectedSignature === signature;
}

/**
 * Generate Cloud API request headers with authorization
 *
 * @param accessToken - META_ACCESS_TOKEN
 * @returns Headers object for fetch/axios
 */
export function getCloudAPIHeaders(
  accessToken: string,
): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Build Cloud API endpoint URL
 * Includes appsecret_proof query parameter when appSecret is provided
 *
 * @param phoneNumberId - META_PHONE_NUMBER_ID
 * @param endpoint - API endpoint (e.g., 'messages', 'media', 'contacts')
 * @param apiVersion - Cloud API version (default: v20.0)
 * @param accessToken - Optional access token for generating appsecret_proof
 * @param appSecret - Optional app secret for generating appsecret_proof
 * @returns Full endpoint URL with appsecret_proof if credentials provided
 */
export function buildCloudAPIUrl(
  phoneNumberId: string,
  endpoint: string,
  apiVersion: string = 'v20.0',
  accessToken?: string,
  appSecret?: string,
): string {
  const baseUrl = 'https://graph.facebook.com';
  let url = `${baseUrl}/${apiVersion}/${phoneNumberId}/${endpoint}`;

  // Add appsecret_proof if both accessToken and appSecret are provided
  if (accessToken && appSecret) {
    const proof = generateAppSecretProof(accessToken, appSecret);
    url += `?appsecret_proof=${proof}`;
  }

  return url;
}

/**
 * Extract phone number (remove formatting)
 * Cloud API expects phone without '+' prefix
 *
 * @param phoneNumber - Phone number with or without '+'
 * @returns Cleaned phone number
 */
export function cleanPhoneNumber(phoneNumber: string): string {
  return phoneNumber.replace(/^\+?/, '');
}

/**
 * Generate a deterministic chat ID from two phone numbers
 * Uses sorted order so direction doesn't matter
 *
 * @param phone1 - First phone number
 * @param phone2 - Second phone number
 * @returns chat_XXXX_YYYY format
 */
export function generateChatId(phone1: string, phone2: string): string {
  const cleaned1 = cleanPhoneNumber(phone1);
  const cleaned2 = cleanPhoneNumber(phone2);
  const sorted = [cleaned1, cleaned2].sort();
  return `chat_${sorted.join('_')}`;
}

/**
 * Extract conversation ID from Cloud API message (when applicable)
 * Cloud API includes conversation context in webhook
 *
 * @param waMessageId - Message ID from Cloud API
 * @returns Conversation ID or undefined
 */
export function extractConversationId(waMessageId: string): string | undefined {
  // Conversation ID is extracted from webhook context
  // For now, return undefined - will be set during webhook processing
  return undefined;
}

/**
 * Map Cloud API message type to normalized type
 *
 * Note: GIFs come from WhatsApp as 'video' messages with `animated: true` flag
 * They are handled separately in the message processing logic
 */
export function mapCloudAPIMessageType(
  cloudAPIType: string,
):
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'contacts'
  | 'sticker'
  | 'unknown' {
  const typeMap: Record<string, any> = {
    text: 'text',
    image: 'image',
    video: 'video',
    audio: 'audio',
    document: 'document',
    contacts: 'contacts',
    sticker: 'sticker',
    button: 'text',
    interactive: 'text',
    location: 'unknown',
    reaction: 'unknown',
    unknown: 'unknown',
  };
  return typeMap[cloudAPIType] || 'unknown';
}

/**
 * Map Cloud API status to normalized status
 */
export function mapCloudAPIStatus(
  status: string,
): 'sent' | 'delivered' | 'read' | 'failed' {
  const statusMap: Record<string, any> = {
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
    failed: 'failed',
  };
  return statusMap[status] || 'sent';
}

/**
 * Validate Cloud API message before sending
 * Ensures required fields are present
 */
export function validateCloudAPIMessage(message: any): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!message.messaging_product) {
    errors.push('messaging_product is required');
  }

  if (!message.to) {
    errors.push('to (recipient phone) is required');
  }

  if (!message.type) {
    errors.push('type is required');
  }

  // Type-specific validation
  switch (message.type) {
    case 'text':
      if (!message.text?.body) {
        errors.push('text.body is required for text messages');
      }
      break;
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
      const mediaKey = message.type;
      if (!message[mediaKey]?.link && !message[mediaKey]?.id) {
        errors.push(`${mediaKey}.link or ${mediaKey}.id is required`);
      }
      break;
    case 'template':
      if (!message.template?.name) {
        errors.push('template.name is required');
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Parse and validate Cloud API webhook payload
 */
export function parseWebhookPayload(body: any): {
  valid: boolean;
  errors: string[];
  data: any;
} {
  const errors: string[] = [];

  if (!body.object || body.object !== 'whatsapp_business_account') {
    errors.push('Invalid webhook object type');
  }

  if (!Array.isArray(body.entry)) {
    errors.push('entry must be an array');
  }

  if (errors.length === 0) {
    // Parse entries
    const entries = body.entry || [];
    const changes: any[] = [];

    for (const entry of entries) {
      if (Array.isArray(entry.changes)) {
        changes.push(...entry.changes);
      }
    }

    return {
      valid: true,
      errors: [],
      data: {
        entries: body.entry || [],
        changes,
      },
    };
  }

  return {
    valid: false,
    errors,
    data: null,
  };
}

/**
 * Extract message, status, and contact updates from webhook
 */
export function extractWebhookUpdates(webhookPayload: any): {
  messages: any[];
  statuses: any[];
  contacts: any[];
  errors: any[];
} {
  const messages: any[] = [];
  const statuses: any[] = [];
  const contacts: any[] = [];
  const errors: any[] = [];

  const entries = webhookPayload.entry || [];

  for (const entry of entries) {
    const changes = entry.changes || [];

    for (const change of changes) {
      const value = change.value || {};

      if (Array.isArray(value.messages)) {
        messages.push(...value.messages);
      }

      if (Array.isArray(value.statuses)) {
        statuses.push(...value.statuses);
      }

      if (Array.isArray(value.contacts)) {
        contacts.push(...value.contacts);
      }

      if (Array.isArray(value.errors)) {
        errors.push(...value.errors);
      }
    }
  }

  return { messages, statuses, contacts, errors };
}
