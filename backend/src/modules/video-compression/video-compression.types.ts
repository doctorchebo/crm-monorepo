/**
 * Video Compression Types
 *
 * Type definitions for the video compression system that processes
 * uploaded videos to meet WhatsApp Cloud API size limits.
 *
 * Architecture:
 * - Videos are uploaded at a higher limit (e.g., 50MB)
 * - If they exceed WhatsApp limits (16MB), they're queued for compression
 * - Compression runs asynchronously via BullMQ
 * - The compressed version replaces the original for WhatsApp delivery
 */

// ============================================================================
// COMPRESSION STATUS
// ============================================================================

/**
 * Status of video compression
 */
export type CompressionStatus =
  | 'not_needed' // File already within WhatsApp limits
  | 'pending' // Queued for compression
  | 'processing' // Currently being compressed
  | 'completed' // Compression finished successfully
  | 'failed'; // Compression failed

/**
 * Compression preset - balances speed vs quality
 */
export type CompressionPreset =
  | 'fast' // Faster compression, slightly larger output
  | 'balanced' // Good balance of speed and quality (default)
  | 'quality'; // Best quality, slower compression

// ============================================================================
// QUEUE TYPES
// ============================================================================

/**
 * Queue name for video compression
 */
export const VIDEO_COMPRESSION_QUEUE_NAME = 'video-compression';

/**
 * Job name for compression jobs
 */
export const VIDEO_COMPRESSION_JOB_NAME = 'compress-video';

/**
 * Job data for video compression queue
 */
export interface CompressionJobData {
  /** Media record ID */
  mediaId: string;

  /** S3 key of the original video */
  s3Key: string;

  /** S3 bucket name */
  s3Bucket: string;

  /** Original file size in bytes */
  originalFileSize: number;

  /** Target file size in bytes (WhatsApp limit) */
  targetFileSize: number;

  /** Original MIME type */
  mimeType: string;

  /** Original file name */
  fileName: string;

  /** User ID for folder structure */
  userId: number;

  /** Object ID for folder structure */
  objectId: string;

  /** Compression preset to use */
  preset: CompressionPreset;

  /** Priority (lower = higher priority) */
  priority?: number;
}

/**
 * Result from video compression
 */
export interface CompressionResult {
  /** Whether compression succeeded */
  success: boolean;

  /** Compressed file S3 key (if successful) */
  compressedS3Key?: string;

  /** Compressed file size in bytes */
  compressedFileSize?: number;

  /** Compression ratio (original / compressed) */
  compressionRatio?: number;

  /** Duration of compression in milliseconds */
  processingTimeMs?: number;

  /** Error message if failed */
  error?: string;

  /** Video metadata */
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
    bitrate?: number;
    codec?: string;
  };
}

// ============================================================================
// COMPRESSION CONFIGURATION
// ============================================================================

/**
 * FFmpeg encoding settings for each preset
 */
export interface CompressionSettings {
  /** FFmpeg preset (ultrafast, faster, fast, medium, slow, slower, veryslow) */
  ffmpegPreset: string;

  /** Constant Rate Factor for quality (0-51, lower = better quality, larger file) */
  crf: number;

  /** Maximum bitrate in kbps (0 = no limit) */
  maxBitrate: number;

  /** Audio bitrate in kbps */
  audioBitrate: number;

  /** Scale factor for resolution (1 = original, 0.5 = half) */
  scaleFactor: number;

  /** Target frame rate (0 = original) */
  targetFps: number;
}

/**
 * Preset configurations for different compression modes
 *
 * These are tuned for WhatsApp's 16MB limit while maintaining acceptable quality
 */
export const COMPRESSION_PRESETS: Record<
  CompressionPreset,
  CompressionSettings
> = {
  fast: {
    ffmpegPreset: 'faster',
    crf: 28, // Slightly lower quality for speed
    maxBitrate: 1500, // 1.5 Mbps max
    audioBitrate: 96, // 96 kbps AAC
    scaleFactor: 1, // Keep original resolution initially
    targetFps: 30, // Cap at 30fps
  },
  balanced: {
    ffmpegPreset: 'medium',
    crf: 26, // Good balance
    maxBitrate: 2000, // 2 Mbps max
    audioBitrate: 128, // 128 kbps AAC
    scaleFactor: 1, // Keep original resolution initially
    targetFps: 30,
  },
  quality: {
    ffmpegPreset: 'slow',
    crf: 23, // Higher quality
    maxBitrate: 3000, // 3 Mbps max
    audioBitrate: 160, // 160 kbps AAC
    scaleFactor: 1, // Keep original resolution
    targetFps: 0, // Keep original fps
  },
} as const;

// ============================================================================
// FILE SIZE LIMITS
// ============================================================================

/**
 * Upload limits (higher than WhatsApp send limits)
 * These are the maximum sizes users can upload before we reject
 */
export const UPLOAD_FILE_SIZE_LIMITS = {
  /** Videos can be uploaded up to 50MB, then compressed */
  video: 50 * 1024 * 1024, // 50 MB

  /** Images keep original WhatsApp limit (5 MB) - use image compression if needed */
  image: 5 * 1024 * 1024, // 5 MB

  /** Audio keeps original WhatsApp limit (16 MB) */
  audio: 16 * 1024 * 1024, // 16 MB

  /** Documents keep original WhatsApp limit (100 MB) */
  document: 100 * 1024 * 1024, // 100 MB
} as const;

/**
 * WhatsApp sending limits (target for compression)
 */
export const WHATSAPP_SEND_LIMITS = {
  video: 16 * 1024 * 1024, // 16 MB
  image: 5 * 1024 * 1024, // 5 MB
  audio: 16 * 1024 * 1024, // 16 MB
  document: 100 * 1024 * 1024, // 100 MB
} as const;

/**
 * Check if a file needs compression
 */
export function needsCompression(
  mediaCategory: 'video' | 'image' | 'audio' | 'document',
  fileSize: number,
): boolean {
  // Only videos support compression currently
  if (mediaCategory !== 'video') {
    return false;
  }

  return fileSize > WHATSAPP_SEND_LIMITS.video;
}

/**
 * Check if a file is within upload limits
 */
export function isWithinUploadLimits(
  mediaCategory: 'video' | 'image' | 'audio' | 'document',
  fileSize: number,
): boolean {
  const limit = UPLOAD_FILE_SIZE_LIMITS[mediaCategory];
  return fileSize <= limit;
}

/**
 * Get the appropriate preset based on file size
 * Larger files get faster presets to reduce processing time
 */
export function getCompressionPreset(
  fileSize: number,
  targetSize: number,
): CompressionPreset {
  const ratio = fileSize / targetSize;

  // Very large files (>3x target) - use fast preset
  if (ratio > 3) {
    return 'fast';
  }

  // Medium files (1.5x - 3x target) - use balanced preset
  if (ratio > 1.5) {
    return 'balanced';
  }

  // Files close to target - use quality preset
  return 'quality';
}

// ============================================================================
// WEBSOCKET EVENTS
// ============================================================================

/**
 * WebSocket event for compression status updates
 */
export interface CompressionStatusEvent {
  mediaId: string;
  status: CompressionStatus;
  progress?: number; // 0-100 percentage
  compressedS3Key?: string;
  compressedFileSize?: number;
  error?: string;
}

/**
 * WebSocket event names
 */
export const COMPRESSION_EVENTS = {
  STATUS_UPDATE: 'compression:status',
  COMPLETED: 'compression:completed',
  FAILED: 'compression:failed',
} as const;
