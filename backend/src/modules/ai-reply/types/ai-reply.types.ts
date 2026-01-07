/**
 * AI Reply Types
 * Type definitions for the AI-powered reply system
 */

// ============================================================================
// Message Decision Types
// ============================================================================

/**
 * The type of message the AI should send based on conversation context
 */
export type MessageDecision = 'free_form' | 'template' | 'blocked';

/**
 * Reason why a message might be blocked
 */
export type BlockReason =
  | 'rate_limit_exceeded'
  | 'repetitive_content'
  | 'outside_window_no_template'
  | 'template_not_approved'
  | 'anti_ban_cooldown'
  | 'daily_limit_reached'
  | 'hourly_limit_reached';

/**
 * Result of analyzing the conversation context
 */
export interface ConversationAnalysis {
  /** Whether we're within the 24-hour window */
  isWithinWindow: boolean;
  /** Time remaining in the window (ms) */
  windowTimeRemainingMs: number;
  /** Last customer message timestamp */
  lastCustomerMessageAt: Date | null;
  /** Number of messages sent in the last hour */
  messagesSentLastHour: number;
  /** Number of messages sent today */
  messagesSentToday: number;
  /** Whether this would be repetitive content */
  isRepetitiveContent: boolean;
  /** Suggested message decision */
  decision: MessageDecision;
  /** If blocked, the reason why */
  blockReason?: BlockReason;
  /** Recommended template if outside window */
  recommendedTemplateId?: string;
}

// ============================================================================
// AI Generation Types
// ============================================================================

/**
 * Style preferences for AI-generated messages
 */
export interface AIStylePreferences {
  /** Tone of voice: formal, casual, friendly, professional */
  tone: 'formal' | 'casual' | 'friendly' | 'professional';
  /** Response length preference */
  length: 'concise' | 'moderate' | 'detailed';
  /** Whether to use emojis */
  useEmojis: boolean;
  /** Preferred language code (e.g., 'en', 'es') */
  language: string;
  /** Custom instructions for the AI */
  customInstructions?: string;
  /** Business context/description */
  businessContext?: string;
  /** Products/services offered */
  productsServices?: string;
}

/**
 * Context provided to the AI for generating a reply
 */
export interface AIReplyContext {
  /** The chat ID */
  chatId: string;
  /** Recent messages for context */
  recentMessages: RecentMessageContext[];
  /** Customer information */
  customer: CustomerContext;
  /** AI style preferences */
  stylePreferences: AIStylePreferences;
  /** Business/sender information */
  business: BusinessContext;
  /** Optional specific prompt/instruction */
  userPrompt?: string;
  /** Message being replied to (if any) */
  replyToMessage?: RecentMessageContext;
  /** Relevant AI memories from vector search */
  relevantMemories?: string[];
}

/**
 * A message in the conversation history
 */
export interface RecentMessageContext {
  messageId: string;
  direction: 'inbound' | 'outbound';
  type: string;
  text: string | null;
  timestamp: Date;
  senderName: string;
}

/**
 * Customer context for personalization
 */
export interface CustomerContext {
  contactId?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber: string;
  language?: string;
  /** Custom attributes from contact_attributes table */
  attributes: Record<string, string | null>;
}

/**
 * Business context for personalization
 */
export interface BusinessContext {
  senderId: number;
  businessName?: string;
  businessPhone: string;
}

// ============================================================================
// AI Reply Result Types
// ============================================================================

/**
 * Result of generating an AI reply
 */
export interface AIReplyGenerationResult {
  success: boolean;
  /** The generated message text */
  generatedText?: string;
  /** Confidence score (0-1) */
  confidence?: number;
  /** Tokens used for generation */
  tokensUsed?: number;
  /** Error message if failed */
  error?: string;
  /** Warnings (e.g., low confidence) */
  warnings?: string[];
}

/**
 * Result of sending an AI-generated reply
 */
export interface AIReplySendResult {
  success: boolean;
  /** The message ID if sent */
  messageId?: string;
  /** Message type that was sent */
  messageType: 'free_form' | 'template';
  /** Template version ID if a template was used */
  templateVersionId?: string;
  /** The text that was sent */
  sentText?: string;
  /** Error message if failed */
  error?: string;
  /** Whether the message was blocked by guardrails */
  blocked?: boolean;
  /** Block reason if blocked */
  blockReason?: BlockReason;
}

