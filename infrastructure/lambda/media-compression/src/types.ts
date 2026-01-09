/**
 * Media Compression and Thumbnail Types
 *
 * Type definitions for the media processing Lambda function.
 * These types define the message contract between backend and Lambda.
 */

/**
 * Media types supported for compression
 */
export type MediaType = "video" | "image" | "audio";

/**
 * Job types supported by the Lambda
 */
export type JobType = "compression" | "thumbnail";

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
 * Safety configuration for preventing infinite loops
 */
export interface JobSafetyConfig {
  /**
   * Current attempt number (1-indexed)
   * Incremented on each retry by the backend before re-queuing
   */
  attempt?: number;

  /**
   * Maximum number of attempts allowed
   * Job will be marked as permanently failed if exceeded
   */
  maxAttempts?: number;

  /**
   * Timestamp when the job was first created (ISO string)
   * Used for timeout calculations
   */
  createdAt?: string;

  /**
   * Maximum age in milliseconds before job is considered stale
   * Default: 1 hour (3600000ms)
   */
  maxAgeMs?: number;
}

/**
 * Default safety limits
 */
export const DEFAULT_SAFETY_LIMITS = {
  maxAttempts: 3,
  maxAgeMs: 60 * 60 * 1000, // 1 hour
  maxFileSizeBytes: {
    thumbnail: 500 * 1024 * 1024, // 500MB for thumbnails
    compression: 4 * 1024 * 1024 * 1024, // 4GB for compression
  },
} as const;

/**
 * SQS message schema for compression jobs
 *
 * This is the contract between the backend and the Lambda function.
 * Backend sends this message to SQS, Lambda processes it.
 */
export interface CompressionJobMessage {
  /**
   * Job type - defaults to "compression" for backward compatibility
   */
  jobType?: "compression";

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

  /**
   * Safety configuration to prevent infinite loops
   */
  safety?: JobSafetyConfig;
}

/**
 * SQS message schema for thumbnail generation jobs
 */
export interface ThumbnailJobMessage {
  /**
   * Job type - must be "thumbnail"
   */
  jobType: "thumbnail";

  /**
   * Unique job identifier (UUID)
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
   * S3 bucket for the thumbnail output (usually same as input)
   */
  outputBucket: string;

  /**
   * S3 key (path) for the thumbnail file
   * If not provided, will be auto-generated from inputKey
   */
  outputKey?: string;

  /**
   * MIME type of the source media
   */
  mimeType: string;

  /**
   * Context for the thumbnail job
   * Helps identify the source of the request
   */
  context: "kb-media" | "message-attachment";

  /**
   * Related entity IDs for database updates
   */
  entityIds?: {
    /** KB media ID or message ID */
    mediaId?: string;
    /** Message attachment ID */
    attachmentId?: string;
    /** Message ID for message attachments */
    messageId?: string;
    /** Chat ID for WebSocket notifications */
    chatId?: string;
  };

  /**
   * Callback configuration for job completion notification
   */
  callback: JobCallback;

  /**
   * Safety configuration to prevent infinite loops
   */
  safety?: JobSafetyConfig;
}

/**
 * Union type for all job messages
 */
export type MediaJobMessage = CompressionJobMessage | ThumbnailJobMessage;

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
   * Job type
   */
  jobType?: "compression";

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
 * Result of a thumbnail generation operation
 */
export interface ThumbnailResult {
  /**
   * Whether thumbnail generation succeeded
   */
  success: boolean;

  /**
   * The job ID that was processed
   */
  jobId: string;

  /**
   * Job type
   */
  jobType: "thumbnail";

  /**
   * Error message if generation failed
   */
  error?: string;

  /**
   * Error code for programmatic handling
   * - MAX_ATTEMPTS_EXCEEDED: Job has been retried too many times
   * - JOB_EXPIRED: Job is older than maxAgeMs
   * - FILE_TOO_LARGE: Input file exceeds size limits
   * - INVALID_SAFETY_CONFIG: Safety config is invalid or missing
   * - UNSUPPORTED_FORMAT: MIME type not supported for thumbnails
   * - PROCESSING_ERROR: ffmpeg/ghostscript error during processing
   * - S3_ERROR: Error downloading/uploading from/to S3
   * - WEBHOOK_ERROR: Error sending callback notification
   */
  errorCode?:
    | "MAX_ATTEMPTS_EXCEEDED"
    | "JOB_EXPIRED"
    | "FILE_TOO_LARGE"
    | "INVALID_SAFETY_CONFIG"
    | "UNSUPPORTED_FORMAT"
    | "PROCESSING_ERROR"
    | "S3_ERROR"
    | "WEBHOOK_ERROR";

