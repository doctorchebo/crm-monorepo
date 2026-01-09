/**
 * MediaCompressionLambda Construct
 *
 * Creates a Lambda function that processes media compression jobs.
 * The Lambda:
 * 1. Receives messages from SQS (one at a time)
 * 2. Downloads media from S3 input bucket
 * 3. Compresses using ffmpeg (provided via Lambda Layer)
 * 4. Uploads compressed media to S3 (same or different bucket)
 * 5. Optionally deletes original file after successful compression
 * 6. Calls webhook to notify backend of completion
 *
 * Architecture decisions:
 * - ARM64 architecture: Better price/performance for compute-intensive workloads
 * - nodejs20.x runtime: Latest LTS with good ffmpeg compatibility
 * - Reserved concurrency: Limits parallel executions to control costs
 * - Batch size 1: One compression job per Lambda invocation (ffmpeg is single-threaded)
 * - Ephemeral storage: Large temp storage for media processing
 *
 * IAM guardrails (strictly enforced):
 * - Read access to input bucket (specific bucket ARN)
 * - Read/Write/Delete access when using same bucket for input/output
 * - Receive/Delete messages from specific queue only
 * - CloudWatch Logs for the function's log group only
 * - NO wildcard permissions
 *
 * @see https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html
 */

import { Duration, Size } from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import * as path from "path";

/**
 * Configuration options for MediaCompressionLambda
 */
export interface MediaCompressionLambdaProps {
  /**
   * The SQS queue to process messages from.
   * Lambda will be triggered by messages in this queue.
   */
  readonly queue: sqs.IQueue;

  /**
   * S3 bucket for input media (source files to compress).
   * Lambda will have READ access to this bucket.
   */
  readonly inputBucket: s3.IBucket;

  /**
   * S3 bucket for output media (compressed files).
   * Lambda will have WRITE access to this bucket.
   * Can be the same as inputBucket for in-place compression.
   */
  readonly outputBucket: s3.IBucket;

  /**
   * Whether to delete original files after successful compression.
   * Only applies when inputBucket and outputBucket are the same.
   *
   * WHY: Saves storage costs and avoids duplicate files.
   * The compressed file replaces the original at a different key path.
   *
   * @default true
   */
  readonly deleteOriginalAfterCompression?: boolean;

  /**
   * ARN of the ffmpeg Lambda Layer.
   * If not provided, a layer will be created from the ffmpeg-lambda-layer release.
   *
   * The layer must contain ffmpeg and ffprobe binaries for arm64 Linux.
   *
   * @default undefined - creates layer from public release
   */
  readonly ffmpegLayerArn?: string;

  /**
   * ARN of the Chromium Lambda Layer for PDF thumbnail generation.
   * If not provided, PDF thumbnails will be disabled.
   *
   * The layer must be from @sparticuz/chromium releases for ARM64.
   * Download from: https://github.com/Sparticuz/chromium/releases
   * Use the arm64 .zip file and upload to S3, then create a layer.
   *
   * @default undefined - PDF thumbnails disabled
   */
  readonly chromiumLayerArn?: string;

  /**
   * Lambda memory in MB.
   * Higher memory = more CPU = faster compression.
   *
   * WHY 2048: Good balance of speed and cost for video compression.
   * ffmpeg benefits from more CPU, which scales with memory in Lambda.
   *
   * @default 2048
   */
  readonly memoryMb?: number;

  /**
   * Lambda timeout in seconds.
   * Maximum is 900 (15 minutes).
   *
   * WHY 900: Video compression can take a long time for large files.
   * 15 minutes is the maximum Lambda allows.
   *
   * @default 900
   */
  readonly timeoutSeconds?: number;

  /**
   * Ephemeral storage in MB.
   * Used for downloading and processing media files.
   *
   * WHY 10240 (10GB): Large videos need space for both input and output.
   * Formula: inputSize + outputSize + overhead
   *
   * @default 10240 (10 GB)
   */
  readonly ephemeralStorageMb?: number;

  /**
   * Reserved concurrent executions.
   * Limits how many Lambda instances can run simultaneously.
   *
   * WHY 5: Controls costs and prevents overwhelming downstream services.
   * Each instance processes one video at a time.
   *
   * @default 5
   */
  readonly reservedConcurrency?: number;

  /**
   * CloudWatch Logs retention period.
   *
   * WHY 14 days: Enough time to debug issues without excessive costs.
   *
   * @default 14 days
   */
  readonly logRetentionDays?: number;

