/**
 * Hook for loading media URLs with proper lifecycle management
 *
 * DESIGN:
 * - Uses centralized MediaCache for presigned URL caching
 * - Blob URLs are created and managed per-component instance
 * - Clear separation between thumbnail URLs (presigned) and full URLs (blob)
 * - Correctly distinguishes between:
 *   1. True optimistic messages (not yet in DB) - use previewUrl only
 *   2. Messages with pending- prefix that ARE in DB - load from backend
 *   3. Staging files (still uploading) - use previewUrl or thumbnail if available
 *
 * Message ID Notes:
 * - Outbound media messages use "pending-{timestamp}-{random}" as permanent messageId
 * - The real WhatsApp ID is stored in message.mediaUrl as "wa:wamid.xxx"
 * - This is by design - the messageId never changes, it's used for S3 paths
 *
 * Usage:
 * ```tsx
 * const { url, loading, error } = useMediaUrl(messageId, attachmentId, { attachment });
 * ```
 */

import { mediaCache } from "@/lib/cache/media-cache";
import { mediaApi } from "@/lib/media/api";
import { Attachment, ThumbnailStatus } from "@/lib/media/types";
import { useCallback, useEffect, useRef, useState } from "react";

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
// HELPER FUNCTIONS
// ============================================================

/**
 * Determine if a message is a TRUE optimistic message (not yet stored in DB).
 *
 * Key insight: Messages with "pending-xxx" prefix are PERMANENT IDs for outbound
 * media messages. They ARE stored in the database. The way to tell if a message
 * is truly optimistic (frontend-only) is to check for backend confirmation:
 *
 * - Has thumbnailKey → Backend processed it, message is in DB
 * - Has non-staging s3Key → File promoted, message is in DB
 * - Status is 'sent'/'delivered'/'read'/'success' → Obviously in DB
 *
 * A TRUE optimistic message has:
 * - pending- prefix
 * - NO thumbnailKey (or staging thumbnailKey)
 * - s3Key is empty or staging
 * - previewUrl exists (local blob from file selection)
 */
function isTrueOptimisticMessage(
  messageId: string,
  attachment?: Attachment
): boolean {
  // Not a pending message at all
  if (!messageId.startsWith("pending-")) {
    return false;
  }

  // Has non-staging thumbnail key means backend has processed it
  if (
    attachment?.thumbnailKey &&
    !attachment.thumbnailKey.startsWith("staging/")
  ) {
    return false;
  }

  // Has non-staging s3Key means file is promoted and message is stored
  if (attachment?.s3Key && !attachment.s3Key.startsWith("staging/")) {
    return false;
  }

  // Has successful status means it's in the DB
  const confirmedStatuses = ["success", "sent", "delivered", "read"];
  if (attachment?.status && confirmedStatuses.includes(attachment.status)) {
    return false;
  }

  // This is a true optimistic message - only exists in frontend state
  return true;
}

/**
 * Determine if the full resolution media can be loaded from the backend.
 * Returns false for:
 * - True optimistic messages (not yet in DB)
 * - Files still in staging (being uploaded)
 */
function canLoadFullFromBackend(
  messageId: string,
  attachment?: Attachment
): boolean {
  // True optimistic messages don't exist in DB
  if (isTrueOptimisticMessage(messageId, attachment)) {
    return false;
  }

  // Staging files can't be downloaded via normal API
  if (attachment?.s3Key?.startsWith("staging/")) {
    return false;
  }

  return true;
}

// ============================================================
// CACHE INVALIDATION UTILITIES (Delegated to MediaCache)
// ============================================================

/**
 * Invalidate cache for an attachment.
 * Call when thumbnail becomes ready or attachment is updated.
 */
export function invalidateCacheForAttachment(
  messageId: string,
  attachmentId: string
): void {
  mediaCache.invalidateThumbnailUrl(messageId, attachmentId);
}

/**
 * Invalidate all cache entries for a message.
 */
export function invalidateCachesForMessage(messageId: string): void {
  mediaCache.invalidateMessageUrls(messageId);
}

/**
 * Invalidate all cache entries with staging paths.
 * Call after file promotion to ensure we don't serve stale staging URLs.
 */
