/**
 * Workflow DTOs
 * Data Transfer Objects with validation for workflow API endpoints
 */

import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

// ============================================================================
// Enums
// ============================================================================

export enum RuleConditionType {
  KEYWORD = 'keyword',
  SENTIMENT = 'sentiment',
  CATEGORY = 'category',
  INTENT = 'intent',
  TIME_IN_STAGE = 'time_in_stage',
  MESSAGE_COUNT = 'message_count',
  CUSTOM = 'custom',
}

export enum SentimentValue {
  POSITIVE = 'positive',
  NEUTRAL = 'neutral',
  NEGATIVE = 'negative',
}

// ============================================================================
// Stage DTOs
// ============================================================================

export class CreateStageDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsNumber()
  @Min(0)
  @Max(1000)
  @IsOptional()
  order?: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  isFinal?: boolean;

  @IsBoolean()
  @IsOptional()
  requiresHandoff?: boolean;

  @IsBoolean()
  @IsOptional()
  aiEnabled?: boolean;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class UpdateStageDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsNumber()
  @Min(0)
  @Max(1000)
  @IsOptional()
  order?: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  isFinal?: boolean;

  @IsBoolean()
  @IsOptional()
  requiresHandoff?: boolean;

  @IsBoolean()
  @IsOptional()
  aiEnabled?: boolean;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class ReorderStagesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  stageIds: string[];
}

// ============================================================================
// Rule Condition DTOs
// ============================================================================

export class KeywordConditionDto {
  @IsArray()
  @IsString({ each: true })
  keywords: string[];

  @IsBoolean()
  @IsOptional()
  matchAll?: boolean;

  @IsBoolean()
  @IsOptional()
  caseSensitive?: boolean;
}

export class SentimentConditionDto {
  @IsEnum(SentimentValue)
  value: SentimentValue;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  minConfidence?: number;
}

export class CategoryConditionDto {
  @IsArray()
  @IsString({ each: true })
  categories: string[];

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  minConfidence?: number;
}

export class IntentConditionDto {
  @IsArray()
  @IsString({ each: true })
  intents: string[];

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  minConfidence?: number;
}

export class TimeInStageConditionDto {
  @IsNumber()
  @Min(0)
  minHours: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxHours?: number;
}

export class MessageCountConditionDto {
  @IsNumber()
  @Min(0)
  minCount: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxCount?: number;

  @IsBoolean()
  @IsOptional()
  customerOnly?: boolean;
}

export class RuleConditionDto {
  @IsEnum(RuleConditionType)
  type: RuleConditionType;

  @ValidateNested()
  @Type(() => KeywordConditionDto)
  @IsOptional()
  keyword?: KeywordConditionDto;

  @ValidateNested()
  @Type(() => SentimentConditionDto)
  @IsOptional()
  sentiment?: SentimentConditionDto;

  @ValidateNested()
  @Type(() => CategoryConditionDto)
  @IsOptional()
  category?: CategoryConditionDto;

  @ValidateNested()
  @Type(() => IntentConditionDto)
  @IsOptional()
  intent?: IntentConditionDto;

  @ValidateNested()
  @Type(() => TimeInStageConditionDto)
  @IsOptional()
  timeInStage?: TimeInStageConditionDto;

  @ValidateNested()
  @Type(() => MessageCountConditionDto)
  @IsOptional()
  messageCount?: MessageCountConditionDto;

  @IsObject()
  @IsOptional()
  custom?: Record<string, unknown>;
}

// ============================================================================
// Rule DTOs
// ============================================================================

export class CreateRuleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsOptional()
  fromStageId?: string;

  @IsUUID()
  toStageId: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  priority?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  conditions: RuleConditionDto[];

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class UpdateRuleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsOptional()
  fromStageId?: string;

  @IsUUID()
  @IsOptional()
  toStageId?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  priority?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  @IsOptional()
  conditions?: RuleConditionDto[];

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Chat Transition DTOs
// ============================================================================