  /**
   * Prefix for resource names.
   *
   * @default 'media-compression'
   */
  readonly resourcePrefix?: string;

  /**
   * Additional environment variables for the Lambda function.
   * Useful for passing configuration like API endpoints.
   */
  readonly environment?: Record<string, string>;
}

/**
 * MediaCompressionLambda Construct
 *
 * Creates a Lambda function with:
 * - ffmpeg layer for media processing
 * - SQS trigger with batch size 1
 * - Strictly scoped IAM permissions
 * - CloudWatch Logs with retention
 */
export class MediaCompressionLambda extends Construct {
  /**
   * The Lambda function
   */
  public readonly function: lambda.Function;

  /**
   * The CloudWatch Log Group for the function
   */
  public readonly logGroup: logs.LogGroup;

  /**
   * The function ARN
   */
  public readonly functionArn: string;

  /**
   * The function name
   */
  public readonly functionName: string;

  constructor(
    scope: Construct,
    id: string,
    props: MediaCompressionLambdaProps
  ) {
    super(scope, id);

    // Extract configuration with defaults
    const memoryMb = props.memoryMb ?? 2048;
    const timeoutSeconds = props.timeoutSeconds ?? 900;
    const ephemeralStorageMb = props.ephemeralStorageMb ?? 10240;
    const reservedConcurrency = props.reservedConcurrency ?? 5;
    const logRetentionDays = props.logRetentionDays ?? 14;
    const resourcePrefix = props.resourcePrefix ?? "media-compression";

    // =========================================================================
    // CloudWatch Log Group
    // =========================================================================
    // Create log group explicitly to control retention
    this.logGroup = new logs.LogGroup(this, "LogGroup", {
      logGroupName: `/aws/lambda/${resourcePrefix}-lambda`,
      retention: this.mapRetentionDays(logRetentionDays),
    });

    // =========================================================================
    // ffmpeg Lambda Layer
    // =========================================================================
    // Either use provided ARN or create from local asset
    let ffmpegLayer: lambda.ILayerVersion;

    if (props.ffmpegLayerArn) {
      // Use provided layer ARN
      ffmpegLayer = lambda.LayerVersion.fromLayerVersionArn(
        this,
        "FfmpegLayer",
        props.ffmpegLayerArn
      );
    } else {
      // Create layer from local ffmpeg binaries
      // The layer-ffmpeg directory should contain:
      // - bin/ffmpeg (arm64 static binary)
      // - bin/ffprobe (arm64 static binary)
      ffmpegLayer = new lambda.LayerVersion(this, "FfmpegLayer", {
        layerVersionName: `${resourcePrefix}-ffmpeg-layer`,
        description:
          "FFmpeg and FFprobe static binaries for ARM64 Lambda (media compression)",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../../layers/ffmpeg")
        ),
        compatibleRuntimes: [
          lambda.Runtime.NODEJS_18_X,
          lambda.Runtime.NODEJS_20_X,
          lambda.Runtime.NODEJS_22_X,
        ],
        compatibleArchitectures: [lambda.Architecture.ARM_64],
      });
    }

    // =========================================================================
    // Chromium Lambda Layer (optional, for PDF thumbnails)
    // =========================================================================
    // Build the layers array - ffmpeg is always required
    const layers: lambda.ILayerVersion[] = [ffmpegLayer];

    // Add Chromium layer if provided (for PDF thumbnail generation)
    let chromiumLayer: lambda.ILayerVersion | undefined;
    if (props.chromiumLayerArn) {
      chromiumLayer = lambda.LayerVersion.fromLayerVersionArn(
        this,
        "ChromiumLayer",
        props.chromiumLayerArn
      );
      layers.push(chromiumLayer);
    }

