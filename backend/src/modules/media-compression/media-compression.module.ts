/**
 * Media Processing Module (Compression & Thumbnails)
 *
 * This module provides media processing functionality using AWS Lambda:
 * - Video/image/audio compression for WhatsApp compatibility
 * - Thumbnail generation for images and videos
 *
 * Both features use the same SQS queue and Lambda function for simplicity.
 *
 * Features:
 * - Queue compression jobs to SQS for Lambda processing
 * - Queue thumbnail jobs to SQS for Lambda processing
 * - Handle webhook callbacks when processing completes
 * - Automatic fallback to local processing when Lambda is not configured
 *
 * Configuration (environment variables):
 * - MEDIA_COMPRESSION_QUEUE_URL: SQS queue URL for compression/thumbnail jobs
 * - BACKEND_URL: Base URL for webhook callbacks (e.g., https://api.example.com)
 * - AWS_S3_BUCKET_NAME: S3 bucket for media storage
 * - AWS_REGION: AWS region
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LambdaCompressionService } from '@shared/services/lambda-compression.service';
import { LambdaThumbnailService } from '@shared/services/lambda-thumbnail.service';
import { S3Service } from '@shared/services/s3.service';
import { CompressionCallbackController } from './compression-callback.controller';
import { ThumbnailCallbackController } from './thumbnail-callback.controller';

@Module({
  imports: [ConfigModule],
  controllers: [CompressionCallbackController, ThumbnailCallbackController],
  providers: [LambdaCompressionService, LambdaThumbnailService, S3Service],
  exports: [LambdaCompressionService, LambdaThumbnailService],
})
export class MediaCompressionModule {}
