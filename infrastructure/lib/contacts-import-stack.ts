/**
 * ContactsImportStack
 *
 * Main CDK stack for contacts import infrastructure:
 * - S3 bucket for uploaded import files
 * - SQS queue with DLQ for job messages
 * - Lambda functions for parsing, validation, and import execution
 *
 * Backend integration:
 * The backend needs these outputs to send import jobs:
 * - queueUrl: URL to send SQS messages
 * - importBucketName: S3 bucket for uploaded files
 *
 * Message format (sent by backend):
 * ```json
 * {
 *   "action": "PARSE" | "VALIDATE" | "EXECUTE",
 *   "jobId": "uuid",
 *   "s3Key": "string" (for PARSE action),
 *   "batchStart": number (for VALIDATE action),
 *   "batchSize": number (for VALIDATE action)
 * }
 * ```
 */

import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { ContactsImportLambda } from "./constructs/contacts-import-lambda";
import { ContactsImportQueue } from "./constructs/contacts-import-queue";

export interface ContactsImportStackProps extends StackProps {
    /**
     * Database URL for Lambda functions
     * Should be passed via environment or Secrets Manager
     */
    readonly databaseUrl: string;

    /**
     * ARN of existing S3 bucket for imports.
     * If not provided, a new bucket will be created.
     */
    readonly existingBucketArn?: string;

    /**
     * Lambda configuration
     */
    readonly lambda?: {
        readonly memoryMb?: number;
        readonly timeoutSeconds?: number;
    };

    /**
     * Queue configuration
     */
    readonly queue?: {
        readonly maxReceiveCount?: number;
        readonly dlqRetentionDays?: number;
    };

    /**
     * Log retention in days
     * @default 14
     */
    readonly logRetentionDays?: number;

    /**
     * Resource prefix
     * @default 'contacts-import'
     */
    readonly resourcePrefix?: string;

    /**
     * Days to keep uploaded files before auto-deletion
     * @default 7
     */
    readonly fileRetentionDays?: number;
}

export class ContactsImportStack extends Stack {
    public readonly queue: ContactsImportQueue;
    public readonly lambda: ContactsImportLambda;
    public readonly importBucket: s3.IBucket;

    constructor(scope: Construct, id: string, props: ContactsImportStackProps) {
        super(scope, id, props);

        const resourcePrefix = props.resourcePrefix ?? "contacts-import";
        const logRetentionDays = props.logRetentionDays ?? 14;
        const lambdaTimeoutSeconds = props.lambda?.timeoutSeconds ?? 300;
        const fileRetentionDays = props.fileRetentionDays ?? 7;

        // =========================================================================
        // S3 Bucket for import files
        // =========================================================================
        if (props.existingBucketArn) {
            this.importBucket = s3.Bucket.fromBucketArn(
                this,
                "ImportBucket",
                props.existingBucketArn
            );
        } else {
            this.importBucket = new s3.Bucket(this, "ImportBucket", {
                bucketName: `${resourcePrefix}-files-${this.account}-${this.region}`,
                encryption: s3.BucketEncryption.S3_MANAGED,
                blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
                versioned: false,
                // Auto-delete uploaded files after retention period
                lifecycleRules: [
                    {
                        id: "auto-delete-old-imports",
                        enabled: true,
                        expiration: Duration.days(fileRetentionDays),
                        abortIncompleteMultipartUploadAfter: Duration.days(1),
                    },
                ],
                // CORS for direct browser uploads
                cors: [
                    {
                        allowedMethods: [
                            s3.HttpMethods.GET,
                            s3.HttpMethods.PUT,
                            s3.HttpMethods.POST,
                        ],
                        allowedOrigins: ["*"], // Configure for your domain in production
                        allowedHeaders: ["*"],
                        maxAge: 3000,
                    },
                ],
                removalPolicy: RemovalPolicy.DESTROY,
                autoDeleteObjects: true,
            });
        }

        // =========================================================================
        // SQS Queue
        // =========================================================================
        this.queue = new ContactsImportQueue(this, "Queue", {
            lambdaTimeoutSeconds: lambdaTimeoutSeconds,
            maxReceiveCount: props.queue?.maxReceiveCount ?? 3,
            dlqRetentionDays: props.queue?.dlqRetentionDays ?? 14,
            resourcePrefix: resourcePrefix,
        });

        // =========================================================================
        // Lambda Functions
        // =========================================================================
        this.lambda = new ContactsImportLambda(this, "Lambda", {
            queue: this.queue.queue,
            importBucket: this.importBucket,
            databaseUrl: props.databaseUrl,
            memoryMb: props.lambda?.memoryMb ?? 1024,
            timeoutSeconds: lambdaTimeoutSeconds,
            logRetentionDays: logRetentionDays,
            resourcePrefix: resourcePrefix,
        });

        // =========================================================================
        // Stack Outputs
        // =========================================================================
        new CfnOutput(this, "QueueUrl", {
            value: this.queue.queueUrl,
            description: "SQS Queue URL for sending import job messages",
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

        new CfnOutput(this, "ImportBucketName", {
            value: this.importBucket.bucketName,
            description: "S3 bucket name for import files",
            exportName: `${resourcePrefix}-bucket-name`,
        });

        new CfnOutput(this, "ImportBucketArn", {
            value: this.importBucket.bucketArn,
            description: "S3 bucket ARN for IAM policies",
            exportName: `${resourcePrefix}-bucket-arn`,
        });

        new CfnOutput(this, "ParserFunctionName", {
            value: this.lambda.parserFunctionName,
            description: "File parser Lambda function name",
            exportName: `${resourcePrefix}-parser-lambda`,
        });

        new CfnOutput(this, "ValidatorFunctionName", {
            value: this.lambda.validatorFunctionName,
            description: "Validator Lambda function name",
            exportName: `${resourcePrefix}-validator-lambda`,
        });

        new CfnOutput(this, "ExecutorFunctionName", {
            value: this.lambda.executorFunctionName,
            description: "Import executor Lambda function name",
            exportName: `${resourcePrefix}-executor-lambda`,
        });
    }
}
