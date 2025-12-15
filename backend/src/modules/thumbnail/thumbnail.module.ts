/**
 * Thumbnail Module
 * Provides thumbnail generation capabilities for media messages
 *
 * Features:
 * - Async thumbnail generation via BullMQ
 * - Image thumbnail generation (Sharp)
 * - Video thumbnail extraction (FFmpeg)
 * - Blurhash generation for progressive loading
 * - WebSocket notifications when thumbnails are ready
 */

import { getBullMQConnection } from '@config/redis.config';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { S3Service } from '@shared/services/s3.service';
import { ThumbnailProcessorService } from './thumbnail-processor.service';
import { ThumbnailQueueService } from './thumbnail-queue.service';
import { ThumbnailWorkerProcessor } from './thumbnail-worker.processor';
import { ThumbnailController } from './thumbnail.controller';
import { ThumbnailService } from './thumbnail.service';
import { THUMBNAIL_QUEUE_NAME } from './thumbnail.types';

@Module({
  imports: [
    ConfigModule,
    // Register BullMQ queue for thumbnail generation
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        connection: getBullMQConnection(),
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: false,
        },
      }),
      inject: [ConfigService],
    }),
    // Register the thumbnail queue
    BullModule.registerQueue({
      name: THUMBNAIL_QUEUE_NAME,
    }),
  ],
  controllers: [ThumbnailController],
  providers: [
    S3Service,
    ThumbnailService,
    ThumbnailProcessorService,
    ThumbnailQueueService,
    ThumbnailWorkerProcessor,
  ],
  exports: [ThumbnailService, ThumbnailQueueService, ThumbnailProcessorService],
})
export class ThumbnailModule {}
