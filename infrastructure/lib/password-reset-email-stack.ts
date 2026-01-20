/**
 * PasswordResetEmailStack
 *
 * Main CDK stack for password reset email infrastructure:
 * - SQS queue with DLQ for email jobs
 * - Lambda function for sending emails via Mailgun
 * - Lambda function for cleaning up expired tokens
 * - EventBridge rule for scheduled cleanup
 *
 * Backend integration:
 * The backend needs this output to send email jobs:
 * - queueUrl: URL to send SQS messages
 *
 * Message format (sent by frontend API):
 * ```json
 * {
 *   "userId": number,
 *   "email": "string",
 *   "name": "string (optional)",
 *   "token": "string (unhashed)",
 *   "expiresAt": "ISO date string"
 * }
 * ```
 */

import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { PasswordResetEmailLambda } from "./constructs/password-reset-email-lambda";
import { PasswordResetEmailQueue } from "./constructs/password-reset-email-queue";

export interface PasswordResetEmailStackProps extends StackProps {
  /**
   * Database URL for Lambda functions
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
   */
  readonly senderEmail?: string;

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
   * @default 'password-reset-email'
   */
  readonly resourcePrefix?: string;

  /**
   * Enable cleanup Lambda
   * @default true
   */
  readonly enableCleanup?: boolean;

  /**
   * Cleanup schedule
   * @default 'rate(1 hour)'
   */
  readonly cleanupSchedule?: string;
}

export class PasswordResetEmailStack extends Stack {
  public readonly queue: PasswordResetEmailQueue;
  public readonly lambda: PasswordResetEmailLambda;

  constructor(
    scope: Construct,
    id: string,
    props: PasswordResetEmailStackProps,
  ) {
    super(scope, id, props);

    const resourcePrefix = props.resourcePrefix ?? "password-reset-email";
    const logRetentionDays = props.logRetentionDays ?? 14;
    const lambdaTimeoutSeconds = props.lambda?.timeoutSeconds ?? 30;

    // =========================================================================
    // SQS Queue
    // =========================================================================
    this.queue = new PasswordResetEmailQueue(this, "Queue", {
      lambdaTimeoutSeconds: lambdaTimeoutSeconds,
      maxReceiveCount: props.queue?.maxReceiveCount ?? 3,
      dlqRetentionDays: props.queue?.dlqRetentionDays ?? 14,
      resourcePrefix: resourcePrefix,
    });

    // =========================================================================
    // Lambda Functions
    // =========================================================================
    this.lambda = new PasswordResetEmailLambda(this, "Lambda", {
      queue: this.queue.queue,
      databaseUrl: props.databaseUrl,
      mailgunApiKeyParam: props.mailgunApiKeyParam,
      mailgunDomain: props.mailgunDomain,
      appUrl: props.appUrl,
      senderEmail: props.senderEmail,
      memoryMb: props.lambda?.memoryMb ?? 256,
      timeoutSeconds: lambdaTimeoutSeconds,
      logRetentionDays: logRetentionDays,
      resourcePrefix: resourcePrefix,
      enableCleanup: props.enableCleanup ?? true,
      cleanupSchedule: props.cleanupSchedule,
    });

    // =========================================================================
    // Stack Outputs
    // =========================================================================
    new CfnOutput(this, "QueueUrl", {
      value: this.queue.queueUrl,
      description: "SQS Queue URL for sending password reset email jobs",
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

    new CfnOutput(this, "SendFunctionName", {
      value: this.lambda.sendFunctionName,
      description: "Password Reset Email Sender Lambda function name",
      exportName: `${resourcePrefix}-sender-lambda`,
    });

    if (this.lambda.cleanupFunctionName) {
      new CfnOutput(this, "CleanupFunctionName", {
        value: this.lambda.cleanupFunctionName,
        description: "Token Cleanup Lambda function name",
        exportName: `${resourcePrefix}-cleanup-lambda`,
      });
    }
  }
}
