/**
 * AWS Lambda Thumbnail Service
 *
 * This service handles integration with the AWS Lambda-based thumbnail generation system.
 * It offloads thumbnail generation from the backend server to Lambda for better scalability.
 *
 * Architecture:
 * 1. Backend sends thumbnail job to SQS queue (same queue as compression)
 * 2. Lambda picks up job, downloads from S3, generates thumbnail with ffmpeg
 * 3. Lambda uploads thumbnail to same bucket with _thumb suffix
 * 4. Lambda calls webhook to notify backend of completion
 * 5. Backend updates database with thumbnail info
 *
 * Benefits:
 * - No sharp/ffmpeg dependency on backend server
 * - Horizontal scaling via Lambda concurrency
 * - Faster response times (non-blocking thumbnail generation)
 * - Better UX (file upload completes without waiting for thumbnail)
 */

import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

/**
 * Message format for thumbnail jobs sent to SQS
 * This matches the Lambda's expected ThumbnailJobMessage type
 */
export interface ThumbnailJobMessage {
  jobType: 'thumbnail';
  jobId: string;
  inputBucket: string;
  inputKey: string;
  outputBucket: string;
  outputKey?: string; // Optional - auto-generated if not provided
  mimeType: string;
  context:
    | 'kb-media'
    | 'message-attachment'
    | 'profile-picture'
    | 'template-media';
  entityIds?: {
    mediaId?: string;
    attachmentId?: string;
    messageId?: string;
    chatId?: string;
    userId?: string;
    localeId?: string;
    originalS3Key?: string; // For template-media: original file to delete after thumbnail
  };
  callback: {
    type: 'webhook';
    url: string;
  };
  /** Safety config for preventing infinite loops and runaway costs */
  safety?: JobSafetyConfig;
}

/**
 * Result from Lambda thumbnail generation (received via webhook)
 */
export interface ThumbnailCallbackResult {
  success: boolean;
  jobId: string;
  jobType: 'thumbnail';
  error?: string;
  thumbnailKey?: string;
  width?: number;
  height?: number;
  blurhash?: string;
  duration?: number;
  processingTimeMs?: number;
  outputLocation?: {
    bucket: string;
    key: string;
  };
  context?:
    | 'kb-media'
    | 'message-attachment'
    | 'profile-picture'
    | 'template-media';
  entityIds?: {
    mediaId?: string;
    attachmentId?: string;
    messageId?: string;
    chatId?: string;
    userId?: string;
    localeId?: string;
    originalS3Key?: string;
  };
}

/**
 * Parameters for queueing a KB media thumbnail job
 */
export interface QueueKbThumbnailParams {
  mediaId: string;
  s3Key: string;
  mimeType: string;
  /** Target S3 key for thumbnail (optional - auto-generated if not provided) */
  thumbnailS3Key?: string;
  /** S3 bucket (optional - uses default if not provided) */
  s3Bucket?: string;
  /** User ID (optional - for logging) */
  userId?: number;
  /** Object ID (optional - used as FIFO group ID) */
  objectId?: string;
}

/**
 * Parameters for queueing a message attachment thumbnail job
 */
export interface QueueMessageThumbnailParams {
  messageId: string;
  attachmentId: string;
  s3Key: string;
  mimeType: string;
  /** Target S3 key for thumbnail (optional - auto-generated if not provided) */
  thumbnailS3Key?: string;
  /** Chat ID (optional - used as FIFO group ID) */
  chatId?: string;
  /** S3 bucket (optional - uses default if not provided) */
  s3Bucket?: string;
}

/**
 * Parameters for queueing a profile picture thumbnail job
 */
export interface QueueProfilePictureThumbnailParams {
  userId: number;
  s3Key: string;
  mimeType: string;
  /** Target S3 key for thumbnail (optional - auto-generated if not provided) */
  thumbnailS3Key?: string;
  /** S3 bucket (optional - uses default if not provided) */
  s3Bucket?: string;
}

/**
 * Parameters for queueing a template media thumbnail job
 */
