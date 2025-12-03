import { IsOptional, IsString } from 'class-validator';

export class WebhookDto {
  @IsString()
  @IsOptional()
  MessageSid?: string;

  @IsString()
  @IsOptional()
  From?: string;

  @IsString()
  @IsOptional()
  To?: string;

  @IsString()
  @IsOptional()
  Body?: string;

  @IsString()
  @IsOptional()
  NumMedia?: string;

  @IsString()
  @IsOptional()
  MessageStatus?: string;
}
