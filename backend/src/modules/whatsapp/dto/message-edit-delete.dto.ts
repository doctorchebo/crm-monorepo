import { IsOptional, IsString } from 'class-validator';

export class EditMessageDto {
  @IsString()
  text: string; // New text content

  @IsOptional()
  @IsString()
  chatId?: string; // Optional chat ID for context
}

export class DeleteMessageDto {
  @IsOptional()
  @IsString()
  chatId?: string; // Optional chat ID for context
}
