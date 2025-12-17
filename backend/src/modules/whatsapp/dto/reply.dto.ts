import {
  IsArray,
  IsNumber,
  IsOptional,
  IsPhoneNumber,
  IsString,
} from 'class-validator';

/**
 * DTO for sending a reply message
 * Extends the standard message DTO with reply context
 */
export class SendReplyDto {
  @IsPhoneNumber()
  to: string;

  @IsNumber()
  @IsOptional()
  senderId?: number;

  @IsString()
  @IsOptional()
  businessPhone?: string;

  @IsString()
  @IsOptional()
  body?: string;

  @IsString()
  replyToMessageId: string; // Required: message ID to reply to

  @IsString()
  @IsOptional()
  mediaUrl?: string;

  @IsArray()
  @IsOptional()
  attachments?: Array<{
    id: string;
    type: string;
    fileName: string;
    mimeType: string;
    size: number;
    s3Key: string;
    thumbnailKey?: string;
    duration?: number;
    uploadedAt: string;
    status: string;
    errorMessage?: string;
  }>;
}

/**
 * Reply preview as stored in database
 */
export interface ReplyPreviewDto {
  messageId: string;
  senderType: 'customer' | 'agent';
  senderName: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'contacts';
  text?: string;
  media?: {
    url?: string;
    mimeType: string;
    thumbnailUrl?: string;
    fileName?: string;
  };
  unavailable?: boolean;
}
