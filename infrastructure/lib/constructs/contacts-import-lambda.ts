/**
 * ContactsImportLambda Construct
 *
 * Creates the Lambda functions for contacts import processing:
 * - Processing Function: Unified handler for parsing, validation, and execution
 */

import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import * as path from "path";

export interface ContactsImportLambdaProps {
    /**
     * SQS queue for import jobs
     */
    readonly queue: sqs.IQueue;

    /**
     * S3 bucket for import files
     */
    readonly importBucket: s3.IBucket;

    /**
     * Database connection string (from Secrets Manager or SSM)
     */
    readonly databaseUrl: string;

    /**
     * Lambda memory in MB
     * @default 1024
     */
    readonly memoryMb?: number;

    /**
     * Lambda timeout in seconds
     * @default 300
     */
    readonly timeoutSeconds?: number;

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
     * SQS batch size for Lambda
     * @default 1
     */
    readonly batchSize?: number;
}

export class ContactsImportLambda extends Construct {
    public readonly processingFunction: lambda.Function;

    constructor(scope: Construct, id: string, props: ContactsImportLambdaProps) {
        super(scope, id);

        const memoryMb = props.memoryMb ?? 1024;
        const timeoutSeconds = props.timeoutSeconds ?? 300;
        const logRetentionDays = props.logRetentionDays ?? 14;
        const resourcePrefix = props.resourcePrefix ?? "contacts-import";
        const batchSize = props.batchSize ?? 1;

        // Lambda code path
        const lambdaCodePath = path.join(__dirname, "../../lambda/contacts-import/dist");

        // Common Lambda configuration
        const commonProps = {
            runtime: lambda.Runtime.NODEJS_20_X,
            architecture: lambda.Architecture.ARM_64,
            memorySize: memoryMb,
            timeout: Duration.seconds(timeoutSeconds),
            environment: {
                NODE_OPTIONS: "--enable-source-maps",
                DATABASE_URL: props.databaseUrl,
                IMPORT_BUCKET: props.importBucket.bucketName,
                QUEUE_URL: props.queue.queueUrl,
            },
        };

        // Processing Lambda - triggered via SQS for all actions (PARSE, VALIDATE, EXECUTE)
        this.processingFunction = new lambda.Function(this, "ProcessingFunction", {
            ...commonProps,
            functionName: `${resourcePrefix}-processor`,
            handler: "index.handler",
            code: lambda.Code.fromAsset(lambdaCodePath),
            description: "Unified processor for contact imports (Parse/Validate/Execute)",
        });

        // Grant S3 read permissions
        props.importBucket.grantRead(this.processingFunction);

        // Grant SQS send permissions (for chaining)
        props.queue.grantSendMessages(this.processingFunction);

        // Add SQS event source
        // No filters needed because this one function handles all message types on the queue
        this.processingFunction.addEventSource(
            new SqsEventSource(props.queue, {
                batchSize: batchSize,
                maxBatchingWindow: Duration.seconds(5),
                reportBatchItemFailures: true,
            })
        );

        // Log group with retention
        new logs.LogGroup(this, "ProcessorLogGroup", {
            logGroupName: `/aws/lambda/${this.processingFunction.functionName}`,
            retention: logRetentionDays as logs.RetentionDays,
            removalPolicy: RemovalPolicy.DESTROY,
        });
    }

    get functionName(): string {
        return this.processingFunction.functionName;
    }
}
