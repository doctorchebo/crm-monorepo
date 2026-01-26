/**
 * Profile Picture DTOs
 *
 * Data Transfer Objects for profile picture operations.
 */

import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * DTO for requesting a presigned upload URL for profile picture
 */
export class RequestUploadUrlDto {
  @IsString()
  fileName: string;

  @IsString()
  contentType: string;

  @IsNumber()
  @IsOptional()
  fileSize?: number;
}

/**
 * Response DTO for presigned upload URL
 */
export interface UploadUrlResponseDto {
  uploadUrl: string;
  s3Key: string;
  expiresIn: number;
}

/**
 * DTO for profile picture thumbnail callback from Lambda
 */
export class ThumbnailCallbackDto {
  @IsBoolean()
  success: boolean;

  @IsString()
  jobId: string;

  @IsString()
  jobType: 'thumbnail';

  @IsString()
  @IsOptional()
  error?: string;

  @IsString()
  @IsOptional()
  thumbnailKey?: string;

  @IsNumber()
  @IsOptional()
  width?: number;

  @IsNumber()
  @IsOptional()
  height?: number;

  @IsString()
  @IsOptional()
  blurhash?: string;

  @IsNumber()
  @IsOptional()
  processingTimeMs?: number;

  @IsObject()
  @IsOptional()
  outputLocation?: {
    bucket: string;
    key: string;
  };

  @IsString()
  @IsOptional()
  context?: 'profile-picture';

  @IsObject()
  @IsOptional()
  entityIds?: {
    userId?: string;
  };
}

/**
 * Response DTO for profile picture info
 */
export interface ProfilePictureInfoDto {
  hasProfilePicture: boolean;
  status: 'none' | 'uploading' | 'processing' | 'ready' | 'error';
  thumbnailUrl?: string;
  originalUrl?: string;
  expiresIn?: number;
}
