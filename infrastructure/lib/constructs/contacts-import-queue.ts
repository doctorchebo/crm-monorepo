/**
 * ContactsImportQueue Construct
 *
 * Creates an SQS queue for contacts import job messages.
 * Handles file parsing, validation, and import execution jobs.
 *
 * Architecture:
 * - Standard queue (not FIFO): Import jobs are idempotent
 * - Dead-letter queue: Failed jobs captured for debugging
 * - Visibility timeout: 2x Lambda timeout
 */

import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

export interface ContactsImportQueueProps {
  /**
   * Lambda timeout in seconds.
   * Visibility timeout will be set to 2x this value.
   * @default 300 (5 minutes)
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
   * @default 'contacts-import'
   */
  readonly resourcePrefix?: string;
}

export class ContactsImportQueue extends Construct {
  public readonly queue: sqs.Queue;
  public readonly deadLetterQueue: sqs.Queue;
  public readonly queueArn: string;
  public readonly queueUrl: string;
  public readonly dlqArn: string;

  constructor(
    scope: Construct,
    id: string,
    props: ContactsImportQueueProps = {},
  ) {
    super(scope, id);

    const lambdaTimeoutSeconds = props.lambdaTimeoutSeconds ?? 300;
    const maxReceiveCount = props.maxReceiveCount ?? 3;
    const dlqRetentionDays = props.dlqRetentionDays ?? 14;
    const resourcePrefix = props.resourcePrefix ?? "contacts-import";

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
      // Long polling - wait up to 20 seconds for messages before returning empty
      // This reduces the number of empty receives and lowers SQS API costs
      receiveMessageWaitTime: Duration.seconds(20),
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
