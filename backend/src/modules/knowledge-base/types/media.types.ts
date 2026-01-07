/**
 * Knowledge Base Media Types
 *
 * Type definitions for the media attachment system including:
 * - Media role classifications
 * - AI eligibility criteria
 * - Guardrail configurations
 * - Decision audit types
 */

// ============================================================================
// MEDIA ROLE ENUM - What purpose does this media serve?
// ============================================================================

/**
 * Media roles define the semantic purpose of attached media.
 * These are stored in kb_object_media.media_type column.
 */
export type MediaRole =
  | 'hero_image' // Primary display image
  | 'gallery_image' // Secondary/gallery images
  | 'thumbnail' // Preview thumbnail
  | 'brochure' // PDF brochure/catalog
  | 'price_sheet' // Pricing document
  | 'floor_plan' // Architectural floor plan
  | 'video_tour' // Video walkthrough
  | 'promotional_video' // Marketing video
  | 'audio_description' // Audio narration
  | 'legal_document' // Contracts, terms
  | 'specification_sheet' // Technical specs
  | 'certificate' // Certifications, awards
  | 'map' // Location map
  | 'infographic' // Data visualization
  | 'logo' // Brand logo
  | 'other'; // Catch-all

/**
 * Media role metadata for UI and validation
 */
export interface MediaRoleMetadata {
  value: MediaRole;
  label: string;
  description: string;
  allowedMimeTypes: string[];
  /** Whether this role is typically AI-sendable */
  defaultAiEnabled: boolean;
  /** Priority when ranking media for AI selection */
  aiPriorityScore: number;
}

/**
 * Complete registry of media roles with metadata
 */
export const MEDIA_ROLE_REGISTRY: MediaRoleMetadata[] = [
  {
    value: 'hero_image',
    label: 'Hero Image',
    description: 'Primary display image for this item',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    defaultAiEnabled: true,
    aiPriorityScore: 100,
  },
  {
    value: 'gallery_image',
    label: 'Gallery Image',
    description: 'Additional images for gallery display',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    defaultAiEnabled: true,
    aiPriorityScore: 80,
  },
  {
    value: 'thumbnail',
    label: 'Thumbnail',
    description: 'Small preview image',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    defaultAiEnabled: false,
    aiPriorityScore: 10,
  },
  {
    value: 'brochure',
    label: 'Brochure',
    description: 'PDF brochure, catalog, or image flyer',
    allowedMimeTypes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ],
    defaultAiEnabled: true,
    aiPriorityScore: 90,
  },
  {
    value: 'price_sheet',
    label: 'Price Sheet',
    description: 'Pricing document or list',
    allowedMimeTypes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    defaultAiEnabled: true,
    aiPriorityScore: 95,
  },
  {
    value: 'floor_plan',
    label: 'Floor Plan',
    description: 'Architectural layout or floor plan',
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ],
    defaultAiEnabled: true,
    aiPriorityScore: 85,
  },
  {
    value: 'video_tour',
    label: 'Video Tour',
    description: 'Video walkthrough or tour',
    allowedMimeTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
    defaultAiEnabled: true,
    aiPriorityScore: 75,
  },
  {
    value: 'promotional_video',
    label: 'Promotional Video',
    description: 'Marketing or promotional video',
    allowedMimeTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
    defaultAiEnabled: true,
    aiPriorityScore: 70,
  },
  {
    value: 'audio_description',
    label: 'Audio Description',
    description: 'Audio narration or description',
    allowedMimeTypes: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/m4a'],
    defaultAiEnabled: false,
    aiPriorityScore: 40,
  },
  {
    value: 'legal_document',
    label: 'Legal Document',
    description: 'Contracts, terms, legal notices',
    allowedMimeTypes: ['application/pdf'],
    defaultAiEnabled: false,
    aiPriorityScore: 20,
  },
  {
    value: 'specification_sheet',
    label: 'Specification Sheet',
    description: 'Technical specifications document',
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    defaultAiEnabled: true,
    aiPriorityScore: 85,
  },
  {
    value: 'certificate',
    label: 'Certificate',
    description: 'Certifications, awards, or credentials',
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    defaultAiEnabled: false,
    aiPriorityScore: 30,
  },
  {
    value: 'map',
    label: 'Map',
    description: 'Location or area map',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    defaultAiEnabled: true,
    aiPriorityScore: 65,
  },
  {
    value: 'infographic',
    label: 'Infographic',
    description: 'Data visualization or infographic',
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/svg+xml',
    ],
    defaultAiEnabled: true,
    aiPriorityScore: 60,
  },
  {
    value: 'logo',
    label: 'Logo',
    description: 'Brand or company logo',
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/svg+xml',
    ],
    defaultAiEnabled: false,
    aiPriorityScore: 5,
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Other media type',
    allowedMimeTypes: ['*/*'],
    defaultAiEnabled: false,
    aiPriorityScore: 1,
  },
];

