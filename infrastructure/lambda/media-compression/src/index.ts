/**
 * Media Processing Lambda Handler
 *
 * Entry point for the Lambda function that processes media jobs:
 * - Compression: Reduce file size for WhatsApp compatibility
 * - Thumbnail: Generate preview images for images/videos
 *
 * Flow:
 * 1. Receive SQS message with job details
 * 2. Determine job type (compression or thumbnail)
 * 3. Validate message and check ephemeral storage limits
 * 4. Download source media from S3
 * 5. Process (compress or generate thumbnail)
 * 6. Upload result to S3
 * 7. Send webhook notification to backend
 *
 * Error handling:
 * - Fail fast if media exceeds ephemeral storage
 * - Log structured errors for CloudWatch analysis
 * - Let SQS retry naturally on failures
 * - Messages go to DLQ after max attempts
 *
 * Environment variables:
 * - INPUT_BUCKET: Expected input bucket name (for validation)
 * - OUTPUT_BUCKET: Expected output bucket name (for validation)
 * - FFMPEG_PATH: Path to ffmpeg binary (default: /opt/bin/ffmpeg)
 * - FFPROBE_PATH: Path to ffprobe binary (default: /opt/bin/ffprobe)
 */

import { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from "aws-lambda";
import * as fs from "fs";
import * as path from "path";
import {
  compressMedia,
  getOutputContentType,
  getOutputExtension,
} from "./ffmpeg-compression";
import { logger } from "./logger";
import {
  deleteFromS3,
  downloadFromS3,
  getObjectSize,
  uploadToS3,
  validateBuckets,
} from "./s3-operations";
import {
  isPermanentError,
  validateJobSafety,
  validateThumbnailFileSize,
} from "./safety";
import {
  generateThumbnail,
  generateThumbnailKey,
  supportsThumbnailGeneration,
} from "./thumbnail-generator";
import {
  CompressionJobMessage,
  CompressionResult,
  MediaJobMessage,
  ThumbnailJobMessage,
  ThumbnailResult as ThumbnailJobResult,
} from "./types";
import { sendWebhookNotification } from "./webhook";

// Lambda ephemeral storage directory
const TMP_DIR = "/tmp";

// Maximum safe file size for ephemeral storage (leave buffer for processing)
// Default ephemeral storage is 10GB, we need space for input + output + overhead
const MAX_SAFE_INPUT_SIZE_BYTES = 4 * 1024 * 1024 * 1024; // 4GB (conservative)

// Environment variables
const EXPECTED_INPUT_BUCKET = process.env.INPUT_BUCKET;
const EXPECTED_OUTPUT_BUCKET = process.env.OUTPUT_BUCKET;
const DELETE_ORIGINAL =
  process.env.DELETE_ORIGINAL_AFTER_COMPRESSION === "true";

/**
 * Validate the job message and determine type
 */
function validateMessage(message: unknown): MediaJobMessage {
  const msg = message as MediaJobMessage;

  // Check job type - default to compression for backward compatibility
  const jobType = (msg as any).jobType || "compression";

  if (!msg.jobId || typeof msg.jobId !== "string") {
    throw new Error("Invalid message: missing or invalid jobId");
  }

  if (!msg.inputBucket || typeof msg.inputBucket !== "string") {
    throw new Error("Invalid message: missing or invalid inputBucket");
  }

  if (!msg.inputKey || typeof msg.inputKey !== "string") {
    throw new Error("Invalid message: missing or invalid inputKey");
  }

  if (!msg.outputBucket || typeof msg.outputBucket !== "string") {
    throw new Error("Invalid message: missing or invalid outputBucket");
  }

  if (!msg.callback || typeof msg.callback !== "object") {
    throw new Error("Invalid message: missing or invalid callback");
  }

  if (msg.callback.type !== "webhook" || !msg.callback.url) {
    throw new Error(
      'Invalid message: callback must have type "webhook" and a url'
    );
  }

  // Validate based on job type
  if (jobType === "thumbnail") {
    const thumbMsg = msg as ThumbnailJobMessage;
    if (!thumbMsg.mimeType || typeof thumbMsg.mimeType !== "string") {
      throw new Error("Invalid thumbnail message: missing or invalid mimeType");
    }
    if (
      !thumbMsg.context ||
      !["kb-media", "message-attachment"].includes(thumbMsg.context)
    ) {
      throw new Error("Invalid thumbnail message: missing or invalid context");
    }
    return thumbMsg;
  } else {
    // Compression job validation
    const compMsg = msg as CompressionJobMessage;
    if (!compMsg.outputKey || typeof compMsg.outputKey !== "string") {
      throw new Error("Invalid message: missing or invalid outputKey");
    }
    if (
      !compMsg.mediaType ||
      !["video", "image", "audio"].includes(compMsg.mediaType)
    ) {
      throw new Error("Invalid message: missing or invalid mediaType");
    }
    if (
      !compMsg.targetMaxSizeMb ||
      typeof compMsg.targetMaxSizeMb !== "number" ||
      compMsg.targetMaxSizeMb <= 0
    ) {
      throw new Error("Invalid message: missing or invalid targetMaxSizeMb");
    }
    return compMsg;
  }
}

/**
 * Check if message is a thumbnail job
 */
function isThumbnailJob(msg: MediaJobMessage): msg is ThumbnailJobMessage {
  return (msg as any).jobType === "thumbnail";
}

/**
 * Clean up temporary files
 */
function cleanup(...paths: (string | undefined)[]): void {
  for (const filePath of paths) {
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      // Log but don't throw - cleanup failure is not critical
      logger.warn("Cleanup failed", undefined, {
        error: error instanceof Error ? error.message : String(error),
        path: filePath,
      });
    }
  }
}

