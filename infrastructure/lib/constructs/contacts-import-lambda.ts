/**
 * ContactsImportLambda Construct
 *
 * Creates the Lambda functions for contacts import processing:
 * - File Parser: Parses CSV/XLSX files from S3
 * - Validator: Validates rows and checks for duplicates
 * - Import Executor: Moves valid rows to contacts table
 */

import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
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
    public readonly parserFunction: lambda.Function;
    public readonly validatorFunction: lambda.Function;
    public readonly executorFunction: lambda.Function;

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
            logRetention: logRetentionDays as logs.RetentionDays,
        };

        // File Parser Lambda - triggered via SQS when file is uploaded
        this.parserFunction = new lambda.Function(this, "ParserFunction", {
            ...commonProps,
            functionName: `${resourcePrefix}-file-parser`,
            handler: "index.handleFileParse",
            code: lambda.Code.fromAsset(lambdaCodePath),
            description: "Parses CSV/XLSX files and inserts rows into staging table",
        });

        // Validator Lambda - triggered via SQS after parsing
        this.validatorFunction = new lambda.Function(this, "ValidatorFunction", {
            ...commonProps,
            functionName: `${resourcePrefix}-validator`,
            handler: "index.handleValidation",
            code: lambda.Code.fromAsset(lambdaCodePath),
            description: "Validates staging rows and checks for duplicates",
        });

        // Import Executor Lambda - triggered via SQS after user approval
        this.executorFunction = new lambda.Function(this, "ExecutorFunction", {
            ...commonProps,
            functionName: `${resourcePrefix}-executor`,
            handler: "index.handleImportExecution",
            code: lambda.Code.fromAsset(lambdaCodePath),
            description: "Moves valid staging rows to contacts table",
        });

        // Grant S3 read permissions to parser
        props.importBucket.grantRead(this.parserFunction);

        // Grant SQS send permissions to all functions (for chaining)
        props.queue.grantSendMessages(this.parserFunction);
        props.queue.grantSendMessages(this.validatorFunction);
        props.queue.grantSendMessages(this.executorFunction);

        // Add SQS event source to all functions
        const eventSourceConfig = {
            batchSize: batchSize,
            maxBatchingWindow: Duration.seconds(5),
            reportBatchItemFailures: true,
        };

        this.parserFunction.addEventSource(
            new SqsEventSource(props.queue, {
                ...eventSourceConfig,
                filters: [
                    lambda.FilterCriteria.filter({
                        body: { action: lambda.FilterRule.isEqual("PARSE") },
                    }),
                ],
            })
        );

        this.validatorFunction.addEventSource(
            new SqsEventSource(props.queue, {
                ...eventSourceConfig,
                filters: [
                    lambda.FilterCriteria.filter({
                        body: { action: lambda.FilterRule.isEqual("VALIDATE") },
                    }),
                ],
            })
        );

        this.executorFunction.addEventSource(
            new SqsEventSource(props.queue, {
                ...eventSourceConfig,
                filters: [
                    lambda.FilterCriteria.filter({
                        body: { action: lambda.FilterRule.isEqual("EXECUTE") },
                    }),
                ],
            })
        );

        // Log groups with retention
        new logs.LogGroup(this, "ParserLogGroup", {
            logGroupName: `/aws/lambda/${this.parserFunction.functionName}`,
            retention: logRetentionDays as logs.RetentionDays,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        new logs.LogGroup(this, "ValidatorLogGroup", {
            logGroupName: `/aws/lambda/${this.validatorFunction.functionName}`,
            retention: logRetentionDays as logs.RetentionDays,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        new logs.LogGroup(this, "ExecutorLogGroup", {
            logGroupName: `/aws/lambda/${this.executorFunction.functionName}`,
            retention: logRetentionDays as logs.RetentionDays,
            removalPolicy: RemovalPolicy.DESTROY,
        });
    }

    get parserFunctionName(): string {
        return this.parserFunction.functionName;
    }

    get validatorFunctionName(): string {
        return this.validatorFunction.functionName;
    }

    get executorFunctionName(): string {
        return this.executorFunction.functionName;
    }
}