export interface QueueTemplateMediaThumbnailParams {
  /** Template media record ID */
  mediaId: string;
  /** Locale ID for the template */
  localeId: string;
  /** S3 key of the original file (to be deleted after thumbnail generation) */
  s3Key: string;
  /** MIME type of the original file */
  mimeType: string;
  /** Target S3 key for thumbnail (optional - auto-generated if not provided) */
  thumbnailS3Key?: string;
  /** S3 bucket (optional - uses default if not provided) */
  s3Bucket?: string;
  /** Temporary ID for WebSocket event matching (frontend uses this to update UI) */
  tempId?: string;
}

/**
 * Safety configuration for Lambda jobs to prevent infinite loops
 */
interface JobSafetyConfig {
  attempt: number;
  maxAttempts: number;
  createdAt: string;
  maxAgeMs: number;
}

/**
 * Default safety limits - CRITICAL for preventing exorbitant AWS bills
 */
const SAFETY_LIMITS = {
  /** Maximum retry attempts before permanent failure */
  maxAttempts: 3,
  /** Maximum job age before considered stale (1 hour) */
  maxAgeMs: 60 * 60 * 1000,
} as const;

/**
 * MIME types that support thumbnail generation in Lambda
 * Now includes PDFs via Chromium + pdf.js Lambda layer
 */
const THUMBNAIL_SUPPORTED_TYPES: Record<string, boolean> = {
  // Images
  'image/jpeg': true,
  'image/png': true,
  'image/gif': true,
  'image/webp': true,
  'image/bmp': true,
  'image/heic': true,
  'image/heif': true,
  // Videos
  'video/mp4': true,
  'video/quicktime': true,
  'video/webm': true,
  'video/3gpp': true,
  'video/x-msvideo': true,
  'video/x-matroska': true,
  // Documents - PDFs supported via Ghostscript
  'application/pdf': true,
};

@Injectable()
export class LambdaThumbnailService implements OnModuleInit {
  private readonly logger = new Logger(LambdaThumbnailService.name);
  private readonly sqsClient: SQSClient;
  private readonly queueUrl: string;
  private readonly webhookBaseUrl: string;
  private readonly bucketName: string;
  private isEnabled = false;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1');