// ============================================================================
// AI PERMISSION & ELIGIBILITY
// ============================================================================

/**
 * AI permission settings stored in kb_object_media.field_config as JSON
 */
export interface MediaAiPermission {
  /** Whether AI is allowed to send this media to customers */
  aiEnabled: boolean;
  /** User who enabled/disabled AI permission */
  aiPermissionSetBy?: number;
  /** When AI permission was last changed */
  aiPermissionSetAt?: string;
  /** Language codes this media is appropriate for (empty = all languages) */
  allowedLanguages?: string[];
  /** Specific intents where this media is relevant */
  relevantIntents?: string[];
  /** Maximum times AI can send this media per chat */
  maxSendsPerChat?: number;
  /** Custom instructions for AI about when to use this media */
  aiInstructions?: string;
}

/**
 * Full eligibility check result for media
 */
export interface MediaEligibilityResult {
  /** Whether media is eligible for AI sending */
  isEligible: boolean;
  /** Specific reason codes for any failures */
  failureReasons: MediaEligibilityFailure[];
  /** Human-readable explanation */
  explanation: string;
  /** Confidence score if eligible (0-1) */
  confidenceScore?: number;
}

/**
 * Reasons why media might fail eligibility
 */
export type MediaEligibilityFailure =
  | 'missing_caption' // Caption is required but null/empty
  | 'ai_disabled' // AI permission is false
  | 'already_sent_in_chat' // Media was already sent in this chat
  | 'language_mismatch' // Chat language doesn't match allowed languages
  | 'outside_whatsapp_window' // Outside 24h window
  | 'max_sends_exceeded' // Exceeded max sends per chat
  | 'object_not_indexed' // Parent KB object not indexed
  | 'low_relevance_score' // Similarity score too low
  | 'object_archived' // Parent KB object is archived
  | 'extraction_pending' // Content extraction not complete
  | 'invalid_media_type'; // WhatsApp doesn't support this media type

// ============================================================================
// MEDIA RETRIEVAL & RANKING
// ============================================================================

/**
 * Options for retrieving media
 */
export interface MediaRetrievalOptions {
  /** Number of results to return */
  topK?: number;
  /** Minimum similarity score (0-1) */
  minSimilarity?: number;
  /** Filter by template IDs */
  templateIds?: string[];
  /** Filter by object IDs */
  objectIds?: string[];
  /** Exclude these object IDs */
  excludeObjectIds?: string[];
  /** Filter by media roles */
  mediaRoles?: MediaRole[];
  /** Filter by mime types */
  mimeTypes?: string[];
  /** Chat ID for "already sent" filtering */
  chatId?: string;
  /** Chat language for language matching */
  chatLanguage?: string;
  /** Only return AI-enabled media */
  aiEnabledOnly?: boolean;
  /** Conversation context for enhanced retrieval */
  conversationContext?: string;
}

/**
 * Single media retrieval result
 */
export interface MediaRetrievalResult {
  /** Media record ID */
  mediaId: string;
  /** Parent object ID */
  objectId: string;
  /** Parent object name */
  objectName: string;
  /** Template ID */
  templateId: string;
  /** Template name */
  templateName: string;
  /** Media role */
  mediaRole: MediaRole;
  /** Original filename */
  fileName: string;
  /** MIME type */
  mimeType: string;
  /** S3 key for retrieval */
  s3Key: string;
  /** S3 bucket */
  s3Bucket: string;
  /** Caption (why this media exists) */
  caption: string | null;
  /** Alt text (factual description) */
  altText: string | null;
  /** Thumbnail S3 key if available */
  thumbnailS3Key: string | null;
  /** AI-extracted content summary */
  extractedContent: string | null;
  /** AI instructions - when to send this media */
  aiInstructions: string | null;
  /** Vector similarity score */
  similarity: number;
  /** Combined ranking score (similarity + priority + recency) */
  rankingScore: number;
  /** Eligibility check result */
  eligibility: MediaEligibilityResult;
}

