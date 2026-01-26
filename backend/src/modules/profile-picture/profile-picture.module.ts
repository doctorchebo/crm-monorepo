/**
 * Profile Picture Module
 *
 * Handles user profile picture upload, thumbnail generation, and management.
 * Uses AWS Lambda for async thumbnail generation via SQS queue.
 *
 * Features:
 * - Presigned URL upload to S3
 * - Async thumbnail generation (200x200) via Lambda
 * - Webhook callback to update user profile
 * - Delete old pictures when updating/removing
 * - Get presigned URLs for displaying profile pictures
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MediaCompressionModule } from '../media-compression/media-compression.module';
import { ProfilePictureController } from './profile-picture.controller';
import { ProfilePictureService } from './profile-picture.service';

@Module({
  imports: [ConfigModule, MediaCompressionModule],
  controllers: [ProfilePictureController],
  providers: [ProfilePictureService],
  exports: [ProfilePictureService],
})
export class ProfilePictureModule {}
