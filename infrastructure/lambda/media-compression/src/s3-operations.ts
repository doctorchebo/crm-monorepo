/**
 * S3 Operations
 *
 * Handles all S3 interactions for the media compression Lambda.
 * - Downloads source media from input bucket
 * - Uploads compressed media to output bucket
 * - Deletes original file after compression (optional)
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
import { logger } from "./logger";

// S3 client - reused across invocations
const s3Client = new S3Client({});

/**
 * Get the size of an object in S3 without downloading it
 */
export async function getObjectSize(
  bucket: string,
  key: string
): Promise<number> {
  const command = new HeadObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await s3Client.send(command);
  return response.ContentLength ?? 0;
}

/**
 * Download a file from S3 to local filesystem
 *
 * @param bucket - S3 bucket name
 * @param key - S3 object key
 * @param localPath - Local filesystem path to save the file
 * @param jobId - Job ID for logging
 * @returns Size of downloaded file in bytes
 */
export async function downloadFromS3(
  bucket: string,
  key: string,
  localPath: string,
  jobId: string
): Promise<number> {
  logger.info("Downloading file from S3", jobId, { bucket, key, localPath });

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error(`Failed to get object body from S3: ${bucket}/${key}`);
  }

  // Ensure directory exists
  const dir = path.dirname(localPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Stream the file to disk
  const writeStream = fs.createWriteStream(localPath);
  const body = response.Body as Readable;

  await new Promise<void>((resolve, reject) => {
    body.pipe(writeStream);
    body.on("error", reject);
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });

  const stats = fs.statSync(localPath);
  logger.info("Downloaded file from S3", jobId, {
    bucket,
    key,
    sizeBytes: stats.size,
  });

  return stats.size;
}

/**
 * Upload a file to S3 from local filesystem or buffer
 *
 * @param bucket - S3 bucket name
 * @param key - S3 object key
 * @param source - Local filesystem path or Buffer to upload
 * @param contentType - MIME type of the file
 * @param jobId - Job ID for logging
 * @returns Size of uploaded file in bytes
 */
export async function uploadToS3(
  bucket: string,
  key: string,
  source: string | Buffer,
  contentType: string,
  jobId: string
): Promise<number> {
  logger.info("Uploading to S3", jobId, {
    bucket,
    key,
    contentType,
    sourceType: typeof source === "string" ? "file" : "buffer",
  });

  const fileBuffer =
    typeof source === "string" ? fs.readFileSync(source) : source;
  const fileSize = fileBuffer.length;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
  });

  await s3Client.send(command);

  logger.info("Uploaded to S3", jobId, {
    bucket,
    key,
    sizeBytes: fileSize,
  });

  return fileSize;
}

/**
 * Validate that bucket names match expected values
 * Security check to prevent accessing unauthorized buckets
 */
export function validateBuckets(
  inputBucket: string,
  outputBucket: string,
  expectedInputBucket: string,
  expectedOutputBucket: string
): void {
  if (inputBucket !== expectedInputBucket) {
    throw new Error(
      `Invalid input bucket: ${inputBucket}. Expected: ${expectedInputBucket}`
    );
  }

  if (outputBucket !== expectedOutputBucket) {
    throw new Error(
      `Invalid output bucket: ${outputBucket}. Expected: ${expectedOutputBucket}`
    );
  }
}

/**
 * Delete an object from S3
 *
 * @param bucket - S3 bucket name
 * @param key - S3 object key
 * @param jobId - Job ID for logging
 */
export async function deleteFromS3(
  bucket: string,
  key: string,
  jobId: string
): Promise<void> {
  logger.info("Deleting file from S3", jobId, { bucket, key });

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await s3Client.send(command);

  logger.info("Deleted file from S3", jobId, { bucket, key });
}