/**
 * Complete retrieval response
 */
export interface MediaRetrievalResponse {
  /** Original query text */
  query: string;
  /** Matching media results */
  results: MediaRetrievalResult[];
  /** Total matches before filtering */
  totalMatches: number;
  /** Total eligible after filtering */
  eligibleCount: number;
  /** Processing time in ms */
  latencyMs: number;
}

// ============================================================================
// WHATSAPP ANTI-BAN GUARDRAILS
// ============================================================================

/**
 * WhatsApp media sending rules
 */
export interface WhatsAppMediaGuardrails {
  /** No media in first AI message of conversation */
  noMediaInFirstMessage: boolean;
  /** No consecutive AI messages with media */
  noConsecutiveMediaMessages: boolean;
  /** Maximum media per AI reply */
  maxMediaPerReply: number;
  /** Minimum messages before media is allowed */
  minMessagesBeforeMedia: number;
  /** Required user intent signals for media */
  requireIntentSignal: boolean;
  /** Cooldown between media messages (ms) */
  mediaCooldownMs: number;
  /** Whether to block media outside 24h window */
  blockOutsideWindow: boolean;
}

/**
 * Default guardrail configuration
 */
export const DEFAULT_MEDIA_GUARDRAILS: WhatsAppMediaGuardrails = {
  noMediaInFirstMessage: true,
  noConsecutiveMediaMessages: true,
  maxMediaPerReply: 1,
  minMessagesBeforeMedia: 2,
  requireIntentSignal: true,
  mediaCooldownMs: 60000, // 1 minute
  blockOutsideWindow: true,
};

/**
 * Result of guardrail checks
 */
export interface GuardrailCheckResult {
  /** Whether all guardrails passed */
  passed: boolean;
  /** Which specific guardrails failed */
  failures: GuardrailFailure[];
  /** Recommended action */
  recommendation: 'send_media' | 'send_text_only' | 'use_template' | 'block';
  /** Human-readable explanation */
  explanation: string;
}

/**
 * Individual guardrail failure
 */
export interface GuardrailFailure {
  /** Rule that failed */
  rule: keyof WhatsAppMediaGuardrails;
  /** Human-readable reason */
  reason: string;
  /** When the rule will pass (if applicable) */
  retryAfterMs?: number;
}

// ============================================================================
// AI DECISION AUDIT TRAIL
// ============================================================================

/**
 * Complete audit record for AI media decisions
 * Stored in a dedicated table or as part of the message metadata
 */
export interface MediaDecisionAudit {
  /** Unique audit ID */
  id: string;
  /** Message ID where media was sent (or would have been) */
  messageId: string;
  /** Chat ID */
  chatId: string;
  /** User ID (CRM user) */
  userId: number;
  /** Timestamp of decision */
  timestamp: string;
  /** Whether media was actually sent */
  mediaSent: boolean;
  /** Selected media ID (if sent) */
  selectedMediaId: string | null;
  /** Parent KB object ID */
  objectId: string | null;
  /** Classified user intent */
  userIntent: string;
  /** User's original query text */
  queryText: string;
  /** Why this media was selected (or not) */
  selectionReason: string;
  /** All guardrails that were checked */
  guardrailsApplied: string[];
  /** Any guardrails that failed */
  guardrailFailures: GuardrailFailure[];
  /** Candidate media that were considered */
  candidatesConsidered: MediaCandidate[];
  /** Vector similarity score of selected media */
  similarityScore: number | null;
  /** Final ranking score */
  rankingScore: number | null;
}

/**
 * A candidate media that was considered
 */
export interface MediaCandidate {
  mediaId: string;
  objectId: string;
  objectName: string;
  mediaRole: MediaRole;
  caption: string | null;
  similarity: number;
  eligibility: MediaEligibilityResult;
  selected: boolean;
  rejectionReason?: string;
}

