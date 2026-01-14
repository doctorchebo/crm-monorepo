/**
 * Thumbnail Regeneration Service
 *
 * A robust, production-grade service for regenerating thumbnails with new resolution.
 * Features:
 * - Progress tracking with resume capability
 * - Batch processing with configurable concurrency
 * - Detailed logging and error reporting
 * - Dry-run mode for testing
 * - Force regeneration for ALL thumbnails (not just missing ones)
 *
 * Usage:
 *   npx ts-node scripts/thumbnail-regeneration status           - Show current status
 *   npx ts-node scripts/thumbnail-regeneration regenerate       - Regenerate all thumbnails
 *   npx ts-node scripts/thumbnail-regeneration regenerate --dry-run
 *   npx ts-node scripts/thumbnail-regeneration resume           - Resume interrupted job
 *
 * Options:
 *   --batch-size=N       Number of items to process per batch (default: 50)
 *   --concurrency=N      Parallel jobs per batch (default: 10)
 *   --force              Regenerate even if thumbnail exists (default: true for resolution upgrade)
 *   --dry-run            Show what would be done without making changes
 *   --direction=<value>  Filter: inbound, outbound, all (default: all)
 *   --verbose            Enable verbose logging
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from backend/.env
config({ path: resolve(__dirname, '../../.env') });

import { Logger, LogLevel } from './logger';
import { ProgressTracker } from './progress-tracker';
import {
  RegenerationOptions,
  RegenerationService,
} from './regeneration-service';

// ============================================================================
// CLI Interface
// ============================================================================

interface CliOptions {
  command: 'status' | 'regenerate' | 'resume' | 'help';
  batchSize: number;
  concurrency: number;
  force: boolean;
  dryRun: boolean;
  direction: 'inbound' | 'outbound' | 'all';
  verbose: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const command = (args[0] || 'help') as CliOptions['command'];

  const options: CliOptions = {
    command,
    batchSize: 50,
    concurrency: 10,
    force: true, // Default to true for resolution upgrade
    dryRun: false,
    direction: 'all',
    verbose: false,
  };

  for (const arg of args.slice(1)) {
    if (arg.startsWith('--batch-size=')) {
      options.batchSize = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--concurrency=')) {
      options.concurrency = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--direction=')) {
      options.direction = arg.split('=')[1] as CliOptions['direction'];
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--no-force') {
      options.force = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    }
  }

  return options;
}

function printHelp() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    🖼️  THUMBNAIL REGENERATION SERVICE                          ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  A robust service for regenerating thumbnails with new resolution settings.   ║
║  Supports progress tracking, resumption, and batch processing.                ║
╚═══════════════════════════════════════════════════════════════════════════════╝

USAGE:
  npx ts-node scripts/thumbnail-regeneration <command> [options]

COMMANDS:
  status        Show current regeneration status and statistics
  regenerate    Start regenerating all thumbnails with new resolution
  resume        Resume an interrupted regeneration job
  help          Show this help message

OPTIONS:
  --batch-size=N       Items per batch (default: 50)
  --concurrency=N      Parallel jobs per batch (default: 10)
  --force              Regenerate even if thumbnail exists (default: true)
  --no-force           Only regenerate missing thumbnails
  --dry-run            Preview without making changes
  --direction=<val>    Filter: inbound, outbound, all (default: all)
  --verbose            Enable detailed logging

EXAMPLES:
  # Check status before starting
  npx ts-node scripts/thumbnail-regeneration status

  # Preview what would be regenerated
  npx ts-node scripts/thumbnail-regeneration regenerate --dry-run

  # Start full regeneration
  npx ts-node scripts/thumbnail-regeneration regenerate

  # Resume if interrupted
  npx ts-node scripts/thumbnail-regeneration resume

  # Regenerate only inbound messages with smaller batches
  npx ts-node scripts/thumbnail-regeneration regenerate --direction=inbound --batch-size=20

ENVIRONMENT VARIABLES:
  AWS_REGION                    AWS region (default: us-east-1)
  AWS_S3_BUCKET_NAME            S3 bucket name (required)
  MEDIA_COMPRESSION_QUEUE_URL   SQS queue URL for Lambda jobs (required)
  BACKEND_URL                   Backend URL for callbacks (required)
  DATABASE_URL                  PostgreSQL connection string (required)
`);
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  const options = parseArgs();
  const logger = new Logger(options.verbose ? LogLevel.DEBUG : LogLevel.INFO);

  if (options.command === 'help') {
    printHelp();
    process.exit(0);
  }

  logger.banner('THUMBNAIL REGENERATION SERVICE');

  // Validate environment
  const requiredEnvVars = [
    ['AWS_S3_BUCKET_NAME', 'AWS_S3_BUCKET'],
    ['MEDIA_COMPRESSION_QUEUE_URL'],
    ['BACKEND_URL'],
  ];

  const missingVars = requiredEnvVars
    .filter((vars) => !vars.some((v) => process.env[v]))
    .map((vars) => vars[0]);
  if (missingVars.length > 0 && !options.dryRun) {
    logger.error(
      `Missing required environment variables: ${missingVars.join(', ')}`,
    );
    process.exit(1);
  }

  const progressTracker = new ProgressTracker(logger);
  const service = new RegenerationService(logger, progressTracker);

  const serviceOptions: RegenerationOptions = {
    batchSize: options.batchSize,
    concurrency: options.concurrency,
    force: options.force,
    dryRun: options.dryRun,
    direction: options.direction,
  };

  try {
    switch (options.command) {
      case 'status':
        await service.showStatus(serviceOptions);
        break;
      case 'regenerate':
        await service.regenerateAll(serviceOptions);
        break;
      case 'resume':
        await service.resume(serviceOptions);
        break;
      default:
        logger.error(`Unknown command: ${options.command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error: any) {
    logger.error(`Fatal error: ${error.message}`);
    if (options.verbose) {
      logger.error(error.stack);
    }
    process.exit(1);
  }

  process.exit(0);
}

main();
