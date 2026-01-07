/**
 * Hook for loading media with caching and abort support
 *
 * Features:
 * - Automatic cleanup on unmount via AbortController
 * - Integrated media URL caching
 * - Cloud API blob URL lifecycle management
 * - Prevents race conditions on component unmount
 * - Thumbnail status awareness for progressive loading
 * - Module-level URL cache for instant restoration on re-mount
 *
 * Usage:
 * ```tsx
 * const { url, loading, error, thumbnailStatus } = useMediaUrl(messageId, attachmentId);
 * ```
 */

import { mediaApi } from "@/lib/media/api";
import { Attachment, ThumbnailStatus } from "@/lib/media/types";
import { useCallback, useEffect, useRef, useState } from "react";

// ============================================================
// MODULE-LEVEL THUMBNAIL URL CACHE
// ============================================================
// This cache persists across component unmounts/remounts
// It stores thumbnail URLs that have been successfully loaded
// This eliminates loading flicker when switching between chats
// and prevents unnecessary skeleton displays

interface CachedMediaEntry {
  thumbnailUrl: string | null;
  fullUrl: string | null;
  cachedAt: number;
}

// Module-level cache - survives component unmounts
const mediaUrlCache = new Map<string, CachedMediaEntry>();

// Cache TTL - 30 minutes (thumbnail presigned URLs typically last 1 hour)
const CACHE_TTL = 30 * 60 * 1000;

function getCacheKey(messageId: string, attachmentId: string): string {
  return `${messageId}:${attachmentId}`;
}

function getCachedEntry(
  messageId: string,
  attachmentId: string
): CachedMediaEntry | null {
  const key = getCacheKey(messageId, attachmentId);
  const entry = mediaUrlCache.get(key);

  if (!entry) return null;

  // Check if entry is expired
  if (Date.now() - entry.cachedAt > CACHE_TTL) {
    mediaUrlCache.delete(key);
    return null;
  }

  return entry;
}

function setCachedEntry(
  messageId: string,
  attachmentId: string,
  thumbnailUrl: string | null,
  fullUrl: string | null
): void {
  const key = getCacheKey(messageId, attachmentId);
  mediaUrlCache.set(key, {
    thumbnailUrl,
    fullUrl,
    cachedAt: Date.now(),
  });
}

// ============================================================
// HOOK TYPES
// ============================================================

interface UseMediaUrlOptions {
  loadThumbnail?: boolean; // Try to load thumbnail first
  handleCloudApi?: boolean; // Convert cloud-api:// URLs to blob URLs
  /** Attachment data with thumbnail info */
  attachment?: Attachment;
  /** Whether to enable fetching (default: true). When false, no API calls will be made */
  enabled?: boolean;
}

interface UseMediaUrlResult {
  /** The resolved URL (thumbnail or full) */
  url: string | null;
  /** Thumbnail URL (if available) */
  thumbnailUrl: string | null;
  /** Full resolution URL (separate from thumbnail) */
  fullUrl: string | null;
  /** Whether loading is in progress */
  loading: boolean;
  /** Error message if loading failed */
  error: string | null;
  /** Current thumbnail status */
  thumbnailStatus: ThumbnailStatus | undefined;
  /** Whether thumbnail is ready */
  hasThumbnail: boolean;
  /** Blurhash for progressive loading */
  blurhash: string | undefined;
  /** Media dimensions */
  dimensions: { width?: number; height?: number };
  /** Manually load full resolution */
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

  // Check module-level cache SYNCHRONOUSLY for initial state
  // This prevents loading flicker when component remounts
  const cachedEntry =
    attachmentId && enabled ? getCachedEntry(messageId, attachmentId) : null;
  const hasCachedUrl =
    cachedEntry && (cachedEntry.thumbnailUrl || cachedEntry.fullUrl);

  // Initialize state from cache if available
  const [url, setUrl] = useState<string | null>(
    hasCachedUrl ? cachedEntry.thumbnailUrl || cachedEntry.fullUrl : null
  );
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(
    cachedEntry?.thumbnailUrl || null
  );
  const [fullUrl, setFullUrl] = useState<string | null>(
    cachedEntry?.fullUrl || null
  );
  // CRITICAL: Start as NOT loading if we have cached data
  const [loading, setLoading] = useState(!hasCachedUrl);
  const [error, setError] = useState<string | null>(null);
  const [shouldLoadFull, setShouldLoadFull] = useState(false);