/**
 * Process a thumbnail generation job
 *
 * SAFETY: This function includes multiple safeguards to prevent infinite loops:
 * 1. Job safety validation (max attempts, max age)
 * 2. File size validation
 * 3. Permanent error detection (errors that should not be retried)
 */
async function processThumbnailJob(
  message: ThumbnailJobMessage
): Promise<ThumbnailJobResult> {
  const {
    jobId,
    inputBucket,
    inputKey,
    outputBucket,
    outputKey,
    mimeType,
    context,
    entityIds,
    callback,
    safety,
  } = message;
  const startTime = Date.now();

  let inputPath = "";

  // SAFETY CHECK 1: Validate job safety (max attempts, expiry)
  const safetyResult = validateJobSafety(message);
  if (!safetyResult.isValid) {
    logger.error("Job failed safety validation", jobId, {
      error: safetyResult.error,
      errorCode: safetyResult.errorCode,
      attempt: safetyResult.attempt,
      maxAttempts: safetyResult.maxAttempts,
    });

    const result: ThumbnailJobResult = {
      success: false,
      jobId,
      jobType: "thumbnail",
      error: safetyResult.error,
      errorCode: safetyResult.errorCode,
      permanentFailure: true,
      context,
      entityIds,
      processingTimeMs: Date.now() - startTime,
      safetyInfo: {
        attempt: safetyResult.attempt,
        maxAttempts: safetyResult.maxAttempts,
        ageMs: safetyResult.ageMs,
      },
    };
    await sendWebhookNotification(callback, result);
    return result;
  }

  try {
    logger.info("Processing thumbnail job", jobId, {
      inputBucket,
      inputKey,
      mimeType,
      context,
      attempt: safetyResult.attempt,
      maxAttempts: safetyResult.maxAttempts,
    });

    // Check if this media type supports thumbnails
    if (!supportsThumbnailGeneration(mimeType)) {
      logger.info("Media type does not support thumbnails", jobId, {
        mimeType,
      });
      const result: ThumbnailJobResult = {
        success: true,
        jobId,
        jobType: "thumbnail",
        context,
        entityIds,
        processingTimeMs: Date.now() - startTime,
      };
      await sendWebhookNotification(callback, result);
      return result;
    }

    // Validate bucket names match expected values (security check)
    if (EXPECTED_INPUT_BUCKET && EXPECTED_OUTPUT_BUCKET) {
      validateBuckets(
        inputBucket,
        outputBucket,
        EXPECTED_INPUT_BUCKET,
        EXPECTED_OUTPUT_BUCKET
      );
    }

    // SAFETY CHECK 2: Check input file size
    const inputSize = await getObjectSize(inputBucket, inputKey);
    logger.info("Input file size for thumbnail", jobId, {
      sizeBytes: inputSize,
    });

    const sizeValidation = validateThumbnailFileSize(inputSize, jobId);
    if (!sizeValidation.isValid) {
      const result: ThumbnailJobResult = {
        success: false,
        jobId,
        jobType: "thumbnail",
        error: sizeValidation.error,
        errorCode: "FILE_TOO_LARGE",
        permanentFailure: true,
        context,
        entityIds,
        processingTimeMs: Date.now() - startTime,
      };
      await sendWebhookNotification(callback, result);
      return result;
    }

    // Download source file
    const extension = path.extname(inputKey) || ".bin";
    inputPath = path.join(TMP_DIR, `${jobId}-thumb-input${extension}`);
    await downloadFromS3(inputBucket, inputKey, inputPath, jobId);

    // Read the file into buffer
    const inputBuffer = fs.readFileSync(inputPath);

    // Generate thumbnail with context-aware configuration
    // - kb-media: Smaller thumbnails (300x300) for file browser UI
    // - message-attachment: Larger thumbnails (600x600) for chat with readable text
    const thumbResult = await generateThumbnail(
      inputBuffer,
      mimeType,
      TMP_DIR,
      context
    );

    if (!thumbResult.success || !thumbResult.thumbnailBuffer) {
      // Check if this is a permanent error that shouldn't be retried
      if (thumbResult.permanentError) {
        logger.warn("Thumbnail generation permanently failed", jobId, {
          error: thumbResult.error,
          permanentError: true,
        });
        const result: ThumbnailJobResult = {
          success: false,
          jobId,
          jobType: "thumbnail",
          error: thumbResult.error,
          errorCode: "PROCESSING_ERROR",
          permanentFailure: true,
          context,
          entityIds,
          processingTimeMs: Date.now() - startTime,
        };
        await sendWebhookNotification(callback, result);
        cleanup(inputPath);
        return result;
      }

      // Non-fatal: some media types just don't have thumbnails
      if (thumbResult.error) {
        logger.warn("Thumbnail generation failed (non-fatal)", jobId, {
          error: thumbResult.error,
        });
      }
      const result: ThumbnailJobResult = {
        success: true,
        jobId,
        jobType: "thumbnail",
        context,
        entityIds,
        processingTimeMs: Date.now() - startTime,
      };
      await sendWebhookNotification(callback, result);
      cleanup(inputPath);
      return result;
    }

    // Determine output key
    const thumbnailKey = outputKey || generateThumbnailKey(inputKey);

    // Upload thumbnail to S3
    await uploadToS3(
      outputBucket,
      thumbnailKey,
      thumbResult.thumbnailBuffer,
      "image/jpeg",
      jobId
    );

    logger.info("Thumbnail uploaded successfully", jobId, {
      thumbnailKey,
      size: thumbResult.thumbnailBuffer.length,
      width: thumbResult.width,
      height: thumbResult.height,
    });

    // Build result
    const result: ThumbnailJobResult = {
      success: true,
      jobId,
      jobType: "thumbnail",
      thumbnailKey,
      width: thumbResult.width,
      height: thumbResult.height,
      blurhash: thumbResult.blurhash,
      duration: thumbResult.duration,
      processingTimeMs: Date.now() - startTime,
      outputLocation: {
        bucket: outputBucket,
        key: thumbnailKey,
      },
      context,
      entityIds,
    };

    // Send success webhook
    await sendWebhookNotification(callback, result);

    // Cleanup
    cleanup(inputPath);

    logger.info("Thumbnail job completed", jobId, {
      processingTimeMs: result.processingTimeMs,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const permanent = isPermanentError(
      error instanceof Error ? error : errorMessage
    );

    logger.error("Thumbnail job failed", jobId, {
      error: errorMessage,
      permanentFailure: permanent,
      attempt: safetyResult.attempt,
    });

    // Determine error code
    let errorCode: ThumbnailJobResult["errorCode"] = "PROCESSING_ERROR";
    if (errorMessage.toLowerCase().includes("s3")) {
      errorCode = "S3_ERROR";
    }

    // Send failure notification
    const result: ThumbnailJobResult = {
      success: false,
      jobId,
      jobType: "thumbnail",
      error: errorMessage,
      errorCode,
      permanentFailure: permanent,
      processingTimeMs: Date.now() - startTime,
      context,
      entityIds,
      safetyInfo: {
        attempt: safetyResult.attempt,
        maxAttempts: safetyResult.maxAttempts,
        ageMs: safetyResult.ageMs,
      },
    };

    try {
      await sendWebhookNotification(callback, result);
    } catch (webhookError) {
      logger.error("Failed to send thumbnail failure webhook", jobId, {
        error:
          webhookError instanceof Error
            ? webhookError.message
            : String(webhookError),
      });
    }

    cleanup(inputPath);

    // Only re-throw to trigger SQS retry if NOT a permanent error
    // Permanent errors should be acknowledged to prevent infinite loops
    if (permanent) {
      logger.warn("Permanent error - not retrying", jobId);
      return result;
    }

    // Re-throw to trigger SQS retry
    throw error;
  }
}

/**
 * Process a single compression job
 */
async function processCompressionJob(
  message: CompressionJobMessage
): Promise<CompressionResult> {
  const {
    jobId,
    inputBucket,
    inputKey,
    outputBucket,
    outputKey,
    mediaType,
    targetMaxSizeMb,
    callback,
  } = message;
  const startTime = Date.now();

  // Initialize paths - will be set during processing
  let inputPath = "";
  let outputPath = "";

  try {
    logger.info("Processing compression job", jobId, {
      inputBucket,
      inputKey,
      outputBucket,
      outputKey,
      mediaType,
      targetMaxSizeMb,
    });

    // Validate bucket names match expected values (security check)
    if (EXPECTED_INPUT_BUCKET && EXPECTED_OUTPUT_BUCKET) {
      validateBuckets(
        inputBucket,
        outputBucket,
        EXPECTED_INPUT_BUCKET,
        EXPECTED_OUTPUT_BUCKET
      );
    }

    // Check input file size before downloading (fail fast)
    const inputSize = await getObjectSize(inputBucket, inputKey);
    logger.info("Input file size", jobId, { sizeBytes: inputSize });

    if (inputSize > MAX_SAFE_INPUT_SIZE_BYTES) {
      throw new Error(
        `Input file too large for ephemeral storage: ${inputSize} bytes ` +
          `(max: ${MAX_SAFE_INPUT_SIZE_BYTES} bytes)`
      );
    }

    // Check if compression is actually needed
    const targetSizeBytes = targetMaxSizeMb * 1024 * 1024;
    if (inputSize <= targetSizeBytes) {
      logger.info(
        "File already within target size, skipping compression",
        jobId,
        {
          inputSize,
          targetSizeBytes,
        }
      );

      // Still need to copy to output location
      // Download and re-upload (could optimize with S3 copy if same bucket)
      const extension = path.extname(inputKey) || getOutputExtension(mediaType);
      inputPath = path.join(TMP_DIR, `${jobId}-input${extension}`);
      outputPath = inputPath; // Same file, just upload to new location

      await downloadFromS3(inputBucket, inputKey, inputPath, jobId);

      const contentType = getOutputContentType(mediaType);
      await uploadToS3(outputBucket, outputKey, inputPath, contentType, jobId);

      const result: CompressionResult = {
        success: true,
        jobId,
        originalSizeBytes: inputSize,
        compressedSizeBytes: inputSize,
        compressionRatio: 1,
        processingTimeMs: Date.now() - startTime,
        outputLocation: {
          bucket: outputBucket,
          key: outputKey,
        },
      };

      await sendWebhookNotification(callback, result);
      cleanup(inputPath);

      return result;
    }

    // Set up file paths
    const inputExtension = path.extname(inputKey) || "";
    const outputExtension = getOutputExtension(mediaType);
    inputPath = path.join(TMP_DIR, `${jobId}-input${inputExtension}`);
    outputPath = path.join(TMP_DIR, `${jobId}-output${outputExtension}`);

    // Download from S3
    await downloadFromS3(inputBucket, inputKey, inputPath, jobId);

    // Compress
    await compressMedia(
      inputPath,
      outputPath,
      mediaType,
      targetMaxSizeMb,
      jobId
    );

    // Get compressed file size
    const compressedSize = fs.statSync(outputPath).size;
    const compressionRatio = inputSize / compressedSize;

    logger.info("Compression completed", jobId, {
      originalSizeBytes: inputSize,
      compressedSizeBytes: compressedSize,
      compressionRatio: compressionRatio.toFixed(2),
    });

    // Upload to S3
    const contentType = getOutputContentType(mediaType);
    await uploadToS3(outputBucket, outputKey, outputPath, contentType, jobId);

    // Delete original file if configured (only when output is different from input)
    if (DELETE_ORIGINAL && inputKey !== outputKey) {
      try {
        await deleteFromS3(inputBucket, inputKey, jobId);
        logger.info("Deleted original file after compression", jobId, {
          bucket: inputBucket,
          key: inputKey,
        });
      } catch (deleteError) {
        // Log but don't fail the job - compression succeeded
        logger.warn("Failed to delete original file", jobId, {
          bucket: inputBucket,
          key: inputKey,
          error:
            deleteError instanceof Error
              ? deleteError.message
              : String(deleteError),
        });
      }
    }

    // Build result
    const result: CompressionResult = {
      success: true,
      jobId,
      originalSizeBytes: inputSize,
      compressedSizeBytes: compressedSize,
      compressionRatio,
      processingTimeMs: Date.now() - startTime,
      outputLocation: {
        bucket: outputBucket,
        key: outputKey,
      },
      originalDeleted: DELETE_ORIGINAL && inputKey !== outputKey,
    };

    // Send webhook notification
    await sendWebhookNotification(callback, result);

    // Cleanup
    cleanup(inputPath, outputPath);

    logger.info("Job completed successfully", jobId, {
      processingTimeMs: result.processingTimeMs,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Job failed", jobId, { error: errorMessage });

    // Send failure notification
    const result: CompressionResult = {
      success: false,
      jobId,
      error: errorMessage,
      processingTimeMs: Date.now() - startTime,
    };

    try {
      await sendWebhookNotification(callback, result);
    } catch (webhookError) {
      // Log but don't mask original error
      logger.error("Failed to send failure webhook", jobId, {
        error:
          webhookError instanceof Error
            ? webhookError.message
            : String(webhookError),
      });
    }

    // Cleanup
    cleanup(inputPath, outputPath);

    // Re-throw to trigger SQS retry
    throw error;
  }
}

/**
 * Route and process a job based on type
 */
async function processJob(message: MediaJobMessage): Promise<void> {
  if (isThumbnailJob(message)) {
    await processThumbnailJob(message);
  } else {
    await processCompressionJob(message);
  }
}

/**
 * Lambda handler for SQS events
 *
 * Processes media jobs (compression or thumbnail) from SQS queue.
 * Returns batch item failures for partial batch failure reporting.
 */
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  logger.info("Lambda invoked", undefined, {
    recordCount: event.Records.length,
  });

  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    const messageId = record.messageId;

    try {
      // Parse message body
      const body = JSON.parse(record.body);

      // Validate and route message
      const message = validateMessage(body);

      // Process the job (compression or thumbnail)
      await processJob(message);

      logger.info("Record processed successfully", (message as any).jobId, {
        messageId,
        jobType: isThumbnailJob(message) ? "thumbnail" : "compression",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Record processing failed", undefined, {
        messageId,
        error: errorMessage,
      });

      // Add to batch failures - SQS will retry this message
      batchItemFailures.push({
        itemIdentifier: messageId,
      });
    }
  }

  // Return batch response for partial batch failure handling
  return {
    batchItemFailures,
  };
}