  /**
   * Whether this error is permanent (should not be retried)
   */
  permanentFailure?: boolean;

  /**
   * Thumbnail S3 key
   */
  thumbnailKey?: string;

  /**
   * Thumbnail width in pixels
   */
  width?: number;

  /**
   * Thumbnail height in pixels
   */
  height?: number;

  /**
   * Blurhash for progressive loading
   */
  blurhash?: string;

  /**
   * Duration (videos) or page count (PDFs)
   */
  duration?: number;

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
   * Context info passed through from job
   */
  context?: "kb-media" | "message-attachment";

  /**
   * Entity IDs passed through from job
   */
  entityIds?: {
    mediaId?: string;
    attachmentId?: string;
    messageId?: string;
    chatId?: string;
  };

  /**
   * Safety info for debugging
   */
  safetyInfo?: {
    attempt: number;
    maxAttempts: number;
    ageMs?: number;
  };
}

/**
 * Union type for all job results
 */
export type MediaJobResult = CompressionResult | ThumbnailResult;

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

/**
 * Context types for thumbnail generation
 * Determines which thumbnail preset to use
 */
export type ThumbnailContext = "kb-media" | "message-attachment";

/**
 * Configuration for thumbnail generation
 * These settings affect size, quality, and processing behavior
 */
export interface ThumbnailConfig {
  /**
   * Maximum width in pixels
   * Thumbnail maintains aspect ratio and won't exceed this
   */
  maxWidth: number;

  /**
   * Maximum height in pixels
   * Thumbnail maintains aspect ratio and won't exceed this
   */
  maxHeight: number;

  /**
   * JPEG quality (1-100)
   * Higher = better quality, larger file
   */
  quality: number;

  /**
   * Video frame extraction position in seconds
   */
  videoFramePosition: string;

  /**
   * Processing timeout in milliseconds
   */
  processingTimeoutMs: number;

  /**
   * PDF viewport width for Chromium rendering
   */
  pdfViewportWidth: number;

  /**
   * PDF viewport height for Chromium rendering
   */
  pdfViewportHeight: number;
}

/**
 * Context-aware thumbnail presets
 *
 * Design rationale:
 * - KB media: Smaller thumbnails (300x300) are sufficient for file browser UI
 * - Message attachments: Larger thumbnails (600x600) needed for chat thread
 *   where users need to preview images with readable text
 *
 * These values balance quality vs storage/bandwidth costs
 */
export const THUMBNAIL_PRESETS: Record<ThumbnailContext, ThumbnailConfig> = {
  /**
   * Knowledge Base thumbnails
   * Used in file browser/gallery views where thumbnails are displayed small
   * Optimized for minimal storage and fast loading
   */
  "kb-media": {
    maxWidth: 300,
    maxHeight: 300,
    quality: 80,
    videoFramePosition: "00:00:01",
    processingTimeoutMs: 30000,
    pdfViewportWidth: 800,
    pdfViewportHeight: 1100,
  },

  /**
   * Message attachment thumbnails
   * Used in chat thread where thumbnails are displayed larger
   * Higher resolution needed to see text in images and documents
   * Still balanced to avoid excessive storage/bandwidth
   */
  "message-attachment": {
    maxWidth: 600,
    maxHeight: 600,
    quality: 85,
    videoFramePosition: "00:00:01",
    processingTimeoutMs: 30000,
    pdfViewportWidth: 1200,
    pdfViewportHeight: 1600,
  },
} as const;

/**
 * Get thumbnail configuration for a given context
 * Falls back to message-attachment config if context is unknown
 *
 * @param context - The thumbnail context
 * @returns ThumbnailConfig for the context
 */
export function getThumbnailConfig(
  context?: ThumbnailContext
): ThumbnailConfig {
  if (context && THUMBNAIL_PRESETS[context]) {
    return THUMBNAIL_PRESETS[context];
  }
  // Default to message-attachment for better quality if context unknown
  return THUMBNAIL_PRESETS["message-attachment"];
}
