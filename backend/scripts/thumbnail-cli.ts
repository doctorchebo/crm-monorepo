/**
 * Thumbnail Management CLI Script
 *
 * This script provides CLI commands for thumbnail management.
 * Uses direct database and S3 access for standalone operation.
 *
 * Usage:
 *   npx ts-node scripts/thumbnail-cli.ts repair      - Repair orphaned thumbnails (exist in S3, missing in DB)
 *   npx ts-node scripts/thumbnail-cli.ts regenerate  - Regenerate missing thumbnails via Lambda
 *   npx ts-node scripts/thumbnail-cli.ts status      - Show thumbnail status summary
 *
 * Options:
 *   --direction=inbound|outbound|all  - Filter by message direction (default: all)
 *   --limit=N                         - Limit number of items to process
 *   --dry-run                         - Show what would be done without making changes
 */

import { config } from 'dotenv';
config();

import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../src/database/db.connection';
import { messages } from '../src/database/schema';

// ============================================================================
// Configuration
// ============================================================================

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});
const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const bucketName = process.env.AWS_S3_BUCKET || 'chatflowai-dev';
const queueUrl = process.env.MEDIA_COMPRESSION_QUEUE_URL || '';
const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';

// ============================================================================
// Types
// ============================================================================

interface CliOptions {
  command: 'repair' | 'regenerate' | 'status' | 'help';
  direction: 'inbound' | 'outbound' | 'all';
  limit?: number;
  dryRun: boolean;
}

interface AttachmentInfo {
  messageId: string;
  attachmentId: string;
  s3Key: string;
  mediaType: 'image' | 'video' | 'document';
  mimeType: string;
  chatId: string;
  direction: 'inbound' | 'outbound';
  thumbnailStatus?: string;
  thumbnailKey?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const command = (args[0] || 'help') as CliOptions['command'];

  let direction: CliOptions['direction'] = 'all';
  let limit: number | undefined;
  let dryRun = false;

  for (const arg of args.slice(1)) {
    if (arg.startsWith('--direction=')) {
      direction = arg.split('=')[1] as CliOptions['direction'];
    } else if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  return { command, direction, limit, dryRun };
}

function generateThumbnailKey(originalKey: string): string {
  const lastDot = originalKey.lastIndexOf('.');
  const baseName =
    lastDot > -1 ? originalKey.substring(0, lastDot) : originalKey;
  return `${baseName}_thumb.jpg`;
}

async function checkS3FileExists(
  key: string,
): Promise<{ exists: boolean; size?: number }> {
  try {
    const command = new HeadObjectCommand({ Bucket: bucketName, Key: key });
    const response = await s3Client.send(command);
    return { exists: true, size: response.ContentLength };
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return { exists: false };
    }
    throw error;
  }
}

function supportsThumbnail(mediaType: string, mimeType?: string): boolean {
  if (mediaType === 'image' || mediaType === 'video') return true;
  if (mediaType === 'document' && mimeType === 'application/pdf') return true;
  return false;
}

// ============================================================================
// Data Access Functions
// ============================================================================

async function getAttachmentsNeedingThumbnails(options: {
  direction: CliOptions['direction'];
  limit?: number;
}): Promise<AttachmentInfo[]> {
  const { direction, limit } = options;
  const result: AttachmentInfo[] = [];

  const allMessages = await db.query.messages.findMany({
    columns: {
      messageId: true,
      chatId: true,
      direction: true,
      attachments: true,
    },
  });

  for (const message of allMessages) {
    if (!message.attachments || !Array.isArray(message.attachments)) continue;

    const msgDirection = message.direction as 'inbound' | 'outbound';
    if (direction !== 'all' && msgDirection !== direction) continue;

    const attachments = message.attachments as any[];

    for (const attachment of attachments) {
      if (!attachment.s3Key) continue;

      const type = attachment.type as string;
      if (!['image', 'video', 'document'].includes(type)) continue;

      // Skip if thumbnail already ready
      if (attachment.thumbnailStatus === 'ready' && attachment.thumbnailKey)
        continue;

      // Skip non-PDF documents
      if (type === 'document' && attachment.mimeType !== 'application/pdf')
        continue;

      result.push({
        messageId: message.messageId,
        attachmentId: attachment.id,
        s3Key: attachment.s3Key,
        mediaType: type as 'image' | 'video' | 'document',
        mimeType: attachment.mimeType || 'application/octet-stream',
        chatId: message.chatId,
        direction: msgDirection,
        thumbnailStatus: attachment.thumbnailStatus,
        thumbnailKey: attachment.thumbnailKey,
      });

      if (limit && result.length >= limit) return result;
    }
  }

  return result;
}

