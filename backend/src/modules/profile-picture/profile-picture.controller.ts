/**
 * Profile Picture Controller
 *
 * REST API endpoints for profile picture operations:
 * - POST /api/v1/profile-picture/upload-url - Get presigned upload URL
 * - POST /api/v1/profile-picture/confirm-upload - Confirm upload and start thumbnail generation
 * - GET /api/v1/profile-picture - Get profile picture info with URLs
 * - DELETE /api/v1/profile-picture - Delete profile picture
 * - POST /api/v1/profile-picture/thumbnail/callback - Lambda callback (no auth)
 */

import { JwtAuthGuard } from '@modules/auth/auth.guard';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtPayload } from '@shared/types';
import {
  ProfilePictureInfoDto,
  RequestUploadUrlDto,
  ThumbnailCallbackDto,
  UploadUrlResponseDto,
} from './dto';
import { ProfilePictureService } from './profile-picture.service';

@Controller('api/v1/profile-picture')
export class ProfilePictureController {
  private readonly logger = new Logger(ProfilePictureController.name);

  constructor(private readonly profilePictureService: ProfilePictureService) {}

  /**
   * Upload profile picture directly through backend (CORS-free)
   * POST /api/v1/profile-picture/upload
   */
  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  )
  async uploadFile(
    @UploadedFile() file: any,
    @Req() req: any,
  ): Promise<{ jobId: string | null; status: string; s3Key: string }> {
    const user = req.user as JwtPayload;

    if (!file) {
      throw new BadRequestException('No file provided');
    }

    this.logger.log(
      `Profile picture upload started for user ${user.userId}: ${file.originalname} (${file.size} bytes)`,
    );

    const result = await this.profilePictureService.proxyUpload(
      user.userId,
      file,
    );

    this.logger.log(
      `Profile picture upload completed for user ${user.userId}: ${result.s3Key}`,
    );

    return result;
  }

  /**
   * Get presigned URL for uploading profile picture
   * POST /api/v1/profile-picture/upload-url
   */
  @Post('upload-url')
  @UseGuards(JwtAuthGuard)
  async getUploadUrl(
    @Req() req: any,
    @Body() dto: RequestUploadUrlDto,
  ): Promise<UploadUrlResponseDto> {
    const user = req.user as JwtPayload;
    return this.profilePictureService.generateUploadUrl(
      user.userId,
      dto.fileName,
      dto.contentType,
      dto.fileSize,
    );
  }

  /**
   * Confirm upload completion and start thumbnail generation
   * POST /api/v1/profile-picture/confirm-upload
   */
  @Post('confirm-upload')
  @UseGuards(JwtAuthGuard)
  async confirmUpload(
    @Req() req: any,
    @Body() body: { s3Key: string; contentType: string },
  ): Promise<{ jobId: string | null; status: string }> {
    const user = req.user as JwtPayload;
    return this.profilePictureService.confirmUpload(
      user.userId,
      body.s3Key,
      body.contentType,
    );
  }

  /**
   * Get current user's profile picture info
   * GET /api/v1/profile-picture
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async getProfilePicture(@Req() req: any): Promise<ProfilePictureInfoDto> {
    const user = req.user as JwtPayload;
    return this.profilePictureService.getProfilePictureInfo(user.userId);
  }

  /**
   * Delete current user's profile picture
   * DELETE /api/v1/profile-picture
   */
  @Delete()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async deleteProfilePicture(
    @Req() req: any,
  ): Promise<{ success: boolean; message: string }> {
    const user = req.user as JwtPayload;
    return this.profilePictureService.deleteProfilePicture(user.userId);
  }

  /**
   * Lambda thumbnail callback endpoint
   * POST /api/v1/profile-picture/thumbnail/callback
   *
   * NOTE: No authentication - Lambda calls this endpoint directly
   * Security is maintained through:
   * - SQS queue access controls
   * - Callback URL only known to Lambda
   * - Job ID verification could be added for additional security
   */
  @Post('thumbnail/callback')
  @HttpCode(HttpStatus.OK)
  async handleThumbnailCallback(
    @Body() callback: ThumbnailCallbackDto,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(
      `Received profile picture thumbnail callback: ${JSON.stringify({
        jobId: callback.jobId,
        success: callback.success,
        userId: callback.entityIds?.userId,
        thumbnailKey: callback.thumbnailKey,
      })}`,
    );

    return this.profilePictureService.handleThumbnailCallback(callback);
  }
}