// ============================================================================
// MEDIA UPLOAD & MANAGEMENT
// ============================================================================

/**
 * Request to upload media to a KB object
 */
export interface MediaUploadRequest {
  /** Object to attach media to */
  objectId: string;
  /** Field ID if attaching to specific field */
  fieldId?: string;
  /** Media role classification */
  mediaRole: MediaRole;
  /** Caption explaining why this media exists (REQUIRED for AI) */
  caption: string;
  /** Short factual description */
  altText?: string;
  /** Whether AI can use this media */
  aiEnabled: boolean;
  /** Language codes this media is appropriate for */
  allowedLanguages?: string[];
  /** Display sort order */
  sortOrder?: number;
}

/**
 * Response from media upload
 */
export interface MediaUploadResponse {
  /** Created media record */
  media: {
    id: string;
    objectId: string;
    fieldId: string | null;
    mediaRole: MediaRole;
    fileName: string;
    mimeType: string;
    fileSize: number;
    s3Key: string;
    s3Bucket: string;
    caption: string | null;
    altText: string | null;
    aiEnabled: boolean;
    extractionStatus: string;
    createdAt: string;
  };
  /** Presigned URL for upload */
  uploadUrl: string;
  /** URL expires at */
  uploadUrlExpires: string;
}

/**
 * Request to update media metadata
 */
export interface MediaUpdateRequest {
  /** New caption */
  caption?: string;
  /** New alt text */
  altText?: string;
  /** New media role */
  mediaRole?: MediaRole;
  /** Enable/disable AI */
  aiEnabled?: boolean;
  /** Update allowed languages */
  allowedLanguages?: string[];
  /** Update AI instructions */
  aiInstructions?: string;
  /** Update sort order */
  sortOrder?: number;
}

// ============================================================================
// CONTENT EXTRACTION
// ============================================================================

/**
 * Status of content extraction
 */
export type ExtractionStatus =
  | 'pending' // Not yet processed
  | 'processing' // Currently being extracted
  | 'completed' // Successfully extracted
  | 'failed' // Extraction failed
  | 'not_applicable'; // Media type doesn't support extraction

/**
 * Extracted content from media
 */
export interface ExtractedMediaContent {
  /** Summary of extracted content */
  summary: string;
  /** Full extracted text (for documents) */
  fullText?: string;
  /** Detected objects/elements (for images/videos) */
  detectedElements?: string[];
  /** OCR text if any */
  ocrText?: string;
  /** Extraction method used */
  method: string;
  /** Extraction timestamp */
  extractedAt: string;
  /** Confidence score (0-1) */
  confidence: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get media role metadata by value
 */
export function getMediaRoleMetadata(
  role: MediaRole,
): MediaRoleMetadata | undefined {
  return MEDIA_ROLE_REGISTRY.find((r) => r.value === role);
}

/**
 * Validate MIME type against allowed types for a role
 */
export function isValidMimeTypeForRole(
  role: MediaRole,
  mimeType: string,
): boolean {
  const metadata = getMediaRoleMetadata(role);
  if (!metadata) return false;
  if (metadata.allowedMimeTypes.includes('*/*')) return true;
  return metadata.allowedMimeTypes.includes(mimeType);
}

/**
 * Get WhatsApp-compatible MIME types
 */
export const WHATSAPP_SUPPORTED_MIME_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4', 'video/3gpp'],
  audio: ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'],
  document: [
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
};

/**
 * Check if MIME type is supported by WhatsApp
 */
export function isWhatsAppSupportedMimeType(mimeType: string): boolean {
  return Object.values(WHATSAPP_SUPPORTED_MIME_TYPES).flat().includes(mimeType);
}

/**
 * Get WhatsApp media type category from MIME type
 */
export function getWhatsAppMediaCategory(
  mimeType: string,
): 'image' | 'video' | 'audio' | 'document' | null {
  for (const [category, types] of Object.entries(
    WHATSAPP_SUPPORTED_MIME_TYPES,
  )) {
    if (types.includes(mimeType)) {
      return category as 'image' | 'video' | 'audio' | 'document';
    }
  }
  return null;
}
