/**
 * Media Message DTOs
 * Data Transfer Objects for media upload and message operations
 */

import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Request presigned URL for file upload
 */
export class RequestPresignedUrlDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName: string;

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  mimeType: string; // e.g., 'image/jpeg', 'video/mp4'

  @IsNumber()
  @Min(1)
  @Max(300 * 1024 * 1024) // 300MB max
  fileSize: number; // in bytes

  @IsOptional()
  @IsString()
  messageId?: string; // Optional: for attaching to existing message
}

/**
 * Presigned URL response
 */
export class PresignedUrlResponseDto {
  uploadId: string;
  url: string;
  expiresIn: number;
  s3Key: string;
  maxFileSize: number;
}

/**
 * Notify backend of completed upload
 */
export class UploadCompletedDto {
  @IsString()
  @IsUUID()
  uploadId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName: string;

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  mimeType: string;

  @IsNumber()
  @Min(1)
  fileSize: number;

  @IsString()
  @MinLength(1)
  s3Key: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  duration?: number; // Duration in seconds for audio/video
}

/**
 * Send message with attachments
 */
export class SendMessageWithAttachmentsDto {
  @IsString()
  @MinLength(1)
  to: string; // Recipient phone number

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  body?: string; // Optional text message

  @IsOptional()
  @IsNumber()
  senderId?: number; // Sender ID

  @IsArray()
  @IsUUID('4', { each: true })
  attachmentIds: string[]; // Array of upload IDs or S3 keys

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  caption?: string; // Caption for attachment (if single image/video)
}

/**
 * Retrieve attachment metadata
 */
export class GetAttachmentDto {
  @IsString()
  @MinLength(1)
  messageId: string;

  @IsOptional()
  @IsString()
  @IsUUID()
  attachmentId?: string; // Optional: get specific attachment, else all
}

/**
 * Delete attachment
 */
export class DeleteAttachmentDto {
  @IsString()
  @MinLength(1)
  messageId: string;

  @IsString()
  @IsUUID()
  attachmentId: string;
}

/**
 * Get download URL for attachment
 */
export class GetDownloadUrlDto {
  @IsString()
  @MinLength(1)
  messageId: string;

  @IsString()
  @IsUUID()
  attachmentId: string;

  @IsOptional()
  @IsNumber()
  @Min(300)
  @Max(3600)
  expiresIn?: number; // URL expiry in seconds (default: 1 hour)
}

/**
 * Download URL response
 */
export class DownloadUrlResponseDto {
  url: string;
  expiresIn: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
}
