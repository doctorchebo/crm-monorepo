/**
 * PasswordResetEmailQueue Construct
 *
 * Creates an SQS queue for password reset email delivery.
 * Handles email sending jobs with retry and DLQ support.
 *
 * Architecture:
 * - Standard queue (not FIFO): Email jobs are idempotent
 * - Dead-letter queue: Failed jobs captured for debugging
 * - Visibility timeout: 2x Lambda timeout
 */

import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

export interface PasswordResetEmailQueueProps {
  /**
   * Lambda timeout in seconds.
   * Visibility timeout will be set to 2x this value.
   * @default 30 (30 seconds)
   */
  readonly lambdaTimeoutSeconds?: number;

  /**
   * Maximum receive count before sending to DLQ.
   * @default 3
   */
  readonly maxReceiveCount?: number;

  /**
   * DLQ retention in days.
   * @default 14
   */
  readonly dlqRetentionDays?: number;

  /**
   * Resource prefix for naming.
   * @default 'password-reset-email'
   */
  readonly resourcePrefix?: string;
}

export class PasswordResetEmailQueue extends Construct {
  public readonly queue: sqs.Queue;
  public readonly deadLetterQueue: sqs.Queue;
  public readonly queueArn: string;
  public readonly queueUrl: string;
  public readonly dlqArn: string;

  constructor(
    scope: Construct,
    id: string,
    props: PasswordResetEmailQueueProps = {},
  ) {
    super(scope, id);

    const lambdaTimeoutSeconds = props.lambdaTimeoutSeconds ?? 30;
    const maxReceiveCount = props.maxReceiveCount ?? 3;
    const dlqRetentionDays = props.dlqRetentionDays ?? 14;
    const resourcePrefix = props.resourcePrefix ?? "password-reset-email";

    // Visibility timeout = 2x Lambda timeout (AWS best practice)
    const visibilityTimeoutSeconds = lambdaTimeoutSeconds * 2;

    // Dead-letter queue for failed jobs
    this.deadLetterQueue = new sqs.Queue(this, "DeadLetterQueue", {
      queueName: `${resourcePrefix}-dlq`,
      retentionPeriod: Duration.days(dlqRetentionDays),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Main processing queue
    this.queue = new sqs.Queue(this, "ProcessingQueue", {
      queueName: `${resourcePrefix}-queue`,
      visibilityTimeout: Duration.seconds(visibilityTimeoutSeconds),
      retentionPeriod: Duration.days(4),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        maxReceiveCount: maxReceiveCount,
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.queueArn = this.queue.queueArn;
    this.queueUrl = this.queue.queueUrl;
    this.dlqArn = this.deadLetterQueue.queueArn;
  }
}
