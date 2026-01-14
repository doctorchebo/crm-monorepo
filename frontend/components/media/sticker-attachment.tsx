"use client";

/**
 * Sticker Attachment Component
 * WhatsApp-style sticker display
 *
 * Features:
 * - Displays stickers without message bubble background
 * - Supports both static and animated stickers (webp)
 * - Animated stickers play automatically on loop
 * - Consistent sizing (stickers are typically square or near-square)
 * - Transparent background preservation
 *
 * Design:
 * - Stickers in WhatsApp appear without the chat bubble
 * - They are displayed directly with transparent backgrounds
 * - Max size is typically 512x512 but displayed smaller in chat
 */

import { useMediaUrl } from "@/hooks/use-media-url";
import { Attachment } from "@/lib/media/types";
import { cn } from "@/lib/utils";
import { memo, useCallback, useRef, useState } from "react";
import { ThumbnailSkeleton } from "./thumbnail-skeleton";

interface StickerAttachmentProps {
  /** The sticker attachment metadata */
  attachment: Attachment;
  /** Message ID for media URL resolution */
  messageId: string;
  /** Whether this is an outbound message */
  isOutbound?: boolean;
  /** Maximum dimension (width/height) constraint */
  maxSize?: number;
}

/**
 * Sticker Loading Placeholder
 * Shows while sticker is loading
 */
function StickerPlaceholder({
  size,
  blurhash,
}: {
  size: number;
  blurhash?: string;
}) {
  return (
    <ThumbnailSkeleton
      width={size}
      height={size}
      blurhash={blurhash}
      variant="small"
      className="rounded-lg"
    />
  );
}

export const StickerAttachment = memo(function StickerAttachment({
  attachment,
  messageId,
  isOutbound = false,
  maxSize = 180,
}: StickerAttachmentProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Determine if this is an animated sticker
  const isAnimated = attachment.isAnimated === true;

  // Use media URL hook for loading the sticker
  const {
    url: mediaUrl,
    loading,
    error,
    blurhash,
    dimensions,
  } = useMediaUrl(messageId, attachment.id, {
    handleCloudApi: true,
    attachment,
  });

  // Handle image load
  const handleLoad = useCallback(() => {
    setIsLoaded(true);
  }, []);

  // Handle image error
  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  // Error state
  // IMPORTANT: Must include data-media-loading="false" to signal scroll system
  // that this media is "done" (even though it failed)
  if (error || hasError) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground"
        data-media-container="sticker"
        data-media-loading="false"
      >
        <div
          className="bg-muted/50 rounded-lg flex items-center justify-center"
          style={{ width: maxSize, height: maxSize }}
        >
          <span className="text-xs">Sticker unavailable</span>
        </div>
      </div>
    );
  }

  // Calculate display size maintaining aspect ratio
  // Stickers are typically square, but may not be exactly
  const displaySize = maxSize;
  const actualWidth = dimensions?.width || maxSize;
  const actualHeight = dimensions?.height || maxSize;
  const aspectRatio = actualWidth / actualHeight;

  let displayWidth: number;
  let displayHeight: number;

  if (aspectRatio >= 1) {
    // Wider than tall
    displayWidth = Math.min(actualWidth, maxSize);
    displayHeight = displayWidth / aspectRatio;
  } else {
    // Taller than wide
    displayHeight = Math.min(actualHeight, maxSize);
    displayWidth = displayHeight * aspectRatio;
  }

  // Track if media is still loading for scroll hook coordination
  const isMediaLoading = loading || !isLoaded;

  return (
    <div
      className="relative inline-block"
      style={{
        width: displayWidth,
        height: displayHeight,
      }}
      data-media-container="sticker"
      data-media-loading={isMediaLoading ? "true" : "false"}
    >
      {/* Loading placeholder */}
      {(loading || !isLoaded) && !hasError && (
        <div className="absolute inset-0">
          <StickerPlaceholder size={displaySize} blurhash={blurhash} />
        </div>
      )}

      {/* Sticker image */}
      {mediaUrl && (
        <img
          ref={imgRef}
          src={mediaUrl}
          alt="Sticker"
          className={cn(
            "object-contain transition-opacity duration-300",
            isLoaded ? "opacity-100" : "opacity-0"
          )}
          style={{
            width: displayWidth,
            height: displayHeight,
          }}
          onLoad={handleLoad}
          onError={handleError}
          // Preserve transparent backgrounds
          draggable={false}
        />
      )}

      {/* Loading spinner for animated stickers */}
      {loading && isAnimated && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-primary" />
        </div>
      )}
    </div>
  );
});

StickerAttachment.displayName = "StickerAttachment";
