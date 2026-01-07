/**
 * Knowledge Base Media DTOs
 *
 * Data Transfer Objects for media upload, update, and retrieval operations.
 */

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

// Media role enum values for validation
const MEDIA_ROLES = [
  'hero_image',
  'gallery_image',
  'thumbnail',
  'brochure',
  'price_sheet',
  'floor_plan',
  'video_tour',
  'promotional_video',
  'audio_description',
  'legal_document',
  'specification_sheet',
  'certificate',
  'map',
  'infographic',
  'logo',
  'other',
] as const;

// ============================================================================
// Media Upload DTOs
// ============================================================================

/**
 * Request to initiate a media upload
 */
export class InitiateMediaUploadDto {
  @IsUUID()
  objectId: string;

  @IsOptional()
  @IsUUID()
  fieldId?: string;

  @IsEnum(MEDIA_ROLES)
  mediaRole: (typeof MEDIA_ROLES)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  fileName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  mimeType: string;

  @IsNumber()
  @Min(1)
  @Max(100 * 1024 * 1024) // 100MB max
  fileSize: number;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  caption: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  altText?: string;

  @IsBoolean()
  aiEnabled: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  allowedLanguages?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}

/**
 * Confirm media upload completion
 */
export class ConfirmMediaUploadDto {
  @IsUUID()
  mediaId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  width?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  height?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  duration?: number;
}

/**
 * Proxy upload request - for form-data uploads through the backend
 *
 * Note: All fields are strings because they come from multipart form-data.
 * The controller handles parsing/conversion.
 */
export class ProxyUploadDto {
  @IsUUID()
  objectId: string;

  @IsOptional()
  @IsString()
  fieldId?: string;

  @IsEnum(MEDIA_ROLES)
  mediaRole: (typeof MEDIA_ROLES)[number];

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  caption: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  altText?: string;

  @IsOptional()
  @IsString()
  aiEnabled?: string; // 'true' or 'false' from form-data

  @IsOptional()
  @IsString()
  allowedLanguages?: string; // JSON array string from form-data

  @IsOptional()
  @IsString()
  width?: string;

  @IsOptional()
  @IsString()
  height?: string;

  @IsOptional()
  @IsString()
  duration?: string;
}

// ============================================================================
// Media Update DTOs
// ============================================================================

/**
 * Update media metadata
 */
export class UpdateMediaDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  caption?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  altText?: string;

  @IsOptional()
  @IsEnum(MEDIA_ROLES)
  mediaRole?: (typeof MEDIA_ROLES)[number];

  @IsOptional()
  @IsBoolean()
  aiEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  allowedLanguages?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  aiInstructions?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}

/**
 * Update AI permission for media
 */
export class UpdateMediaAiPermissionDto {
  @IsBoolean()
  aiEnabled: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  allowedLanguages?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  relevantIntents?: string[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  maxSendsPerChat?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  aiInstructions?: string;
}

/**
 * Batch update media order
 */
export class UpdateMediaOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaOrderItemDto)
  @ArrayMaxSize(100)
  items: MediaOrderItemDto[];
}

export class MediaOrderItemDto {
  @IsUUID()
  mediaId: string;

  @IsNumber()
  @Min(0)
  sortOrder: number;
}

// ============================================================================
// Media Retrieval DTOs
// ============================================================================

/**
 * Retrieve media for AI usage
 */
export class RetrieveMediaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  query: string;

  @IsString()
  chatId: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  chatLanguage?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  topK?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minSimilarity?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  templateIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  objectIds?: string[];

  @IsOptional()
  @IsArray()
  @IsEnum(MEDIA_ROLES, { each: true })
  mediaRoles?: (typeof MEDIA_ROLES)[number][];

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  conversationContext?: string;
}

/**
 * Check media eligibility before sending
 */
export class CheckMediaEligibilityDto {
  @IsUUID()
  mediaId: string;

  @IsString()
  chatId: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  chatLanguage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  userIntent?: string;
}

// ============================================================================
// Media Guardrail DTOs
// ============================================================================

/**
 * Check if media can be sent based on guardrails
 */
export class CheckMediaGuardrailsDto {
  @IsString()
  chatId: string;

  @IsOptional()
  @IsUUID()
  mediaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  chatLanguage?: string;

  @IsOptional()
  @IsBoolean()
  isFirstAiMessage?: boolean;

  @IsOptional()
  @IsBoolean()
  lastMessageHadMedia?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  messageCountInConversation?: number;
}

// ============================================================================
// Media Decision Audit DTOs
// ============================================================================

/**
 * Log a media decision (internal use)
 */
export class LogMediaDecisionDto {
  @IsString()
  messageId: string;

  @IsString()
  chatId: string;

  @IsBoolean()
  mediaSent: boolean;

  @IsOptional()
  @IsUUID()
  selectedMediaId?: string;

  @IsOptional()
  @IsUUID()
  objectId?: string;

  @IsString()
  @MaxLength(100)
  userIntent: string;

  @IsString()
  @MaxLength(2000)
  queryText: string;

  @IsString()
  @MaxLength(2000)
  selectionReason: string;

  @IsArray()
  @IsString({ each: true })
  guardrailsApplied: string[];

  @IsOptional()
  @IsArray()
  guardrailFailures?: Array<{
    rule: string;
    reason: string;
    retryAfterMs?: number;
  }>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  similarityScore?: number;

  @IsOptional()
  @IsNumber()
  rankingScore?: number;
}

/**
 * Query media decision audit logs
 */
export class QueryMediaDecisionLogsDto {
  @IsOptional()
  @IsString()
  chatId?: string;

  @IsOptional()
  @IsUUID()
  mediaId?: string;

  @IsOptional()
  @IsUUID()
  objectId?: string;

  @IsOptional()
  @IsBoolean()
  mediaSentOnly?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

// ============================================================================
// Content Extraction DTOs
// ============================================================================

/**
 * Trigger content extraction for media
 */
export class TriggerExtractionDto {
  @IsUUID()
  mediaId: string;

  @IsOptional()
  @IsBoolean()
  forceReextract?: boolean;
}

/**
 * List media query DTO
 */
export class ListMediaQueryDto {
  @IsOptional()
  @IsUUID()
  objectId?: string;

  @IsOptional()
  @IsUUID()
  fieldId?: string;

  @IsOptional()
  @IsEnum(MEDIA_ROLES)
  mediaRole?: (typeof MEDIA_ROLES)[number];

  @IsOptional()
  @IsBoolean()
  aiEnabledOnly?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

// ============================================================================
// Feedback DTOs
// ============================================================================

/**
 * Submit feedback on AI media selection
 */
export class MediaFeedbackDto {
  @IsUUID()
  auditId: string;

  @IsEnum(['correct', 'incorrect', 'inappropriate'])
  feedback: 'correct' | 'incorrect' | 'inappropriate';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @IsOptional()
  @IsUUID()
  correctMediaId?: string;
}

/**
 * Mark media as disabled by user after AI sent it incorrectly
 */
export class DisableMediaFromAiDto {
  @IsUUID()
  mediaId: string;

  @IsString()
  @MaxLength(500)
  reason: string;
}
