/**
 * Profile Picture Service
 *
 * Handles business logic for profile picture management:
 * - Generate presigned upload URLs
 * - Queue thumbnail generation via Lambda
 * - Handle thumbnail callback
 * - Manage profile picture lifecycle
 * - Delete old pictures from S3
 */

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { db } from '@database/db.connection';
import { users } from '@database/schema';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LambdaThumbnailService } from '@shared/services/lambda-thumbnail.service';
import { eq } from 'drizzle-orm';
import {
  ProfilePictureInfoDto,
  ThumbnailCallbackDto,
  UploadUrlResponseDto,
} from './dto';

/**
 * Maximum file size for profile pictures (5MB)
 * Users should crop images client-side before upload
 */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Allowed MIME types for profile pictures
 */
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

@Injectable()
export class ProfilePictureService {
  private readonly logger = new Logger(ProfilePictureService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly presignedUrlExpiry: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly lambdaThumbnailService: LambdaThumbnailService,
  ) {
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1');
    this.bucketName = this.configService.get<string>(
      'AWS_S3_BUCKET_NAME',
      'chatflowai-dev',
    );
    this.presignedUrlExpiry = this.configService.get<number>(
      'AWS_PRESIGNED_URL_EXPIRY_SECONDS',
      300,
    );

    this.s3Client = new S3Client({ region });

    this.logger.log(
      `ProfilePictureService initialized - Bucket: ${this.bucketName}`,
    );
  }

