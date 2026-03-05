/**
 * MediaCompressionStack
 *
 * Main CDK stack that wires together all media compression infrastructure:
 * - SQS queue for job messages
 * - Lambda function for compression processing
 * - S3 bucket configuration (existing or new)
 *
 * This stack is designed to be deployed independently and does NOT:
 * - Create IAM roles directly (uses construct grants)
 * - Modify existing stacks
 * - Use wildcard permissions
 *
 * Backend integration:
 * The backend only needs the following outputs to send compression jobs:
 * - queueUrl: URL to send SQS messages to
 * - inputBucketName: S3 bucket for source media
 * - outputBucketName: S3 bucket for compressed media
 *
 * Message format (sent by backend):
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

import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { MediaCompressionLambda } from "./constructs/media-compression-lambda";
import { MediaProcessingQueue } from "./constructs/media-processing-queue";

/**
 * Configuration for the MediaCompressionStack
 */
export interface MediaCompressionStackProps extends StackProps {
  /**
   * ARN of an existing S3 bucket for input media.
   * Required - this bucket must already exist.
   * Lambda will have READ access to this bucket.
   */
  readonly inputBucketArn?: string;

  /**
   * ARN of an existing S3 bucket for output media.
   * If not provided, uses the same bucket as input (recommended).
   * When using same bucket, compressed files are stored alongside originals
   * with different key paths, and originals can be deleted after compression.
   */
  readonly outputBucketArn?: string;

  /**
   * Whether to use the same bucket for input and output.
   * When true, outputBucketArn is ignored and inputBucket is used for both.
   * Compressed files replace originals at the same path structure.
   *
   * WHY recommended: Simpler architecture, no cross-bucket permissions,
   * easier URL management, and automatic cleanup of originals.
   *
   * @default true
   */
  readonly useSameBucket?: boolean;

  /**
   * Whether to delete original files after successful compression.
   * Only applies when using same bucket for input/output.
   *
   * @default true
   */
  readonly deleteOriginalAfterCompression?: boolean;

  /**
   * ARN of the ffmpeg Lambda Layer.
   * If not provided, a layer will be created from local binaries (layers/ffmpeg).
   *
   * Recommended public layers:
   * - arn:aws:lambda:{region}:764866452798:layer:ffmpeg:1
   */
  readonly ffmpegLayerArn?: string;

  /**
   * ARN of the Chromium Lambda Layer for PDF thumbnail generation.
   * If not provided, PDF thumbnails will be disabled.
   *
   * Use @sparticuz/chromium releases for ARM64 layers:
   * - Download from: https://github.com/Sparticuz/chromium/releases
   * - Use the arm64 .zip file and upload to S3, then create a layer
   *
   * @default undefined - PDF thumbnails disabled
   */
  readonly chromiumLayerArn?: string;

  /**
   * Number of days to keep compressed artifacts before deletion.
   * Applied as a lifecycle rule on the output bucket (if created).
   *
   * WHY: Compressed files are typically moved to permanent storage by backend.
   * This prevents orphaned files from accumulating.
   *
   * @default 7
   */
  readonly artifactRetentionDays?: number;

  /**
   * Lambda configuration overrides
   */
  readonly lambda?: {
    /**
     * Lambda memory in MB
     * @default 2048
     */
    readonly memoryMb?: number;

    /**
     * Lambda timeout in seconds (max 900)
     * @default 900
     */
    readonly timeoutSeconds?: number;

    /**
     * Ephemeral storage in MB (max 10240)
     * @default 10240
     */
    readonly ephemeralStorageMb?: number;

    /**
     * Reserved concurrent executions
     * @default 5
     */
    readonly reservedConcurrency?: number;

    /**
     * Additional environment variables
     */
    readonly environment?: Record<string, string>;
  };

  /**
   * Queue configuration overrides
   */
  readonly queue?: {
    /**
     * Maximum receive count before sending to DLQ
     * @default 3
     */
    readonly maxReceiveCount?: number;

    /**
     * DLQ retention days
     * @default 14
     */
    readonly dlqRetentionDays?: number;
  };

  /**
   * CloudWatch Logs retention in days
   * @default 14
   */
  readonly logRetentionDays?: number;

  /**
   * Prefix for all resource names
   * @default 'media-compression'
   */
  readonly resourcePrefix?: string;

  /**
   * Enable SQS event source mapping for Lambda.
   *
   * When disabled, Lambda will NOT automatically poll the SQS queue.
   * This is useful for development to avoid excessive SQS free tier consumption.
   *
   * In development, Lambda event source mappings continuously poll SQS queues
   * even when empty, consuming ~86,400 requests/day per queue (which exceeds
   * the 1M/month free tier in ~12 days with 4 queues).
   *
   * Set to false in development, true in production.
   *
   * @default true
   */
  readonly enableEventSourceMapping?: boolean;
}

/**
 * MediaCompressionStack
 *
 * Deploys the complete media compression infrastructure:
 * - MediaProcessingQueue: SQS queue with DLQ for job messages
 * - MediaCompressionLambda: Lambda function with ffmpeg for compression
 * - S3 buckets: Input (existing) and output (existing or new)
 */
