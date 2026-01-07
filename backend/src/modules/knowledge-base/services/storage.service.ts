/**
 * Knowledge Base S3 Storage Utilities
 *
 * Provides structured path generation and utilities for S3 storage
 * of knowledge base media, files, and uploads.
 *
 * Path Structure:
 * /{bucket}/knowledge-base/{userId}/{category}/{objectId}/{mediaType}/{filename}
 *
 * Categories:
 * - objects: Media attached to knowledge objects
 * - uploads: Unstructured uploads pending processing
 * - bulk: Bulk import source files
 * - exports: Exported data
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KB_UPLOAD_FILE_SIZE_LIMITS } from '@shared/constants/whatsapp-media-limits';
import * as crypto from 'crypto';
import * as path from 'path';

export type MediaCategory = 'objects' | 'uploads' | 'bulk' | 'exports';
export type MediaType = 'images' | 'videos' | 'audio' | 'documents' | 'other';

export interface S3PathParams {
  userId: number;
  category: MediaCategory;
  objectId?: string;
  mediaType: MediaType;
  fileName: string;
}

export interface S3PathResult {
  bucket: string;
  key: string;
  fullPath: string;
}

export interface PresignedUrlParams {
  key: string;
  expiresIn?: number;
  contentType?: string;
}

@Injectable()
export class KnowledgeBaseStorageService {
  private readonly logger = new Logger(KnowledgeBaseStorageService.name);
  private readonly bucketName: string;
  private readonly region: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    // Use the same config key as the shared S3Service for consistency
    this.bucketName = this.configService.get<string>(
      'AWS_S3_BUCKET_NAME',
      'default-bucket',
    );
    this.region = this.configService.get<string>('AWS_REGION', 'us-east-1');
    this.baseUrl = this.configService.get<string>(
      'S3_BASE_URL',
      `https://${this.bucketName}.s3.${this.region}.amazonaws.com`,
    );
  }

  /**
   * Generate a unique filename with timestamp and random suffix
   */
  generateUniqueFileName(originalFileName: string): string {
    const ext = path.extname(originalFileName);
    const baseName = path.basename(originalFileName, ext);
    const sanitizedBase = this.sanitizeFileName(baseName);
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(4).toString('hex');

    return `${sanitizedBase}-${timestamp}-${randomSuffix}${ext}`;
  }

  /**
   * Sanitize filename for S3 storage
   */
  sanitizeFileName(fileName: string): string {
    return fileName
      .toLowerCase()
      .replace(/[^a-z0-9-_.]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 100);
  }

  /**
   * Determine media type from MIME type
   */
  getMediaTypeFromMime(mimeType: string): MediaType {
    if (mimeType.startsWith('image/')) return 'images';
    if (mimeType.startsWith('video/')) return 'videos';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (
      mimeType.includes('pdf') ||
      mimeType.includes('document') ||
      mimeType.includes('text/') ||
      mimeType.includes('spreadsheet') ||
      mimeType.includes('presentation')
    ) {
      return 'documents';
    }
    return 'other';
  }

  /**
   * Generate S3 path for knowledge base media
   *
   * Structure: knowledge-base/{userId}/{category}/{objectId?}/{mediaType}/{filename}
   */
  generatePath(params: S3PathParams): S3PathResult {
    const { userId, category, objectId, mediaType, fileName } = params;

    const pathParts = ['knowledge-base', userId.toString(), category];

    if (objectId) {
      pathParts.push(objectId);
    }

    pathParts.push(mediaType, fileName);

    const key = pathParts.join('/');

    return {
      bucket: this.bucketName,
      key,
      fullPath: `${this.baseUrl}/${key}`,
    };
  }

  /**
   * Generate S3 path for object media
   */
  generateObjectMediaPath(
    userId: number,
    objectId: string,
    mimeType: string,
    originalFileName: string,
  ): S3PathResult {
    const fileName = this.generateUniqueFileName(originalFileName);
    const mediaType = this.getMediaTypeFromMime(mimeType);

    return this.generatePath({
      userId,
      category: 'objects',
      objectId,
      mediaType,
      fileName,
    });
  }

  /**
   * Generate S3 path for unstructured uploads
   */
  generateUploadPath(
    userId: number,
    mimeType: string,
    originalFileName: string,
  ): S3PathResult {
    const fileName = this.generateUniqueFileName(originalFileName);
    const mediaType = this.getMediaTypeFromMime(mimeType);

    return this.generatePath({
      userId,
      category: 'uploads',
      mediaType,
      fileName,
    });
  }

  /**
   * Generate S3 path for bulk import source files
   */
  generateBulkImportPath(
    userId: number,
    batchId: string,
    originalFileName: string,
  ): S3PathResult {
    const fileName = this.generateUniqueFileName(originalFileName);

    return {
      bucket: this.bucketName,
      key: `knowledge-base/${userId}/bulk/${batchId}/${fileName}`,
      fullPath: `${this.baseUrl}/knowledge-base/${userId}/bulk/${batchId}/${fileName}`,
    };
  }

  /**
   * Generate S3 path for thumbnails
   *
   * Thumbnails are stored in a 'thumbnails' subfolder within the same directory
   * as the original file. The filename is prefixed with 'thumb-' and the extension
   * is changed to '.jpg' since thumbnails are always generated as JPEGs.
   *
   * Example:
   * Original: knowledge-base/123/objects/abc-uuid/images/photo-12345.png
   * Thumbnail: knowledge-base/123/objects/abc-uuid/images/thumbnails/thumb-photo-12345.jpg
   */
  generateThumbnailPath(originalKey: string): S3PathResult {
    const parts = originalKey.split('/');
    const fileName = parts.pop() || '';

    // Get filename without extension and create thumbnail filename with .jpg extension
    const lastDotIndex = fileName.lastIndexOf('.');
    const baseName =
      lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
    const thumbFileName = `thumb-${baseName}.jpg`;

    // Insert 'thumbnails' subfolder before the filename
    parts.push('thumbnails', thumbFileName);
    const key = parts.join('/');

    return {
      bucket: this.bucketName,
      key,
      fullPath: `${this.baseUrl}/${key}`,
    };
  }

  /**
   * Generate S3 path for exports
   */
  generateExportPath(
    userId: number,
    exportType: string,
    fileName: string,
  ): S3PathResult {
    const uniqueFileName = this.generateUniqueFileName(fileName);

    return {
      bucket: this.bucketName,
      key: `knowledge-base/${userId}/exports/${exportType}/${uniqueFileName}`,
      fullPath: `${this.baseUrl}/knowledge-base/${userId}/exports/${exportType}/${uniqueFileName}`,
    };
  }

  /**
   * Extract metadata from S3 key
   */
  parseS3Key(key: string): {
    userId?: number;
    category?: MediaCategory;
    objectId?: string;
    mediaType?: MediaType;
    fileName?: string;
  } {
    const parts = key.split('/');

    // Expected: knowledge-base/{userId}/{category}/{objectId?}/{mediaType}/{fileName}
    if (parts[0] !== 'knowledge-base' || parts.length < 5) {
      return {};
    }

    const userId = parseInt(parts[1], 10);
    const category = parts[2] as MediaCategory;

    // Determine if objectId is present (6 parts = with objectId, 5 parts = without)
    if (parts.length === 6) {
      return {
        userId,
        category,
        objectId: parts[3],
        mediaType: parts[4] as MediaType,
        fileName: parts[5],
      };
    }

    return {
      userId,
      category,
      mediaType: parts[3] as MediaType,
      fileName: parts[4],
    };
  }

  /**
   * Generate a public URL for an S3 object
   */
  getPublicUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }

  /**
   * Check if a MIME type is allowed for knowledge base uploads
   */
  isAllowedMimeType(mimeType: string): boolean {
    const allowedTypes = [
      // Images
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      // Videos
      'video/mp4',
      'video/webm',
      'video/quicktime',
      // Audio
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/webm',
      // Documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      'text/markdown',
      'application/json',
    ];

    return allowedTypes.includes(mimeType);
  }

  /**
   * Get maximum file size for a given media type (in bytes)
   * Uses centralized KB_UPLOAD_FILE_SIZE_LIMITS from whatsapp-media-limits.ts
   */
  getMaxFileSizeForType(mediaType: MediaType): number {
    // Map internal MediaType to the centralized limit keys
    const limitMapping: Record<MediaType, number> = {
      images: KB_UPLOAD_FILE_SIZE_LIMITS.image,
      videos: KB_UPLOAD_FILE_SIZE_LIMITS.video,
      audio: KB_UPLOAD_FILE_SIZE_LIMITS.audio,
      documents: KB_UPLOAD_FILE_SIZE_LIMITS.document,
      other: KB_UPLOAD_FILE_SIZE_LIMITS.document, // Default to document limit
    };

    return limitMapping[mediaType];
  }

  /**
   * Validate file size for upload
   */
  validateFileSize(fileSize: number, mimeType: string): boolean {
    const mediaType = this.getMediaTypeFromMime(mimeType);
    const maxSize = this.getMaxFileSizeForType(mediaType);
    return fileSize <= maxSize;
  }

  /**
   * Get bucket name
   */
  getBucketName(): string {
    return this.bucketName;
  }
}
