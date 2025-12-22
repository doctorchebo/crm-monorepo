import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

/**
 * DTO for searching messages within a chat
 * Supports text search with date filtering and pagination
 */
export class SearchMessagesDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Search query must be at least 2 characters' })
  query: string;

  @IsOptional()
  @IsDateString({}, { message: 'Invalid date format. Use ISO 8601 format.' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Invalid date format. Use ISO 8601 format.' })
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 20;
}

/**
 * Interface for a single search result
 */
export interface MessageSearchResult {
  messageId: string;
  chatId: string;
  text: string;
  type: string;
  direction: 'inbound' | 'outbound';
  status: string;
  timestamp: Date;
  sender: string;
  sentAt?: Date | null;
  deliveredAt?: Date | null;
  readAt?: Date | null;
  attachments?: any[];
  // For highlighting matched text
  matchedText?: string;
  matchStartIndex?: number;
  matchEndIndex?: number;
}

/**
 * Response for message search endpoint
 */
export interface SearchMessagesResponse {
  results: MessageSearchResult[];
  total: number;
  hasMore: boolean;
  query: string;
}
