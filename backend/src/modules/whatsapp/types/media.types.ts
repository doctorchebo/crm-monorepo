/**
 * Media Message Types
 * Defines types and interfaces for multimedia messaging support
 */

/**
 * Supported media types
 */
export type MediaType = 'image' | 'video' | 'audio' | 'document';

/**
 * MIME type mapping for supported file types
 */
export const MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'audio/mpeg': 'audio',
  'audio/mp3': 'audio',
  'audio/ogg': 'audio',
  'audio/wav': 'audio',
  'audio/aac': 'audio',
  'application/pdf': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    'document',
  'text/plain': 'document',
};

/**
 * File extension mapping
 */
export const EXTENSION_MAP: Record<string, string> = {
  // Images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',

  // Videos
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',

  // Audio
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  aac: 'audio/aac',
  m4a: 'audio/aac',

  // Documents
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  txt: 'text/plain',
};

/**
 * Thumbnail generation status
 */
export type ThumbnailStatus =
  | 'pending' // Queued for processing
  | 'processing' // Currently being generated
  | 'ready' // Thumbnail available
  | 'failed' // Generation failed
  | 'not-applicable'; // Documents, audio (icon only)

/**
 * Attachment metadata stored in database
 */
export interface AttachmentMetadata {
  id: string; // UUID for tracking
  type: MediaType; // Media type: image, video, audio, document
  fileName: string; // Original file name
  mimeType: string; // MIME type (image/jpeg, video/mp4, etc)
  size: number; // File size in bytes
  s3Key: string; // S3 object key to original file
  thumbnailKey?: string; // S3 object key to thumbnail (for images/videos)
  thumbnailStatus?: ThumbnailStatus; // Status of thumbnail generation
  width?: number; // Original media width in pixels
  height?: number; // Original media height in pixels
  blurhash?: string; // Blurhash for progressive loading placeholder
  duration?: number; // Duration in seconds (for audio/video)
  uploadedAt: string; // ISO timestamp
  status: 'success' | 'pending' | 'failed'; // Upload status
  errorMessage?: string; // Error details if failed
  thumbnailError?: string; // Error details if thumbnail generation failed
  mediaUrl?: string; // Cloud API media URL reference (for inbound messages from Meta)
}

/**
 * Presigned URL response
 */
export interface PresignedUrlResponse {
  uploadId: string; // Unique upload session ID
  url: string; // Presigned URL for client upload
  expiresIn: number; // Seconds until expiry
  expectedKey: string; // Expected S3 key after upload
  maxFileSize: number; // Max file size in bytes
}

/**
 * File upload request
 */
export interface FileUploadRequest {
  fileName: string;
  mimeType: string;
  fileSize: number;
  messageId?: string; // Optional: attach to message
}

/**
 * Upload completion notification
 */
export interface UploadCompletionRequest {
  uploadId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  messageId?: string;
}

/**
 * File size limits (in bytes)
 */
export const FILE_SIZE_LIMITS = {
  image: 100 * 1024 * 1024, // 100MB
  video: 300 * 1024 * 1024, // 300MB
  audio: 50 * 1024 * 1024, // 50MB
  document: 100 * 1024 * 1024, // 100MB
};

/**
 * Get file size limit for media type
 */
export function getFileSizeLimit(mediaType: MediaType): number {
  return FILE_SIZE_LIMITS[mediaType] || 100 * 1024 * 1024;
}

/**
 * Get media type from MIME type
 */
export function getMediaTypeFromMimeType(mimeType: string): MediaType | null {
  const normalized = mimeType.toLowerCase();
  const mediaType = MIME_TYPES[normalized];
  return (mediaType as MediaType) || null;
}

/**
 * Get file extension from file name
 */
export function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Get MIME type from file extension
 */
export function getMimeTypeFromExtension(extension: string): string | null {
  return EXTENSION_MAP[extension.toLowerCase()] || null;
}

/**
 * Validate file upload
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateFileUpload(
  fileName: string,
  mimeType: string,
  fileSize: number,
): ValidationResult {
  const errors: string[] = [];
  const extension = getFileExtension(fileName);

  // Validate extension exists
  if (!extension) {
    errors.push('File must have an extension');
  }

  // Validate MIME type
  const expectedMimeType = getMimeTypeFromExtension(extension);
  if (expectedMimeType && mimeType.toLowerCase() !== expectedMimeType) {
    errors.push(
      `MIME type mismatch: expected ${expectedMimeType}, got ${mimeType}`,
    );
  }

  // Validate supported file type
  if (!EXTENSION_MAP[extension.toLowerCase()]) {
    errors.push(`File type .${extension} is not supported`);
  }

  // Validate file size
  const mediaType = getMediaTypeFromMimeType(mimeType);
  if (mediaType) {
    const limit = getFileSizeLimit(mediaType);
    if (fileSize > limit) {
      errors.push(
        `File size ${(fileSize / 1024 / 1024).toFixed(2)}MB exceeds limit of ${(limit / 1024 / 1024).toFixed(0)}MB for ${mediaType}`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
