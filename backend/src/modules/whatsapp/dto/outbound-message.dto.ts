import { IsNumber, IsOptional, IsPhoneNumber, IsString } from 'class-validator';

export class OutboundMessageDto {
  @IsPhoneNumber()
  to: string;

  @IsNumber()
  @IsOptional()
  senderId?: number; // Which sender this message is from

  @IsString()
  @IsOptional()
  businessPhone?: string; // Alternative: specify by phone number instead of ID

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
