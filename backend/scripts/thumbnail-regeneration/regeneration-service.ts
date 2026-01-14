/**
 * Regeneration Service
 *
 * Core service for regenerating thumbnails with new resolution.
 * Handles batch processing, concurrency control, and error recovery.
 */

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../src/database/db.connection';
import { messages } from '../../src/database/schema';
import { Logger } from './logger';
import { ProgressTracker } from './progress-tracker';

// ============================================================================
// Configuration
// ============================================================================

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});
const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const bucketName =
  process.env.AWS_S3_BUCKET_NAME ||
  process.env.AWS_S3_BUCKET ||
  'chatflowai-dev';
const queueUrl = process.env.MEDIA_COMPRESSION_QUEUE_URL || '';
const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';

// ============================================================================
// Types
// ============================================================================

export interface RegenerationOptions {
  batchSize: number;
  concurrency: number;
  force: boolean;
  dryRun: boolean;
  direction: 'inbound' | 'outbound' | 'all';
}

export interface AttachmentInfo {
  messageId: string;
  attachmentId: string;
  s3Key: string;
  mediaType: 'image' | 'video' | 'document';
  mimeType: string;
  chatId: string;
  direction: 'inbound' | 'outbound';
  thumbnailStatus?: string;
  thumbnailKey?: string;
  width?: number;
  height?: number;
}

