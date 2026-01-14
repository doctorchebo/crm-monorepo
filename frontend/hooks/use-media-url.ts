/**
 * Hook for loading media URLs with proper lifecycle management
 *
 * SIMPLIFIED DESIGN:
 * - Only caches presigned URLs (not blob URLs)
 * - Blob URLs are created and managed per-component instance
 * - Clear separation between thumbnail URLs (presigned) and full URLs (blob)
 * - No complex reference counting - React's cleanup handles it
 *
 * Usage:
 * ```tsx
 * const { url, loading, error } = useMediaUrl(messageId, attachmentId, { attachment });
 * ```
 */

import { mediaApi } from "@/lib/media/api";
import { Attachment, ThumbnailStatus } from "@/lib/media/types";
import { useCallback, useEffect, useRef, useState } from "react";

// ============================================================
// PRESIGNED URL CACHE (NO blob URLs)
// ============================================================
// Only stores presigned URLs which are safe to cache
// Blob URLs are NOT cached - they're managed per-component

interface CachedPresignedUrl {
  url: string;
  cachedAt: number;
  s3Key: string; // Track which s3Key this URL was generated for
}

// Cache for thumbnail presigned URLs only
const thumbnailUrlCache = new Map<string, CachedPresignedUrl>();

// Cache TTL - 30 minutes (presigned URLs typically last 1 hour)
const CACHE_TTL = 30 * 60 * 1000;

function getThumbnailCacheKey(messageId: string, attachmentId: string): string {
  return `thumb:${messageId}:${attachmentId}`;
}

function getCachedThumbnailUrl(
  messageId: string,
  attachmentId: string,
  currentS3Key?: string
): string | null {
  const key = getThumbnailCacheKey(messageId, attachmentId);
  const entry = thumbnailUrlCache.get(key);

  if (!entry) return null;

  // Check if expired
  if (Date.now() - entry.cachedAt > CACHE_TTL) {
    thumbnailUrlCache.delete(key);
    return null;
  }

  // Check if s3Key changed (file was promoted)
  if (currentS3Key && entry.s3Key !== currentS3Key) {
    thumbnailUrlCache.delete(key);
    return null;
  }

  return entry.url;
}

function setCachedThumbnailUrl(
  messageId: string,
  attachmentId: string,
  url: string,
  s3Key: string
): void {
  const key = getThumbnailCacheKey(messageId, attachmentId);
  thumbnailUrlCache.set(key, {
    url,
    cachedAt: Date.now(),
    s3Key,
  });
}

/**
 * Invalidate cache for an attachment.
 * Call this when the attachment's s3Key changes (e.g., after promotion).
 */
export function invalidateCacheForAttachment(
  messageId: string,
  attachmentId: string
): void {
  const key = getThumbnailCacheKey(messageId, attachmentId);
  if (thumbnailUrlCache.has(key)) {
    thumbnailUrlCache.delete(key);
    console.debug(`[MediaUrlCache] Invalidated cache for ${key}`);
  }
}

/**
 * Invalidate all cache entries with staging paths.
 */
export function invalidateStagingCaches(): void {
  let count = 0;
  for (const [key, entry] of thumbnailUrlCache) {
    if (entry.s3Key?.startsWith("staging/")) {
      thumbnailUrlCache.delete(key);
      count++;
    }
  }
  if (count > 0) {
    console.debug(`[MediaUrlCache] Invalidated ${count} staging cache entries`);
  }
}

/**
 * Invalidate all cache entries for a message.
 */
export function invalidateCachesForMessage(messageId: string): void {
  let count = 0;
  for (const key of thumbnailUrlCache.keys()) {
    if (key.includes(`:${messageId}:`)) {
      thumbnailUrlCache.delete(key);
      count++;
    }
  }
  if (count > 0) {
    console.debug(
      `[MediaUrlCache] Invalidated ${count} cache entries for message ${messageId}`
    );
  }
}

// ============================================================
// HOOK TYPES
// ============================================================

