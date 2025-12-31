import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * DTO for creating or updating a message reaction
 */
export class CreateReactionDto {
  @IsString()
  @IsNotEmpty()
  messageId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  emoji: string;
}

/**
 * DTO for removing a reaction
 */
export class RemoveReactionDto {
  @IsString()
  @IsNotEmpty()
  messageId: string;
}

/**
 * Response DTO for a reaction
 */
export interface ReactionResponseDto {
  id: number;
  messageId: string;
  userId: number;
  emoji: string;
  userName?: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/**
 * Response DTO for reactions grouped by message
 */
export interface MessageReactionsDto {
  messageId: string;
  reactions: ReactionResponseDto[];
}

/**
 * Response DTO for a customer reaction (from WhatsApp user)
 */
export interface CustomerReactionResponseDto {
  id: number;
  messageId: string;
  waMessageId?: string;
  chatId: string;
  senderPhone: string;
  emoji?: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}
