import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * ProfilePictureUrlService - Centralized service for generating presigned URLs
 * for profile picture thumbnails stored in S3.
 *
 * This service eliminates code duplication across controllers and provides
 * a single point of maintenance for URL generation logic.
 *
 * Features:
 * - Generates presigned S3 URLs for profile picture thumbnails
 * - Handles null/undefined keys gracefully
 * - Provides batch processing for multiple profile pictures
 * - Configurable URL expiration time
 *
 * Usage:
 *   // Single URL
 *   const url = await service.getUrl(thumbnailKey);
 *
 *   // Batch processing
 *   const urls = await service.getUrlBatch({ user1: key1, user2: key2 });
 */
@Injectable()
export class ProfilePictureUrlService {
  private readonly logger = new Logger(ProfilePictureUrlService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly defaultExpiresIn = 3600; // 1 hour

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1');
    this.bucketName = this.configService.get<string>(
      'AWS_S3_BUCKET_NAME',
      'chatflowai-dev',
    );
    this.s3Client = new S3Client({ region });

    this.logger.log(
      `ProfilePictureUrlService initialized - Bucket: ${this.bucketName}, Region: ${region}`,
    );
  }

  /**
   * Generate a presigned download URL for a profile picture thumbnail
   *
   * @param thumbnailKey - The S3 key for the thumbnail (e.g., "profile-pictures/123/thumb.jpg")
   * @param expiresIn - URL expiration time in seconds (default: 3600)
   * @returns The presigned URL or null if key is null/undefined or an error occurs
   */
  async getUrl(
    thumbnailKey: string | null | undefined,
    expiresIn: number = this.defaultExpiresIn,
  ): Promise<string | null> {
    if (!thumbnailKey) {
      this.logger.debug(`getUrl called with null/undefined key`);
      return null;
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: thumbnailKey,
      });
      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      this.logger.debug(
        `Generated presigned URL for key ${thumbnailKey}: ${url.substring(0, 80)}...`,
      );
      return url;
    } catch (error) {
      this.logger.warn(
        `Failed to generate presigned URL for key ${thumbnailKey}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Generate presigned URLs for multiple profile picture thumbnails in batch
   *
   * @param keyMap - Object mapping identifiers to S3 keys
   * @param expiresIn - URL expiration time in seconds (default: 3600)
   * @returns Object with same keys but values replaced with presigned URLs
   *
   * @example
   * const urls = await service.getUrlBatch({
   *   user1: 'profile-pictures/1/thumb.jpg',
   *   user2: 'profile-pictures/2/thumb.jpg',
   *   user3: null,
   * });
   * // Returns: { user1: 'https://...', user2: 'https://...', user3: null }
   */
  async getUrlBatch<T extends Record<string, string | null | undefined>>(
    keyMap: T,
    expiresIn: number = this.defaultExpiresIn,
  ): Promise<Record<keyof T, string | null>> {
    const entries = Object.entries(keyMap);
    const urlPromises = entries.map(async ([id, key]) => {
      const url = await this.getUrl(key, expiresIn);
      return [id, url] as const;
    });

    const results = await Promise.all(urlPromises);
    return Object.fromEntries(results) as Record<keyof T, string | null>;
  }

  /**
   * Transform an array of objects by converting a profile picture key field to a URL field
   *
   * This is a convenience method for the common pattern of transforming API responses
   * to include presigned URLs instead of S3 keys.
   *
   * @param items - Array of objects containing a profile picture key field
   * @param keyField - Name of the field containing the S3 key
   * @param urlField - Name of the field to add with the presigned URL
   * @param removeKeyField - Whether to remove the original key field (default: true)
   * @returns Array with transformed objects
   *
   * @example
   * const chats = [{ id: 1, assigneeProfilePictureKey: 'key1' }];
   * const result = await service.transformArrayWithUrls(
   *   chats,
   *   'assigneeProfilePictureKey',
   *   'assigneeProfilePictureUrl'
   * );
   * // Returns: [{ id: 1, assigneeProfilePictureUrl: 'https://...' }]
   */
  async transformArrayWithUrls<T extends object>(
    items: T[],
    keyField: keyof T,
    urlField: string,
    removeKeyField: boolean = true,
  ): Promise<(Omit<T, typeof keyField> & Record<string, string | null>)[]> {
    this.logger.debug(
      `transformArrayWithUrls: Processing ${items.length} items, keyField=${String(keyField)}, urlField=${urlField}`,
    );

    const results = await Promise.all(
      items.map(async (item) => {
        const key = item[keyField] as string | null | undefined;
        const url = await this.getUrl(key);

        if (removeKeyField) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [keyField]: _removed, ...rest } = item;
          return {
            ...rest,
            [urlField]: url,
          } as Omit<T, typeof keyField> & Record<string, string | null>;
        }

        return {
          ...item,
          [urlField]: url,
        } as T & Record<string, string | null>;
      }),
    );

    const withUrls = results.filter((r) => r[urlField] !== null).length;
    this.logger.debug(
      `transformArrayWithUrls: Completed. ${withUrls}/${items.length} items have profile picture URLs`,
    );

    return results;
  }
}