interface UseMediaUrlOptions {
  /** Try to load thumbnail first (for images) */
  loadThumbnail?: boolean;
  /** Handle cloud-api:// URLs */
  handleCloudApi?: boolean;
  /** Attachment data with s3Key, thumbnailKey, etc. */
  attachment?: Attachment;
  /** Whether to enable fetching (default: true) */
  enabled?: boolean;
}

interface UseMediaUrlResult {
  /** The resolved URL to display (thumbnail or full) */
  url: string | null;
  /** Thumbnail presigned URL (if available) */
  thumbnailUrl: string | null;
  /** Full resolution URL (blob URL for local display) */
  fullUrl: string | null;
  /** Whether loading is in progress */
  loading: boolean;
  /** Error message if loading failed */
  error: string | null;
  /** Current thumbnail status from attachment */
  thumbnailStatus: ThumbnailStatus | undefined;
  /** Whether thumbnail is available */
  hasThumbnail: boolean;
  /** Blurhash for progressive loading */
  blurhash: string | undefined;
  /** Media dimensions */
  dimensions: { width?: number; height?: number };
  /** Manually trigger full resolution load */
  loadFullResolution: () => void;
}

// ============================================================
// MAIN HOOK
// ============================================================

export function useMediaUrl(
  messageId: string,
  attachmentId: string,
  options: UseMediaUrlOptions = {}
): UseMediaUrlResult {
  const {
    loadThumbnail = false,
    handleCloudApi = true,
    attachment,
    enabled = true,
  } = options;

  // State
  const [url, setUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shouldLoadFull, setShouldLoadFull] = useState(false);

  // Refs for cleanup
  const abortControllerRef = useRef<AbortController | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const cloudApiBlobRef = useRef<object>({});

  // Derived values from attachment
  const thumbnailStatus = attachment?.thumbnailStatus;
  const hasThumbnail =
    thumbnailStatus === "ready" && !!attachment?.thumbnailKey;
  const blurhash = attachment?.blurhash;
  const dimensions = {
    width: attachment?.width,
    height: attachment?.height,
  };

  // Manual trigger for full resolution
  const loadFullResolution = useCallback(() => {
    setShouldLoadFull(true);
  }, []);

  // Main loading effect
  useEffect(() => {
    // Reset state when key props change
    setError(null);

    // Clean up previous blob URL when deps change
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    // Early exit conditions
    if (!enabled || !attachmentId) {
      setLoading(false);
      setUrl(null);
      setThumbnailUrl(null);
      setFullUrl(null);
      return;
    }

    // CASE 1: Active upload in progress - use previewUrl directly
    // previewUrl is a blob URL created during file selection
    const isActiveUpload =
      attachment?.previewUrl &&
      (!attachment.s3Key ||
        attachment.s3Key === "" ||
        attachment.s3Key.startsWith("staging/"));

    if (isActiveUpload) {
      setUrl(attachment.previewUrl!);
      setThumbnailUrl(attachment.previewUrl!);
      setLoading(false);
      return;
    }

    // CASE 2: No s3Key yet - nothing to load
    if (!attachment?.s3Key || attachment.s3Key === "") {
      setLoading(false);
      return;
    }

    // CASE 3: Orphaned staging file - show error
    if (attachment.s3Key.startsWith("staging/") && !attachment.previewUrl) {
      setError("Media file is no longer available");
      setLoading(false);
      return;
    }

    // CASE 4: Normal load from S3
    let isMounted = true;
    abortControllerRef.current = new AbortController();

    const loadMedia = async () => {
      try {
        setLoading(true);
        setError(null);

        let loadedThumbnailUrl: string | null = null;
        let loadedFullUrl: string | null = null;

        // Try to load thumbnail if requested and available
        if (loadThumbnail && hasThumbnail) {
          // Check cache first
          const cached = getCachedThumbnailUrl(
            messageId,
            attachmentId,
            attachment?.s3Key
          );

          if (cached) {
            loadedThumbnailUrl = cached;
          } else {
            try {
              const thumbUrl = await mediaApi.getThumbnailUrl(
                messageId,
                attachmentId
              );
              if (thumbUrl) {
                loadedThumbnailUrl = thumbUrl;
                // Cache the presigned URL
                setCachedThumbnailUrl(
                  messageId,
                  attachmentId,
                  thumbUrl,
                  attachment?.s3Key || ""
                );
              }
            } catch (err) {
              console.debug(
                "[useMediaUrl] Thumbnail load failed, will fall back to full"
              );
            }
          }
        }

        // Determine if we need to load full resolution
        const isVideo = attachment?.type === "video";
        const needsFull =
          !loadThumbnail || // Explicitly requesting full
          (!loadedThumbnailUrl && !isVideo) || // Thumbnail failed for image
          shouldLoadFull; // User requested full

        if (needsFull) {
          try {
            // Download via stream and create blob URL
            const blob = await mediaApi.downloadMediaViaStream(
              messageId,
              attachmentId
            );
            loadedFullUrl = URL.createObjectURL(blob);
            // Track for cleanup
            blobUrlRef.current = loadedFullUrl;
          } catch (streamErr) {
            console.warn(
              "[useMediaUrl] Stream download failed, trying presigned URL"
            );

            // Fallback to presigned URL
            const response = await mediaApi.getDownloadUrl(
              messageId,
              attachmentId
            );
            let presignedUrl = response.url;

            // Handle cloud-api:// URLs
            if (
              presignedUrl &&
              handleCloudApi &&
              presignedUrl.startsWith("cloud-api://")
            ) {
              const mediaId = presignedUrl.replace("cloud-api://", "");
              presignedUrl = await mediaApi.fetchCloudAPIMedia(
                mediaId,
                cloudApiBlobRef.current
              );
            }

            loadedFullUrl = presignedUrl;
          }
        }

        // Update state if still mounted
        if (isMounted && !abortControllerRef.current?.signal.aborted) {
          setThumbnailUrl(loadedThumbnailUrl);
          setFullUrl(loadedFullUrl);
          // Prefer thumbnail for display, fall back to full
          setUrl(loadedThumbnailUrl || loadedFullUrl);
        }
      } catch (err) {
        if (isMounted && !abortControllerRef.current?.signal.aborted) {
          console.error("[useMediaUrl] Load failed:", err);
          setError(err instanceof Error ? err.message : "Failed to load media");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadMedia();

    // Cleanup on unmount or dependency change
    return () => {
      isMounted = false;
      abortControllerRef.current?.abort();

      // Revoke blob URL we created
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }

      // Cleanup cloud API blobs
      mediaApi.cleanupComponentMedia(cloudApiBlobRef.current);
    };
  }, [
    messageId,
    attachmentId,
    loadThumbnail,
    handleCloudApi,
    hasThumbnail,
    shouldLoadFull,
    enabled,
    // Re-run when attachment state changes
    attachment?.s3Key,
    attachment?.thumbnailKey,
    attachment?.thumbnailStatus,
    attachment?.previewUrl,
  ]);

  return {
    url,
    thumbnailUrl,
    fullUrl,
    loading,
    error,
    thumbnailStatus,
    hasThumbnail,
    blurhash,
    dimensions,
    loadFullResolution,
  };
}

/**
 * Hook for batch loading multiple media items
 */
export function useMediaUrls(
  attachments: Array<{ id: string; messageId: string }>,
  options: UseMediaUrlOptions = {}
) {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!attachments.length) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadAll = async () => {
      const newUrls: Record<string, string | null> = {};
      const newErrors: Record<string, string | null> = {};

      await Promise.all(
        attachments.map(async ({ id, messageId }) => {
          try {
            const response = await mediaApi.getThumbnailUrl(messageId, id);
            newUrls[id] = response;
          } catch (err) {
            newErrors[id] =
              err instanceof Error ? err.message : "Failed to load";
          }
        })
      );

      if (isMounted) {
        setUrls(newUrls);
        setErrors(newErrors);
        setLoading(false);
      }
    };

    loadAll();

    return () => {
      isMounted = false;
    };
  }, [attachments]);

  return { urls, loading, errors };
}