// ============================================================================
// Template Selection Types
// ============================================================================

/**
 * Criteria for selecting a template
 */
export interface TemplateSelectionCriteria {
  /** Chat context keywords */
  contextKeywords?: string[];
  /** Customer language preference */
  language?: string;
  /** Template category preference */
  category?: 'utility' | 'marketing' | 'authentication';
  /** Whether to include template variables in selection */
  requireVariables?: string[];
}

/**
 * Result of template selection
 */
export interface TemplateSelectionResult {
  found: boolean;
  /** Selected template locale ID */
  localeId?: string;
  /** Template ID */
  templateId?: string;
  /** Template name */
  templateName?: string;
  /** Template body (with placeholders) */
  templateBody?: string;
  /** Variables that need to be filled */
  requiredVariables?: string[];
  /** Match score (0-1) */
  matchScore?: number;
  /** Reason for selection or failure */
  reason: string;
}

// ============================================================================
// Rate Limiting Types
// ============================================================================

/**
 * Rate limit configuration per chat
 */
export interface RateLimitConfig {
  /** Maximum messages per hour per chat */
  maxMessagesPerHour: number;
  /** Maximum messages per day per chat */
  maxMessagesPerDay: number;
  /** Minimum seconds between messages */
  minSecondsBetweenMessages: number;
  /** Cooldown after rate limit hit (seconds) */
  cooldownSeconds: number;
  /** Maximum similar messages allowed (anti-repetition) */
  maxSimilarMessages: number;
}

/**
 * Current rate limit status for a chat
 */
export interface RateLimitStatus {
  /** Whether sending is currently allowed */
  canSend: boolean;
  /** Messages sent in the last hour */
  messagesLastHour: number;
  /** Messages sent today */
  messagesToday: number;
  /** Seconds until next message allowed */
  cooldownRemaining: number;
  /** Reason if blocked */
  blockReason?: BlockReason;
  /** When the rate limit resets (hourly) */
  hourlyResetAt: Date;
  /** When the rate limit resets (daily) */
  dailyResetAt: Date;
}

// ============================================================================
// Usage Tracking Types
// ============================================================================

/**
 * AI usage record for billing and analytics
 */
export interface AIUsageRecord {
  id: string;
  chatId: string;
  messageId: string;
  userId: number;
  senderId: number;
  /** Type of AI operation */
  operationType: 'generation' | 'template_selection' | 'memory_retrieval';
  /** Tokens used */
  inputTokens: number;
  outputTokens: number;
  /** Model used */
  model: string;
  /** Cost in USD (string for precision) */
  costUsd: string;
  /** Duration in milliseconds */
  latencyMs: number;
  /** Success or failure */
  status: 'success' | 'failed';
  /** Error message if failed */
  errorMessage?: string;
  createdAt: Date;
}

// ============================================================================
// AI Reply Request/Response Types
// ============================================================================

/**
 * Media type mapping for WhatsApp
 */
export type WhatsAppMediaType = 'image' | 'video' | 'audio' | 'document';

/**
 * Media attachment to be sent with AI reply
 */
export interface AIReplyMediaAttachment {
  /** Media ID from knowledge base */
  mediaId: string;
  /** Knowledge base object ID */
  objectId: string;
  /** Object name for context */
  objectName: string;
  /** Media role (brochure, hero_image, etc.) */
  mediaRole: string;
  /** WhatsApp media type */
  whatsAppMediaType: WhatsAppMediaType;
  /** S3 key for the media */
  s3Key: string;
  /** S3 bucket */
  s3Bucket: string;
  /** Original filename */
  fileName: string;
  /** MIME type */
  mimeType: string;
  /** Caption to send with media */
  caption: string | null;
  /** Alt text for accessibility */
  altText: string | null;
  /** Why this media was selected */
  selectionReason: string;
  /** Similarity score from retrieval */
  similarityScore: number;
  /** Audit ID for this decision */
  auditId: string;
}