  // Track AbortController to cancel requests on unmount
  const abortControllerRef = useRef<AbortController | null>(null);
  const componentRef = useRef<object>({});
  // Track blob URLs created for cleanup
  const blobUrlsRef = useRef<string[]>([]);

  // Get thumbnail metadata from attachment
  const thumbnailStatus = attachment?.thumbnailStatus;
  const hasThumbnail =
    thumbnailStatus === "ready" && !!attachment?.thumbnailKey;
  const blurhash = attachment?.blurhash;
  const dimensions = {
    width: attachment?.width,
    height: attachment?.height,
  };

  // Function to manually trigger full resolution loading
  const loadFullResolution = useCallback(() => {
    setShouldLoadFull(true);
  }, []);

  useEffect(() => {
    // Skip loading if disabled
    if (!enabled) {
      setLoading(false);
      setUrl(null);
      setThumbnailUrl(null);
      setFullUrl(null);
      return;
    }

    // Skip loading if no attachmentId is provided
    if (!attachmentId) {
      setLoading(false);
      setUrl(null);
      setThumbnailUrl(null);
      setFullUrl(null);
      return;
    }

    // Skip loading if attachment exists but has no s3Key yet (pending upload)
    // This prevents "Attachment not found" errors during upload
    if (attachment && (!attachment.s3Key || attachment.s3Key === "")) {
      console.log(
        `[useMediaUrl] Skipping fetch for ${attachmentId} - s3Key is empty (pending upload)`
      );
      setLoading(false);
      return;
    }

    // Check module-level cache first - if we have cached URLs, skip the fetch
    const cached = getCachedEntry(messageId, attachmentId);
    if (cached && (cached.thumbnailUrl || cached.fullUrl)) {
      // We already have cached URLs, just ensure state is set correctly
      // (This handles the case where dependencies change but we still have valid cache)
      const displayUrl = cached.thumbnailUrl || cached.fullUrl;
      if (
        url !== displayUrl ||
        thumbnailUrl !== cached.thumbnailUrl ||
        fullUrl !== cached.fullUrl
      ) {
        setThumbnailUrl(cached.thumbnailUrl);
        setFullUrl(cached.fullUrl);
        setUrl(displayUrl);
      }
      setLoading(false);

      // If thumbnail wasn't ready before but now is, we might need to fetch it
      // Check if we should fetch thumbnail now that it's ready
      if (loadThumbnail && hasThumbnail && !cached.thumbnailUrl) {
        // Fall through to fetch thumbnail
      } else {
        console.log(`[useMediaUrl] Using cached URL for ${attachmentId}`);
        return; // Cache hit - no need to fetch
      }
    }

    // Create abort controller for this effect
    abortControllerRef.current = new AbortController();
    let isMounted = true;

    console.log(`[useMediaUrl] Fetching URL for ${attachmentId}:`, {
      hasThumbnail,
      thumbnailStatus,
      thumbnailKey: attachment?.thumbnailKey,
      s3Key: attachment?.s3Key,
    });

    const loadUrl = async () => {
      try {
        // Only set loading if we don't already have a URL to display
        if (!url) {
          setLoading(true);
        }
        setError(null);

        let loadedThumbnailUrl: string | null = null;
        let originalUrl: string | null = null;

        // Try to load thumbnail if available and requested
        if (loadThumbnail && hasThumbnail) {
          try {
            loadedThumbnailUrl = await mediaApi.getThumbnailUrl(
              messageId,
              attachmentId
            );
          } catch (err) {
            console.debug("Thumbnail load failed, falling back to full image");
          }
        }

        // For videos: only load full video if explicitly requested via shouldLoadFull
        // Otherwise, just show the thumbnail (or skeleton if thumbnail isn't ready)
        const isVideo = attachment?.type === "video";
        const shouldSkipFullLoad = isVideo && loadThumbnail && !shouldLoadFull;

        // Load full URL if thumbnail not available or explicitly requested
        // Skip full load for videos when we only want thumbnail display
        if ((!loadedThumbnailUrl && !shouldSkipFullLoad) || shouldLoadFull) {
          // Use streaming endpoint to avoid CORS issues with direct S3 URLs
          // Fetch the media as a blob and create an object URL
          try {
            const blob = await mediaApi.downloadMediaViaStream(
              messageId,
              attachmentId
            );
            originalUrl = window.URL.createObjectURL(blob);
            // Track blob URL for cleanup on unmount
            blobUrlsRef.current.push(originalUrl);
          } catch (streamErr) {
            console.warn(
              "Stream download failed, falling back to presigned URL:",
              streamErr
            );
            // Fallback to presigned URL (may fail due to CORS)
            const urlResponse = await mediaApi.getDownloadUrl(
              messageId,
              attachmentId
            );
            originalUrl = urlResponse.url;

            // Handle Cloud API media URLs
            if (
              originalUrl &&
              handleCloudApi &&
              originalUrl.startsWith("cloud-api://")
            ) {
              const mediaId = originalUrl.replace("cloud-api://", "");
              try {
                originalUrl = await mediaApi.fetchCloudAPIMedia(
                  mediaId,
                  componentRef.current
                );
              } catch (err) {
                console.error("Failed to fetch cloud API media:", err);
                throw err;
              }
            }
          }
        }

        // Update state if component is still mounted and request wasn't aborted
        if (isMounted && !abortControllerRef.current?.signal.aborted) {
          // Use thumbnail as primary URL if available, otherwise full
          setThumbnailUrl(loadedThumbnailUrl);
          setUrl(loadedThumbnailUrl || originalUrl);
          setFullUrl(originalUrl);
          setError(null);

          // Update module-level cache for instant restoration on re-mount
          // Only cache presigned URLs (not blob URLs which are component-local)
          if (
            loadedThumbnailUrl ||
            (originalUrl && !originalUrl.startsWith("blob:"))
          ) {
            setCachedEntry(
              messageId,
              attachmentId,
              loadedThumbnailUrl,
              originalUrl && !originalUrl.startsWith("blob:")
                ? originalUrl
                : null
            );
          }
        }
      } catch (err) {
        if (isMounted && !abortControllerRef.current?.signal.aborted) {
          setError(err instanceof Error ? err.message : "Failed to load media");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadUrl();

    // Cleanup on unmount
    return () => {
      isMounted = false;
      abortControllerRef.current?.abort();

      // Cleanup cloud API blob URLs
      mediaApi.cleanupComponentMedia(componentRef.current);

      // Cleanup blob URLs created from stream downloads
      blobUrlsRef.current.forEach((blobUrl) => {
        window.URL.revokeObjectURL(blobUrl);
      });
      blobUrlsRef.current = [];
    };
  }, [
    messageId,
    attachmentId,
    loadThumbnail,
    handleCloudApi,
    hasThumbnail,
    shouldLoadFull,
    enabled,
    // Include thumbnailKey to re-run when thumbnail becomes ready via WebSocket
    attachment?.thumbnailKey,
    attachment?.thumbnailStatus,
    // Include s3Key to re-fetch when attachment upload completes
    attachment?.s3Key,
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
 * Useful for galleries and carousels
 */
export function useMediaUrls(
  attachments: Array<{ id: string; messageId: string }>,
  options: UseMediaUrlOptions = {}
) {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortControllerRef.current = new AbortController();
    let isMounted = true;

    const loadUrls = async () => {
      try {
        setLoading(true);
        setError(null);

        const results: Record<string, string | null> = {};

        // Load all URLs in parallel
        const promises = attachments.map(async (attachment) => {
          try {
            const urlResponse = await mediaApi.getDownloadUrl(
              attachment.messageId,
              attachment.id
            );
            let finalUrl = urlResponse.url;

            // Handle Cloud API media
            if (
              options.handleCloudApi !== false &&
              finalUrl.startsWith("cloud-api://")
            ) {
              const mediaId = finalUrl.replace("cloud-api://", "");
              finalUrl = await mediaApi.fetchCloudAPIMedia(mediaId);
            }

            results[attachment.id] = finalUrl;
          } catch (err) {
            console.error(`Failed to load media ${attachment.id}:`, err);
            results[attachment.id] = null;
          }
        });

        await Promise.all(promises);

        if (isMounted && !abortControllerRef.current?.signal.aborted) {
          setUrls(results);
          setError(null);
        }
      } catch (err) {
        if (isMounted && !abortControllerRef.current?.signal.aborted) {
          setError(err instanceof Error ? err.message : "Failed to load media");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadUrls();

    return () => {
      isMounted = false;
      abortControllerRef.current?.abort();
    };
  }, [attachments, options]);

  return { urls, loading, error };
}
