/**
 * Frontend Media Types
 * Shared types and interfaces for media messaging on frontend
 */

/**
 * Media types
 * - 'gif': Animated GIF (comes from WhatsApp as video with animated=true)
 * - 'sticker': WhatsApp sticker (static or animated webp)
 */
export type MediaType =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "gif"
  | "sticker";

/**
 * Thumbnail generation status
 */
export type ThumbnailStatus =
  | "pending" // Queued for processing
  | "processing" // Currently being generated
  | "ready" // Thumbnail available
  | "failed" // Generation failed
  | "not-applicable"; // Documents, audio, stickers, gifs (icon only or display directly)

/**
 * Attachment metadata (mirrors backend)
 */
export interface Attachment {
  id: string; // UUID
  type: MediaType;
  fileName: string;
  mimeType: string;
  size: number;
  s3Key: string;
  thumbnailKey?: string; // S3 key for thumbnail
  thumbnailStatus?: ThumbnailStatus; // Status of thumbnail generation
  width?: number; // Original media width in pixels
  height?: number; // Original media height in pixels
  blurhash?: string; // Blurhash for progressive loading placeholder
  duration?: number; // For videos: duration in seconds. For PDFs: page count
  pageCount?: number; // For documents: number of pages
  uploadedAt: string;
  status: "success" | "pending" | "failed" | "uploading"; // uploading = currently uploading to S3
  progress?: number; // 0-100 upload progress (for optimistic UI during upload)
  errorMessage?: string;
  thumbnailError?: string; // Error details if thumbnail generation failed
  mediaUrl?: string; // For Cloud API media (inbound from Meta), format: "cloud-api://mediaId"
  isVoiceNote?: boolean; // For audio: true if recorded voice note (vs file upload)
  waveformData?: number[]; // For voice notes: amplitude samples for waveform display
  isAnimated?: boolean; // For stickers/gifs: true if animated
  previewUrl?: string; // For optimistic UI: local blob URL before upload completes
}

/**
 * Thumbnail ready event from WebSocket
 */
export interface ThumbnailReadyEvent {
  messageId: string;
  attachmentId: string;
  thumbnailKey: string;
  width: number;
  height: number;
  blurhash: string;
  duration?: number; // For PDFs: page count
}

/**
 * Pending upload (not yet sent)
 */
export interface PendingUpload {
  id: string; // Upload session ID
  file: File;
  progress: number; // 0-100
  uploadedBytes: number;
  totalBytes: number;
  status: "queued" | "uploading" | "completed" | "error";
  error?: string;
  previewUrl?: string; // For images/videos
}

/**
 * Presigned URL response
 */
export interface PresignedUrlResponse {
  uploadId: string;
  url: string;
  expiresIn: number;
  s3Key: string;
  maxFileSize: number;
}

/**
 * Upload completion request
 */
export interface UploadCompletionRequest {
  uploadId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  s3Key: string;
  duration?: number;
}

/**
 * Download URL response
 */
export interface DownloadUrlResponse {
  url: string;
  expiresIn: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

/**
 * File size limits and allowed types
 * Note: GIFs and stickers are received from WhatsApp, not uploaded
 */
export const ALLOWED_FILE_TYPES = {
  image: ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"],
  video: ["video/mp4", "video/quicktime"],
  audio: ["audio/mpeg", "audio/mp3", "audio/ogg", "audio/wav", "audio/aac"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
  ],
  // GIFs come as video/mp4 from WhatsApp with animated=true flag
  gif: ["video/mp4", "image/gif"],
  // Stickers are webp images (static or animated)
  sticker: ["image/webp"],
};

export const FILE_SIZE_LIMITS = {
  image: 100 * 1024 * 1024, // 100MB
  video: 300 * 1024 * 1024, // 300MB
  audio: 50 * 1024 * 1024, // 50MB
  document: 100 * 1024 * 1024, // 100MB
  gif: 50 * 1024 * 1024, // 50MB
  sticker: 10 * 1024 * 1024, // 10MB
};

/**
 * Get media type from MIME type
 * Note: This is for file uploads - GIFs and stickers are detected by backend metadata
 */
export function getMediaTypeFromMime(mimeType: string): MediaType | null {
  // Check standard upload types first
  for (const [mediaType, mimes] of Object.entries(ALLOWED_FILE_TYPES)) {
    // Skip gif and sticker for upload detection - they come from WhatsApp
    if (mediaType === "gif" || mediaType === "sticker") continue;
    if (mimes.includes(mimeType)) {
      return mediaType as MediaType;
    }
  }
  return null;
}

/**
 * Get file extension from filename
 */
export function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * Format duration for display (seconds to mm:ss)
 */
export function formatDuration(seconds: number): string {
  if (!seconds) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Validate file for upload
 */
export function validateFile(file: File): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const mimeType = file.type.toLowerCase();
  const mediaType = getMediaTypeFromMime(mimeType);

  if (!mediaType) {
    errors.push(`File type ${file.type} is not supported`);
  }

  if (mediaType) {
    const limit = FILE_SIZE_LIMITS[mediaType];
    if (file.size > limit) {
      errors.push(
        `File size ${formatFileSize(
          file.size
        )} exceeds limit of ${formatFileSize(limit)} for ${mediaType}s`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get icon for media type
 */
export function getMediaIcon(type: MediaType): string {
  switch (type) {
    case "image":
      return "🖼️";
    case "video":
      return "🎥";
    case "audio":
      return "🎵";
    case "document":
      return "📄";
    default:
      return "📎";
  }
}

/**
 * Check if an attachment has accessible media source.
 * An attachment is accessible if it has either:
 * - An s3Key (media stored in S3)
 * - A mediaUrl starting with "cloud-api://" (Cloud API reference)
 *
 * Attachments without either of these cannot be downloaded or streamed.
 * This can happen when:
 * - Media was deleted from S3
 * - Cloud API media expired and wasn't cached
 * - Upload failed but attachment record was created
 */
export function hasAccessibleMediaSource(attachment: Attachment): boolean {
  // Check for local preview URL (optimistic upload in progress)
  if (attachment.previewUrl && attachment.previewUrl.trim().length > 0) {
    return true;
  }

  // Check for S3 key
  if (attachment.s3Key && attachment.s3Key.trim().length > 0) {
    return true;
  }

  // Check for Cloud API reference
  if (
    attachment.mediaUrl &&
    attachment.mediaUrl.startsWith("cloud-api://") &&
    attachment.mediaUrl.length > "cloud-api://".length
  ) {
    return true;
  }

  return false;
}
