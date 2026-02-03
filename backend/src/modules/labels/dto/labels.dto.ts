import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * DTO for creating a new label
 */
export class CreateLabelDto {
  @IsString()
  @IsNotEmpty({ message: 'Label name is required' })
  @MaxLength(100, { message: 'Label name cannot exceed 100 characters' })
  name: string;

  @IsString()
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Color must be a valid hex color (e.g., #6366f1)',
  })
  color?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  emoji?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}

/**
 * DTO for updating an existing label
 */
export class UpdateLabelDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty({ message: 'Label name cannot be empty' })
  @MaxLength(100, { message: 'Label name cannot exceed 100 characters' })
  name?: string;

  @IsString()
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Color must be a valid hex color (e.g., #6366f1)',
  })
  color?: string;

  @IsOptional()
  @MaxLength(50)
  emoji?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}

/**
 * DTO for applying labels to chats
 */
export class ApplyLabelsDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ message: 'At least one chat ID is required' })
  chatIds: string[];

  @IsArray()
  @IsUUID('4', { each: true })
  @IsNotEmpty({ message: 'At least one label ID is required' })
  labelIds: string[];
}

/**
 * DTO for removing labels from chats
 */
export class RemoveLabelsDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ message: 'At least one chat ID is required' })
  chatIds: string[];

  @IsArray()
  @IsUUID('4', { each: true })
  @IsNotEmpty({ message: 'At least one label ID is required' })
  labelIds: string[];
}

/**
 * Response DTO for a label
 */
export interface LabelResponseDto {
  id: string;
  teamId: number;
  name: string;
  color: string;
  emoji: string | null;
  description: string | null;
  isSystem: boolean;
  sortOrder: number;
  chatCount?: number; // Optional count of chats with this label
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response DTO for chat labels
 */
export interface ChatLabelResponseDto {
  id: string;
  chatId: string;
  labelId: string;
  label: LabelResponseDto;
  appliedBy: number | null;
  appliedByWorkflowId: string | null;
  createdAt: string;
}

/**
 * Response DTO for chats with a specific label
 */
export interface ChatsWithLabelResponseDto {
  label: LabelResponseDto;
  chats: Array<{
    chatId: string;
    participantName: string | null;
    participantPhone: string;
    lastMessage: string | null;
    lastMessageTime: string | null;
    unreadCount: number;
  }>;
  total: number;
}
