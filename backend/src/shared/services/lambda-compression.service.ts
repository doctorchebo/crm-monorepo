/**
 * AWS Lambda Media Compression Service
 *
 * This service handles integration with the AWS Lambda-based media compression system.
 * It replaces the local BullMQ-based compression with serverless SQS+Lambda processing.
 *
 * Architecture:
 * 1. Backend sends compression job to SQS queue
 * 2. Lambda picks up job, downloads from S3, compresses with ffmpeg
 * 3. Lambda uploads compressed file to same bucket with different key
 * 4. Lambda calls webhook to notify backend of completion
 * 5. Backend updates database with compressed file info
 *
 * Benefits over local compression:
 * - No ffmpeg dependency on backend server
 * - Horizontal scaling via Lambda concurrency
 * - Better cost efficiency (pay per use)
 * - Faster processing (dedicated Lambda resources)
 */

import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

/**
 * Message format for compression jobs sent to SQS
 * This matches the Lambda's expected CompressionJobMessage type
 */
export interface CompressionJobMessage {
  jobId: string;
  inputBucket: string;
  inputKey: string;
  outputBucket: string;
  outputKey: string;
  mediaType: 'video' | 'image' | 'audio';
  targetMaxSizeMb: number;
  callback: {
    type: 'webhook';
    url: string;
  };
  // Additional metadata for the callback
  metadata?: {
    mediaId?: string;
    userId?: number;
    objectId?: string;
    originalFileName?: string;
  };
}

/**
 * Result from Lambda compression (received via webhook)
 */
export interface CompressionCallbackResult {
  success: boolean;
  jobId: string;
  error?: string;
  originalSizeBytes?: number;
  compressedSizeBytes?: number;
  compressionRatio?: number;
  processingTimeMs?: number;
  outputLocation?: {
    bucket: string;
    key: string;
  };
  originalDeleted?: boolean;
}

/**
 * Parameters for queueing a compression job
 */
export interface QueueCompressionParams {
  mediaId: string;
  s3Key: string;
  s3Bucket: string;
  fileSize: number;
  mimeType: string;
  fileName: string;
  userId: number;
  objectId: string;
  mediaType: 'video' | 'image' | 'audio';
}

/**
 * WhatsApp media size limits in bytes
 */
const WHATSAPP_SIZE_LIMITS = {
  video: 16 * 1024 * 1024, // 16MB
  image: 5 * 1024 * 1024, // 5MB
  audio: 16 * 1024 * 1024, // 16MB
};

@Injectable()
export class LambdaCompressionService implements OnModuleInit {
  private readonly logger = new Logger(LambdaCompressionService.name);
  private readonly sqsClient: SQSClient;
  private readonly queueUrl: string;
  private readonly webhookBaseUrl: string;
  private readonly bucketName: string;
  private isEnabled = false;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1');

