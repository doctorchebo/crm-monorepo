/**
 * Workflow Utilities
 * Shared utility functions for the workflow engine
 */

import { db } from '@database/db.connection';
import { contacts, messages } from '@database/schema';
import { Logger } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { HANDOFF_KEYWORDS } from '../../types/workflow-engine.types';

const logger = new Logger('WorkflowUtils');

/**
 * Check if message contains explicit handoff request
 */
export function checkHandoffRequest(content: string): boolean {
  const lowerContent = content.toLowerCase();
  return HANDOFF_KEYWORDS.some((keyword) => lowerContent.includes(keyword));
}

/**
 * Convert MIME type to WhatsApp media type
 */
export function getWhatsAppMediaType(
  mimeType: string,
): 'image' | 'video' | 'audio' | 'document' {
  if (mimeType.startsWith('image/')) {
    return 'image';
  }
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }
  // Everything else (PDF, docs, etc.) is a document
  return 'document';
}

/**
 * Get a human-readable label for media type
 */
export function getMediaTypeLabel(
  mediaType: 'image' | 'video' | 'document' | 'audio',
): string {
  switch (mediaType) {
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio file';
    case 'document':
      return 'document';
    default:
      return 'file';
  }
}

/**
 * Get contact's preferred language for a chat
 * Fetches the contact by participant phone and returns their language preference
 */
export async function getContactLanguage(
  chatId: string,
): Promise<string | null> {
  try {
    // Get the most recent inbound message to find the contact's phone number
    const recentInboundMsg = await db
      .select({ sender: messages.sender })
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.timestamp))
      .limit(1);

    if (!recentInboundMsg || recentInboundMsg.length === 0) {
      return null;
    }

    // Fetch contact by phone number
    const contactRecord = await db
      .select({ language: contacts.language })
      .from(contacts)
      .where(eq(contacts.phoneNumber, recentInboundMsg[0].sender))
      .limit(1);

    return contactRecord?.[0]?.language || null;
  } catch (error) {
    logger.warn(
      `[Contact Language] Failed to fetch language for chat ${chatId}: ${error.message}`,
    );
    return null;
  }
}

/**
 * Build conversation context for KB retrieval.
 * Extracts relevant information from recent messages to help match
 * generic queries (like "what's the price?") to specific KB items.
 */
export function buildConversationContextForRetrieval(
  recentMessages: Array<{ text: string | null; direction: string }>,
): string {
  if (!recentMessages || recentMessages.length === 0) {
    return '';
  }

  // Focus on the most recent messages that might contain entity mentions
  const relevantMessages = recentMessages
    .filter((msg) => msg.text && msg.text.length > 5)
    .slice(0, 6) // Last 6 messages
    .map((msg) => {
      const prefix = msg.direction === 'outbound' ? 'Assistant' : 'Customer';
      return `${prefix}: ${msg.text}`;
    });

  return relevantMessages.join('\n');
}
