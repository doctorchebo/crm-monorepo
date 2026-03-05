/**
 * PasswordResetEmailLambda Construct
 *
 * Creates Lambda functions for password reset email processing:
 * - SendPasswordResetEmail: Triggered by SQS, sends emails via Mailgun
 * - TokenCleanup: Scheduled via EventBridge, cleans up expired tokens
 */

import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import * as path from "path";

export interface PasswordResetEmailLambdaProps {
  /**
   * SQS queue for email jobs
   */
  readonly queue: sqs.IQueue;

  /**
   * Database connection string
   */
  readonly databaseUrl: string;

  /**
   * SSM Parameter Store name for Mailgun API key
   * @default '/crm/mailgun/api-key'
   */
  readonly mailgunApiKeyParam?: string;

  /**
   * Mailgun domain for sending emails
   */
  readonly mailgunDomain: string;

  /**
   * Application URL for reset links
   */
  readonly appUrl: string;

  /**
   * Email sender address
   * @default 'noreply@{mailgunDomain}'
   */
  readonly senderEmail?: string;

  /**
   * Lambda memory in MB
   * @default 256
   */
  readonly memoryMb?: number;

  /**
   * Lambda timeout in seconds
   * @default 30
   */
  readonly timeoutSeconds?: number;

  /**
   * Log retention in days
   * @default 14
   */
  readonly logRetentionDays?: number;

  /**
   * Resource prefix
   * @default 'password-reset-email'
   */
  readonly resourcePrefix?: string;

  /**
   * SQS batch size for Lambda
   * @default 1
   */
  readonly batchSize?: number;

  /**
   * Enable cleanup Lambda (scheduled via EventBridge)
   * @default true
   */
  readonly enableCleanup?: boolean;

  /**
   * Cleanup schedule (cron expression)
   * @default 'rate(1 hour)'
   */
  readonly cleanupSchedule?: string;

  /**
   * Enable SQS event source mapping.
   *
   * When disabled, Lambda will NOT poll the SQS queue automatically.
   * This is useful for development to avoid SQS free tier consumption.
   *
   * @default true
   */
  readonly enableEventSourceMapping?: boolean;
}

export class PasswordResetEmailLambda extends Construct {
  public readonly sendFunction: lambda.Function;
  public readonly cleanupFunction?: lambda.Function;

  constructor(
    scope: Construct,
    id: string,
    props: PasswordResetEmailLambdaProps,
  ) {
    super(scope, id);

    const memoryMb = props.memoryMb ?? 256;
    const timeoutSeconds = props.timeoutSeconds ?? 30;
    const logRetentionDays = props.logRetentionDays ?? 14;
    const resourcePrefix = props.resourcePrefix ?? "password-reset-email";
    const batchSize = props.batchSize ?? 1;
    const enableCleanup = props.enableCleanup ?? true;
    const cleanupSchedule = props.cleanupSchedule ?? "rate(1 hour)";
    const senderEmail = props.senderEmail ?? `noreply@${props.mailgunDomain}`;

    // Lambda code path
    const lambdaCodePath = path.join(
      __dirname,
      "../../lambda/password-reset-email",
    );

    const mailgunApiKeyParam =
      props.mailgunApiKeyParam ?? "/crm/mailgun/api-key";

    // Common Lambda configuration
    const commonEnv = {
      NODE_OPTIONS: "--enable-source-maps",
      DATABASE_URL: props.databaseUrl,
      MAILGUN_API_KEY_PARAM: mailgunApiKeyParam,
      MAILGUN_DOMAIN: props.mailgunDomain,
      APP_URL: props.appUrl,
      SENDER_EMAIL: senderEmail,
    };

    // Send Email Lambda - triggered by SQS
    this.sendFunction = new lambda.Function(this, "SendFunction", {
      functionName: `${resourcePrefix}-sender`,
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: memoryMb,
      timeout: Duration.seconds(timeoutSeconds),
      handler: "dist/index.sendHandler",
      code: lambda.Code.fromAsset(lambdaCodePath),
      environment: commonEnv,
      description: "Sends password reset emails via Mailgun",
    });

    // Add SQS event source (can be disabled for development)
    const enableEventSource = props.enableEventSourceMapping ?? true;

    if (enableEventSource) {
      this.sendFunction.addEventSource(
        new SqsEventSource(props.queue, {
          batchSize: batchSize,
          maxBatchingWindow: Duration.seconds(5),
          reportBatchItemFailures: true,
        }),
      );
    } else {
      // Grant SQS permissions manually since event source won't do it
      props.queue.grantConsumeMessages(this.sendFunction);
    }

    // Log group with retention
    new logs.LogGroup(this, "SendLogGroup", {
      logGroupName: `/aws/lambda/${this.sendFunction.functionName}`,
      retention: logRetentionDays as logs.RetentionDays,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Grant SSM read permissions for the API key parameter
    this.sendFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ssm:GetParameter"],
        resources: [
          `arn:aws:ssm:${process.env.CDK_DEFAULT_REGION || "us-east-1"}:${process.env.CDK_DEFAULT_ACCOUNT || "*"}:parameter${mailgunApiKeyParam}`,
        ],
      }),
    );

    // Cleanup Lambda - scheduled via EventBridge
    if (enableCleanup) {
      this.cleanupFunction = new lambda.Function(this, "CleanupFunction", {
        functionName: `${resourcePrefix}-cleanup`,
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 128,
        timeout: Duration.seconds(60),
        handler: "dist/index.cleanupHandler",
        code: lambda.Code.fromAsset(lambdaCodePath),
        environment: {
          NODE_OPTIONS: "--enable-source-maps",
          DATABASE_URL: props.databaseUrl,
        },
        description: "Cleans up expired password reset tokens",
      });

      // EventBridge rule
      const cleanupRule = new events.Rule(this, "CleanupSchedule", {
        ruleName: `${resourcePrefix}-cleanup-schedule`,
        schedule: events.Schedule.expression(cleanupSchedule),
        description: "Triggers password reset token cleanup every hour",
      });

      cleanupRule.addTarget(new targets.LambdaFunction(this.cleanupFunction));

      // Log group for cleanup
      new logs.LogGroup(this, "CleanupLogGroup", {
        logGroupName: `/aws/lambda/${this.cleanupFunction.functionName}`,
        retention: logRetentionDays as logs.RetentionDays,
        removalPolicy: RemovalPolicy.DESTROY,
      });
    }
  }

  get sendFunctionName(): string {
    return this.sendFunction.functionName;
  }

  get cleanupFunctionName(): string | undefined {
    return this.cleanupFunction?.functionName;
  }
}
