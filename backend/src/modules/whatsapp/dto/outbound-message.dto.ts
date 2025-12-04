import { IsOptional, IsPhoneNumber, IsString } from 'class-validator';

export class OutboundMessageDto {
  @IsPhoneNumber()
  to: string;

  @IsString()
  @IsOptional()
  body?: string;

  @IsString()
  @IsOptional()
  contentSid?: string;

  @IsString()
  @IsOptional()
  contentVariables?: string;

  @IsString()
  @IsOptional()
  mediaUrl?: string;
}
