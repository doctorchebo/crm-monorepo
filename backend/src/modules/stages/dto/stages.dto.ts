/**
 * Stage DTOs
 * Data Transfer Objects with validation for stage/pipeline API endpoints
 */

import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

// ============================================================================
// Stage CRUD DTOs
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

export class GetChatsByStageDto {
  @IsUUID()
  @IsOptional()
  stageId?: string;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  offset?: number;
}
