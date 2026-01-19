/**
 * Local Runner for Invitation Email Lambda
 *
 * Simulates SQS trigger for local development and testing.
 *
 * Usage:
 *   npx ts-node src/local-runner.ts [invitationId]
 */

import { sendHandler } from "./index";
import type { SQSEvent } from "aws-lambda";

// Set environment for local development
process.env.EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "mock";
process.env.APP_URL = process.env.APP_URL || "http://localhost:3000";

async function main() {
  const invitationId = parseInt(process.argv[2] || "1", 10);

  console.log(
    `\nLocal runner: Testing invitation email for ID ${invitationId}\n`,
  );

  // Simulate SQS message
  const testMessage = {
    invitationId,
    email: "test@example.com",
    teamName: "Test Team",
    inviterName: "John Doe",
    token: "test-token-12345",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    role: "agent",
  };

  const sqsEvent: SQSEvent = {
    Records: [
      {
        messageId: "test-message-id",
        receiptHandle: "test-receipt",
        body: JSON.stringify(testMessage),
        attributes: {
          ApproximateReceiveCount: "1",
          SentTimestamp: Date.now().toString(),
          SenderId: "test-sender",
          ApproximateFirstReceiveTimestamp: Date.now().toString(),
        },
        messageAttributes: {},
        md5OfBody: "",
        eventSource: "aws:sqs",
        eventSourceARN: "arn:aws:sqs:us-east-1:123456789:test-queue",
        awsRegion: "us-east-1",
      },
    ],
  };

  try {
    const result = await sendHandler(sqsEvent);
    console.log("\nResult:", JSON.stringify(result, null, 2));

    if (result.batchItemFailures.length === 0) {
      console.log("\n✓ Email processed successfully");
    } else {
      console.log("\n✗ Email processing failed (would retry)");
    }
  } catch (error) {
    console.error("\nFatal error:", error);
    process.exit(1);
  }
}

main();
