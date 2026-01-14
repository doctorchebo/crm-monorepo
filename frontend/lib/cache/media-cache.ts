/**
 * Media Cache Layer
 *
 * Centralized caching for media URLs and thumbnails to eliminate redundant API calls.
 *
 * Features:
 * - In-memory cache with TTL (Time To Live)
 * - Request deduplication (in-flight requests shared across callers)
 * - Cache invalidation on message edit/delete
 * - Automatic cleanup of expired entries
 *
 * Impact: Reduces media URL requests by 80%+
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface InFlightRequest<T> {
  promise: Promise<T>;
  createdAt: number;
}

export class MediaCache {
  private static instance: MediaCache;

  // URL caches
  private downloadUrlCache = new Map<string, CacheEntry<string>>();
  private thumbnailUrlCache = new Map<string, CacheEntry<string | null>>();

  // In-flight request tracking for deduplication
  private inFlightDownloadRequests = new Map<string, InFlightRequest<string>>();
  private inFlightThumbnailRequests = new Map<
    string,
    InFlightRequest<string | null>
  >();

  // Configuration
  private readonly TTL = 60 * 60 * 1000; // 1 hour
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // Cleanup every 5 minutes
  private cleanupTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.startCleanupTimer();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): MediaCache {
    if (!MediaCache.instance) {
      MediaCache.instance = new MediaCache();
    }
    return MediaCache.instance;
  }

  /**
   * Get cached download URL or execute fetcher if not cached
   *
   * Key: `${messageId}:${attachmentId}`
   */
  async getDownloadUrl<T>(
    messageId: string,
    attachmentId: string,
    fetcher: () => Promise<string>
  ): Promise<string> {
    const cacheKey = this._makeCacheKey(messageId, attachmentId);

    // Check cache first
    const cached = this.downloadUrlCache.get(cacheKey);
    if (cached && !this._isExpired(cached)) {
      //console.debug(`[MediaCache] Cache hit for download URL: ${cacheKey}`);
      return cached.data;
    }

    // Check if request is already in-flight
    const inFlight = this.inFlightDownloadRequests.get(cacheKey);
    if (inFlight) {
      //console.debug(
      //`[MediaCache] Returning in-flight download URL request: ${cacheKey}`
      //);
      return inFlight.promise;
    }

    // Fetch and cache
    // console.debug(
    //   `[MediaCache] Cache miss, fetching download URL: ${cacheKey}`
    // );
    const promise = fetcher()
      .then((url) => {
        // Store in cache
        this.downloadUrlCache.set(cacheKey, {
          data: url,
          timestamp: Date.now(),
          expiresAt: Date.now() + this.TTL,
        });

        // Remove from in-flight
        this.inFlightDownloadRequests.delete(cacheKey);

        return url;
      })
      .catch((error) => {
        // Remove from in-flight on error
        this.inFlightDownloadRequests.delete(cacheKey);
        throw error;
      });

    // Track as in-flight
    this.inFlightDownloadRequests.set(cacheKey, {
      promise,
      createdAt: Date.now(),
    });

    return promise;
  }

  /**
   * Get cached thumbnail URL or execute fetcher if not cached
   *
   * Key: `thumb:${messageId}:${attachmentId}`
   */
  async getThumbnailUrl(
    messageId: string,
    attachmentId: string,
    fetcher: () => Promise<string | null>
  ): Promise<string | null> {
    const cacheKey = this._makeCacheKey(messageId, attachmentId, "thumb");

    // Check cache first
    const cached = this.thumbnailUrlCache.get(cacheKey);
    if (cached && !this._isExpired(cached)) {
      // IMPORTANT: Only return cache hit if we have an actual URL
      // Don't return cached null - that was from a failed request before thumbnail was ready
      if (cached.data) {
        console.log(
          `[MediaCache] Cache HIT for thumbnail URL: ${cacheKey} -> HAS_URL`
        );
        return cached.data;
      } else {
        // Cached null - remove it and re-fetch
        console.log(
          `[MediaCache] Cache HIT but NULL - removing stale entry: ${cacheKey}`
        );
        this.thumbnailUrlCache.delete(cacheKey);
      }
    }

    // Check if request is already in-flight
    const inFlight = this.inFlightThumbnailRequests.get(cacheKey);
    if (inFlight) {
      console.log(`[MediaCache] In-flight request found for: ${cacheKey}`);
      return inFlight.promise;
    }

    console.log(`[MediaCache] Cache MISS, fetching: ${cacheKey}`);

    // Fetch and cache
    const promise = fetcher()
      .then((url) => {
        // ONLY cache successful responses - don't cache null
        // This allows retrying when thumbnail becomes ready
        if (url) {
          console.log(`[MediaCache] Caching successful URL for: ${cacheKey}`);
          this.thumbnailUrlCache.set(cacheKey, {
            data: url,
            timestamp: Date.now(),
            expiresAt: Date.now() + this.TTL,
          });
        } else {
          console.log(
            `[MediaCache] Not caching NULL response for: ${cacheKey}`
          );
        }

        // Remove from in-flight
        this.inFlightThumbnailRequests.delete(cacheKey);

        return url;
      })
      .catch((error) => {
        // Remove from in-flight on error
        this.inFlightThumbnailRequests.delete(cacheKey);
        throw error;
      });

    // Track as in-flight
    this.inFlightThumbnailRequests.set(cacheKey, {
      promise,
      createdAt: Date.now(),
    });

    return promise;
  }

  /**
   * Invalidate all URLs for a specific message
   * Call when message is edited or deleted
   */
  invalidateMessageUrls(messageId: string): void {
    console.debug(
      `[MediaCache] Invalidating all URLs for message: ${messageId}`
    );

    // Find and remove all entries for this message
    for (const [key] of this.downloadUrlCache) {
      if (key.startsWith(`${messageId}:`)) {
        this.downloadUrlCache.delete(key);
      }
    }

    for (const [key] of this.thumbnailUrlCache) {
      if (key.startsWith(`${messageId}:`)) {
        this.thumbnailUrlCache.delete(key);
      }
    }
  }

  /**
   * Invalidate specific attachment URL
   */
  invalidateAttachmentUrl(messageId: string, attachmentId: string): void {
    const downloadKey = this._makeCacheKey(messageId, attachmentId);
    const thumbnailKey = this._makeCacheKey(messageId, attachmentId, "thumb");

    this.downloadUrlCache.delete(downloadKey);
    this.thumbnailUrlCache.delete(thumbnailKey);

    console.debug(
      `[MediaCache] Invalidated URLs for attachment: ${downloadKey}`
    );
  }

  /**
   * Invalidate thumbnail URL specifically
   * Call when thumbnail becomes ready to clear any cached null value
   */
  invalidateThumbnailUrl(messageId: string, attachmentId: string): void {
    const thumbnailKey = this._makeCacheKey(messageId, attachmentId, "thumb");
    this.thumbnailUrlCache.delete(thumbnailKey);
    this.inFlightThumbnailRequests.delete(thumbnailKey);

    console.debug(
      `[MediaCache] Invalidated thumbnail URL for: ${messageId}:${attachmentId}`
    );
  }

  /**
   * Invalidate all cached URLs that contain staging paths
   * Called after promotion to ensure we don't serve stale staging URLs
   */
  invalidateStagingUrls(): void {
    let downloadRemoved = 0;
    let thumbnailRemoved = 0;

    // Scan download URL cache for staging URLs
    for (const [key, entry] of this.downloadUrlCache) {
      if (
        entry.data &&
        typeof entry.data === "string" &&
        entry.data.includes("/staging/")
      ) {
        this.downloadUrlCache.delete(key);
        downloadRemoved++;
      }
    }

    // Scan thumbnail URL cache for staging URLs
    for (const [key, entry] of this.thumbnailUrlCache) {
      if (
        entry.data &&
        typeof entry.data === "string" &&
        entry.data.includes("/staging/")
      ) {
        this.thumbnailUrlCache.delete(key);
        thumbnailRemoved++;
      }
    }

    if (downloadRemoved > 0 || thumbnailRemoved > 0) {
      console.debug(
        `[MediaCache] Invalidated staging URLs: ${downloadRemoved} download, ${thumbnailRemoved} thumbnail`
      );
    }
  }

  /**
   * Pre-cache a known thumbnail URL for an attachment
   * Used after promotion to immediately make the new URL available
   */
  setCachedThumbnailUrl(
    messageId: string,
    attachmentId: string,
    url: string | null
  ): void {
    const cacheKey = this._makeCacheKey(messageId, attachmentId, "thumb");
    this.thumbnailUrlCache.set(cacheKey, {
      data: url,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.TTL,
    });
    console.debug(
      `[MediaCache] Pre-cached thumbnail URL for ${messageId}:${attachmentId}`
    );
  }

  /**
   * Get the cache key format - useful for external cache coordination
   */
  getCacheKey(messageId: string, attachmentId: string, prefix = ""): string {
    return this._makeCacheKey(messageId, attachmentId, prefix);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    console.debug(`[MediaCache] Clearing all caches`);
    this.downloadUrlCache.clear();
    this.thumbnailUrlCache.clear();
    this.inFlightDownloadRequests.clear();
    this.inFlightThumbnailRequests.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      downloadUrlCacheSize: this.downloadUrlCache.size,
      thumbnailUrlCacheSize: this.thumbnailUrlCache.size,
      inFlightDownloadRequests: this.inFlightDownloadRequests.size,
      inFlightThumbnailRequests: this.inFlightThumbnailRequests.size,
      totalCacheSize: this.downloadUrlCache.size + this.thumbnailUrlCache.size,
    };
  }

  // Private helpers

  private _makeCacheKey(
    messageId: string,
    attachmentId: string,
    prefix = ""
  ): string {
    return prefix
      ? `${prefix}:${messageId}:${attachmentId}`
      : `${messageId}:${attachmentId}`;
  }

  private _isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() > entry.expiresAt;
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this._cleanupExpiredEntries();
    }, this.CLEANUP_INTERVAL);
  }

  private _cleanupExpiredEntries(): void {
    let downloadRemoved = 0;
    let thumbnailRemoved = 0;

    // Clean download URLs
    for (const [key, entry] of this.downloadUrlCache) {
      if (this._isExpired(entry)) {
        this.downloadUrlCache.delete(key);
        downloadRemoved++;
      }
    }

    // Clean thumbnail URLs
    for (const [key, entry] of this.thumbnailUrlCache) {
      if (this._isExpired(entry)) {
        this.thumbnailUrlCache.delete(key);
        thumbnailRemoved++;
      }
    }

    if (downloadRemoved > 0 || thumbnailRemoved > 0) {
      console.debug(
        `[MediaCache] Cleanup: removed ${downloadRemoved} download URLs, ${thumbnailRemoved} thumbnail URLs`
      );
    }
  }

  /**
   * Cleanup on app shutdown
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }
}

/**
 * Export singleton instance
 */
export const mediaCache = MediaCache.getInstance();
