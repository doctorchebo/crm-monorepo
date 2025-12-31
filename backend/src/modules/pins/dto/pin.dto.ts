import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

/**
 * Pin duration options in hours
 */
export enum PinDuration {
  HOURS_24 = 24,
  DAYS_7 = 168, // 7 * 24
  DAYS_30 = 720, // 30 * 24
}

/**
 * DTO for creating a pin
 */
export class CreatePinDto {
  @IsString()
  @IsNotEmpty()
  messageId: string;

  @IsString()
  @IsNotEmpty()
  chatId: string;

  @IsEnum(PinDuration)
  duration: PinDuration;
}

/**
 * DTO for unpinning a message
 */
export class UnpinDto {
  @IsString()
  @IsNotEmpty()
  messageId: string;

  @IsString()
  @IsNotEmpty()
  chatId: string;
}

/**
 * Response DTO for a pinned message
 */
export interface PinnedMessageResponseDto {
  id: number;
  messageId: string;
  chatId: string;
  pinnedBy: number;
  pinnedByName?: string;
  pinnedAt: Date | string;
  expiresAt: Date | string;
  // Embedded message data for display
  message?: {
    messageId: string;
    text?: string | null;
    type: string;
    direction: string | null;
    timestamp: string;
    sender: string | null;
    attachments?: any[];
    senderName?: string;
  };
}

/**
 * Response DTO for pin count check
 */
export interface PinCountResponseDto {
  chatId: string;
  count: number;
  maxPins: number;
  canPinMore: boolean;
  oldestPin?: PinnedMessageResponseDto;
}