    this.sqsClient = new SQSClient({ region });
    // Use same queue as compression - Lambda handles both job types
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
    // Check if Lambda thumbnail is configured (uses same queue as compression)
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
        `Lambda thumbnails are DISABLED - Invalid queue URL format`,
      );
      this.isEnabled = false;
      return;
    }

    this.isEnabled = true;
  }

  /**
   * Check if Lambda thumbnail generation is enabled
   */
  isLambdaThumbnailEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Check if a MIME type supports thumbnail generation
   */
  supportsThumbnail(mimeType: string): boolean {
    return !!THUMBNAIL_SUPPORTED_TYPES[mimeType];
  }

  /**
   * Check if a MIME type should use Lambda for thumbnail
   * ALL supported types now go through Lambda (no local fallback)
   */
  shouldUseLambda(mimeType: string): boolean {
    if (!this.isEnabled) return false;
    return this.supportsThumbnail(mimeType);
  }

  /**
   * Create safety configuration for a new job
   * This is CRITICAL for preventing infinite loops and runaway costs
   */
  private createSafetyConfig(): JobSafetyConfig {
    return {
      attempt: 1,
      maxAttempts: SAFETY_LIMITS.maxAttempts,
      createdAt: new Date().toISOString(),
      maxAgeMs: SAFETY_LIMITS.maxAgeMs,
    };
  }

  /**
   * Generate the S3 key for the thumbnail version of a file
   *
   * Input: kb-media/{objectId}/{mediaId}/original.mp4
   * Output: kb-media/{objectId}/{mediaId}/original_thumb.jpg
   */
  generateThumbnailKey(originalKey: string): string {
    const parts = originalKey.split('/');
    const fileName = parts[parts.length - 1];
    const extension = fileName.split('.').pop() || '';
    const nameWithoutExt = fileName.slice(
      0,
      -(extension.length + 1) || undefined,
    );

    // Add _thumb suffix and change extension to jpg
    const thumbnailFileName = `${nameWithoutExt}_thumb.jpg`;
    parts[parts.length - 1] = thumbnailFileName;
    return parts.join('/');
  }

  /**
   * Detect if the configured queue is a FIFO queue based on URL
   */
  private isFifoQueue(): boolean {
    return this.queueUrl.endsWith('.fifo');
  }

  /**
   * Queue a KB media file for thumbnail generation via Lambda
   *
   * @returns Job ID if successfully queued, null if not supported or failed
   */
  async queueKbMediaThumbnail(
    params: QueueKbThumbnailParams,
  ): Promise<string | null> {
    if (!this.shouldUseLambda(params.mimeType)) {
      this.logger.warn(
        `[Lambda Thumbnail] Type ${params.mimeType} not supported - thumbnail will NOT be generated`,
      );
      return null;
    }

    const jobId = uuidv4();
    const bucket = params.s3Bucket || this.bucketName;
    const outputKey =
      params.thumbnailS3Key || this.generateThumbnailKey(params.s3Key);

    const message: ThumbnailJobMessage = {
      jobType: 'thumbnail',
      jobId,
      inputBucket: bucket,
      inputKey: params.s3Key,
      outputBucket: bucket,
      outputKey,
      mimeType: params.mimeType,
      context: 'kb-media',
      entityIds: {
        mediaId: params.mediaId,
      },
      callback: {
        type: 'webhook',
        url: `${this.webhookBaseUrl}/api/v1/media/thumbnail/callback`,
      },
      // CRITICAL: Safety config prevents infinite loops and runaway costs
      safety: this.createSafetyConfig(),
    };

    return this.sendToQueue(
      message,
      params.objectId || params.mediaId,
      jobId,
      'kb-media',
    );
  }

  /**
   * Queue a message attachment for thumbnail generation via Lambda
   *
   * @returns Job ID if successfully queued, null if not supported or failed
   */
  async queueMessageThumbnail(
    params: QueueMessageThumbnailParams,
  ): Promise<string | null> {
    if (!this.shouldUseLambda(params.mimeType)) {
      this.logger.warn(
        `[Lambda Thumbnail] Type ${params.mimeType} not supported - thumbnail will NOT be generated`,
      );
      return null;
    }

    const jobId = uuidv4();
    const bucket = params.s3Bucket || this.bucketName;
    const outputKey =
      params.thumbnailS3Key || this.generateThumbnailKey(params.s3Key);

    const message: ThumbnailJobMessage = {
      jobType: 'thumbnail',
      jobId,
      inputBucket: bucket,
      inputKey: params.s3Key,
      outputBucket: bucket,
      outputKey,
      mimeType: params.mimeType,
      context: 'message-attachment',
      entityIds: {
        messageId: params.messageId,
        attachmentId: params.attachmentId,
        chatId: params.chatId,
      },
      callback: {
        type: 'webhook',
        url: `${this.webhookBaseUrl}/api/v1/media/thumbnail/callback`,
      },
      // CRITICAL: Safety config prevents infinite loops and runaway costs
      safety: this.createSafetyConfig(),
    };

    return this.sendToQueue(
      message,
      params.chatId || params.messageId,
      jobId,
      'message',
    );
  }

  /**
   * Queue a profile picture for thumbnail generation via Lambda
   *
   * @returns Job ID if successfully queued, null if not supported or failed
   */
  async queueProfilePictureThumbnail(
    params: QueueProfilePictureThumbnailParams,
  ): Promise<string | null> {
    if (!this.shouldUseLambda(params.mimeType)) {
      this.logger.warn(
        `[Lambda Thumbnail] Type ${params.mimeType} not supported for profile picture - thumbnail will NOT be generated`,
      );
      return null;
    }

    const jobId = uuidv4();
    const bucket = params.s3Bucket || this.bucketName;
    const outputKey =
      params.thumbnailS3Key || this.generateThumbnailKey(params.s3Key);

    const message: ThumbnailJobMessage = {
      jobType: 'thumbnail',
      jobId,
      inputBucket: bucket,
      inputKey: params.s3Key,
      outputBucket: bucket,
      outputKey,
      mimeType: params.mimeType,
      context: 'profile-picture',
      entityIds: {
        userId: params.userId.toString(),
      },
      callback: {
        type: 'webhook',
        url: `${this.webhookBaseUrl}/api/v1/profile-picture/thumbnail/callback`,
      },
      // CRITICAL: Safety config prevents infinite loops and runaway costs
      safety: this.createSafetyConfig(),
    };

    return this.sendToQueue(
      message,
      `user-${params.userId}`,
      jobId,
      'profile-picture',
    );
  }

  /**
   * Queue a template media file for thumbnail generation via Lambda
   *
   * For videos and documents uploaded as template headers, this:
   * 1. Queues Lambda to generate a thumbnail from the original file
   * 2. Stores the original S3 key in entityIds for cleanup after thumbnail is ready
   *
   * @returns Job ID if successfully queued, null if not supported or failed
   */
  async queueTemplateMediaThumbnail(
    params: QueueTemplateMediaThumbnailParams,
  ): Promise<string | null> {
    if (!this.shouldUseLambda(params.mimeType)) {
      this.logger.warn(
        `[Lambda Thumbnail] Type ${params.mimeType} not supported for template media - thumbnail will NOT be generated`,
      );
      return null;
    }

    const jobId = uuidv4();
    const bucket = params.s3Bucket || this.bucketName;
    const outputKey =
      params.thumbnailS3Key || this.generateThumbnailKey(params.s3Key);

    const message: ThumbnailJobMessage = {
      jobType: 'thumbnail',
      jobId,
      inputBucket: bucket,
      inputKey: params.s3Key,
      outputBucket: bucket,
      outputKey,
      mimeType: params.mimeType,
      context: 'template-media',
      entityIds: {
        mediaId: params.mediaId,
        localeId: params.localeId,
        originalS3Key: params.s3Key, // Store for cleanup after thumbnail is ready
        ...(params.tempId && { tempId: params.tempId }),
      },
      callback: {
        type: 'webhook',
        url: `${this.webhookBaseUrl}/api/v1/media/thumbnail/callback`,
      },
      // CRITICAL: Safety config prevents infinite loops and runaway costs
      safety: this.createSafetyConfig(),
    };

    return this.sendToQueue(
      message,
      params.localeId || params.mediaId,
      jobId,
      'template-media',
    );
  }

  /**
   * Send a thumbnail job to the SQS queue
   */
  private async sendToQueue(
    message: ThumbnailJobMessage,
    groupId: string,
    jobId: string,
    context: string,
  ): Promise<string | null> {
    try {
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
          jobType: {
            DataType: 'String',
            StringValue: 'thumbnail',
          },
          context: {
            DataType: 'String',
            StringValue: context,
          },
          jobId: {
            DataType: 'String',
            StringValue: jobId,
          },
        },
      };

      // Only add FIFO-specific parameters for FIFO queues
      if (this.isFifoQueue()) {
        commandInput.MessageGroupId = groupId;
        commandInput.MessageDeduplicationId = jobId;
      }

      const command = new SendMessageCommand(commandInput);
      const result = await this.sqsClient.send(command);

      this.logger.log(
        `[Lambda Thumbnail] Queued job ${jobId} for ${message.inputKey} ` +
          `(${message.mimeType}) [MessageId: ${result.MessageId}]`,
      );

      return jobId;
    } catch (error) {
      this.logger.error(
        `[Lambda Thumbnail] Failed to queue job for ${message.inputKey}: ${error.message}`,
        error.stack,
      );
      // CRITICAL: No fallback - thumbnail will not be generated
      // This is intentional to avoid local processing overhead
      throw new Error(`Failed to queue Lambda thumbnail job: ${error.message}`);
    }
  }
}