interface RegenerationStats {
  total: number;
  byDirection: {
    inbound: { image: number; video: number; document: number };
    outbound: { image: number; video: number; document: number };
  };
  byStatus: {
    ready: number;
    pending: number;
    failed: number;
    notApplicable: number;
    missing: number;
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

function generateThumbnailKey(originalKey: string): string {
  const lastDot = originalKey.lastIndexOf('.');
  const baseName =
    lastDot > -1 ? originalKey.substring(0, lastDot) : originalKey;
  return `${baseName}_thumb.jpg`;
}

function supportsThumbnail(mediaType: string, mimeType?: string): boolean {
  if (mediaType === 'image' || mediaType === 'video') return true;
  if (mediaType === 'document' && mimeType === 'application/pdf') return true;
  return false;
}

async function checkS3FileExists(
  key: string,
): Promise<{ exists: boolean; size?: number }> {
  try {
    const command = new HeadObjectCommand({ Bucket: bucketName, Key: key });
    const response = await s3Client.send(command);
    return { exists: true, size: response.ContentLength };
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return { exists: false };
    }
    throw error;
  }
}

async function deleteS3File(key: string): Promise<void> {
  try {
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: bucketName, Key: key }),
    );
  } catch (error: any) {
    // Ignore errors - file may already be deleted
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Regeneration Service
// ============================================================================

export class RegenerationService {
  private logger: Logger;
  private progressTracker: ProgressTracker;

  constructor(logger: Logger, progressTracker: ProgressTracker) {
    this.logger = logger;
    this.progressTracker = progressTracker;
  }

  /**
   * Get all attachments that need thumbnail regeneration
   */
  private async getAllAttachments(
    options: RegenerationOptions,
  ): Promise<AttachmentInfo[]> {
    this.logger.info('Scanning database for attachments...');

    const result: AttachmentInfo[] = [];
    const { direction, force } = options;

    // Fetch all messages with attachments
    const allMessages = await db.query.messages.findMany({
      columns: {
        messageId: true,
        chatId: true,
        direction: true,
        attachments: true,
      },
    });

    for (const message of allMessages) {
      if (!message.attachments || !Array.isArray(message.attachments)) continue;

      const msgDirection = message.direction as 'inbound' | 'outbound';
      if (direction !== 'all' && msgDirection !== direction) continue;

      const attachments = message.attachments as any[];

      for (const attachment of attachments) {
        if (!attachment.s3Key) continue;
        if (attachment.s3Key.startsWith('staging/')) continue; // Skip staging files

        const type = attachment.type as string;
        if (!['image', 'video', 'document'].includes(type)) continue;

        // Skip non-PDF documents
        if (type === 'document' && attachment.mimeType !== 'application/pdf')
          continue;

        // If not forcing, skip ready thumbnails
        if (
          !force &&
          attachment.thumbnailStatus === 'ready' &&
          attachment.thumbnailKey
        ) {
          continue;
        }

        result.push({
          messageId: message.messageId,
          attachmentId: attachment.id,
          s3Key: attachment.s3Key,
          mediaType: type as 'image' | 'video' | 'document',
          mimeType: attachment.mimeType || 'application/octet-stream',
          chatId: message.chatId,
          direction: msgDirection,
          thumbnailStatus: attachment.thumbnailStatus,
          thumbnailKey: attachment.thumbnailKey,
          width: attachment.width,
          height: attachment.height,
        });
      }
    }

    return result;
  }

  /**
   * Get statistics about current thumbnail status
   */
  private async getStats(
    direction: 'inbound' | 'outbound' | 'all',
  ): Promise<RegenerationStats> {
    const stats: RegenerationStats = {
      total: 0,
      byDirection: {
        inbound: { image: 0, video: 0, document: 0 },
        outbound: { image: 0, video: 0, document: 0 },
      },
      byStatus: {
        ready: 0,
        pending: 0,
        failed: 0,
        notApplicable: 0,
        missing: 0,
      },
    };

    const allMessages = await db.query.messages.findMany({
      columns: {
        messageId: true,
        chatId: true,
        direction: true,
        attachments: true,
      },
    });

    for (const message of allMessages) {
      if (!message.attachments || !Array.isArray(message.attachments)) continue;

      const msgDirection = message.direction as 'inbound' | 'outbound';
      if (direction !== 'all' && msgDirection !== direction) continue;

      const attachments = message.attachments as any[];

      for (const attachment of attachments) {
        if (!attachment.s3Key) continue;
        if (attachment.s3Key.startsWith('staging/')) continue;

        const type = attachment.type as string;
        if (!['image', 'video', 'document'].includes(type)) continue;
        if (type === 'document' && attachment.mimeType !== 'application/pdf')
          continue;

        stats.total++;
        stats.byDirection[msgDirection][
          type as 'image' | 'video' | 'document'
        ]++;

        const status = attachment.thumbnailStatus;
        if (status === 'ready') {
          stats.byStatus.ready++;
        } else if (status === 'pending' || status === 'processing') {
          stats.byStatus.pending++;
        } else if (status === 'failed') {
          stats.byStatus.failed++;
        } else if (status === 'not-applicable') {
          stats.byStatus.notApplicable++;
        } else {
          stats.byStatus.missing++;
        }
      }
    }

    return stats;
  }

  /**
   * Queue a thumbnail regeneration job to Lambda
   */
  private async queueThumbnailJob(
    attachment: AttachmentInfo,
  ): Promise<boolean> {
    if (!supportsThumbnail(attachment.mediaType, attachment.mimeType)) {
      return false;
    }

    const jobId = uuidv4();
    const outputKey = generateThumbnailKey(attachment.s3Key);

    const message = {
      jobType: 'thumbnail',
      jobId,
      inputBucket: bucketName,
      inputKey: attachment.s3Key,
      outputBucket: bucketName,
      outputKey,
      mimeType: attachment.mimeType,
      context: 'message-attachment',
      entityIds: {
        messageId: attachment.messageId,
        attachmentId: attachment.attachmentId,
        chatId: attachment.chatId,
      },
      callback: {
        type: 'webhook',
        url: `${backendUrl}/api/v1/media/thumbnail/callback`,
      },
      safety: {
        attempt: 1,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        maxAgeMs: 60 * 60 * 1000,
      },
    };

    try {
      const isFifo = queueUrl.endsWith('.fifo');
      const commandInput: any = {
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          jobType: { DataType: 'String', StringValue: 'thumbnail' },
          context: { DataType: 'String', StringValue: 'message-attachment' },
        },
      };

      if (isFifo) {
        commandInput.MessageGroupId = attachment.chatId || attachment.messageId;
        commandInput.MessageDeduplicationId = jobId;
      }

      await sqsClient.send(new SendMessageCommand(commandInput));
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to queue job: ${error.message}`);
      return false;
    }
  }

  /**
   * Reset attachment thumbnail status in database
   */
  private async resetAttachmentStatus(
    attachment: AttachmentInfo,
  ): Promise<void> {
    const message = await db.query.messages.findFirst({
      where: eq(messages.messageId, attachment.messageId),
    });

    if (!message || !message.attachments) return;

    const attachmentsList = message.attachments as any[];
    const attachmentIndex = attachmentsList.findIndex(
      (att: any) => att.id === attachment.attachmentId,
    );

    if (attachmentIndex === -1) return;

    // Reset thumbnail fields
    attachmentsList[attachmentIndex] = {
      ...attachmentsList[attachmentIndex],
      thumbnailStatus: 'pending',
      thumbnailKey: undefined,
      width: undefined,
      height: undefined,
      blurhash: undefined,
    };

    await db
      .update(messages)
      .set({ attachments: attachmentsList as any })
      .where(eq(messages.messageId, attachment.messageId));
  }

  /**
   * Delete existing thumbnail from S3
   */
  private async deleteExistingThumbnail(
    attachment: AttachmentInfo,
  ): Promise<void> {
    if (attachment.thumbnailKey) {
      await deleteS3File(attachment.thumbnailKey);
    }
    // Also try the expected path in case thumbnailKey was never set
    const expectedKey = generateThumbnailKey(attachment.s3Key);
    await deleteS3File(expectedKey);
  }

  /**
   * Process a single attachment
   */
  private async processAttachment(
    attachment: AttachmentInfo,
    options: RegenerationOptions,
  ): Promise<{ success: boolean; error?: string }> {
    const itemId = `${attachment.messageId}:${attachment.attachmentId}`;

    // Skip if already processed in this session
    if (this.progressTracker.isProcessed(itemId)) {
      this.progressTracker.recordSkipped(itemId);
      return { success: true };
    }

    if (options.dryRun) {
      this.logger.debug(
        `Would regenerate: ${attachment.attachmentId} (${attachment.mediaType})`,
      );
      this.progressTracker.recordSuccess(itemId);
      return { success: true };
    }

    try {
      // Step 1: Delete existing thumbnail
      await this.deleteExistingThumbnail(attachment);

      // Step 2: Reset database status
      await this.resetAttachmentStatus(attachment);

      // Step 3: Queue new thumbnail generation
      const queued = await this.queueThumbnailJob(attachment);
      if (!queued) {
        throw new Error('Failed to queue thumbnail job');
      }

      this.progressTracker.recordSuccess(itemId);
      return { success: true };
    } catch (error: any) {
      this.progressTracker.recordFailure(itemId, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process a batch of attachments with concurrency control
   */
  private async processBatch(
    attachments: AttachmentInfo[],
    options: RegenerationOptions,
    batchNumber: number,
  ): Promise<{ succeeded: number; failed: number }> {
    this.progressTracker.updateBatch(batchNumber);

    let succeeded = 0;
    let failed = 0;

    // Process in chunks based on concurrency
    for (let i = 0; i < attachments.length; i += options.concurrency) {
      const chunk = attachments.slice(i, i + options.concurrency);

      const results = await Promise.all(
        chunk.map((att) => this.processAttachment(att, options)),
      );

      for (const result of results) {
        if (result.success) {
          succeeded++;
        } else {
          failed++;
        }
      }

      // Small delay between chunks to avoid overwhelming the queue
      if (i + options.concurrency < attachments.length) {
        await delay(100);
      }
    }

    return { succeeded, failed };
  }

  // ============================================================================
  // Public Commands
  // ============================================================================

  /**
   * Show current status and statistics
   */
  async showStatus(options: RegenerationOptions): Promise<void> {
    this.logger.section('THUMBNAIL STATUS');

    // Environment info
    this.logger.table(
      {
        'S3 Bucket': bucketName,
        'SQS Queue': queueUrl || '❌ NOT CONFIGURED',
        'Backend URL': backendUrl,
        'Direction Filter': options.direction,
      },
      'Configuration',
    );

    // Check for existing progress
    const existingProgress = this.progressTracker.load();
    if (existingProgress && existingProgress.status === 'running') {
      this.logger.newLine();
      this.logger.warn('An interrupted regeneration job was found!');
      this.logger.table(this.progressTracker.getSummary(), 'Previous Job');
      this.logger.info('Run "resume" command to continue.');
    }

    // Get current stats
    const stats = await this.getStats(options.direction);

    this.logger.newLine();
    this.logger.table(
      {
        'Total Attachments': stats.total,
        'With Thumbnails (ready)': stats.byStatus.ready,
        'Pending/Processing': stats.byStatus.pending,
        Failed: stats.byStatus.failed,
        'Not Applicable': stats.byStatus.notApplicable,
        'Missing Status': stats.byStatus.missing,
      },
      'Thumbnail Status',
    );

    this.logger.newLine();
    this.logger.table(
      {
        'Inbound Images': stats.byDirection.inbound.image,
        'Inbound Videos': stats.byDirection.inbound.video,
        'Inbound Documents (PDF)': stats.byDirection.inbound.document,
        'Outbound Images': stats.byDirection.outbound.image,
        'Outbound Videos': stats.byDirection.outbound.video,
        'Outbound Documents (PDF)': stats.byDirection.outbound.document,
      },
      'By Type',
    );

    if (options.force) {
      this.logger.newLine();
      this.logger.info(
        `Force mode enabled: ALL ${stats.total} attachments will be regenerated`,
      );
    } else {
      const needsRegeneration =
        stats.byStatus.pending + stats.byStatus.failed + stats.byStatus.missing;
      this.logger.newLine();
      this.logger.info(
        `${needsRegeneration} attachments need thumbnail regeneration`,
      );
    }

    this.logger.newLine();
    this.logger.info(
      'Run "regenerate" to start, or "regenerate --dry-run" to preview.',
    );
  }

  /**
   * Regenerate all thumbnails
   */
  async regenerateAll(options: RegenerationOptions): Promise<void> {
    this.logger.section('THUMBNAIL REGENERATION');

    if (options.dryRun) {
      this.logger.warn('DRY RUN MODE - No changes will be made');
    }

    // Check for existing progress
    const existingProgress = this.progressTracker.load();
    if (existingProgress && existingProgress.status === 'running') {
      this.logger.warn(
        'An interrupted regeneration job was found. Use "resume" to continue or clear progress first.',
      );
      this.logger.table(this.progressTracker.getSummary());
      return;
    }

    // Clear any old progress
    this.progressTracker.clear();

    // Get all attachments
    const attachments = await this.getAllAttachments(options);

    if (attachments.length === 0) {
      this.logger.success('No attachments need regeneration!');
      return;
    }

    this.logger.info(`Found ${attachments.length} attachments to process`);
    this.logger.table(
      {
        'Batch Size': options.batchSize,
        Concurrency: options.concurrency,
        'Force Regeneration': options.force,
        Direction: options.direction,
      },
      'Options',
    );

    // Initialize progress tracking
    this.progressTracker.startNew(
      attachments.length,
      options.direction,
      options.force,
      options.batchSize,
    );

    // Process in batches
    const totalBatches = Math.ceil(attachments.length / options.batchSize);
    let totalSucceeded = 0;
    let totalFailed = 0;

    for (let batchNum = 1; batchNum <= totalBatches; batchNum++) {
      const start = (batchNum - 1) * options.batchSize;
      const end = Math.min(start + options.batchSize, attachments.length);
      const batch = attachments.slice(start, end);

      this.logger.newLine();
      this.logger.info(
        `Processing batch ${batchNum}/${totalBatches} (${batch.length} items)...`,
      );

      const { succeeded, failed } = await this.processBatch(
        batch,
        options,
        batchNum,
      );
      totalSucceeded += succeeded;
      totalFailed += failed;

      // Show progress
      const processed = start + batch.length;
      this.logger.progress(processed, attachments.length, 'Overall: ');

      // Show ETA periodically
      if (batchNum % 5 === 0) {
        this.logger.info(`ETA: ${this.progressTracker.getETA()}`);
      }
    }

    // Complete
    this.progressTracker.complete();

    this.logger.newLine();
    this.logger.section('REGENERATION COMPLETE');
    this.logger.table(this.progressTracker.getSummary());

    if (!options.dryRun && totalSucceeded > 0) {
      this.logger.newLine();
      this.logger.success(`${totalSucceeded} thumbnail jobs queued to Lambda`);
      this.logger.info(
        'Thumbnails will be generated asynchronously. Check backend logs for progress.',
      );
      this.logger.info(
        `Callback URL: ${backendUrl}/api/v1/media/thumbnail/callback`,
      );
    }

    if (totalFailed > 0) {
      this.logger.newLine();
      this.logger.warn(`${totalFailed} items failed. Check logs for details.`);
    }
  }

  /**
   * Resume an interrupted regeneration job
   */
  async resume(options: RegenerationOptions): Promise<void> {
    this.logger.section('RESUMING REGENERATION');

    const existingProgress = this.progressTracker.load();

    if (!existingProgress) {
      this.logger.warn(
        'No interrupted job found. Use "regenerate" to start a new job.',
      );
      return;
    }

    if (existingProgress.status === 'completed') {
      this.logger.success('Previous job already completed!');
      this.logger.table(this.progressTracker.getSummary());
      return;
    }

    this.logger.info('Found interrupted job:');
    this.logger.table(this.progressTracker.getSummary());

    // Get remaining attachments
    const allAttachments = await this.getAllAttachments({
      ...options,
      direction: existingProgress.direction,
      force: existingProgress.force,
    });

    // Filter out already processed
    const remainingAttachments = allAttachments.filter(
      (att) =>
        !this.progressTracker.isProcessed(
          `${att.messageId}:${att.attachmentId}`,
        ),
    );

    if (remainingAttachments.length === 0) {
      this.logger.success('All items already processed!');
      this.progressTracker.complete();
      return;
    }

    this.logger.info(`${remainingAttachments.length} items remaining`);

    // Process remaining in batches
    const totalBatches = Math.ceil(
      remainingAttachments.length / options.batchSize,
    );
    let totalSucceeded = 0;
    let totalFailed = 0;

    for (let batchNum = 1; batchNum <= totalBatches; batchNum++) {
      const start = (batchNum - 1) * options.batchSize;
      const end = Math.min(
        start + options.batchSize,
        remainingAttachments.length,
      );
      const batch = remainingAttachments.slice(start, end);

      this.logger.newLine();
      this.logger.info(
        `Processing batch ${batchNum}/${totalBatches} (${batch.length} items)...`,
      );

      const { succeeded, failed } = await this.processBatch(
        batch,
        options,
        existingProgress.currentBatch + batchNum,
      );
      totalSucceeded += succeeded;
      totalFailed += failed;

      // Show progress
      const processed = start + batch.length;
      this.logger.progress(
        processed,
        remainingAttachments.length,
        'Remaining: ',
      );
    }

    // Complete
    this.progressTracker.complete();

    this.logger.newLine();
    this.logger.section('RESUME COMPLETE');
    this.logger.table(this.progressTracker.getSummary());
  }
}
