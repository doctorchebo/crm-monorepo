/**
 * Staging Types
 *
 * Centralized types for the media staging system.
 * Pre-uploads files to S3 for thumbnail generation before sending.
 */

/**
 * Upload status for a staged file
 */
export type UploadStatus = "pending" | "uploading" | "uploaded" | "failed";

/**
 * Thumbnail generation status
 */
export type ThumbnailStatus = "pending" | "processing" | "completed" | "failed";

/**
 * Staged file with upload tracking
 *
 * Represents a file that has been selected for upload but not yet sent.
 * The file may be pre-uploaded to S3 for thumbnail generation.
 */
export interface StagedFile {
  /** Unique identifier for this staged file (local UUID) */
  id: string;

  /** The actual file object */
  file: File;

  /** Local preview URL (blob URL) for immediate display */
  previewUrl?: string;

  /** Type of media */
  type: "image" | "video" | "audio" | "document";

  // === Staging fields (populated after pre-upload) ===

  /** Staging ID from backend (for tracking and cleanup) */
  stagingId?: string;

  /** S3 key where the file is staged */
  s3Key?: string;

  /** S3 key for the generated thumbnail */
  thumbnailKey?: string;

  /** Current upload status */
  uploadStatus: UploadStatus;

  /** Upload progress percentage (0-100) */
  uploadProgress: number;

  /** Thumbnail generation status */
  thumbnailStatus: ThumbnailStatus;

  /** Pre-signed URL for the thumbnail (once ready) */
  thumbnailUrl?: string;

  /** Error message if upload or staging failed */
  error?: string;
}

/**
 * Result from staging a file
 */
export interface StagedFileResult {
  stagingId: string;
  s3Key: string;
  thumbnailKey: string;
  mediaType: string;
  size: number;
  fileName: string;
  mimeType: string;
  thumbnailQueued: boolean;
}

/**
 * Result from getting staging status
 */
export interface StagingStatusResult {
  stagingId: string;
  s3Key: string;
  thumbnailKey: string;
  thumbnailStatus: string;
  mediaType: string;
  thumbnailUrl?: string;
}

/**
 * Result from promoting a staged file
 */
export interface PromotedFileResult {
  stagingId: string;
  s3Key: string;
  thumbnailKey?: string;
  thumbnailStatus: string;
}

/**
 * Create a new staged file entry from a File object
 */
export function createStagedFile(file: File): StagedFile {
  const fileType = file.type.startsWith("image/")
    ? "image"
    : file.type.startsWith("video/")
      ? "video"
      : file.type.startsWith("audio/")
        ? "audio"
        : "document";

  const previewUrl =
    fileType === "image" || fileType === "video" || fileType === "audio"
      ? URL.createObjectURL(file)
      : undefined;

  return {
    id: crypto.randomUUID(),
    file,
    previewUrl,
    type: fileType,
    uploadStatus: "pending",
    uploadProgress: 0,
    thumbnailStatus: "pending",
  };
}

/**
 * Check if a staged file is ready to be sent
 * (uploaded and optionally has thumbnail)
 */
export function isStagedFileReady(file: StagedFile): boolean {
  // Must be uploaded
  if (file.uploadStatus !== "uploaded") {
    return false;
  }

  // For images and videos, we prefer thumbnail to be ready
  // but don't block sending if it's still processing
  if (file.type === "image" || file.type === "video") {
    return (
      file.thumbnailStatus === "completed" ||
      file.thumbnailStatus === "processing" ||
      file.thumbnailStatus === "failed"
    );
  }

  // For audio and documents, no thumbnail needed
  return true;
}

/**
 * Check if all staged files are ready to send
 */
export function areAllFilesReady(files: StagedFile[]): boolean {
  return files.every(isStagedFileReady);
}

/**
 * Get staging IDs for cleanup
 */
export function getStagingIds(files: StagedFile[]): string[] {
  return files.filter((f) => f.stagingId).map((f) => f.stagingId as string);
}