export class TransitionChatDto {
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @IsUUID()
  toStageId: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class BulkTransitionChatsDto {
  @IsArray()
  @IsString({ each: true })
  chatIds: string[];

  @IsUUID()
  toStageId: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

// ============================================================================
// Handoff DTOs
// ============================================================================

export class RequestHandoffDto {
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class ResolveHandoffDto {
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @IsString()
  @IsOptional()
  resolution?: string;

  @IsBoolean()
  @IsOptional()
  resumeAI?: boolean;
}

export class PauseAIDto {
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @IsNumber()
  @Min(1)
  @Max(168) // Max 1 week
  @IsOptional()
  durationHours?: number;

  @IsString()
  @IsOptional()
  reason?: string;
}

// ============================================================================
// LLM/AI DTOs
// ============================================================================

export class ClassifyMessageDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsOptional()
  context?: string;
}

export class GenerateResponseDto {
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @IsString()
  @IsNotEmpty()
  customerMessage: string;

  @IsNumber()
  @Min(0)
  @Max(2)
  @IsOptional()
  temperature?: number;

  @IsNumber()
  @Min(1)
  @Max(4096)
  @IsOptional()
  maxTokens?: number;
}

export class ChatCompletionDto {
  @IsArray()
  @ValidateNested({ each: true })
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;

  @IsNumber()
  @Min(0)
  @Max(2)
  @IsOptional()
  temperature?: number;

  @IsNumber()
  @Min(1)
  @Max(4096)
  @IsOptional()
  maxTokens?: number;

  @IsString()
  @IsOptional()
  model?: string;
}

// ============================================================================
// Usage & Analytics DTOs
// ============================================================================

export class GetUsageStatsDto {
  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  model?: string;
}

export class GetViolationLogsDto {
  @IsNumber()
  @Min(1)
  @Max(500)
  @IsOptional()
  limit?: number;

  @IsBoolean()
  @IsOptional()
  includeSimulated?: boolean;

  @IsString()
  @IsOptional()
  severity?: 'info' | 'warning' | 'critical';

  @IsString()
  @IsOptional()
  startDate?: string;
}

// ============================================================================
// Simulation DTOs
// ============================================================================

export class RunSimulationDto {
  @IsString()
  @IsNotEmpty()
  scenarioName: string;

  @IsString()
  @IsOptional()
  chatId?: string;

  @IsNumber()
  @IsOptional()
  senderId?: number;
}

export class RunAllSimulationsDto {
  @IsString()
  @IsOptional()
  chatId?: string;

  @IsNumber()
  @IsOptional()
  senderId?: number;
}

// ============================================================================
// Workflow Query DTOs
// ============================================================================

export class GetWorkflowSummaryDto {
  @IsNumber()
  @IsOptional()
  senderId?: number;
}

export class GetChatsByStageDto {
  @IsUUID()
  stageId: string;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  offset?: number;
}

export class InitializeChatWorkflowDto {
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @IsUUID()
  @IsOptional()
  initialStageId?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Response DTOs (for documentation/typing)
// ============================================================================

export interface StageResponseDto {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon?: string;
  order: number;
  isDefault: boolean;
  isFinal: boolean;
  requiresHandoff: boolean;
  aiEnabled: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface RuleResponseDto {
  id: string;
  name: string;
  description?: string;
  fromStageId?: string;
  toStageId: string;
  priority: number;
  conditions: RuleConditionDto[];
  enabled: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClassificationResponseDto {
  category: string;
  intent: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
  suggestedAction: string;
  keywords?: string[];
  language: string;
}

export interface WorkflowSummaryResponseDto {
  totalChats: number;
  byStage: Array<{
    stageId: string;
    stageName: string;
    count: number;
    color: string;
  }>;
  pendingHandoffs: number;
  aiPaused: number;
  recentTransitions: number;
}

// ============================================================================
// AI Configuration DTOs
// ============================================================================

export enum AiTone {
  FRIENDLY = 'friendly',
  PROFESSIONAL = 'professional',
  CASUAL = 'casual',
  FORMAL = 'formal',
}

export enum AiStyle {
  CONCISE = 'concise',
  DETAILED = 'detailed',
  CONVERSATIONAL = 'conversational',
  TECHNICAL = 'technical',
}

export enum AiFormality {
  CASUAL = 'casual',
  BALANCED = 'balanced',
  FORMAL = 'formal',
  VERY_FORMAL = 'very_formal',
}

/**
 * DTO for creating/updating user-level AI configuration
 */
export class UpdateAiConfigurationDto {
  @IsEnum(AiTone)
  @IsOptional()
  defaultTone?: string;

  @IsEnum(AiStyle)
  @IsOptional()
  defaultStyle?: string;

  @IsEnum(AiFormality)
  @IsOptional()
  formalityLevel?: string;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  maxMessagesPerHour?: number;

  @IsNumber()
  @Min(1)
  @Max(1000)
  @IsOptional()
  maxMessagesPerDay?: number;

  @IsNumber()
  @Min(0)
  @Max(60000)
  @IsOptional()
  minDelayBetweenMessagesMs?: number;

  @IsString()
  @IsOptional()
  languagePreference?: string | null;

  @IsBoolean()
  @IsOptional()
  autoTranslateResponses?: boolean;

  @IsBoolean()
  @IsOptional()
  allowFreeTextRepliesWithin24h?: boolean;

  @IsBoolean()
  @IsOptional()
  preferTemplatesOver24h?: boolean;

  @IsBoolean()
  @IsOptional()
  autoSuggestTemplates?: boolean;

  @IsNumber()
  @Min(50)
  @Max(2000)
  @IsOptional()
  maxResponseLength?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  avoidTopics?: string[];

  @IsString()
  @IsOptional()
  requiredSignature?: string | null;

  @IsString()
  @IsOptional()
  preferredModel?: string | null;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  temperature?: number;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

/**
 * DTO for creating/updating chat-level AI overrides
 */
export class SetChatAiOverrideDto {
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @IsEnum(AiTone)
  @IsOptional()
  tone?: string | null;

  @IsEnum(AiStyle)
  @IsOptional()
  style?: string | null;

  @IsEnum(AiFormality)
  @IsOptional()
  formalityLevel?: string | null;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  maxMessagesPerHour?: number | null;

  @IsString()
  @IsOptional()
  languagePreference?: string | null;

  @IsBoolean()
  @IsOptional()
  allowFreeTextReplies?: boolean | null;

  @IsBoolean()
  @IsOptional()
  useTemplatesOnly?: boolean;

  @IsNumber()
  @Min(50)
  @Max(2000)
  @IsOptional()
  maxResponseLength?: number | null;

  @IsString()
  @IsOptional()
  customInstructions?: string | null;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  avoidTopics?: string[] | null;

  @IsBoolean()
  @IsOptional()
  aiEnabled?: boolean;

  @IsString()
  @IsOptional()
  overrideReason?: string | null;
}

/**
 * DTO for setting workflow stage AI settings
 */
export class SetStageAiSettingsDto {
  @IsString()
  @IsNotEmpty()
  stageId: string;

  @IsEnum(AiTone)
  @IsOptional()
  tone?: string | null;

  @IsEnum(AiStyle)
  @IsOptional()
  style?: string | null;

  @IsEnum(AiFormality)
  @IsOptional()
  formalityLevel?: string | null;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  maxMessagesPerHour?: number | null;

  @IsString()
  @IsOptional()
  languagePreference?: string | null;

  @IsBoolean()
  @IsOptional()
  allowFreeTextReplies?: boolean | null;

  @IsBoolean()
  @IsOptional()
  useTemplatesOnly?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  suggestedTemplateIds?: string[];

  @IsNumber()
  @Min(50)
  @Max(2000)
  @IsOptional()
  maxResponseLength?: number | null;

  @IsString()
  @IsOptional()
  systemPromptAddition?: string | null;

  @IsString()
  @IsOptional()
  goalDescription?: string | null;

  @IsArray()
  @IsOptional()
  escalationTriggers?: unknown[];
}

/**
 * Response DTO for resolved AI configuration
 */
export interface ResolvedAiConfigResponseDto {
  source: {
    userId: number;
    chatId?: string;
    stageId?: string;
    hasUserConfig: boolean;
    hasStageConfig: boolean;
    hasChatOverride: boolean;
  };
  tone: string;
  style: string;
  formalityLevel: string;
  maxMessagesPerHour: number;
  maxMessagesPerDay: number;
  minDelayBetweenMessagesMs: number;
  languagePreference: string | null;
  autoTranslateResponses: boolean;
  allowFreeTextReplies: boolean;
  preferTemplatesOver24h: boolean;
  autoSuggestTemplates: boolean;
  useTemplatesOnly: boolean;
  suggestedTemplateIds: string[];
  maxResponseLength: number;
  avoidTopics: string[];
  requiredSignature: string | null;
  preferredModel: string | null;
  temperature: number;
  aiEnabled: boolean;
  systemPromptAddition: string | null;
  goalDescription: string | null;
  customInstructions: string | null;
  escalationTriggers: unknown[];
}

/**
 * Response DTO for AI configuration options
 */
export interface AiConfigOptionsResponseDto {
  tones: Array<{ value: string; label: string; description: string }>;
  styles: Array<{ value: string; label: string; description: string }>;
  formalities: Array<{ value: string; label: string; description: string }>;
}
// ============================================================================
// AI Review DTOs
// ============================================================================

export class SendReviewedAiResponseDto {
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsObject()
  @IsOptional()
  mediaAttachment?: unknown;

  @IsObject()
  @IsOptional()
  interactiveData?: unknown;
}

export class DiscardPendingReviewDto {
  @IsString()
  @IsNotEmpty()
  chatId: string;
}
