/**
 * Thumbnail Module
 *
 * Provides thumbnail generation capabilities for media messages
 * via AWS Lambda (no local fallback).
 *
 * Architecture:
 * - ALL thumbnails generated via AWS Lambda
 * - PDFs supported via Chromium + pdf.js Lambda layer
 * - Safety mechanisms prevent infinite loops
 *
 * Features:
 * - Lambda thumbnail generation for images/videos/PDFs
 * - Blurhash generation for progressive loading
 * - WebSocket notifications when thumbnails are ready
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { S3Service } from '@shared/services/s3.service';
import { MediaCompressionModule } from '../media-compression/media-compression.module';
import { ThumbnailQueueService } from './thumbnail-queue.service';
import { ThumbnailController } from './thumbnail.controller';
import { ThumbnailService } from './thumbnail.service';

@Module({
  imports: [
    ConfigModule,
    // Import MediaCompressionModule for LambdaThumbnailService
    MediaCompressionModule,
  ],
  controllers: [ThumbnailController],
  providers: [S3Service, ThumbnailService, ThumbnailQueueService],
  exports: [ThumbnailService, ThumbnailQueueService],
})
export class ThumbnailModule {}
