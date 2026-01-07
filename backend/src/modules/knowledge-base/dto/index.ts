import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

// Re-declare types here to avoid decorator metadata issues with 'import type'
export type FieldType =
  | 'short_text'
  | 'long_text'
  | 'rich_text'
  | 'number'
  | 'price'
  | 'date'
  | 'date_range'
  | 'boolean'
  | 'tags'
  | 'location'
  | 'media'
  | 'file'
  | 'select'
  | 'multi_select'
  | 'url'
  | 'email'
  | 'phone'
  | 'key_value';

export type AiRelevance = 'low' | 'medium' | 'high' | 'critical';

// Use any for complex types in decorators
type FieldConfig = Record<string, unknown>;
type FieldValue = unknown;

// ============================================================================
// Template DTOs
// ============================================================================

export class CreateTemplateFieldDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  slug: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  placeholder?: string;

  @IsEnum([
    'short_text',
    'long_text',
    'rich_text',
    'number',
    'price',
    'date',
    'date_range',
    'boolean',
    'tags',
    'location',
    'media',
    'file',
    'select',
    'multi_select',
    'url',
    'email',
    'phone',
    'key_value',
  ])
  fieldType: FieldType;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isUnique?: boolean;

  @IsOptional()
  defaultValue?: FieldValue;

  @IsOptional()
  @IsObject()
  fieldConfig?: FieldConfig;

  @IsOptional()
  @IsObject()
  validation?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'critical'])
  aiRelevance?: AiRelevance;

  @IsOptional()
  @IsBoolean()
  aiIncludeInEmbedding?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  aiFieldHints?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  groupName?: string;

  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;
}

export class CreateTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  slug: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  aiUsageHints?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  aiRetrievalContext?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supportedIntents?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fabricationWarnings?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  priorityScore?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTemplateFieldDto)
  fields: CreateTemplateFieldDto[];
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  aiUsageHints?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  aiRetrievalContext?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supportedIntents?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fabricationWarnings?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  priorityScore?: number;
}

export class UpdateTemplateFieldDto extends CreateTemplateFieldDto {
  @IsOptional()
  @IsUUID()
  id?: string;
}

// ============================================================================
// Object DTOs
// ============================================================================

export class FieldValueDto {
  @IsUUID()
  fieldId: string;

  value: FieldValue;
}

export class CreateObjectDto {
  @IsUUID()
  templateId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldValueDto)
  fieldValues: FieldValueDto[];

  @IsOptional()
  @IsBoolean()
  publishImmediately?: boolean;
}

export class UpdateObjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldValueDto)
  fieldValues?: FieldValueDto[];
}

export class BulkUpdateStatusDto {
  @IsArray()
  @IsUUID('4', { each: true })
  objectIds: string[];

  @IsEnum(['draft', 'pending', 'archived'])
  status: 'draft' | 'pending' | 'archived';
}

// ============================================================================
// Upload DTOs
// ============================================================================

export class UploadFileDto {
  @IsOptional()
  @IsUUID()
  objectId?: string;

  @IsOptional()
  @IsUUID()
  fieldId?: string;
}

export class ProcessUploadDto {
  @IsUUID()
  uploadId: string;

  @IsOptional()
  @IsUUID()
  assignToObjectId?: string;

  @IsOptional()
  @IsUUID()
  assignToTemplateId?: string;
}

// ============================================================================
// Bulk Import DTOs
// ============================================================================

export class FieldMappingDto {
  @IsString()
  sourceColumn: string;

  @IsUUID()
  targetFieldId: string;

  @IsOptional()
  @IsEnum(['none', 'trim', 'lowercase', 'uppercase', 'parse_json'])
  transformation?: 'none' | 'trim' | 'lowercase' | 'uppercase' | 'parse_json';
}

export class CreateBulkImportDto {
  @IsUUID()
  templateId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldMappingDto)
  fieldMappings: FieldMappingDto[];

  @IsOptional()
  @IsBoolean()
  skipDuplicates?: boolean;

  @IsOptional()
  @IsBoolean()
  updateExisting?: boolean;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

// ============================================================================
// Retrieval DTOs
// ============================================================================

export class RetrieveDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  query: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  topK?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
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
  @IsUUID('4', { each: true })
  excludeObjectIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  chunkTypes?: string[];
}

// ============================================================================
// Test Query DTOs
// ============================================================================

export class TestQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  query: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  topK?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minSimilarity?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  templateIds?: string[];
}

export class SaveTestQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  query: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  expectedObjectIds?: string[];
}

// ============================================================================
// Query DTOs
// ============================================================================

export class ListObjectsQueryDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  pageSize?: number;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsEnum(['draft', 'pending', 'indexing', 'indexed', 'error', 'archived'])
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

export class ListTemplatesQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  includeSystem?: boolean;

  @IsOptional()
  @IsBoolean()
  activeOnly?: boolean;
}