/**
 * Interactive CTA button to include with AI reply
 */
export interface AIReplyInteractiveButton {
  /** Unique action identifier */
  id: string;
  /** Button text (max 20 chars) */
  title: string;
}

/**
 * Interactive message data for AI reply
 */
export interface AIReplyInteractiveData {
  /** Whether to include interactive buttons */
  enabled: boolean;
  /** Buttons to display (max 3) */
  buttons: AIReplyInteractiveButton[];
  /** Footer text for the interactive message */
  footerText?: string;
  /** Funnel stage that was detected */
  funnelStage?: string;
  /** Reasoning for the CTA selection */
  reasoning?: string;
}

/**
 * Request to generate and optionally send an AI reply
 */
export interface GenerateAIReplyRequest {
  /** The chat to reply to */
  chatId: string;
  /** User ID initiating the request */
  userId: number;
  /** Sender ID to use for the reply */
  senderId: number;
  /** Optional specific prompt from user */
  userPrompt?: string;
  /** Whether to auto-send or just generate */
  autoSend: boolean;
  /** Message to reply to (for threading) */
  replyToMessageId?: string;
  /** Force template even if within window */
  forceTemplate?: boolean;
  /** Specific template ID to use */
  specificTemplateId?: string;
  /** Variable overrides for templates */
  templateVariables?: Record<string, string>;
  /** Whether to include media selection */
  includeMedia?: boolean;
  /** Message ID for audit trail (auto-generated if not provided) */
  messageId?: string;
  /** Whether to include interactive CTAs (proactive engagement) */
  includeInteractiveCTAs?: boolean;
}

/**
 * Response from generating an AI reply
 */
export interface GenerateAIReplyResponse {
  success: boolean;
  /** Analysis of the conversation context */
  analysis: ConversationAnalysis;
  /** Generated text (if successful) */
  generatedText?: string;
  /** Template used (if applicable) */
  templateUsed?: {
    templateId: string;
    localeId: string;
    templateName: string;
  };
  /** Media attachment to send (if applicable) */
  mediaAttachment?: AIReplyMediaAttachment;
  /** Interactive CTAs to include with the message */
  interactiveData?: AIReplyInteractiveData;
  /** Message ID if auto-sent (text message) */
  messageId?: string;
  /** Media message ID if auto-sent */
  mediaMessageId?: string;
  /** Error message */
  error?: string;
  /** Warnings */
  warnings?: string[];
  /** Usage metrics */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: string;
  };
}

// ============================================================================
// Settings Types
// ============================================================================

/**
 * AI reply settings stored in user_settings table
 */
export interface AIReplySettings {
  /** Whether AI replies are enabled */
  enabled: boolean;
  /** Auto-reply on new messages */
  autoReplyEnabled: boolean;
  /** Delay before auto-reply (seconds) */
  autoReplyDelaySeconds: number;
  /** Style preferences */
  stylePreferences: AIStylePreferences;
  /** Rate limit overrides */
  rateLimits: Partial<RateLimitConfig>;
  /** Templates to prefer for specific scenarios */
  preferredTemplates: Record<string, string>;
  /** Keywords to avoid in responses */
  avoidKeywords: string[];
  /** Whether to use AI memory for context */
  useMemory: boolean;
  /** Number of recent messages to include as context */
  recentMessagesCount: number;
}

/**
 * Default AI reply settings
 */
export const DEFAULT_AI_REPLY_SETTINGS: AIReplySettings = {
  enabled: true,
  autoReplyEnabled: false,
  autoReplyDelaySeconds: 5,
  stylePreferences: {
    tone: 'professional',
    length: 'moderate',
    useEmojis: false,
    language: 'en',
  },
  rateLimits: {},
  preferredTemplates: {},
  avoidKeywords: [],
  useMemory: true,
  recentMessagesCount: 10,
};

/**
 * Default rate limit configuration
 */
export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  maxMessagesPerHour: 10,
  maxMessagesPerDay: 50,
  minSecondsBetweenMessages: 30,
  cooldownSeconds: 300, // 5 minutes
  maxSimilarMessages: 3,
};
