/**
 * Thumbnail Types
 * Type definitions for thumbnail generation system
 */

/**
 * Status of thumbnail generation
 */
export type ThumbnailStatus =
  | 'pending' // Queued for processing
  | 'processing' // Currently being generated
  | 'ready' // Thumbnail available
  | 'failed' // Generation failed
  | 'not-applicable'; // Documents, audio (icon only)

/**
 * Job data for thumbnail generation queue
 */
export interface ThumbnailJobData {
  messageId: string;
  attachmentId: string;
  s3Key: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  mimeType: string;
  chatId: string;
  /** For outbound: senderNumberId, for inbound: 'inbound' */
  pathPrefix: string;
  /** Contact ID for folder structure */
  contactId?: string;
}

/**
 * Result from thumbnail generation
 */
export interface ThumbnailResult {
  success: boolean;
  thumbnailKey?: string;
  width?: number;
  height?: number;
  blurhash?: string;
  duration?: number; // For videos
  error?: string;
}

/**
 * Thumbnail metadata stored with attachment
 */
export interface ThumbnailMetadata {
  thumbnailKey: string;
  thumbnailStatus: ThumbnailStatus;
  width: number;
  height: number;
  blurhash: string;
  thumbnailError?: string;
}

/**
 * WebSocket event for thumbnail ready notification
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
 * Document icon types for non-thumbnail media
 */
export type DocumentIconType =
  | 'pdf'
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'text'
  | 'archive'
  | 'file';

/**
 * Map MIME types to document icons
 */
export const DOCUMENT_ICON_MAP: Record<string, DocumentIconType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'word',
  'application/msword': 'word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'application/vnd.ms-excel': 'excel',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'powerpoint',
  'application/vnd.ms-powerpoint': 'powerpoint',
  'text/plain': 'text',
  'text/csv': 'text',
  'application/zip': 'archive',
  'application/x-rar-compressed': 'archive',
  'application/x-7z-compressed': 'archive',
};

/**
 * Get document icon type from MIME type
 */
export function getDocumentIconType(mimeType: string): DocumentIconType {
  return DOCUMENT_ICON_MAP[mimeType.toLowerCase()] || 'file';
}

/**
 * Check if media type supports thumbnail generation
 * Now includes PDF documents
 */
export function supportsThumbnail(
  mediaType: 'image' | 'video' | 'audio' | 'document',
  mimeType?: string,
): boolean {
  if (mediaType === 'image' || mediaType === 'video') {
    return true;
  }
  // Support PDF thumbnails
  if (mediaType === 'document' && mimeType === 'application/pdf') {
    return true;
  }
  return false;
}

/**
 * Queue names for thumbnail processing
 */
export const THUMBNAIL_QUEUE_NAME = 'thumbnail-generation';
export const THUMBNAIL_JOB_NAME = 'generate-thumbnail';
