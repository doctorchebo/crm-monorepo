import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * DTO for searching chats
 * Supports searching by participant name or phone number
 */
export class SearchChatsDto {
  @IsString()
  @IsOptional()
  query?: string;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  skip?: number = 0;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  take?: number = 50;
}

export interface SearchChatsResult {
  chatId: string;
  senderId: number;
  businessPhone?: string;
  participantPhone: string;
  participantName?: string;
  lastMessage?: string;
  lastMessageType?: string;
  lastMessageTime?: Date;
  unreadCount: number;
  matchedField?: 'name' | 'phone';
}

export interface SearchChatsResponse {
  results: SearchChatsResult[];
  total: number;
  hasMore: boolean;
  query?: string;
}
