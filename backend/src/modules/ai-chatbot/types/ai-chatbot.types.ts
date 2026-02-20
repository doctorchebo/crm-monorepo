/**
 * AI Chatbot Types
 * Type definitions for the goal-based AI chatbot module
 */

import type { AIReplyInteractiveData } from '@modules/ai-reply/types';

// ============================================================================
// Goal Types
// ============================================================================

export type GoalType =
  | 'answer_faq'
  | 'qualify_lead'
  | 'book_appointment'
  | 'handle_support'
  | 'custom';

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  answer_faq: 'Answer FAQs',
  qualify_lead: 'Qualify Leads',
  book_appointment: 'Book Appointments',
  handle_support: 'Handle Support',
  custom: 'Custom Goal',
};

// ============================================================================
// Configuration Constants
// ============================================================================

export const AI_CONFIDENCE_THRESHOLD = 0.7;

export const AUTO_HANDOFF_CATEGORIES = [
  'complaint',
  'urgent',
  'legal',
  'refund',
];

export const HANDOFF_KEYWORDS = [
  'hablar con humano',
  'agente',
  'persona real',
  'speak to human',
  'real person',
];

// ============================================================================
// Input Types
// ============================================================================

export interface ChatMessageInput {
  chatId: string;
  messageId: string;
  messageContent: string;
  senderId: number;
  userId: number;
  isFromCustomer: boolean;
  /** Interactive response data when customer clicks a button/list item */
  interactiveResponse?: {
    type: 'button_reply' | 'list_reply';
    buttonId?: string;
    buttonTitle?: string;
    rowId?: string;
    rowTitle?: string;
    rowDescription?: string;
  };
}

// ============================================================================
// Result Types
// ============================================================================

export interface MediaAttachment {
  mediaId: string;
  objectId: string;
  objectName: string;
  s3Key: string;
  s3Bucket: string;
  fileName: string;
  mimeType: string;
  caption: string | null;
  mediaType: 'image' | 'video' | 'audio' | 'document';
}

export interface AiResponseResult {
  content: string;
  confidence: number;
  shouldSend: boolean;
  requiresHandoff: boolean;
  /** Media attachment to send with the response */
  mediaAttachment?: MediaAttachment;
  /** Interactive CTA data for the response (dynamic buttons) */
  interactiveData?: AIReplyInteractiveData;
}

export interface ChatMessageResult {
  success: boolean;
  aiResponse?: AiResponseResult;
  handoffRequested?: boolean;
  error?: string;
}

// ============================================================================
// AI Status Types
// ============================================================================

export interface AiStatusResult {
  chatId: string;
  aiEnabled: boolean;
  aiConfigEnabled: boolean;
  reason?: string;
  isRateLimited: boolean;
  rateLimitReset?: Date;
  rateLimitCurrentCount?: number;
  rateLimitMaxCount?: number;
}

// ============================================================================
// Goal Prompt Builder Types
// ============================================================================

export interface MediaContext {
  willHaveMedia: boolean;
  mediaDescription: string | null;
  mediaType: 'image' | 'video' | 'document' | 'audio' | null;
  mediaFileName: string | null;
  aiInstructions: string | null;
}

export interface GoalPromptParams {
  goalType: GoalType;
  goalDescription?: string | null;
  tone: string;
  style: string;
  formalityLevel: string;
  languagePreference?: string | null;
  maxResponseLength?: number;
  customInstructions?: string | null;
  avoidTopics?: string[];
  knowledgeContext?: string;
  hasKnowledgeBase: boolean;
  mediaContext?: MediaContext;
  customerName?: string | null;
}
