/**
 * Hook for loading media with caching and abort support
 *
 * Features:
 * - Automatic cleanup on unmount via AbortController
 * - Integrated media URL caching
 * - Cloud API blob URL lifecycle management
 * - Prevents race conditions on component unmount
 * - Thumbnail status awareness for progressive loading
 *
 * Usage:
 * ```tsx
 * const { url, loading, error, thumbnailStatus } = useMediaUrl(messageId, attachmentId);
 * ```
 */

import { mediaApi } from "@/lib/media/api";
import { Attachment, ThumbnailStatus } from "@/lib/media/types";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseMediaUrlOptions {
  loadThumbnail?: boolean; // Try to load thumbnail first
  handleCloudApi?: boolean; // Convert cloud-api:// URLs to blob URLs
  /** Attachment data with thumbnail info */
  attachment?: Attachment;
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

export function useMediaUrl(
  messageId: string,
  attachmentId: string,
  options: UseMediaUrlOptions = {}
): UseMediaUrlResult {
  const { loadThumbnail = false, handleCloudApi = true, attachment } = options;
  const [url, setUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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
    // Create abort controller for this effect
    abortControllerRef.current = new AbortController();
    let isMounted = true;

    console.log(`[useMediaUrl] Effect running for ${attachmentId}:`, {
      hasThumbnail,
      thumbnailStatus,
      thumbnailKey: attachment?.thumbnailKey,
    });

    const loadUrl = async () => {
      try {
        setLoading(true);
        setError(null);

        let thumbnailUrl: string | null = null;
        let originalUrl: string | null = null;

        // Try to load thumbnail if available and requested
        if (loadThumbnail && hasThumbnail) {
          console.log(`[useMediaUrl] Loading thumbnail for ${attachmentId}`);
          try {
            thumbnailUrl = await mediaApi.getThumbnailUrl(
              messageId,
              attachmentId
            );
            console.log(
              `[useMediaUrl] Thumbnail URL loaded for ${attachmentId}:`,
              thumbnailUrl
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
        if ((!thumbnailUrl && !shouldSkipFullLoad) || shouldLoadFull) {
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
          setThumbnailUrl(thumbnailUrl);
          setUrl(thumbnailUrl || originalUrl);
          setFullUrl(originalUrl);
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
    // Include thumbnailKey to re-run when thumbnail becomes ready via WebSocket
    attachment?.thumbnailKey,
    attachment?.thumbnailStatus,
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
