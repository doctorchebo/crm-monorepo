/**
 * Media Compression Types
 *
 * Type definitions for the media compression Lambda function.
 * These types define the message contract between backend and Lambda.
 */

/**
 * Media types supported for compression
 */
export type MediaType = "video" | "image" | "audio";

/**
 * Callback type for job completion notifications
 */
export interface JobCallback {
  /**
   * Callback type - currently only webhook is supported
   */
  type: "webhook";

  /**
   * URL to call when job completes (success or failure)
   */
  url: string;
}

/**
 * SQS message schema for compression jobs
 *
 * This is the contract between the backend and the Lambda function.
 * Backend sends this message to SQS, Lambda processes it.
 */
export interface CompressionJobMessage {
  /**
   * Unique job identifier (UUID)
   * Used for tracking and idempotency
   */
  jobId: string;

  /**
   * S3 bucket containing the source media
   */
  inputBucket: string;

  /**
   * S3 key (path) of the source media file
   */
  inputKey: string;

  /**
   * S3 bucket for the compressed output
   */
  outputBucket: string;

  /**
   * S3 key (path) for the compressed output file
   */
  outputKey: string;

  /**
   * Type of media being compressed
   */
  mediaType: MediaType;

  /**
   * Target maximum file size in MB
   * Compression will aim to produce a file at or below this size
   */
  targetMaxSizeMb: number;

  /**
   * Callback configuration for job completion notification
   */
  callback: JobCallback;
}

/**
 * Result of a compression operation
 */
export interface CompressionResult {
  /**
   * Whether compression succeeded
   */
  success: boolean;

  /**
   * The job ID that was processed
   */
  jobId: string;

  /**
   * Error message if compression failed
   */
  error?: string;

  /**
   * Original file size in bytes
   */
  originalSizeBytes?: number;

  /**
   * Compressed file size in bytes
   */
  compressedSizeBytes?: number;

  /**
   * Compression ratio (original / compressed)
   */
  compressionRatio?: number;

  /**
   * Processing time in milliseconds
   */
  processingTimeMs?: number;

  /**
   * Output location in S3
   */
  outputLocation?: {
    bucket: string;
    key: string;
  };

  /**
   * Whether the original file was deleted after compression
   */
  originalDeleted?: boolean;
}

/**
 * Structured log entry for Lambda function
 */
export interface StructuredLog {
  /**
   * Log level
   */
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";

  /**
   * Log message
   */
  message: string;

  /**
   * Job ID for correlation
   */
  jobId?: string;

  /**
   * Additional context
   */
  context?: Record<string, unknown>;

  /**
   * Timestamp
   */
  timestamp: string;
}

/**
 * ffmpeg preset configuration for different media types
 */
export interface FfmpegPreset {
  /**
   * Video codec to use
   */
  videoCodec?: string;

  /**
   * Audio codec to use
   */
  audioCodec?: string;

  /**
   * Constant Rate Factor (lower = better quality, larger file)
   */
  crf?: number;

  /**
   * Preset speed (slower = better compression)
   */
  preset?: string;

  /**
   * Max video bitrate
   */
  maxBitrate?: string;

  /**
   * Audio bitrate
   */
  audioBitrate?: string;

  /**
   * Scale filter (e.g., "-2:720" for 720p)
   */
  scale?: string;
}