async function queueThumbnailJob(attachment: AttachmentInfo): Promise<boolean> {
  if (!queueUrl) {
    console.error('  ❌ MEDIA_COMPRESSION_QUEUE_URL not configured');
    return false;
  }

  if (!supportsThumbnail(attachment.mediaType, attachment.mimeType)) {
    console.log(`  ⏭️  Skipping unsupported type: ${attachment.mimeType}`);
    return false;
  }

  const jobId = uuidv4();
  const outputKey = generateThumbnailKey(attachment.s3Key);

  const message = {
    jobType: 'thumbnail',
    jobId,
    inputBucket: bucketName,
    inputKey: attachment.s3Key,
    outputBucket: bucketName,
    outputKey,
    mimeType: attachment.mimeType,
    context: 'message-attachment',
    entityIds: {
      messageId: attachment.messageId,
      attachmentId: attachment.attachmentId,
      chatId: attachment.chatId,
    },
    callback: {
      type: 'webhook',
      url: `${backendUrl}/api/v1/media/thumbnail/callback`,
    },
    safety: {
      attempt: 1,
      maxAttempts: 3,
      createdAt: new Date().toISOString(),
      maxAgeMs: 60 * 60 * 1000,
    },
  };

  try {
    const isFifo = queueUrl.endsWith('.fifo');
    const commandInput: any = {
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message),
      MessageAttributes: {
        jobType: { DataType: 'String', StringValue: 'thumbnail' },
        context: { DataType: 'String', StringValue: 'message-attachment' },
      },
    };

    if (isFifo) {
      commandInput.MessageGroupId = attachment.chatId || attachment.messageId;
      commandInput.MessageDeduplicationId = jobId;
    }

    await sqsClient.send(new SendMessageCommand(commandInput));
    return true;
  } catch (error: any) {
    console.error(`  ❌ Failed to queue: ${error.message}`);
    return false;
  }
}

// ============================================================================
// Commands
// ============================================================================

function printHelp() {
  console.log(`
🖼️  Thumbnail Management CLI

Usage:
  npx ts-node scripts/thumbnail-cli.ts <command> [options]

Commands:
  repair      - Repair orphaned thumbnails (exist in S3 but missing in DB)
  regenerate  - Regenerate missing thumbnails via Lambda
  status      - Show thumbnail status summary

Options:
  --direction=<value>  Filter by message direction: inbound, outbound, all (default: all)
  --limit=<N>          Limit number of items to process
  --dry-run            Show what would be done without making changes

Examples:
  npx ts-node scripts/thumbnail-cli.ts status
  npx ts-node scripts/thumbnail-cli.ts repair --direction=inbound
  npx ts-node scripts/thumbnail-cli.ts regenerate --limit=10 --dry-run
  npx ts-node scripts/thumbnail-cli.ts regenerate --direction=outbound
`);
}

async function showStatus(options: CliOptions) {
  console.log('📊 Thumbnail Status Summary\n');
  console.log('='.repeat(60));
  console.log(`S3 Bucket: ${bucketName}`);
  console.log(`SQS Queue: ${queueUrl || '❌ NOT CONFIGURED'}`);
  console.log(`Backend URL: ${backendUrl}`);
  console.log('='.repeat(60));
  console.log('');

  const attachments = await getAttachmentsNeedingThumbnails({
    direction: options.direction,
  });

  const stats = {
    inbound: { image: 0, video: 0, document: 0 },
    outbound: { image: 0, video: 0, document: 0 },
  };

  for (const a of attachments) {
    stats[a.direction][a.mediaType]++;
  }

  console.log(`Direction filter: ${options.direction}`);
  console.log(`Total attachments needing thumbnails: ${attachments.length}\n`);

  console.log('By Direction:');
  console.log(
    `  Inbound:  ${stats.inbound.image + stats.inbound.video + stats.inbound.document}`,
  );
  console.log(`    - Images:    ${stats.inbound.image}`);
  console.log(`    - Videos:    ${stats.inbound.video}`);
  console.log(`    - Documents: ${stats.inbound.document}`);
  console.log(
    `  Outbound: ${stats.outbound.image + stats.outbound.video + stats.outbound.document}`,
  );
  console.log(`    - Images:    ${stats.outbound.image}`);
  console.log(`    - Videos:    ${stats.outbound.video}`);
  console.log(`    - Documents: ${stats.outbound.document}`);

  console.log('\n' + '='.repeat(60));

  if (attachments.length > 0) {
    console.log('\nRun the following to fix:');
    console.log('  1. First try repair (for thumbnails already in S3):');
    console.log('     npx ts-node scripts/thumbnail-cli.ts repair');
    console.log('  2. Then regenerate remaining (via Lambda):');
    console.log('     npx ts-node scripts/thumbnail-cli.ts regenerate');
  }
}

