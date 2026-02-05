/**
 * CatalogThumbnailStack
 *
 * CDK stack for catalog image thumbnail generation:
 * - SQS queue for thumbnail job messages
 * - Lambda function for thumbnail processing
 * - Integration with existing S3 bucket
 *
 * This stack processes thumbnail generation requests from the backend
 * when catalog images are uploaded. It uses Sharp (via Lambda Layer)
 * for high-performance image resizing.
 *
 * Message format (sent by backend):
 * ```json
 * {
 *   "jobType": "catalog_thumbnail",
 *   "imageId": "uuid",
 *   "inputBucket": "string",
 *   "inputKey": "string",
 *   "outputBucket": "string",
 *   "outputKey": "string",
 *   "targetWidth": 300,
 *   "targetHeight": 300,
 *   "callback": {
 *     "type": "db_update",
 *     "table": "catalog_item_images",
 *     "idColumn": "id",
 *     "idValue": "uuid",
 *     "updateColumns": {
 *       "thumbnail_key": "string",
 *       "status": "ready"
 *     }
 *   }
 * }
 * ```
 */

import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import * as path from "path";

/**
 * Configuration for the CatalogThumbnailStack
 */
export interface CatalogThumbnailStackProps extends StackProps {
  /**
   * ARN of the existing S3 bucket for catalog images.
   * Lambda will have READ and WRITE access to this bucket.
   * Required - this bucket must already exist.
   */
  readonly bucketArn: string;

  /**
   * Database connection string for callback updates.
   * If provided, Lambda will update the database directly.
   * Otherwise, use webhook callbacks.
   */
  readonly databaseUrl?: string;

  /**
   * Lambda configuration overrides
   */
  readonly lambda?: {
    /**
     * Lambda memory in MB
     * @default 1024
     */
    readonly memoryMb?: number;

    /**
     * Lambda timeout in seconds (max 900)
     * @default 60
     */
    readonly timeoutSeconds?: number;

    /**
     * Reserved concurrent executions
     * @default 10
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
   * @default 'catalog-thumbnail'
   */
  readonly resourcePrefix?: string;
}

/**
 * CatalogThumbnailStack
 *
 * Deploys the catalog thumbnail generation infrastructure:
 * - SQS queue with DLQ for thumbnail job messages
 * - Lambda function with Sharp for image processing
 * - S3 bucket access configuration
 */
export class CatalogThumbnailStack extends Stack {
  /**
   * The SQS queue for thumbnail jobs
   */
  public readonly queue: sqs.Queue;

  /**
   * The dead-letter queue for failed jobs
   */
  public readonly dlq: sqs.Queue;

  /**
   * The Lambda function for thumbnail generation
   */
  public readonly thumbnailFunction: lambda.Function;

  /**
   * The S3 bucket for catalog images
   */
  public readonly bucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: CatalogThumbnailStackProps) {
    super(scope, id, props);

    // Extract configuration with defaults
    const resourcePrefix = props.resourcePrefix ?? "catalog-thumbnail";
    const logRetentionDays = props.logRetentionDays ?? 14;
    const lambdaMemoryMb = props.lambda?.memoryMb ?? 1024;
    const lambdaTimeoutSeconds = props.lambda?.timeoutSeconds ?? 60;
    const reservedConcurrency = props.lambda?.reservedConcurrency ?? 10;
    const maxReceiveCount = props.queue?.maxReceiveCount ?? 3;
    const dlqRetentionDays = props.queue?.dlqRetentionDays ?? 14;

    // =========================================================================
    // S3 Bucket
    // =========================================================================

    if (!props.bucketArn) {
      throw new Error("bucketArn is required. The bucket must already exist.");
    }

    this.bucket = s3.Bucket.fromBucketArn(
      this,
      "CatalogBucket",
      props.bucketArn,
    );

    // =========================================================================
    // SQS Queues
    // =========================================================================

    // Dead-letter queue for failed messages
    this.dlq = new sqs.Queue(this, "DeadLetterQueue", {
      queueName: `${resourcePrefix}-dlq`,
      retentionPeriod: Duration.days(dlqRetentionDays),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // Main processing queue
    this.queue = new sqs.Queue(this, "ProcessingQueue", {
      queueName: `${resourcePrefix}-queue`,
      visibilityTimeout: Duration.seconds(lambdaTimeoutSeconds * 6),
      retentionPeriod: Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: this.dlq,
        maxReceiveCount,
      },
    });

    // =========================================================================
    // Lambda Function
    // =========================================================================

    this.thumbnailFunction = new lambdaNodejs.NodejsFunction(
      this,
      "ThumbnailFunction",
      {
        functionName: `${resourcePrefix}-function`,
        entry: path.join(__dirname, "../lambda/catalog-thumbnail/index.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: lambdaMemoryMb,
        timeout: Duration.seconds(lambdaTimeoutSeconds),
        reservedConcurrentExecutions: reservedConcurrency,
        bundling: {
          minify: true,
          sourceMap: false,
          externalModules: [
            "sharp", // Sharp is bundled via Lambda Layer or esbuild external
          ],
          nodeModules: ["sharp"], // Include sharp in node_modules
          forceDockerBundling: false,
        },
        environment: {
          NODE_ENV: "production",
          LOG_LEVEL: "info",
          DATABASE_URL: props.databaseUrl ?? "",
          ...props.lambda?.environment,
        },
        logRetention: logRetentionDays as logs.RetentionDays,
      },
    );

    // Grant S3 read/write access
    this.bucket.grantRead(this.thumbnailFunction);
    this.bucket.grantWrite(this.thumbnailFunction);

    // Grant SQS access
    this.queue.grantConsumeMessages(this.thumbnailFunction);

    // Add SQS as event source
    this.thumbnailFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(this.queue, {
        batchSize: 10,
        maxBatchingWindow: Duration.seconds(5),
        reportBatchItemFailures: true,
      }),
    );

    // =========================================================================
    // Outputs
    // =========================================================================

    new CfnOutput(this, "QueueUrl", {
      value: this.queue.queueUrl,
      description: "URL of the catalog thumbnail processing queue",
      exportName: `${resourcePrefix}-queue-url`,
    });

    new CfnOutput(this, "QueueArn", {
      value: this.queue.queueArn,
      description: "ARN of the catalog thumbnail processing queue",
      exportName: `${resourcePrefix}-queue-arn`,
    });

    new CfnOutput(this, "DlqUrl", {
      value: this.dlq.queueUrl,
      description: "URL of the dead-letter queue",
      exportName: `${resourcePrefix}-dlq-url`,
    });

    new CfnOutput(this, "FunctionArn", {
      value: this.thumbnailFunction.functionArn,
      description: "ARN of the thumbnail Lambda function",
      exportName: `${resourcePrefix}-function-arn`,
    });
  }
}
