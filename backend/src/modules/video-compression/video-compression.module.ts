/**
 * Video Compression Module
 *
 * Provides video compression capabilities for knowledge base media.
 * Uses FFmpeg for compression and BullMQ for async job processing.
 *
 * Features:
 * - Async video compression via BullMQ queue
 * - Multiple compression presets (fast, balanced, quality)
 * - WebSocket notifications for real-time progress updates
 * - Automatic preset selection based on file size
 * - Auto re-indexing after compression completes
 *
 * Integration:
 * - Import this module in AppModule or KnowledgeBaseModule
 * - Use CompressionQueueService to queue compression jobs
 * - Listen to WebSocket events for progress updates
 */

import { getBullMQConnection } from '@config/redis.config';
import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { S3Service } from '@shared/services/s3.service';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { CompressionQueueService } from './compression-queue.service';
import { CompressionWorkerProcessor } from './compression-worker.processor';
import { VideoCompressionService } from './video-compression.service';
import { VIDEO_COMPRESSION_QUEUE_NAME } from './video-compression.types';

@Module({
  imports: [
    ConfigModule,
    // Use forwardRef to handle circular dependency with KnowledgeBaseModule
    forwardRef(() => KnowledgeBaseModule),
    // Register BullMQ queue for video compression
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
    // Register the compression queue
    BullModule.registerQueue({
      name: VIDEO_COMPRESSION_QUEUE_NAME,
    }),
  ],
  providers: [
    S3Service,
    VideoCompressionService,
    CompressionQueueService,
    CompressionWorkerProcessor,
  ],
  exports: [VideoCompressionService, CompressionQueueService],
})
export class VideoCompressionModule {}