export function invalidateStagingCaches(): void {
  mediaCache.invalidateStagingUrls();
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

  // ROBUST CHECK: If thumbnailKey exists and is NOT staging, thumbnail is available in S3
  // We try to load it unless status explicitly indicates failure or pending processing
  const hasThumbnail =
    !!attachment?.thumbnailKey &&
    !attachment.thumbnailKey.startsWith("staging/") &&
    thumbnailStatus !== "failed" &&
    thumbnailStatus !== "pending" &&
    thumbnailStatus !== "processing";

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

    // Early exit: disabled or no attachmentId
    if (!enabled || !attachmentId) {
      setLoading(false);
      setUrl(null);
      setThumbnailUrl(null);
      setFullUrl(null);
      return;
    }

    // Determine what kind of message/attachment this is
    const isOptimistic = isTrueOptimisticMessage(messageId, attachment);
    const isStaging = attachment?.s3Key?.startsWith("staging/");
    const hasPreviewUrl = !!attachment?.previewUrl;
    const hasS3Key = !!attachment?.s3Key && attachment.s3Key !== "";

    // CASE 1: True optimistic message - use previewUrl only
    if (isOptimistic) {
      if (hasPreviewUrl) {
        setUrl(attachment!.previewUrl!);
        setThumbnailUrl(attachment!.previewUrl!);
        setLoading(false);
        return;
      }
      // No preview - nothing to show yet
      setLoading(false);
      return;
    }

    // CASE 2: Staging file - use previewUrl or try to load thumbnail
    if (isStaging) {
      if (hasPreviewUrl) {
        setUrl(attachment!.previewUrl!);
        setThumbnailUrl(attachment!.previewUrl!);
        setLoading(false);
        return;
      }
      // No preview - check if we can load thumbnail
      if (!hasThumbnail) {
        setLoading(false);
        return;
      }
      // Fall through to load thumbnail from backend
    }

    // CASE 3: No s3Key - nothing to load from backend
    if (!hasS3Key) {
      if (hasPreviewUrl) {
        setUrl(attachment!.previewUrl!);
        setThumbnailUrl(attachment!.previewUrl!);
      }
      setLoading(false);
      return;
    }

    // CASE 4: Load from backend (thumbnail and/or full)
    let isMounted = true;
    abortControllerRef.current = new AbortController();

    const loadMedia = async () => {
      try {
        setLoading(true);
        setError(null);

        let loadedThumbnailUrl: string | null = null;
        let loadedFullUrl: string | null = null;

        console.log(
          `[useMediaUrl] CASE 4: Loading from backend for ${attachmentId}:`,
          {
            loadThumbnail,
            hasThumbnail,
            isOptimistic,
            isStaging,
            thumbnailKey: attachment?.thumbnailKey,
          }
        );

        // Try to load thumbnail if requested and available
        if (loadThumbnail && hasThumbnail) {
          try {
            console.log(
              `[useMediaUrl] Calling getThumbnailUrl for ${attachmentId}...`
            );
            // MediaCache handles deduplication and TTL internally
            const thumbUrl = await mediaApi.getThumbnailUrl(
              messageId,
              attachmentId
            );
            console.log(
              `[useMediaUrl] getThumbnailUrl returned for ${attachmentId}:`,
              thumbUrl ? "URL" : "NULL"
            );

            if (thumbUrl) {
              loadedThumbnailUrl = thumbUrl;
            }
          } catch (err) {
            console.error(
              `[useMediaUrl] Thumbnail load failed for ${attachmentId}:`,
              err
            );
          }
        } else {
          console.log(
            `[useMediaUrl] Skipping thumbnail load for ${attachmentId}:`,
            {
              loadThumbnail,
              hasThumbnail,
            }
          );
        }

        // Determine if we need to load full resolution
        const isVideo = attachment?.type === "video";
        const canLoad = canLoadFullFromBackend(messageId, attachment);

        const needsFull =
          canLoad &&
          (!loadThumbnail || // Explicitly requesting full
            (!loadedThumbnailUrl && !isVideo) || // Thumbnail failed for non-video
            shouldLoadFull); // User requested full

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

    // Cleanup function
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
    enabled,
    loadThumbnail,
    handleCloudApi,
    attachment?.s3Key,
    attachment?.thumbnailKey,
    attachment?.thumbnailStatus,
    attachment?.previewUrl,
    attachment?.status,
    attachment?.type,
    hasThumbnail,
    shouldLoadFull,
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

// ============================================================
// BATCH LOADING HOOK
// ============================================================

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

// ============================================================
// PREFETCH UTILITIES
// ============================================================

/**
 * Prefetch thumbnail URLs for a list of attachments.
 * Useful for preloading thumbnails when a chat is opened.
 */
export async function prefetchThumbnailUrls(
  attachments: Array<{
    messageId: string;
    attachmentId: string;
    thumbnailKey?: string;
    thumbnailStatus?: ThumbnailStatus;
  }>
): Promise<void> {
  const validAttachments = attachments.filter(
    (a) =>
      a.thumbnailKey &&
      !a.thumbnailKey.startsWith("staging/") &&
      a.thumbnailStatus !== "failed" &&
      a.thumbnailStatus !== "pending" &&
      a.thumbnailStatus !== "processing"
  );

  const promises = validAttachments.map(async (attachment) => {
    try {
      await mediaApi.getThumbnailUrl(
        attachment.messageId,
        attachment.attachmentId
      );
    } catch {
      // Ignore errors during prefetch
    }
  });

  await Promise.allSettled(promises);
}
