/**
 * Catalog Thumbnail Lambda Handler
 *
 * Processes SQS messages for catalog image thumbnail generation.
 * Uses Sharp for high-performance image resizing.
 *
 * Features:
 * - Reads original image from S3
 * - Generates thumbnail with specified dimensions
 * - Uploads thumbnail back to S3
 * - Updates database directly or via webhook callback
 *
 * Image processing specs:
 * - Default thumbnail size: 300x300px
 * - Maintains aspect ratio with cover fit
 * - Output format: JPEG with quality 80
 * - Supports: JPEG, PNG input formats
 */

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";
import sharp from "sharp";
import { Readable } from "stream";

// Initialize S3 client
const s3Client = new S3Client({});

/**
 * Message payload structure
 */
interface ThumbnailJobMessage {
  jobType: "catalog_thumbnail";
  imageId: string;
  inputBucket: string;
  inputKey: string;
  outputBucket: string;
  outputKey: string;
  targetWidth?: number;
  targetHeight?: number;
  callback?: {
    type: "db_update" | "webhook";
    // For db_update
    table?: string;
    idColumn?: string;
    idValue?: string;
    updateColumns?: Record<string, string>;
    // For webhook
    url?: string;
  };
}

/**
 * Convert readable stream to buffer
 */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Generate thumbnail from source image
 */
async function generateThumbnail(
  inputBuffer: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(inputBuffer)
    .resize(width, height, {
      fit: "cover",
      position: "centre",
      withoutEnlargement: false,
    })
    .jpeg({
      quality: 80,
      progressive: true,
    })
    .toBuffer();
}

/**
 * Process a single thumbnail job
 */
async function processJob(message: ThumbnailJobMessage): Promise<void> {
  const {
    imageId,
    inputBucket,
    inputKey,
    outputBucket,
    outputKey,
    targetWidth = 300,
    targetHeight = 300,
    callback,
  } = message;

  console.log(
    `Processing thumbnail for image ${imageId}: ${inputKey} -> ${outputKey}`,
  );

  try {
    // 1. Download original image from S3
    const getCommand = new GetObjectCommand({
      Bucket: inputBucket,
      Key: inputKey,
    });

    const response = await s3Client.send(getCommand);
    if (!response.Body) {
      throw new Error(`No body in S3 response for ${inputKey}`);
    }

    const inputBuffer = await streamToBuffer(response.Body as Readable);
    console.log(`Downloaded original image: ${inputBuffer.length} bytes`);

    // 2. Generate thumbnail
    const thumbnailBuffer = await generateThumbnail(
      inputBuffer,
      targetWidth,
      targetHeight,
    );
    console.log(
      `Generated thumbnail: ${thumbnailBuffer.length} bytes (${targetWidth}x${targetHeight})`,
    );

    // 3. Upload thumbnail to S3
    const putCommand = new PutObjectCommand({
      Bucket: outputBucket,
      Key: outputKey,
      Body: thumbnailBuffer,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000", // 1 year cache
    });

    await s3Client.send(putCommand);
    console.log(`Uploaded thumbnail to ${outputKey}`);

    // 4. Execute callback if provided
    if (callback) {
      await executeCallback(callback, imageId, outputKey);
    }

    console.log(`Successfully processed thumbnail for image ${imageId}`);
  } catch (error) {
    console.error(`Failed to process thumbnail for image ${imageId}:`, error);
    throw error;
  }
}

/**
 * Execute callback after successful thumbnail generation
 */
async function executeCallback(
  callback: ThumbnailJobMessage["callback"],
  imageId: string,
  thumbnailKey: string,
): Promise<void> {
  if (!callback) return;

  if (callback.type === "webhook" && callback.url) {
    // Webhook callback
    const response = await fetch(callback.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        imageId,
        thumbnailKey,
        status: "ready",
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      console.warn(`Webhook callback failed with status ${response.status}`);
    } else {
      console.log(`Webhook callback successful to ${callback.url}`);
    }
  } else if (callback.type === "db_update") {
    // Database update callback
    // Note: In production, consider using pg directly with DATABASE_URL
    // For now, we'll use the webhook approach or rely on backend polling
    console.log(
      `Database update callback requested for ${callback.table}.${callback.idColumn} = ${callback.idValue}`,
    );

    // If DATABASE_URL is set, we could use pg here:
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      // Import pg dynamically to avoid bundling when not needed
      const { Client } = await import("pg");
      const client = new Client({ connectionString: databaseUrl });

      try {
        await client.connect();

        // Build safe update query
        const updateColumns = callback.updateColumns || {};
        const setClauses = Object.keys(updateColumns)
          .map((col, idx) => `"${col}" = $${idx + 2}`)
          .join(", ");
        const values = [callback.idValue, ...Object.values(updateColumns)];

        const query = `UPDATE "${callback.table}" SET ${setClauses} WHERE "${callback.idColumn}" = $1`;
        await client.query(query, values);

        console.log(`Database updated successfully for image ${imageId}`);
      } finally {
        await client.end();
      }
    } else {
      console.log("DATABASE_URL not set, skipping database update");
    }
  }
}

/**
 * Lambda handler for SQS events
 */
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  console.log(`Received ${event.Records.length} messages`);

  const batchItemFailures: { itemIdentifier: string }[] = [];

  // Process messages in parallel with concurrency limit
  const processRecord = async (record: SQSRecord): Promise<void> => {
    try {
      const message: ThumbnailJobMessage = JSON.parse(record.body);

      // Validate message type
      if (message.jobType !== "catalog_thumbnail") {
        console.warn(
          `Skipping message with unknown jobType: ${message.jobType}`,
        );
        return;
      }

      await processJob(message);
    } catch (error) {
      console.error(`Failed to process record ${record.messageId}:`, error);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  };

  // Process all records with reasonable concurrency
  const concurrencyLimit = 5;
  const records = [...event.Records];

  while (records.length > 0) {
    const batch = records.splice(0, concurrencyLimit);
    await Promise.all(batch.map(processRecord));
  }

  // Return batch item failures for partial batch response
  return {
    batchItemFailures,
  };
}
