/**
 * WhatsApp Cloud API Media Limits
 *
 * These limits are enforced by WhatsApp when sending media messages.
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
 *
 * IMPORTANT: There are TWO sets of limits:
 * 1. UPLOAD limits - What users can upload to the Knowledge Base
 * 2. SEND limits - What WhatsApp accepts when sending messages
 *
 * Videos can be uploaded at higher limits (50MB) and will be automatically
 * compressed to meet WhatsApp's 16MB limit.
 */

/**
 * WhatsApp SEND limits - Maximum sizes WhatsApp accepts when sending
 * These are the actual WhatsApp Cloud API limits
 */
export const WHATSAPP_FILE_SIZE_LIMITS = {
  /** Images: 5 MB max */
  image: 5 * 1024 * 1024, // 5 MB

  /** Videos: 16 MB max */
  video: 16 * 1024 * 1024, // 16 MB

  /** Audio: 16 MB max */
  audio: 16 * 1024 * 1024, // 16 MB

  /** Documents (PDF, etc): 100 MB max */
  document: 100 * 1024 * 1024, // 100 MB

  /** Stickers: 500 KB for static, 1 MB for animated */
  sticker_static: 500 * 1024, // 500 KB
  sticker_animated: 1 * 1024 * 1024, // 1 MB
} as const;

/**
 * UPLOAD limits - Maximum sizes users can upload to Knowledge Base
 * Videos have higher limits because they will be compressed automatically
 */
export const KB_UPLOAD_FILE_SIZE_LIMITS = {
  /** Images: 10 MB max for Knowledge Base uploads */
  image: 10 * 1024 * 1024, // 10 MB

  /** Videos: 100 MB - will be compressed to 16 MB automatically */
  video: 100 * 1024 * 1024, // 100 MB

  /** Audio: Same as WhatsApp (16 MB) */
  audio: 16 * 1024 * 1024, // 16 MB

  /** Documents: Same as WhatsApp (100 MB) */
  document: 100 * 1024 * 1024, // 100 MB
} as const;

/**
 * Compression thresholds - When to trigger automatic compression
 */
export const COMPRESSION_THRESHOLDS = {
  /** Videos larger than WhatsApp limit need compression */
  video: WHATSAPP_FILE_SIZE_LIMITS.video, // 16 MB
} as const;

/**
 * WhatsApp supported MIME types by category
 */
export const WHATSAPP_SUPPORTED_MIME_TYPES = {
  image: [
    'image/jpeg',
    'image/png',
    'image/webp',
    // Note: WhatsApp converts other formats, but these are natively supported
  ],
  video: [
    'video/mp4',
    'video/3gpp',
    // Note: Only H.264 video codec and AAC audio codec supported
  ],
  audio: [
    'audio/aac',
    'audio/mp4',
    'audio/mpeg',
    'audio/amr',
    'audio/ogg', // Only opus codecs
    'audio/opus',
  ],
  document: [
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
  ],
  sticker: ['image/webp'],
} as const;

/**
 * Get the media category from a MIME type
 */
export function getWhatsAppMediaCategory(
  mimeType: string,
): 'image' | 'video' | 'audio' | 'document' | 'sticker' | null {
  const normalizedMime = mimeType.toLowerCase();

  if (normalizedMime.startsWith('image/')) {
    if (normalizedMime === 'image/webp') {
      // WebP could be sticker or image - we treat it as image for KB purposes
      return 'image';
    }
    return 'image';
  }

  if (normalizedMime.startsWith('video/')) {
    return 'video';
  }

  if (normalizedMime.startsWith('audio/')) {
    return 'audio';
  }

  // Check document types
  if (
    WHATSAPP_SUPPORTED_MIME_TYPES.document.some(
      (docType) => normalizedMime === docType.toLowerCase(),
    )
  ) {
    return 'document';
  }

  // Default documents for application/* types
  if (normalizedMime.startsWith('application/')) {
    return 'document';
  }

  return null;
}

/**
 * Get the WhatsApp SEND limit for a given MIME type
 * This is the limit WhatsApp enforces when sending messages
 */
export function getWhatsAppFileSizeLimit(mimeType: string): number {
  const category = getWhatsAppMediaCategory(mimeType);

  switch (category) {
    case 'image':
      return WHATSAPP_FILE_SIZE_LIMITS.image;
    case 'video':
      return WHATSAPP_FILE_SIZE_LIMITS.video;
    case 'audio':
      return WHATSAPP_FILE_SIZE_LIMITS.audio;
    case 'document':
      return WHATSAPP_FILE_SIZE_LIMITS.document;
    case 'sticker':
      return WHATSAPP_FILE_SIZE_LIMITS.sticker_animated;
    default:
      // Default to document limit for unknown types
      return WHATSAPP_FILE_SIZE_LIMITS.document;
  }
}

/**
 * Get the UPLOAD limit for a given MIME type
 * This is the limit for uploading to Knowledge Base (higher for videos)
 */
export function getKbUploadFileSizeLimit(mimeType: string): number {
  const category = getWhatsAppMediaCategory(mimeType);

  switch (category) {
    case 'image':
      return KB_UPLOAD_FILE_SIZE_LIMITS.image;
    case 'video':
      return KB_UPLOAD_FILE_SIZE_LIMITS.video;
    case 'audio':
      return KB_UPLOAD_FILE_SIZE_LIMITS.audio;
    case 'document':
      return KB_UPLOAD_FILE_SIZE_LIMITS.document;
    default:
      return KB_UPLOAD_FILE_SIZE_LIMITS.document;
  }
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Validation result for WhatsApp media
 */
export interface WhatsAppMediaValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  mediaCategory: 'image' | 'video' | 'audio' | 'document' | 'sticker' | null;
  /** The upload limit (what users can upload) */
  uploadLimit: number;
  /** The send limit (what WhatsApp accepts) */
  sendLimit: number;
  actualFileSize: number;
  /** Whether the file needs compression before sending */
  needsCompression: boolean;
}

