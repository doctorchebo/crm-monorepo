/**
 * Test script for PDF thumbnail generation
 *
 * This script sends a thumbnail generation job to the SQS queue
 * to test the Chromium-based PDF thumbnail generation in Lambda.
 *
 * Usage:
 *   npx tsx test-pdf-thumbnail.ts
 */

import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const QUEUE_URL =
  "https://sqs.us-east-1.amazonaws.com/623951814628/media-compression-queue";
const BUCKET = "chatflowai-dev";

// Test PDF file from the bucket
const TEST_PDF_KEY =
  "3/chat_59167131914_59167162195/pending-1765830221539-b4zyt2sxf/cover letter.pdf";

async function main() {
  const client = new SQSClient({ region: "us-east-1" });

  // Create a thumbnail generation job
  const jobId = `test-pdf-thumb-${Date.now()}`;
  const thumbnailKey = TEST_PDF_KEY.replace(".pdf", "_thumb.jpg");

  const job = {
    jobId,
    jobType: "thumbnail", // Request thumbnail generation only
    inputBucket: BUCKET,
    inputKey: TEST_PDF_KEY,
    outputBucket: BUCKET,
    mimeType: "application/pdf",
    context: "message-attachment", // Required field for thumbnail jobs
    callback: {
      type: "webhook",
      url: "http://localhost:3001/webhook/media-compression", // Backend webhook
    },
  };

  console.log("Sending thumbnail job to SQS:");
  console.log(JSON.stringify(job, null, 2));

  const command = new SendMessageCommand({
    QueueUrl: QUEUE_URL,
    MessageBody: JSON.stringify(job),
  });

  try {
    const result = await client.send(command);
    console.log("\n✅ Job sent successfully!");
    console.log(`Message ID: ${result.MessageId}`);
    console.log(
      `\nCheck CloudWatch Logs for Lambda execution: media-compression-lambda`
    );
    console.log(`\nExpected thumbnail output: s3://${BUCKET}/${thumbnailKey}`);
  } catch (error) {
    console.error("❌ Failed to send job:", error);
    process.exit(1);
  }
}

main();
