/**
 * AI Chatbot DTOs
 * Data Transfer Objects for the AI chatbot module endpoints
 */

import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type { GoalType } from '../types/ai-chatbot.types';

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

  @IsString()
  @IsOptional()
  reason?: string;
}

export class ResumeAIDto {
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @IsString()
  @IsOptional()
  goalType?: GoalType;

  @IsString()
  @IsOptional()
  goalDescription?: string;
}

// ============================================================================
// AI Operation DTOs
// ============================================================================

export class ClassifyMessageDto {
  @IsString()
  @IsNotEmpty()
  content: string;
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
}

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

// ============================================================================
// AI Configuration DTOs
// ============================================================================

export class UpdateAiConfigurationDto {
  @IsString()
  @IsOptional()
  defaultTone?: string;

  @IsString()
  @IsOptional()
  defaultStyle?: string;

  @IsString()
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

  @IsBoolean()
  @IsOptional()
  defaultAiRepliesEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  defaultAiPaused?: boolean;

  @IsString()
  @IsOptional()
  conversationStrategy?: 'direct' | 'qualifying' | 'guided';

  @IsString()
  @IsOptional()
  goalType?: GoalType;

  @IsString()
  @IsOptional()
  goalDescription?: string | null;
}

export class SetChatAiOverrideDto {
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @IsString()
  @IsOptional()
  tone?: string | null;

  @IsString()
  @IsOptional()
  style?: string | null;

  @IsString()
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

  @IsBoolean()
  @IsOptional()
  reviewBeforeSend?: boolean;

  @IsString()
  @IsOptional()
  overrideReason?: string | null;

  // Calendar AI overrides (null = inherit from global calendar AI settings)
  @IsBoolean()
  @IsOptional()
  calendarAiEnabled?: boolean | null;

  @IsBoolean()
  @IsOptional()
  calendarCanCreateEvents?: boolean | null;

  @IsBoolean()
  @IsOptional()
  calendarCanModifyEvents?: boolean | null;

  @IsBoolean()
  @IsOptional()
  calendarCanDeleteEvents?: boolean | null;

  @IsString()
  @IsOptional()
  calendarAiInstructions?: string | null;
}

// ============================================================================
// System AI Prompts DTOs (System Admin Only)
// ============================================================================

export class UpdateGoalPromptDto {
  @IsString()
  @IsOptional()
  displayName?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  promptTemplate?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateSystemSettingDto {
  @IsString()
  @IsNotEmpty()
  settingKey: string;

  @IsNotEmpty()
  settingValue: unknown;

  @IsString()
  @IsOptional()
  description?: string;
}
