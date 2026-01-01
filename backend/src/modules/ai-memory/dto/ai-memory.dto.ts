import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * DTO for storing a message memory
 */
export class StoreMemoryDto {
  @IsString()
  chatId: string;

  @IsOptional()
  @IsString()
  messageId?: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  importanceScore?: number;
}

/**
 * DTO for storing uploaded content
 */
export class StoreUploadedContentDto {
  @IsOptional()
  @IsString()
  chatId?: string;

  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsNumber()
  fileSize?: number;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsString()
  extractedContent: string;
}

/**
 * DTO for memory retrieval query
 */
export class RetrieveMemoriesDto {
  @IsString()
  chatId: string;

  @IsString()
  query: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  topK?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minScore?: number;

  @IsOptional()
  @IsString()
  direction?: 'inbound' | 'outbound' | 'both';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contentTypes?: string[];
}

/**
 * DTO for building AI context
 */
export class BuildContextDto {
  @IsString()
  chatId: string;

  @IsString()
  currentMessage: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  recentMessagesCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  topK?: number;
}

/**
 * DTO for processing uploaded content
 */
export class ProcessContentDto {
  @IsOptional()
  @IsString()
  chatId?: string;

  @IsString()
  fileUrl: string;

  @IsString()
  fileName: string;

  @IsString()
  mimeType: string;

  @IsOptional()
  @IsNumber()
  fileSize?: number;
}

/**
 * DTO for batch memory storage
 */
export class BatchStoreMemoryDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StoreMemoryDto)
  memories: StoreMemoryDto[];
}

/**
 * DTO for deleting memories
 */
export class DeleteMemoriesDto {
  @IsString()
  chatId: string;
}

/**
 * DTO for getting usage stats
 */
export class UsageStatsDto {
  @IsString()
  fromDate: string;

  @IsString()
  toDate: string;
}
