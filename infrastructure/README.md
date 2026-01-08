# Media Compression Infrastructure

AWS CDK infrastructure for offloading media compression from the WhatsApp CRM backend to AWS Lambda.

## Architecture

```
Backend (NestJS)
      ↓
SQS Queue (media-compression-queue)
      ↓
Lambda (media-compression-lambda)
      ↓
S3 (compressed media output)
      ↓
Webhook → Backend
```

## Components

### 1. MediaProcessingQueue (`lib/constructs/media-processing-queue.ts`)

SQS queue for compression job messages with:

- **Dead-letter queue (DLQ)**: Failed jobs are captured for debugging
- **Visibility timeout**: 2× Lambda timeout to prevent duplicate processing
- **Max receive count**: 3 (initial + 2 retries)

### 2. MediaCompressionLambda (`lib/constructs/media-compression-lambda.ts`)

Lambda function for media compression with:

- **Runtime**: Node.js 20.x on ARM64 (better price/performance)
- **Memory**: 2048 MB (more CPU for ffmpeg)
- **Timeout**: 15 minutes (maximum Lambda timeout)
- **Ephemeral storage**: 10 GB for media processing
- **Reserved concurrency**: 5 (cost control)
- **ffmpeg**: Provided via Lambda Layer

### 3. MediaCompressionStack (`lib/media-compression-stack.ts`)

Main stack that wires everything together:

- Creates SQS queue with DLQ
- Creates Lambda with proper IAM permissions
- Optionally creates output S3 bucket with lifecycle rules
- Exports outputs needed by backend

## Message Contract

The backend sends compression jobs with this schema:

```json
{
  "jobId": "uuid",
  "inputBucket": "string",
  "inputKey": "string",
  "outputBucket": "string",
  "outputKey": "string",
  "mediaType": "video|image|audio",
  "targetMaxSizeMb": 16,
  "callback": {
    "type": "webhook",
    "url": "string"
  }
}
```

## Webhook Response

On completion, Lambda calls the webhook with:

```json
{
  "jobId": "uuid",
  "success": true,
  "result": {
    "originalSizeBytes": 50000000,
    "compressedSizeBytes": 15000000,
    "compressionRatio": 3.33,
    "processingTimeMs": 45000,
    "outputBucket": "string",
    "outputKey": "string"
  },
  "completedAt": "2024-01-01T00:00:00.000Z"
}
```

On failure:

```json
{
  "jobId": "uuid",
  "success": false,
  "error": "Error message",
  "completedAt": "2024-01-01T00:00:00.000Z"
}
```

## Backend Integration

The backend needs:

1. **Queue URL**: To send SQS messages
2. **Input bucket name**: Already known (existing bucket)
3. **Output bucket name**: From stack outputs

Example backend code (TypeScript):

```typescript
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const sqs = new SQSClient({});

async function queueCompressionJob(params: {
  mediaId: string;
  s3Key: string;
  s3Bucket: string;
  outputKey: string;
  mediaType: "video" | "image" | "audio";
  callbackUrl: string;
}) {
  const message = {
    jobId: params.mediaId,
    inputBucket: params.s3Bucket,
    inputKey: params.s3Key,
    outputBucket: process.env.OUTPUT_BUCKET,
    outputKey: params.outputKey,
    mediaType: params.mediaType,
    targetMaxSizeMb: 16,
    callback: {
      type: "webhook",
      url: params.callbackUrl,
    },
  };

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: process.env.COMPRESSION_QUEUE_URL,
      MessageBody: JSON.stringify(message),
    })
  );
}
```

## IAM Permissions

All permissions follow least privilege:

| Resource         | Permission     | Scope                |
| ---------------- | -------------- | -------------------- |
| Input S3 Bucket  | Read           | Specific bucket ARN  |
| Output S3 Bucket | Write          | Specific bucket ARN  |
| SQS Queue        | Receive/Delete | Specific queue ARN   |
| CloudWatch Logs  | Write          | Function's log group |