export class MediaCompressionStack extends Stack {
  /**
   * The SQS queue for compression jobs
   */
  public readonly queue: MediaProcessingQueue;

  /**
   * The Lambda function for compression
   */
  public readonly lambda: MediaCompressionLambda;

  /**
   * The input S3 bucket (imported or created)
   */
  public readonly inputBucket: s3.IBucket;

  /**
   * The output S3 bucket (same as input when useSameBucket is true)
   */
  public readonly outputBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: MediaCompressionStackProps) {
    super(scope, id, props);

    // Extract configuration with defaults
    const resourcePrefix = props.resourcePrefix ?? "media-compression";
    const logRetentionDays = props.logRetentionDays ?? 14;
    const lambdaTimeoutSeconds = props.lambda?.timeoutSeconds ?? 900;
    const useSameBucket = props.useSameBucket ?? true;
    const deleteOriginalAfterCompression =
      props.deleteOriginalAfterCompression ?? true;

    // =========================================================================
    // S3 Buckets
    // =========================================================================

    // Input bucket - must exist (passed in) or error
    if (!props.inputBucketArn) {
      throw new Error(
        "inputBucketArn is required. The input bucket must already exist. " +
          "This stack does not create input buckets to prevent accidental data overwrites.",
      );
    }

    this.inputBucket = s3.Bucket.fromBucketArn(
      this,
      "InputBucket",
      props.inputBucketArn,
    );

    // Output bucket configuration
    if (useSameBucket) {
      // Use same bucket for input and output (recommended)
      // Compressed files will be stored alongside originals with different key paths
      this.outputBucket = this.inputBucket;
    } else if (props.outputBucketArn) {
      // Use existing separate output bucket
      this.outputBucket = s3.Bucket.fromBucketArn(
        this,
        "OutputBucket",
        props.outputBucketArn,
      );
    } else {
      throw new Error(
        "Either useSameBucket must be true or outputBucketArn must be provided",
      );
    }

    // =========================================================================
    // SQS Queue
    // =========================================================================
    this.queue = new MediaProcessingQueue(this, "Queue", {
      lambdaTimeoutSeconds: lambdaTimeoutSeconds,
      maxReceiveCount: props.queue?.maxReceiveCount ?? 3,
      dlqRetentionDays: props.queue?.dlqRetentionDays ?? 14,
      resourcePrefix: resourcePrefix,
    });

    // =========================================================================
    // Lambda Function
    // =========================================================================
    this.lambda = new MediaCompressionLambda(this, "Lambda", {
      queue: this.queue.queue,
      inputBucket: this.inputBucket,
      outputBucket: this.outputBucket,
      ffmpegLayerArn: props.ffmpegLayerArn,
      chromiumLayerArn: props.chromiumLayerArn,
      deleteOriginalAfterCompression:
        useSameBucket && deleteOriginalAfterCompression,
      memoryMb: props.lambda?.memoryMb ?? 2048,
      timeoutSeconds: lambdaTimeoutSeconds,
      ephemeralStorageMb: props.lambda?.ephemeralStorageMb ?? 10240,
      reservedConcurrency: props.lambda?.reservedConcurrency ?? 5,
      logRetentionDays: logRetentionDays,
      resourcePrefix: resourcePrefix,
      environment: props.lambda?.environment,
      enableEventSourceMapping: props.enableEventSourceMapping ?? true,
    });

    // =========================================================================
    // Stack Outputs
    // =========================================================================
    // These are the values the backend needs to integrate

    new CfnOutput(this, "QueueUrl", {
      value: this.queue.queueUrl,
      description: "SQS Queue URL for sending compression job messages",
      exportName: `${resourcePrefix}-queue-url`,
    });

    new CfnOutput(this, "QueueArn", {
      value: this.queue.queueArn,
      description: "SQS Queue ARN for IAM policies",
      exportName: `${resourcePrefix}-queue-arn`,
    });

    new CfnOutput(this, "DlqArn", {
      value: this.queue.dlqArn,
      description: "Dead-letter queue ARN for failed jobs",
      exportName: `${resourcePrefix}-dlq-arn`,
    });

    new CfnOutput(this, "InputBucketName", {
      value: this.inputBucket.bucketName,
      description: "S3 bucket name for input media",
      exportName: `${resourcePrefix}-input-bucket`,
    });

    new CfnOutput(this, "OutputBucketName", {
      value: this.outputBucket.bucketName,
      description: "S3 bucket name for compressed media",
      exportName: `${resourcePrefix}-output-bucket`,
    });

    new CfnOutput(this, "LambdaFunctionName", {
      value: this.lambda.functionName,
      description: "Lambda function name for monitoring",
      exportName: `${resourcePrefix}-lambda-name`,
    });

    new CfnOutput(this, "LambdaFunctionArn", {
      value: this.lambda.functionArn,
      description: "Lambda function ARN",
      exportName: `${resourcePrefix}-lambda-arn`,
    });
  }
}
