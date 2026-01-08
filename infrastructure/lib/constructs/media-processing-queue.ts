/**
 * MediaProcessingQueue Construct
 *
 * Creates an SQS queue for media compression job messages.
 * This queue acts as the decoupling layer between the backend and
 * the Lambda-based compression workers.
 *
 * Architecture decisions:
 * - Standard queue (not FIFO): Compression jobs are idempotent and don't require ordering
 * - Dead-letter queue: Failed jobs are captured for debugging/alerting
 * - Visibility timeout: Set to 2x Lambda timeout to prevent duplicate processing
 *
 * Backend integration:
 * - Backend sends messages to this queue when media needs compression
 * - Backend only needs: queueUrl and queueArn
 *
 * @see https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html
 */

import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

/**
 * Configuration options for MediaProcessingQueue
 */
export interface MediaProcessingQueueProps {
  /**
   * Lambda timeout in seconds.
   * Visibility timeout will be set to 2x this value.
   * @default 900 (15 minutes - maximum Lambda timeout)
   */
  readonly lambdaTimeoutSeconds?: number;

  /**
   * Maximum number of times a message can be received before
   * being sent to the dead-letter queue.
   *
   * WHY 3: Allows for 2 retries (initial + 2 retries = 3 receives)
   * before giving up. This matches the Lambda retry behavior.
   *
   * @default 3
   */
  readonly maxReceiveCount?: number;

  /**
   * Number of days to retain messages in the dead-letter queue.
   * Failed messages are kept for debugging and potential manual reprocessing.
   *
   * @default 14
   */
  readonly dlqRetentionDays?: number;

  /**
   * Prefix for resource names.
   * Useful for multi-environment deployments (dev, staging, prod).
   *
   * @default 'media-compression'
   */
  readonly resourcePrefix?: string;
}

/**
 * MediaProcessingQueue Construct
 *
 * Creates the SQS infrastructure for media compression jobs:
 * - Main processing queue for compression jobs
 * - Dead-letter queue for failed jobs
 *
 * Message contract (sent by backend):
 * ```json
 * {
 *   "jobId": "uuid",
 *   "inputBucket": "string",
 *   "inputKey": "string",
 *   "outputBucket": "string",
 *   "outputKey": "string",
 *   "mediaType": "video|image|audio",
 *   "targetMaxSizeMb": 16,
 *   "callback": {
 *     "type": "webhook",
 *     "url": "string"
 *   }
 * }
 * ```
 */
export class MediaProcessingQueue extends Construct {
  /**
   * The main SQS queue for compression jobs
   */
  public readonly queue: sqs.Queue;

  /**
   * The dead-letter queue for failed jobs
   */
  public readonly deadLetterQueue: sqs.Queue;

  /**
   * The ARN of the main queue (for IAM policies)
   */
  public readonly queueArn: string;

  /**
   * The URL of the main queue (for sending messages)
   */
  public readonly queueUrl: string;

  /**
   * The ARN of the dead-letter queue
   */
  public readonly dlqArn: string;

  constructor(
    scope: Construct,
    id: string,
    props: MediaProcessingQueueProps = {}
  ) {
    super(scope, id);

    // Extract configuration with defaults
    const lambdaTimeoutSeconds = props.lambdaTimeoutSeconds ?? 900; // 15 minutes max
    const maxReceiveCount = props.maxReceiveCount ?? 3;
    const dlqRetentionDays = props.dlqRetentionDays ?? 14;
    const resourcePrefix = props.resourcePrefix ?? "media-compression";

    // Calculate visibility timeout: 2x Lambda timeout as per AWS best practices
    // This prevents the message from becoming visible again while Lambda is still processing
    // Reference: https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html#events-sqs-queueconfig
    const visibilityTimeoutSeconds = lambdaTimeoutSeconds * 2;

    // =========================================================================
    // Dead-Letter Queue (DLQ)
    // =========================================================================
    // Messages that fail processing after maxReceiveCount attempts are sent here.
    // This allows for debugging, alerting, and manual reprocessing.
    this.deadLetterQueue = new sqs.Queue(this, "DeadLetterQueue", {
      queueName: `${resourcePrefix}-dlq`,
      // Retain failed messages for analysis
      retentionPeriod: Duration.days(dlqRetentionDays),
      // No encryption required for DLQ as original messages may contain S3 keys
      // but not actual media content (media is in S3)
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      // Keep DLQ on stack deletion for forensics (can be changed for dev environments)
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // =========================================================================
    // Main Processing Queue
    // =========================================================================
    this.queue = new sqs.Queue(this, "ProcessingQueue", {
      queueName: `${resourcePrefix}-queue`,

      // Visibility timeout must be >= Lambda timeout × 2
      // This ensures messages aren't reprocessed while Lambda is still working
      visibilityTimeout: Duration.seconds(visibilityTimeoutSeconds),

      // Standard retention - messages should be processed quickly
      // 4 days gives enough buffer for temporary outages
      retentionPeriod: Duration.days(4),

      // SSE encryption for data at rest
      encryption: sqs.QueueEncryption.SQS_MANAGED,

      // Dead-letter queue configuration
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        // After maxReceiveCount receives, send to DLQ
        // This includes the initial receive + retries
        maxReceiveCount: maxReceiveCount,
      },

      // Remove queue on stack deletion (safe for this use case)
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Export queue properties for easy access
    this.queueArn = this.queue.queueArn;
    this.queueUrl = this.queue.queueUrl;
    this.dlqArn = this.deadLetterQueue.queueArn;
  }
}
