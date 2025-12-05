import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * DTO for creating a note
 * Either messageId OR chatId should be provided, but not both
 */
export class CreateNoteDto {
  @IsOptional()
  @IsString()
  messageId?: string;

  @IsOptional()
  @IsString()
  chatId?: string;

  @IsNotEmpty()
  @IsString()
  note: string;

  @IsNotEmpty()
  @IsInt()
  userId: number;
}