async function repairThumbnails(options: CliOptions) {
  console.log('🔧 Repairing orphaned thumbnails...\n');

  if (options.dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  const attachments = await getAttachmentsNeedingThumbnails({
    direction: options.direction,
    limit: options.limit,
  });

  console.log(`Found ${attachments.length} attachments to check\n`);

  let repaired = 0;
  let notInS3 = 0;
  let failed = 0;

  for (const a of attachments) {
    console.log(`\n🔍 Checking: ${a.attachmentId}`);
    console.log(`   S3 Key: ${a.s3Key}`);

    const thumbnailKey = generateThumbnailKey(a.s3Key);

    if (options.dryRun) {
      console.log(`   Would check S3 for: ${thumbnailKey}`);
      continue;
    }

    try {
      const s3Check = await checkS3FileExists(thumbnailKey);

      if (!s3Check.exists) {
        notInS3++;
        console.log(`   ❌ Not found in S3`);
        continue;
      }

      console.log(`   📦 Found in S3! Size: ${s3Check.size} bytes`);

      // Update the database
      const message = await db.query.messages.findFirst({
        where: eq(messages.messageId, a.messageId),
      });

      if (!message || !message.attachments) {
        failed++;
        console.log(`   ❌ Message not found in DB`);
        continue;
      }

      const attachmentsList = message.attachments as any[];
      const attachmentIndex = attachmentsList.findIndex(
        (att: any) => att.id === a.attachmentId,
      );

      if (attachmentIndex === -1) {
        failed++;
        console.log(`   ❌ Attachment not found in message`);
        continue;
      }

      attachmentsList[attachmentIndex] = {
        ...attachmentsList[attachmentIndex],
        thumbnailKey,
        thumbnailStatus: 'ready',
      };

      await db
        .update(messages)
        .set({ attachments: attachmentsList as any })
        .where(eq(messages.messageId, a.messageId));

      repaired++;
      console.log(`   ✅ REPAIRED!`);
    } catch (error: any) {
      failed++;
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  if (!options.dryRun) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 REPAIR SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Repaired:  ${repaired}`);
    console.log(`📦 Not in S3: ${notInS3}`);
    console.log(`❌ Failed:    ${failed}`);
    console.log('='.repeat(60));

    if (notInS3 > 0) {
      console.log(
        '\n⚠️  Run "regenerate" command to generate missing thumbnails via Lambda',
      );
    }
  }
}

async function regenerateThumbnails(options: CliOptions) {
  console.log('🚀 Regenerating missing thumbnails via Lambda...\n');

  if (!queueUrl) {
    console.error(
      '❌ MEDIA_COMPRESSION_QUEUE_URL not configured. Cannot queue Lambda jobs.',
    );
    process.exit(1);
  }

  if (options.dryRun) {
    console.log('⚠️  DRY RUN MODE - No jobs will be queued\n');
  }

  const attachments = await getAttachmentsNeedingThumbnails({
    direction: options.direction,
    limit: options.limit,
  });

  if (attachments.length === 0) {
    console.log('✅ No attachments need thumbnail generation!');
    return;
  }

  console.log(
    `📋 Found ${attachments.length} attachments needing thumbnails\n`,
  );

  let queued = 0;
  let failed = 0;

  for (const a of attachments) {
    console.log(`\n📤 Queueing: ${a.attachmentId}`);
    console.log(`   S3 Key: ${a.s3Key}`);
    console.log(`   Type: ${a.mediaType} (${a.direction})`);

    if (options.dryRun) {
      console.log(`   Would queue to Lambda`);
      continue;
    }

    // Update status to pending before queueing
    try {
      const message = await db.query.messages.findFirst({
        where: eq(messages.messageId, a.messageId),
      });

      if (message && message.attachments) {
        const attachmentsList = message.attachments as any[];
        const attachmentIndex = attachmentsList.findIndex(
          (att: any) => att.id === a.attachmentId,
        );

        if (attachmentIndex !== -1) {
          attachmentsList[attachmentIndex] = {
            ...attachmentsList[attachmentIndex],
            thumbnailStatus: 'pending',
          };

          await db
            .update(messages)
            .set({ attachments: attachmentsList as any })
            .where(eq(messages.messageId, a.messageId));
        }
      }
    } catch (error) {
      // Non-fatal - continue with queueing
    }

    const success = await queueThumbnailJob(a);
    if (success) {
      queued++;
      console.log(`   ✅ Queued to Lambda`);
    } else {
      failed++;
    }
  }

  if (!options.dryRun) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 REGENERATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Queued: ${queued}`);
    console.log(`❌ Failed: ${failed}`);
    console.log('='.repeat(60));

    if (queued > 0) {
      console.log(
        '\n✅ Jobs queued to Lambda. Thumbnails will be generated asynchronously.',
      );
      console.log(
        `   Callback URL: ${backendUrl}/api/v1/media/thumbnail/callback`,
      );
      console.log(
        '   ⚠️  Make sure BACKEND_URL is publicly reachable for Lambda callbacks!',
      );
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const options = parseArgs();

  if (options.command === 'help') {
    printHelp();
    process.exit(0);
  }

  console.log('🖼️  Thumbnail Management CLI\n');

  try {
    switch (options.command) {
      case 'status':
        await showStatus(options);
        break;
      case 'repair':
        await repairThumbnails(options);
        break;
      case 'regenerate':
        await regenerateThumbnails(options);
        break;
      default:
        console.error(`Unknown command: ${options.command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }

  process.exit(0);
}

main();
