/**
 * AWS S3 Service for Media Management
 * Handles file uploads, downloads, and S3 operations
 */

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

export interface PresignedUrlOptions {
  expiresIn?: number; // Seconds (default: 300 = 5 minutes)
}

export interface S3FileMetadata {
  bucket: string;
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
}

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;
  private readonly presignedUrlExpiry: number; // in seconds

  constructor(private configService: ConfigService) {
    this.region = this.configService.get<string>('AWS_REGION', 'us-east-1');
    this.bucketName = this.configService.get<string>(
      'AWS_S3_BUCKET_NAME',
      'default-bucket',
    );
    this.presignedUrlExpiry = this.configService.get<number>(
      'AWS_PRESIGNED_URL_EXPIRY_SECONDS',
      300,
    );

    // Initialize S3 client
    // Credentials are automatically resolved in the following order:
    // 1. AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables
    // 2. ~/.aws/credentials file (recommended for development)
    // 3. ~/.aws/config file
    // 4. IAM role (if running on EC2 or other AWS services)
    // 5. Web Identity Token (if using federated identity)
    this.s3Client = new S3Client({
      region: this.region,
      // Let AWS SDK handle credential resolution automatically
      // No need to explicitly pass credentials
    });

    this.logger.log(
      `S3 Service initialized. Bucket: ${this.bucketName}, Region: ${this.region}`,
    );
  }

  /**
   * Generate S3 key for media file based on folder structure:
   * /{senderNumberId}/{contactId}/{messageId}/original.{ext}
   */
  private generateS3Key(
    senderNumberId: string | number,
    contactId: string,
    messageId: string,
    fileName: string,
    isThumb: boolean = false,
  ): string {
    const fileExtension = fileName.split('.').pop() || '';
    const fileNameWithoutExt = isThumb ? 'thumb' : 'original';

    return `${senderNumberId}/${contactId}/${messageId}/${fileNameWithoutExt}.${fileExtension}`;
  }

  /**
   * Generate a presigned URL for direct client upload to S3
   * Expires in 5 minutes by default
   */
  async generatePresignedUploadUrl(
    senderNumberId: string | number,
    contactId: string,
    messageId: string,
    fileName: string,
    contentType: string,
    options: PresignedUrlOptions = {},
  ): Promise<{
    uploadId: string;
    url: string;
    expiresIn: number;
    s3Key: string;
  }> {
    try {
      const uploadId = uuidv4();
      const expiresIn = options.expiresIn || this.presignedUrlExpiry;
      const s3Key = this.generateS3Key(
        senderNumberId,
        contactId,
        messageId,
        fileName,
        false,
      );

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        ContentType: contentType,
        ServerSideEncryption: 'AES256', // Enable encryption
        Metadata: {
          uploadId,
          originalFileName: fileName,
          uploadedAt: new Date().toISOString(),
        },
      });

      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });

      this.logger.log(
        `Generated presigned upload URL for: ${s3Key} (expires in ${expiresIn}s)`,
      );

      return {
        uploadId,
        url,
        expiresIn,
        s3Key,
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate presigned URL: ${error.message}`,
        error,
      );
      throw new Error(`Failed to generate upload URL: ${error.message}`);
    }
  }

  /**
   * Generate a presigned URL for direct client upload using a custom S3 key.
   * Use this when you have already generated the S3 key.
   */
  async generatePresignedUploadUrlForKey(
    s3Key: string,
    contentType: string,
    options: PresignedUrlOptions = {},
  ): Promise<{
    url: string;
    expiresIn: number;
    s3Key: string;
  }> {
    try {
      const expiresIn = options.expiresIn || this.presignedUrlExpiry;

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      });

      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });

      this.logger.log(
        `Generated presigned upload URL for key: ${s3Key} (expires in ${expiresIn}s)`,
      );

      return {
        url,
        expiresIn,
        s3Key,
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate presigned URL for key: ${error.message}`,
        error,
      );
      throw new Error(`Failed to generate upload URL: ${error.message}`);
    }
  }

  /**
   * Generate a presigned URL for downloading/viewing file from S3
   */
  async generatePresignedDownloadUrl(
    s3Key: string,
    options: PresignedUrlOptions = {},
  ): Promise<{
    url: string;
    expiresIn: number;
  }> {
    try {
      const expiresIn = options.expiresIn || 3600; // 1 hour default for downloads

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });

      this.logger.log(`Generated presigned download URL for: ${s3Key}`);

      return {
        url,
        expiresIn,
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate download URL: ${error.message}`,
        error,
      );
      throw new Error(`Failed to generate download URL: ${error.message}`);
    }
  }

  /**
   * Check whether an object exists in S3.
   * Returns true if the object exists, false otherwise.
   */
  async objectExists(key: string): Promise<boolean> {
    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a file from S3
   */
  async deleteFile(s3Key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      await this.s3Client.send(command);
      this.logger.log(`Successfully deleted S3 object: ${s3Key}`);
    } catch (error) {
      this.logger.error(`Failed to delete S3 object: ${error.message}`, error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Copy a file within S3
   * Used for promoting staged files to message paths
   *
   * IMPORTANT: The CopySource must be URL-encoded per AWS S3 API requirements.
   * Files with spaces or special characters in their names will fail to copy
   * without proper encoding.
   *
   * @param sourceKey - Source S3 key
   * @param destinationKey - Destination S3 key
   */
  async copyFile(sourceKey: string, destinationKey: string): Promise<void> {
    // URL-encode each path segment separately to handle special characters (spaces, etc.)
    // This is required by AWS S3 CopyObject API
    const encodedSourceKey = sourceKey
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    const copySource = `${this.bucketName}/${encodedSourceKey}`;

    this.logger.log(
      `Copying S3 object: ${sourceKey} -> ${destinationKey} (CopySource: ${copySource})`,
    );

    try {
      const command = new CopyObjectCommand({
        Bucket: this.bucketName,
        CopySource: copySource,
        Key: destinationKey,
      });

      const result = await this.s3Client.send(command);

      // Verify the copy succeeded by checking the response
      if (!result.CopyObjectResult?.ETag) {
        throw new Error(
          'Copy succeeded but no ETag returned - file may not have been copied correctly',
        );
      }

      this.logger.log(
        `Successfully copied ${sourceKey} to ${destinationKey} (ETag: ${result.CopyObjectResult.ETag})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to copy S3 object: ${sourceKey} -> ${destinationKey}. Error: ${error.message}`,
        error.stack,
      );
      throw new Error(
        `Failed to copy file from ${sourceKey}: ${error.message}`,
      );
    }
  }

  /**
   * Delete all files with a given prefix from S3
   * This effectively deletes a "folder" and all its contents
   *
   * @param prefix - The prefix/path to delete (e.g., "inbound/chat_123/")
   * @returns Object with count of deleted files and any errors
   */
  async deleteByPrefix(
    prefix: string,
  ): Promise<{ deletedCount: number; errors: string[] }> {
    const errors: string[] = [];
    let deletedCount = 0;
    let continuationToken: string | undefined;

    try {
      this.logger.log(
        `Starting deletion of all objects with prefix: ${prefix}`,
      );

      // List and delete in batches (S3 allows max 1000 objects per delete request)
      do {
        // List objects with the prefix
        const listCommand = new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        });

        const listResponse = await this.s3Client.send(listCommand);
        const objects = listResponse.Contents || [];

        if (objects.length === 0) {
          this.logger.log(`No objects found with prefix: ${prefix}`);
          break;
        }

        this.logger.log(
          `Found ${objects.length} objects to delete with prefix: ${prefix}`,
        );

        // Prepare delete request
        const objectsToDelete = objects
          .filter((obj) => obj.Key)
          .map((obj) => ({ Key: obj.Key! }));

        if (objectsToDelete.length > 0) {
          const deleteCommand = new DeleteObjectsCommand({
            Bucket: this.bucketName,
            Delete: {
              Objects: objectsToDelete,
              Quiet: false, // Get details about deleted objects
            },
          });

          const deleteResponse = await this.s3Client.send(deleteCommand);

          // Count successes
          if (deleteResponse.Deleted) {
            deletedCount += deleteResponse.Deleted.length;
            for (const deleted of deleteResponse.Deleted) {
              this.logger.log(`Deleted: ${deleted.Key}`);
            }
          }

          // Track errors
          if (deleteResponse.Errors) {
            for (const error of deleteResponse.Errors) {
              const errorMsg = `Failed to delete ${error.Key}: ${error.Message}`;
              errors.push(errorMsg);
              this.logger.warn(errorMsg);
            }
          }
        }

        continuationToken = listResponse.NextContinuationToken;
      } while (continuationToken);

      this.logger.log(
        `Prefix deletion complete: ${deletedCount} objects deleted, ${errors.length} errors`,
      );

      return { deletedCount, errors };
    } catch (error) {
      this.logger.error(
        `Failed to delete objects with prefix ${prefix}: ${error.message}`,
        error,
      );
      errors.push(`Batch delete failed: ${error.message}`);
      return { deletedCount, errors };
    }
  }

  /**
   * Get metadata about a file in S3
   */
  async getFileMetadata(s3Key: string): Promise<S3FileMetadata | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      const response = await this.s3Client.send(command);

      return {
        bucket: this.bucketName,
        key: s3Key,
        size: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        etag: response.ETag || '',
      };
    } catch (error) {
      if (
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        this.logger.warn(`S3 object not found: ${s3Key}`);
        return null;
      }
      this.logger.error(`Failed to get S3 metadata: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Download file from S3 as buffer
   * Used for thumbnail generation and media processing
   */
  async downloadFile(s3Key: string): Promise<Buffer | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        this.logger.warn(`Empty response body for S3 download: ${s3Key}`);
        return null;
      }

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of response.Body as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);
      this.logger.debug(
        `Downloaded file from S3: ${s3Key} (${buffer.length} bytes)`,
      );

      return buffer;
    } catch (error) {
      if (
        error.name === 'NoSuchKey' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        this.logger.warn(`S3 object not found for download: ${s3Key}`);
        return null;
      }
      this.logger.error(
        `Failed to download file from S3: ${error.message}`,
        error,
      );
      throw new Error(`Failed to download file: ${error.message}`);
    }
  }

  /**
   * Upload file to S3 (server-side upload)
   * Used for thumbnail generation or server-processed files
   */
  async uploadFile(
    s3Key: string,
    fileBuffer: Buffer,
    contentType: string,
  ): Promise<{ key: string; size: number }> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      });

      await this.s3Client.send(command);

      this.logger.log(
        `Successfully uploaded file to S3: ${s3Key} (${fileBuffer.length} bytes)`,
      );

      return {
        key: s3Key,
        size: fileBuffer.length,
      };
    } catch (error) {
      this.logger.error(`Failed to upload file to S3: ${error.message}`, error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Generate thumbnail S3 key for a media file
   */
  generateThumbnailKey(
    senderNumberId: string | number,
    contactId: string,
    messageId: string,
    fileName: string,
  ): string {
    return this.generateS3Key(
      senderNumberId,
      contactId,
      messageId,
      fileName,
      true,
    );
  }

  /**
   * Get S3 bucket name
   */
  getBucketName(): string {
    return this.bucketName;
  }

  /**
   * Get S3 region
   */
  getRegion(): string {
    return this.region;
  }
}
