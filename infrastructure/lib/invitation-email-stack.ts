/**
 * InvitationEmailStack
 *
 * Main CDK stack for invitation email infrastructure:
 * - SQS queue with DLQ for email jobs
 * - Lambda function for sending emails via Mailgun
 * - Lambda function for cleaning up expired invitations
 * - EventBridge rule for scheduled cleanup
 *
 * Backend integration:
 * The backend needs this output to send email jobs:
 * - queueUrl: URL to send SQS messages
 *
 * Message format (sent by backend):
 * ```json
 * {
 *   "invitationId": number,
 *   "email": "string",
 *   "teamName": "string",
 *   "inviterName": "string",
 *   "token": "string",
 *   "expiresAt": "ISO date string"
 * }
 * ```
 */

import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { InvitationEmailLambda } from "./constructs/invitation-email-lambda";
import { InvitationEmailQueue } from "./constructs/invitation-email-queue";

export interface InvitationEmailStackProps extends StackProps {
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
   * Application URL for invitation links
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
   * @default 'invitation-email'
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

export class InvitationEmailStack extends Stack {
  public readonly queue: InvitationEmailQueue;
  public readonly lambda: InvitationEmailLambda;

  constructor(scope: Construct, id: string, props: InvitationEmailStackProps) {
    super(scope, id, props);

    const resourcePrefix = props.resourcePrefix ?? "invitation-email";
    const logRetentionDays = props.logRetentionDays ?? 14;
    const lambdaTimeoutSeconds = props.lambda?.timeoutSeconds ?? 30;

    // =========================================================================
    // SQS Queue
    // =========================================================================
    this.queue = new InvitationEmailQueue(this, "Queue", {
      lambdaTimeoutSeconds: lambdaTimeoutSeconds,
      maxReceiveCount: props.queue?.maxReceiveCount ?? 3,
      dlqRetentionDays: props.queue?.dlqRetentionDays ?? 14,
      resourcePrefix: resourcePrefix,
    });

    // =========================================================================
    // Lambda Functions
    // =========================================================================
    this.lambda = new InvitationEmailLambda(this, "Lambda", {
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
      description: "SQS Queue URL for sending invitation email jobs",
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
      description: "Invitation Email Sender Lambda function name",
      exportName: `${resourcePrefix}-sender-lambda`,
    });

    if (this.lambda.cleanupFunctionName) {
      new CfnOutput(this, "CleanupFunctionName", {
        value: this.lambda.cleanupFunctionName,
        description: "Invitation Cleanup Lambda function name",
        exportName: `${resourcePrefix}-cleanup-lambda`,
      });
    }
  }
}