  /**
   * Validate file upload parameters
   */
  private validateUpload(contentType: string, fileSize?: number): void {
    if (!ALLOWED_MIME_TYPES.includes(contentType)) {
      throw new Error(
        `Invalid content type: ${contentType}. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    if (fileSize && fileSize > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `File too large: ${fileSize} bytes. Maximum allowed: ${MAX_FILE_SIZE_BYTES} bytes (${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB)`,
      );
    }
  }

  /**
   * Generate S3 key for profile picture
   * Format: profile-pictures/{userId}/original.{ext}
   */
  private generateS3Key(userId: number, fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase() || 'jpg';
    return `profile-pictures/${userId}/original.${extension}`;
  }

  /**
   * Generate S3 key for profile picture thumbnail
   * Format: profile-pictures/{userId}/thumb.jpg
   */
  private generateThumbnailS3Key(userId: number): string {
    return `profile-pictures/${userId}/thumb.jpg`;
  }

  /**
   * Generate a presigned URL for uploading profile picture
   */
  async generateUploadUrl(
    userId: number,
    fileName: string,
    contentType: string,
    fileSize?: number,
  ): Promise<UploadUrlResponseDto> {
    // Validate upload parameters
    this.validateUpload(contentType, fileSize);

    const s3Key = this.generateS3Key(userId, fileName);
    const expiresIn = this.presignedUrlExpiry;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
      Metadata: {
        userId: userId.toString(),
        originalFileName: fileName,
        uploadedAt: new Date().toISOString(),
      },
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn,
    });

    // Update user status to 'uploading'
    await db
      .update(users)
      .set({
        profilePictureStatus: 'uploading',
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    this.logger.log(
      `Generated presigned upload URL for user ${userId}: ${s3Key}`,
    );

    return {
      uploadUrl,
      s3Key,
      expiresIn,
    };
  }

  /**
   * Confirm upload completion and queue thumbnail generation
   * Called by frontend after successful S3 upload
   */
  async confirmUpload(
    userId: number,
    s3Key: string,
    contentType: string,
  ): Promise<{ jobId: string | null; status: string }> {
    // Get current user to check for existing profile picture
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Delete old profile picture and thumbnail if exists
    // IMPORTANT: Only delete if the old key is DIFFERENT from the new one
    // Otherwise we'd delete the file we just uploaded!
    if (user.profilePictureKey && user.profilePictureKey !== s3Key) {
      await this.deleteS3Object(user.profilePictureKey);
    }
    if (user.profilePictureThumbnailKey) {
      await this.deleteS3Object(user.profilePictureThumbnailKey);
    }

    // Update user with new profile picture key and set status to processing
    const thumbnailS3Key = this.generateThumbnailS3Key(userId);
    await db
      .update(users)
      .set({
        profilePictureKey: s3Key,
        profilePictureThumbnailKey: null, // Will be set by Lambda callback
        profilePictureStatus: 'processing',
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Queue thumbnail generation via Lambda
    const jobId =
      await this.lambdaThumbnailService.queueProfilePictureThumbnail({
        userId,
        s3Key,
        mimeType: contentType,
        thumbnailS3Key,
      });

    if (!jobId) {
      // Lambda queuing failed - mark as error
      await db
        .update(users)
        .set({
          profilePictureStatus: 'error',
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      this.logger.error(
        `Failed to queue thumbnail generation for user ${userId}`,
      );
      return { jobId: null, status: 'error' };
    }

    this.logger.log(
      `Queued thumbnail generation for user ${userId}, jobId: ${jobId}`,
    );

    return { jobId, status: 'processing' };
  }

  /**
   * Handle thumbnail callback from Lambda
   */
  async handleThumbnailCallback(
    callback: ThumbnailCallbackDto,
  ): Promise<{ success: boolean; message: string }> {
    const userId = callback.entityIds?.userId;
    if (!userId) {
      this.logger.error('Thumbnail callback missing userId');
      return { success: false, message: 'Missing userId in callback' };
    }

    const userIdNum = parseInt(userId, 10);

    if (callback.success && callback.thumbnailKey) {
      // Update user with thumbnail info
      await db
        .update(users)
        .set({
          profilePictureThumbnailKey: callback.thumbnailKey,
          profilePictureStatus: 'ready',
          updatedAt: new Date(),
        })
        .where(eq(users.id, userIdNum));

      this.logger.log(
        `Profile picture thumbnail ready for user ${userId}: ${callback.thumbnailKey}`,
      );

      return { success: true, message: 'Profile picture thumbnail updated' };
    } else {
      // Mark as error
      await db
        .update(users)
        .set({
          profilePictureStatus: 'error',
          updatedAt: new Date(),
        })
        .where(eq(users.id, userIdNum));

      this.logger.error(
        `Profile picture thumbnail generation failed for user ${userId}: ${callback.error}`,
      );

      return {
        success: false,
        message: callback.error || 'Thumbnail generation failed',
      };
    }
  }

  /**
   * Get profile picture info with presigned URLs
   *
   * Includes stale status recovery: if status is "processing" or "uploading"
   * for more than 5 minutes, auto-reset to appropriate status.
   */
  async getProfilePictureInfo(userId: number): Promise<ProfilePictureInfoDto> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    let status =
      (user.profilePictureStatus as ProfilePictureInfoDto['status']) || 'none';

    // Stale status recovery: if processing/uploading for more than 5 minutes, auto-recover
    const STALE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    if ((status === 'processing' || status === 'uploading') && user.updatedAt) {
      const timeSinceUpdate = Date.now() - new Date(user.updatedAt).getTime();
      if (timeSinceUpdate > STALE_TIMEOUT_MS) {
        // Status is stale - auto-recover
        const newStatus = user.profilePictureKey ? 'error' : 'none';
        this.logger.warn(
          `Stale profile picture status detected for user ${userId}: ${status} -> ${newStatus} (stale for ${Math.round(timeSinceUpdate / 1000)}s)`,
        );

        // Update database to reflect recovered status
        await db
          .update(users)
          .set({
            profilePictureStatus: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));

        status = newStatus;
      }
    }

    if (status === 'none' || !user.profilePictureKey) {
      return {
        hasProfilePicture: false,
        status: 'none',
      };
    }

    const expiresIn = 3600; // 1 hour

    // Generate presigned download URLs
    let thumbnailUrl: string | undefined;
    let originalUrl: string | undefined;

    if (user.profilePictureThumbnailKey && status === 'ready') {
      thumbnailUrl = await this.generateDownloadUrl(
        user.profilePictureThumbnailKey,
        expiresIn,
      );
    }

    if (user.profilePictureKey) {
      originalUrl = await this.generateDownloadUrl(
        user.profilePictureKey,
        expiresIn,
      );
    }

    return {
      hasProfilePicture: true,
      status,
      thumbnailUrl,
      originalUrl,
      expiresIn,
    };
  }

  /**
   * Delete user's profile picture
   */
  async deleteProfilePicture(
    userId: number,
  ): Promise<{ success: boolean; message: string }> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Delete S3 objects
    if (user.profilePictureKey) {
      await this.deleteS3Object(user.profilePictureKey);
    }
    if (user.profilePictureThumbnailKey) {
      await this.deleteS3Object(user.profilePictureThumbnailKey);
    }

    // Update user record
    await db
      .update(users)
      .set({
        profilePictureKey: null,
        profilePictureThumbnailKey: null,
        profilePictureStatus: 'none',
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    this.logger.log(`Deleted profile picture for user ${userId}`);

    return { success: true, message: 'Profile picture deleted' };
  }

  /**
   * Generate presigned download URL
   */
  private async generateDownloadUrl(
    s3Key: string,
    expiresIn: number,
  ): Promise<string> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Upload profile picture directly through the backend (bypasses S3 CORS issues)
   *
   * Handles the complete upload flow:
   * 1. Validates file parameters
   * 2. Uploads file buffer directly to S3
   * 3. Updates user record
   * 4. Queues thumbnail generation
   */
  async proxyUpload(
    userId: number,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ): Promise<{ jobId: string | null; status: string; s3Key: string }> {
    // Validate upload parameters
    this.validateUpload(file.mimetype, file.size);

    const s3Key = this.generateS3Key(userId, file.originalname);

    this.logger.log(
      `[proxyUpload] Starting S3 upload for user ${userId}: bucket=${this.bucketName}, key=${s3Key}, size=${file.size}, type=${file.mimetype}`,
    );

    // Upload file directly to S3
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ServerSideEncryption: 'AES256',
      Metadata: {
        userId: userId.toString(),
        originalFileName: file.originalname,
        uploadedAt: new Date().toISOString(),
      },
    });

    try {
      const s3Response = await this.s3Client.send(command);
      this.logger.log(
        `[proxyUpload] S3 upload SUCCESS for user ${userId}: ${s3Key}, ETag=${s3Response.ETag}, VersionId=${s3Response.VersionId}`,
      );
    } catch (s3Error: any) {
      this.logger.error(
        `[proxyUpload] S3 upload FAILED for user ${userId}: ${s3Key}`,
        {
          errorName: s3Error.name,
          errorMessage: s3Error.message,
          errorCode: s3Error.Code || s3Error.$metadata?.httpStatusCode,
          bucket: this.bucketName,
          key: s3Key,
          stack: s3Error.stack,
        },
      );
      throw new Error(
        `Failed to upload profile picture to S3: ${s3Error.message}`,
      );
    }

    // Update user status to 'uploading'
    await db
      .update(users)
      .set({
        profilePictureStatus: 'uploading',
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Continue with normal processing
    const result = await this.confirmUpload(userId, s3Key, file.mimetype);

    this.logger.log(
      `[proxyUpload] Complete for user ${userId}: ${s3Key}, jobId=${result.jobId}, status=${result.status}`,
    );

    return {
      ...result,
      s3Key,
    };
  }

  /**
   * Delete S3 object
   */
  private async deleteS3Object(s3Key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      await this.s3Client.send(command);
      this.logger.log(`Deleted S3 object: ${s3Key}`);
    } catch (error) {
      this.logger.warn(`Failed to delete S3 object ${s3Key}: ${error.message}`);
      // Don't throw - deletion failure shouldn't block the operation
    }
  }
}