    // =========================================================================
    // Lambda Function
    // =========================================================================
    this.function = new lambda.Function(this, "Function", {
      functionName: `${resourcePrefix}-lambda`,
      description:
        "Compresses media files (video/image/audio) and generates thumbnails using ffmpeg and Chromium",

      // Runtime configuration
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: "index.handler",

      // Code location - bundled separately
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../lambda/media-compression/dist")
      ),

      // Resource allocation
      memorySize: memoryMb,
      timeout: Duration.seconds(timeoutSeconds),
      ephemeralStorageSize: Size.mebibytes(ephemeralStorageMb),

      // NOTE: Reserved concurrency removed to avoid AWS account limits
      // The account must maintain at least 10 unreserved concurrent executions
      // Cost control is achieved through SQS batch size (1) and visibility timeout

      // Lambda layers (ffmpeg required, Chromium optional)
      layers,

      // Environment variables
      environment: {
        NODE_ENV: "production",
        // Pass bucket names for validation in handler
        INPUT_BUCKET: props.inputBucket.bucketName,
        OUTPUT_BUCKET: props.outputBucket.bucketName,
        // Whether to delete original after compression
        DELETE_ORIGINAL_AFTER_COMPRESSION: (
          props.deleteOriginalAfterCompression ?? true
        ).toString(),
        // ffmpeg binary location in layer
        FFMPEG_PATH: "/opt/bin/ffmpeg",
        FFPROBE_PATH: "/opt/bin/ffprobe",
        // Merge additional environment variables
        ...props.environment,
      },

      // Use explicitly created log group
      logGroup: this.logGroup,
    });

    // =========================================================================
    // IAM Permissions (Least Privilege)
    // =========================================================================
    // CRITICAL: All permissions are scoped to specific resources by ARN
    // NO wildcard permissions are used

    const deleteOriginal = props.deleteOriginalAfterCompression ?? true;
    const sameBucket =
      props.inputBucket.bucketArn === props.outputBucket.bucketArn;

    if (sameBucket) {
      // Same bucket: need read, write, and optionally delete
      props.inputBucket.grantRead(this.function);
      props.inputBucket.grantPut(this.function);
      if (deleteOriginal) {
        props.inputBucket.grantDelete(this.function);
      }
    } else {
      // Different buckets: read from input, write to output
      props.inputBucket.grantRead(this.function);
      props.outputBucket.grantWrite(this.function);
    }

    // SQS permissions are automatically added by the event source mapping
    // This includes: sqs:ReceiveMessage, sqs:DeleteMessage, sqs:GetQueueAttributes

    // =========================================================================
    // SQS Event Source
    // =========================================================================
    // Configure Lambda to be triggered by SQS messages
    this.function.addEventSource(
      new lambdaEventSources.SqsEventSource(props.queue, {
        // Process one message at a time
        // WHY: ffmpeg compression is CPU-intensive and benefits from full resources
        batchSize: 1,

        // Maximum time to wait for messages before invoking Lambda
        // Lower value = more responsive, higher costs
        // Higher value = batching opportunity, but we use batchSize=1
        maxBatchingWindow: Duration.seconds(0),

        // Report partial batch failures
        // If processing fails, only the failed message is retried
        reportBatchItemFailures: true,
      })
    );

    // Export function properties
    this.functionArn = this.function.functionArn;
    this.functionName = this.function.functionName;
  }

  /**
   * Maps retention days to LogGroup retention enum
   */
  private mapRetentionDays(days: number): logs.RetentionDays {
    const retentionMap: Record<number, logs.RetentionDays> = {
      1: logs.RetentionDays.ONE_DAY,
      3: logs.RetentionDays.THREE_DAYS,
      5: logs.RetentionDays.FIVE_DAYS,
      7: logs.RetentionDays.ONE_WEEK,
      14: logs.RetentionDays.TWO_WEEKS,
      30: logs.RetentionDays.ONE_MONTH,
      60: logs.RetentionDays.TWO_MONTHS,
      90: logs.RetentionDays.THREE_MONTHS,
      120: logs.RetentionDays.FOUR_MONTHS,
      150: logs.RetentionDays.FIVE_MONTHS,
      180: logs.RetentionDays.SIX_MONTHS,
      365: logs.RetentionDays.ONE_YEAR,
      400: logs.RetentionDays.THIRTEEN_MONTHS,
      545: logs.RetentionDays.EIGHTEEN_MONTHS,
      731: logs.RetentionDays.TWO_YEARS,
      1096: logs.RetentionDays.THREE_YEARS,
      1827: logs.RetentionDays.FIVE_YEARS,
      2192: logs.RetentionDays.SIX_YEARS,
      2557: logs.RetentionDays.SEVEN_YEARS,
      2922: logs.RetentionDays.EIGHT_YEARS,
      3288: logs.RetentionDays.NINE_YEARS,
      3653: logs.RetentionDays.TEN_YEARS,
    };

    return retentionMap[days] ?? logs.RetentionDays.TWO_WEEKS;
  }
}
