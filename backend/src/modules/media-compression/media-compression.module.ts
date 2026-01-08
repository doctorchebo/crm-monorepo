/**
 * Media Compression Module
 *
 * This module provides media compression functionality using AWS Lambda.
 * It replaces/supplements the local BullMQ-based compression with serverless processing.
 *
 * Features:
 * - Queue compression jobs to SQS for Lambda processing
 * - Handle webhook callbacks when compression completes
 * - Automatic fallback to local compression when Lambda is not configured
 *
 * Configuration (environment variables):
 * - MEDIA_COMPRESSION_QUEUE_URL: SQS queue URL for compression jobs
 * - BACKEND_URL: Base URL for webhook callbacks (e.g., https://api.example.com)
 * - AWS_S3_BUCKET_NAME: S3 bucket for media storage
 * - AWS_REGION: AWS region
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LambdaCompressionService } from '@shared/services/lambda-compression.service';
import { CompressionCallbackController } from './compression-callback.controller';

@Module({
  imports: [ConfigModule],
  controllers: [CompressionCallbackController],
  providers: [LambdaCompressionService],
  exports: [LambdaCompressionService],
})
export class MediaCompressionModule {}