    this.sqsClient = new SQSClient({ region });
    this.queueUrl = this.configService.get<string>(
      'MEDIA_COMPRESSION_QUEUE_URL',
      '',
    );
    this.webhookBaseUrl = this.configService.get<string>(
      'BACKEND_URL',
      'http://localhost:3001',
    );
    this.bucketName = this.configService.get<string>(
      'AWS_S3_BUCKET_NAME',
      'chatflowai-dev',
    );
  }

  async onModuleInit() {
    // Check if Lambda compression is configured
    if (!this.queueUrl) {
      this.isEnabled = false;
      return;
    }

    // Validate queue URL format
    if (
      !this.queueUrl.startsWith('https://sqs.') ||
      !this.queueUrl.includes('.amazonaws.com/')
    ) {
      this.logger.error(
        `Lambda compression is DISABLED - Invalid queue URL format`,
      );
      this.isEnabled = false;
      return;
    }

    this.isEnabled = true;
  }

  /**
   * Check if Lambda compression is enabled
   */
  isLambdaCompressionEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Check if a file needs compression based on its size and WhatsApp limits
   */
  needsCompression(
    mediaType: 'video' | 'image' | 'audio',
    fileSize: number,
  ): boolean {
    const limit = WHATSAPP_SIZE_LIMITS[mediaType];
    return fileSize > limit;
  }

  /**
   * Get the target file size for compression based on media type
   */
  getTargetSizeMb(mediaType: 'video' | 'image' | 'audio'): number {
    // Target slightly below limit to account for encoding variance
    const limits: Record<string, number> = {
      video: 15, // 15MB (below 16MB limit)
      image: 4.5, // 4.5MB (below 5MB limit)
      audio: 15, // 15MB (below 16MB limit)
    };
    return limits[mediaType] || 15;
  }

  /**
   * Generate the S3 key for the compressed version of a file
   *
   * Input: kb-media/{objectId}/{mediaId}/original.mp4
   * Output: kb-media/{objectId}/{mediaId}/compressed.mp4
   */
  generateCompressedKey(originalKey: string): string {
    // Replace 'original' with 'compressed' in the filename
    // e.g., /path/to/original.mp4 -> /path/to/compressed.mp4
    const parts = originalKey.split('/');
    const fileName = parts[parts.length - 1];
    const extension = fileName.split('.').pop() || '';
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');

    // If filename starts with 'original', replace it
    // Otherwise, just prepend 'compressed_'
    let newFileName: string;
    if (
      nameWithoutExt === 'original' ||
      nameWithoutExt.startsWith('original_')
    ) {
      newFileName = `compressed.${extension}`;
    } else {
      newFileName = `compressed_${nameWithoutExt}.${extension}`;
    }

    parts[parts.length - 1] = newFileName;
    return parts.join('/');
  }

  /**
   * Detect if the configured queue is a FIFO queue based on URL
   * FIFO queues have URLs ending in .fifo
   */
  private isFifoQueue(): boolean {
    return this.queueUrl.endsWith('.fifo');
  }

  /**
   * Queue a media file for compression via Lambda
   *
   * @returns Job ID if successfully queued, null if compression not needed or failed
   */
  async queueCompression(
    params: QueueCompressionParams,
  ): Promise<string | null> {
    // Check if Lambda compression is enabled
    if (!this.isEnabled) {
      this.logger.debug(
        `[Lambda Compression] Not enabled, skipping: ${params.fileName}`,
      );
      return null;
    }

    // Check if compression is needed
    if (!this.needsCompression(params.mediaType, params.fileSize)) {
      this.logger.debug(
        `[Lambda Compression] File ${params.fileName} (${(params.fileSize / 1024 / 1024).toFixed(2)}MB) ` +
          `is within WhatsApp limit for ${params.mediaType}, skipping compression`,
      );
      return null;
    }

    const jobId = uuidv4();
    const outputKey = this.generateCompressedKey(params.s3Key);

    const message: CompressionJobMessage = {
      jobId,
      inputBucket: params.s3Bucket,
      inputKey: params.s3Key,
      outputBucket: params.s3Bucket, // Same bucket
      outputKey,
      mediaType: params.mediaType,
      targetMaxSizeMb: this.getTargetSizeMb(params.mediaType),
      callback: {
        type: 'webhook',
        url: `${this.webhookBaseUrl}/api/v1/media/compression/callback`,
      },
      metadata: {
        mediaId: params.mediaId,
        userId: params.userId,
        objectId: params.objectId,
        originalFileName: params.fileName,
      },
    };

    try {
      // Build SQS command - only include FIFO-specific params for FIFO queues
      const commandInput: {
        QueueUrl: string;
        MessageBody: string;
        MessageGroupId?: string;
        MessageDeduplicationId?: string;
        MessageAttributes: Record<
          string,
          { DataType: string; StringValue: string }
        >;
      } = {
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          mediaType: {
            DataType: 'String',
            StringValue: params.mediaType,
          },
          mediaId: {
            DataType: 'String',
            StringValue: params.mediaId,
          },
          jobId: {
            DataType: 'String',
            StringValue: jobId,
          },
        },
      };

      // Only add FIFO-specific parameters for FIFO queues
      if (this.isFifoQueue()) {
        commandInput.MessageGroupId = params.objectId;
        commandInput.MessageDeduplicationId = jobId;
        this.logger.debug(
          `[Lambda Compression] Using FIFO queue with MessageGroupId: ${params.objectId}`,
        );
      }

      const command = new SendMessageCommand(commandInput);
      const result = await this.sqsClient.send(command);

      this.logger.log(
        `[Lambda Compression] Queued job ${jobId} for ${params.fileName} ` +
          `(${(params.fileSize / 1024 / 1024).toFixed(2)}MB -> target ${this.getTargetSizeMb(params.mediaType)}MB) ` +
          `[MessageId: ${result.MessageId}]`,
      );

      return jobId;
    } catch (error) {
      // Log error but return null to allow fallback to local compression
      this.logger.error(
        `[Lambda Compression] Failed to queue job for ${params.fileName}: ${error.message}`,
        error.stack,
      );
      // Return null instead of throwing to allow graceful fallback
      return null;
    }
  }
}
