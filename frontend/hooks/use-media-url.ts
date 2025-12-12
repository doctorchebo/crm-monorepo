/**
 * Hook for loading media with caching and abort support
 *
 * Features:
 * - Automatic cleanup on unmount via AbortController
 * - Integrated media URL caching
 * - Cloud API blob URL lifecycle management
 * - Prevents race conditions on component unmount
 *
 * Usage:
 * ```tsx
 * const { url, loading, error } = useMediaUrl(messageId, attachmentId);
 * ```
 */

import { mediaApi } from "@/lib/media/api";
import { useEffect, useRef, useState } from "react";

interface UseMediaUrlOptions {
  loadThumbnail?: boolean; // Try to load thumbnail first
  handleCloudApi?: boolean; // Convert cloud-api:// URLs to blob URLs
}

export function useMediaUrl(
  messageId: string,
  attachmentId: string,
  options: UseMediaUrlOptions = {}
) {
  const { loadThumbnail = false, handleCloudApi = true } = options;
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track AbortController to cancel requests on unmount
  const abortControllerRef = useRef<AbortController | null>(null);
  const componentRef = useRef<object>({});

  useEffect(() => {
    // Create abort controller for this effect
    abortControllerRef.current = new AbortController();
    let isMounted = true;

    const loadUrl = async () => {
      try {
        setLoading(true);
        setError(null);

        let finalUrl: string | null = null;

        // Try thumbnail first if requested
        if (loadThumbnail) {
          try {
            finalUrl = await mediaApi.getThumbnailUrl(messageId, attachmentId);
          } catch (err) {
            console.debug("Thumbnail load failed, falling back to full image");
          }
        }

        // If no thumbnail or not requested, load full image
        if (!finalUrl) {
          const urlResponse = await mediaApi.getDownloadUrl(
            messageId,
            attachmentId
          );
          finalUrl = urlResponse.url;
        }

        // Handle Cloud API media URLs
        if (finalUrl && handleCloudApi && finalUrl.startsWith("cloud-api://")) {
          const mediaId = finalUrl.replace("cloud-api://", "");
          try {
            finalUrl = await mediaApi.fetchCloudAPIMedia(
              mediaId,
              componentRef.current
            );
          } catch (err) {
            console.error("Failed to fetch cloud API media:", err);
            throw err;
          }
        }

        // Update state if component is still mounted and request wasn't aborted
        if (isMounted && !abortControllerRef.current?.signal.aborted) {
          setUrl(finalUrl);
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
    };
  }, [messageId, attachmentId, loadThumbnail, handleCloudApi]);

  return { url, loading, error };
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