/**
 * Validate media for Knowledge Base upload
 *
 * This validates against UPLOAD limits (which are higher than send limits).
 * Videos up to 50MB can be uploaded and will be compressed automatically.
 *
 * @param mimeType - The MIME type of the file
 * @param fileSize - The file size in bytes
 * @param fileName - Optional filename for better error messages
 * @returns Validation result with errors if any
 */
export function validateWhatsAppMedia(
  mimeType: string,
  fileSize: number,
  fileName?: string,
): WhatsAppMediaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const mediaCategory = getWhatsAppMediaCategory(mimeType);
  const uploadLimit = getKbUploadFileSizeLimit(mimeType);
  const sendLimit = getWhatsAppFileSizeLimit(mimeType);

  // Check if compression is needed (for videos)
  const needsCompression =
    mediaCategory === 'video' &&
    fileSize > sendLimit &&
    fileSize <= uploadLimit;

  // Check if MIME type is supported
  if (!mediaCategory) {
    errors.push(
      `File type "${mimeType}" is not supported by WhatsApp. ` +
        `Supported types: images (JPEG, PNG, WebP), videos (MP4), audio (MP3, AAC, OGG), documents (PDF, Word, Excel).`,
    );
  }

  // Check file size against UPLOAD limit (not send limit)
  if (fileSize > uploadLimit) {
    const fileNamePart = fileName ? ` "${fileName}"` : '';

    if (mediaCategory === 'video') {
      errors.push(
        `Video${fileNamePart} is too large. ` +
          `Size: ${formatBytes(fileSize)}, Maximum: ${formatBytes(uploadLimit)}. ` +
          `Videos up to ${formatBytes(uploadLimit)} can be uploaded and will be automatically compressed for WhatsApp.`,
      );
    } else {
      errors.push(
        `File${fileNamePart} is too large for WhatsApp. ` +
          `Size: ${formatBytes(fileSize)}, Maximum for ${mediaCategory || 'this type'}: ${formatBytes(uploadLimit)}. ` +
          `Please reduce the file size before uploading.`,
      );
    }
  }

  // Info message if compression will be applied
  if (needsCompression) {
    warnings.push(
      `Video (${formatBytes(fileSize)}) exceeds WhatsApp's ${formatBytes(sendLimit)} limit. ` +
        `It will be automatically compressed after upload to ensure it can be sent via WhatsApp.`,
    );
  }

  // Warning for files close to limit (non-video or within send limit)
  if (
    !needsCompression &&
    fileSize > sendLimit * 0.8 &&
    fileSize <= sendLimit
  ) {
    warnings.push(
      `File size (${formatBytes(fileSize)}) is close to WhatsApp's ${formatBytes(sendLimit)} limit for ${mediaCategory}s. ` +
        `Consider using a smaller file for better reliability.`,
    );
  }

  // Video-specific warnings
  if (mediaCategory === 'video' && mimeType !== 'video/mp4') {
    warnings.push(
      `WhatsApp works best with MP4 (H.264) videos. Other formats may not play correctly. ` +
        `The compression process will convert to MP4 if needed.`,
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    mediaCategory,
    uploadLimit,
    sendLimit,
    actualFileSize: fileSize,
    needsCompression,
  };
}

/**
 * Check if a file can be sent via WhatsApp
 * Simpler version that just returns true/false
 */
export function canSendViaWhatsApp(
  mimeType: string,
  fileSize: number,
): boolean {
  const result = validateWhatsAppMedia(mimeType, fileSize);
  return result.isValid;
}

/**
 * Check if a video file needs compression
 * Returns true if the file is a video and exceeds WhatsApp's send limit
 */
export function videoNeedsCompression(
  mimeType: string,
  fileSize: number,
): boolean {
  const category = getWhatsAppMediaCategory(mimeType);
  if (category !== 'video') {
    return false;
  }
  return fileSize > WHATSAPP_FILE_SIZE_LIMITS.video;
}

/**
 * Check if a file is within upload limits (not send limits)
 * This is for the initial upload validation
 */
export function isWithinUploadLimits(
  mimeType: string,
  fileSize: number,
): boolean {
  const uploadLimit = getKbUploadFileSizeLimit(mimeType);
  return fileSize <= uploadLimit;
}

/**
 * Get the maximum upload limit across all media types.
 * Useful for configuring multer/express file upload limits.
 *
 * Currently returns the video limit (100MB) as it's the largest.
 */
export function getMaxKbUploadLimit(): number {
  return Math.max(
    KB_UPLOAD_FILE_SIZE_LIMITS.image,
    KB_UPLOAD_FILE_SIZE_LIMITS.video,
    KB_UPLOAD_FILE_SIZE_LIMITS.audio,
    KB_UPLOAD_FILE_SIZE_LIMITS.document,
  );
}

/**
 * Knowledge Base Object Media Limits
 *
 * These limits control how many media items can be attached to a single
 * knowledge base object. This prevents excessive storage usage and ensures
 * AI retrieval performance remains optimal.
 */
export const KB_OBJECT_MEDIA_LIMIT = 10;