**No wildcard permissions are used.**

## Configuration

### Environment Variables (CDK App)

| Variable              | Description                                     | Required |
| --------------------- | ----------------------------------------------- | -------- |
| `INPUT_BUCKET_ARN`    | ARN of existing S3 bucket for input media       | Yes      |
| `OUTPUT_BUCKET_ARN`   | ARN of existing S3 bucket for output (optional) | No       |
| `FFMPEG_LAYER_ARN`    | ARN of ffmpeg Lambda Layer                      | Yes      |
| `CDK_DEFAULT_ACCOUNT` | AWS account ID                                  | Yes      |
| `CDK_DEFAULT_REGION`  | AWS region                                      | Yes      |

### CDK Context (Alternative)

```bash
cdk deploy \
  -c inputBucketArn=arn:aws:s3:::my-input-bucket \
  -c outputBucketArn=arn:aws:s3:::my-output-bucket \
  -c ffmpegLayerArn=arn:aws:lambda:us-east-1:123456789:layer:ffmpeg:1
```

## Stack Outputs

After deployment, the stack exports:

| Output               | Description                        |
| -------------------- | ---------------------------------- |
| `QueueUrl`           | SQS queue URL for sending messages |
| `QueueArn`           | SQS queue ARN for IAM policies     |
| `DlqArn`             | Dead-letter queue ARN              |
| `InputBucketName`    | Input S3 bucket name               |
| `OutputBucketName`   | Output S3 bucket name              |
| `LambdaFunctionName` | Lambda function name               |
| `LambdaFunctionArn`  | Lambda function ARN                |

## Cost Controls

| Control              | Value   | Reason                            |
| -------------------- | ------- | --------------------------------- |
| Reserved concurrency | 5       | Limits parallel Lambda executions |
| Batch size           | 1       | One job per Lambda invocation     |
| Max retry attempts   | 2       | Prevents infinite retry loops     |
| Log retention        | 14 days | Balances debugging vs. cost       |
| Artifact retention   | 7 days  | Prevents orphaned files           |

## Constraints Enforced

✅ **Services**: Only Lambda, SQS, S3, CloudWatch Logs, IAM (via grants)  
✅ **IAM**: No wildcards, least privilege, scoped by ARN  
✅ **Lambda**: 15min timeout, arm64, nodejs20.x  
✅ **ffmpeg**: Via Lambda Layer (not bundled)  
✅ **Error handling**: Fail fast, DLQ, structured logs  
✅ **Cost control**: Reserved concurrency, lifecycle rules

## Project Structure

```
infrastructure/
├── bin/
│   └── app.ts                 # CDK app entry point
├── lib/
│   ├── index.ts               # Library exports
│   ├── media-compression-stack.ts
│   └── constructs/
│       ├── index.ts
│       ├── media-processing-queue.ts
│       └── media-compression-lambda.ts
├── lambda/
│   └── media-compression/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts       # Lambda handler
│           ├── types.ts       # Type definitions
│           ├── logger.ts      # Structured logging
│           ├── s3-operations.ts
│           ├── ffmpeg-compression.ts
│           └── webhook.ts
├── cdk.json
├── package.json
├── tsconfig.json
└── README.md
```

## Development

```bash
# Install dependencies
cd infrastructure
npm install

# Build Lambda
cd lambda/media-compression
npm install
npm run build

# Synthesize CloudFormation
cd ../..
npx cdk synth

# Deploy (requires AWS credentials)
npx cdk deploy
```

## ffmpeg Lambda Layer

The Lambda requires an ffmpeg layer. Options:

1. **Public layer** (recommended for testing):

   - `arn:aws:lambda:us-east-1:764866452798:layer:ffmpeg:1`

2. **Build your own** (recommended for production):
   - See: https://github.com/serverlesspub/ffmpeg-aws-lambda-layer

The layer must contain:

- `/opt/bin/ffmpeg`
- `/opt/bin/ffprobe`

Built for `arm64` Linux.
