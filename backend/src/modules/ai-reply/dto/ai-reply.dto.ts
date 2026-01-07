/**
 * AI Reply DTOs
 * Data Transfer Objects for AI Reply API endpoints
 */

import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

// ============================================================================
// Generate Reply DTOs
// ============================================================================

export class GenerateReplyDto {
  /** The chat ID to generate a reply for */
  @IsString()
  chatId: string;

  /** Specific prompt/instruction for the AI */
  @IsOptional()
  @IsString()
  userPrompt?: string;

  /** Whether to auto-send the reply */
  @IsOptional()
  @IsBoolean()
  autoSend?: boolean;

  /** Message ID to reply to (for threading) */
  @IsOptional()
  @IsString()
  replyToMessageId?: string;

  /** Force template even if within window */
  @IsOptional()
  @IsBoolean()
  forceTemplate?: boolean;

  /** Specific template ID to use */
  @IsOptional()
  @IsString()
  specificTemplateId?: string;

  /** Variable overrides for templates */
  @IsOptional()
  @IsObject()
  templateVariables?: Record<string, string>;

  /** Whether to include media selection (defaults to true) */
  @IsOptional()
  @IsBoolean()
  includeMedia?: boolean;
}

/**
 * Media attachment in AI reply response
 */
export class MediaAttachmentDto {
  mediaId: string;
  objectId: string;
  objectName: string;
  mediaRole: string;
  whatsAppMediaType: 'image' | 'video' | 'audio' | 'document';
  s3Key: string;
  s3Bucket: string;
  fileName: string;
  mimeType: string;
  caption: string | null;
  altText: string | null;
  selectionReason: string;
  similarityScore: number;
  auditId: string;
}

export class GenerateReplyResponseDto {
  success: boolean;
  generatedText?: string;
  templateUsed?: {
    templateId: string;
    localeId: string;
    templateName: string;
  };
  /** Media attachment to send with the reply */
  mediaAttachment?: MediaAttachmentDto;
  messageId?: string;
  /** Media message ID if auto-sent */
  mediaMessageId?: string;
  error?: string;
  warnings?: string[];
  analysis?: {
    isWithinWindow: boolean;
    windowTimeRemainingMs: number;
    messagesSentLastHour: number;
    messagesSentToday: number;
    decision: string;
  };
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: string;
  };
}

// ============================================================================
// Settings DTOs
// ============================================================================

export class StylePreferencesDto {
  @IsOptional()
  @IsEnum(['formal', 'casual', 'friendly', 'professional'])
  tone?: 'formal' | 'casual' | 'friendly' | 'professional';

  @IsOptional()
  @IsEnum(['concise', 'moderate', 'detailed'])
  length?: 'concise' | 'moderate' | 'detailed';

  @IsOptional()
  @IsBoolean()
  useEmojis?: boolean;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  customInstructions?: string;

  @IsOptional()
  @IsString()
  businessContext?: string;

  @IsOptional()
  @IsString()
  productsServices?: string;
}

export class RateLimitConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  maxMessagesPerHour?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(500)
  maxMessagesPerDay?: number;

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(300)
  minSecondsBetweenMessages?: number;

  @IsOptional()
  @IsNumber()
  @Min(60)
  @Max(3600)
  cooldownSeconds?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  maxSimilarMessages?: number;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  autoReplyEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(60)
  autoReplyDelaySeconds?: number;

  @IsOptional()
  @IsObject()
  stylePreferences?: StylePreferencesDto;

  @IsOptional()
  @IsObject()
  rateLimits?: RateLimitConfigDto;

  @IsOptional()
  @IsObject()
  preferredTemplates?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  avoidKeywords?: string[];

  @IsOptional()
  @IsBoolean()
  useMemory?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  recentMessagesCount?: number;
}

export class SettingsResponseDto {
  enabled: boolean;
  autoReplyEnabled: boolean;
  autoReplyDelaySeconds: number;
  stylePreferences: StylePreferencesDto;
  rateLimits: RateLimitConfigDto;
  preferredTemplates: Record<string, string>;
  avoidKeywords: string[];
  useMemory: boolean;
  recentMessagesCount: number;
}

// ============================================================================
// Analysis DTOs
// ============================================================================

export class AnalyzeConversationDto {
  /** The chat ID to analyze */
  @IsString()
  chatId: string;
}

export class ConversationAnalysisResponseDto {
  isWithinWindow: boolean;
  windowTimeRemainingMs: number;
  lastCustomerMessageAt?: string;
  messagesSentLastHour: number;
  messagesSentToday: number;
  isRepetitiveContent: boolean;
  decision: 'free_form' | 'template' | 'blocked';
  blockReason?: string;
  recommendedTemplateId?: string;
}

// ============================================================================
// Rate Limit DTOs
// ============================================================================

export class RateLimitStatusDto {
  canSend: boolean;
  messagesLastHour: number;
  messagesToday: number;
  cooldownRemaining: number;
  blockReason?: string;
  hourlyResetAt: string;
  dailyResetAt: string;
}

// ============================================================================
// Template Selection DTOs
// ============================================================================

export class SelectTemplateDto {
  /** Keywords from conversation context */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contextKeywords?: string[];

  /** Preferred language code */
  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsEnum(['utility', 'marketing', 'authentication'])
  category?: 'utility' | 'marketing' | 'authentication';
}

export class TemplateSelectionResponseDto {
  found: boolean;
  localeId?: string;
  templateId?: string;
  templateName?: string;
  templateBody?: string;
  requiredVariables?: string[];
  matchScore?: number;
  reason: string;
}
