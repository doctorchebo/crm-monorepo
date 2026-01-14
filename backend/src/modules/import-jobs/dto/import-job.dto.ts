import {
    IsString,
    IsUUID,
    IsOptional,
    IsObject,
    IsNumber,
    IsEnum,
} from 'class-validator';
import { ImportJobStatus, ImportStagingStatus } from '@database/schema';

/**
 * DTO for creating a new import job
 */
export class CreateImportJobDto {
    @IsString()
    originalFilename: string;
}

/**
 * DTO for saving field mapping
 */
export class SaveFieldMappingDto {
    @IsObject()
    mapping: Record<string, string | null>; // { sourceColumn: internalField | null }

    @IsOptional()
    @IsString()
    fullNameColumn?: string;

    @IsOptional()
    @IsString()
    defaultCountryCode?: string;
}

/**
 * DTO for triggering validation
 */
export class TriggerValidationDto {
    @IsOptional()
    @IsNumber()
    batchSize?: number;
}

/**
 * DTO for committing import
 */
export class CommitImportDto {
    @IsOptional()
    @IsNumber()
    batchSize?: number;
}

/**
 * Query params for staging preview
 */
export class StagingPreviewQueryDto {
    @IsOptional()
    @IsNumber()
    skip?: number;

    @IsOptional()
    @IsNumber()
    take?: number;

    @IsOptional()
    @IsString()
    status?: ImportStagingStatus;
}

/**
 * Response types
 */
export interface ImportJobResponse {
    id: string;
    userId: number;
    status: ImportJobStatus;
    originalFilename: string | null;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    duplicateRows: number;
    fieldMapping: FieldMappingData | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface FieldMappingData {
    mapping?: Record<string, string | null>;
    suggestions?: HeaderSuggestion[];
    headers?: string[];
    fullNameColumn?: string;
    defaultCountryCode?: string;
}

export interface HeaderSuggestion {
    sourceColumn: string;
    suggestedField: string | null;
    confidence: number;
}

export interface StagingRowResponse {
    id: string;
    rowNumber: number | null;
    rawData: Record<string, unknown>;
    mappedData: Record<string, unknown> | null;
    validationErrors: ValidationError[];
    status: ImportStagingStatus;
}

export interface ValidationError {
    field: string;
    message: string;
}

export interface StagingPreviewResponse {
    rows: StagingRowResponse[];
    total: number;
    validCount: number;
    invalidCount: number;
    duplicateCount: number;
}

export interface UploadUrlResponse {
    jobId: string;
    uploadUrl: string;
    s3Key: string;
}
