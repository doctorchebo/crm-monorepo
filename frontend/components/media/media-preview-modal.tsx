"use client";

/**
 * Media Preview Modal
 * Inline media viewer (positioned within container) with carousel, toolbar, and video support
 *
 * Features:
 * - Supports both images and videos
 * - Video playback with native controls
 * - Prominent download button
 * - Keyboard navigation (arrow keys, Escape)
 * - Positioned within messages container, not full screen
 *
 * Optimizations:
 * - Uses useMediaUrl hook for automatic URL caching
 * - Carousel thumbnails reuse cached URLs
 * - Cloud API media blob URLs are managed with lifecycle cleanup
 */

import { useMediaUrl } from "@/hooks/use-media-url";
import { Attachment } from "@/lib/media/types";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Film,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface MediaPreviewModalProps {
  isOpen: boolean;
  attachments: Attachment[];
  messageId: string;
  initialIndex?: number;
  onClose: () => void;
}

export function MediaPreviewModal({
  isOpen,
  attachments,
  messageId,
  initialIndex = 0,
  onClose,
}: MediaPreviewModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(100);
  const [loading, setLoading] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Reset to initial index when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setZoom(100);
    }
  }, [isOpen, initialIndex]);

  const currentAttachment = attachments[currentIndex];
  const isVideo = currentAttachment?.type === "video";

  // Use optimized hook for media loading with caching
  const {
    url: mediaUrl,
    loading: urlLoading,
    error: urlError,
  } = useMediaUrl(messageId, currentAttachment?.id || "", {
    handleCloudApi: true,
  });

  // Update loading state
  useEffect(() => {
    setLoading(urlLoading);
  }, [urlLoading]);

  const handleNext = () => {
    if (currentIndex < attachments.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setZoom(100);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setZoom(100);
    }
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 10, 200));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 10, 50));
  };

  const handleDownload = async () => {
    if (!currentAttachment) return;

    try {
      // Use the streaming endpoint to avoid CORS issues with S3
      const { mediaApi } = await import("@/lib/media/api");
      const blob = await mediaApi.downloadMediaViaStream(
        messageId,
        currentAttachment.id
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        currentAttachment.fileName ||
        `${isVideo ? "video" : "image"}_${currentIndex + 1}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Failed to download media:", err);
    }
  };

  // Handle keyboard navigation and close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          handlePrevious();
          break;
        case "ArrowRight":
          handleNext();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentIndex, attachments.length, onClose]);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 bg-black/95 flex flex-col rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-white text-sm">
            {currentIndex + 1} / {attachments.length}
          </span>
          {isVideo && (
            <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded flex items-center gap-1">
              <Film className="w-3 h-3" />
              Video
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Zoom controls - only for images */}
          {!isVideo && (
            <>
              <button
                onClick={handleZoomOut}
                className="p-2 hover:bg-gray-700 rounded-lg text-white transition"
                title="Zoom out"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <span className="text-white text-xs w-12 text-center">
                {zoom}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-2 hover:bg-gray-700 rounded-lg text-white transition"
                title="Zoom in"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
              <div className="w-px h-6 bg-gray-700 mx-2" />
            </>
          )}

          {/* Download button - prominent */}
          <button
            onClick={handleDownload}
            className="p-2 hover:bg-green-600 rounded-lg text-white transition flex items-center gap-2 bg-green-700"
            title="Download"
          >
            <Download className="w-5 h-5" />
            <span className="text-sm">Download</span>
          </button>

          <div className="w-px h-6 bg-gray-700 mx-2" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg text-white transition"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Media viewer */}
      <div className="flex-1 flex items-center justify-center overflow-hidden relative min-h-0 p-4">
        {loading ? (
          <div className="text-white flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-blue-500" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : urlError ? (
          <div className="text-red-400 text-center p-4">
            <p>Failed to load media</p>
            <p className="text-sm text-gray-500 mt-1">{urlError}</p>
          </div>
        ) : mediaUrl ? (
          <>
            {/* Previous button */}
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="absolute left-2 z-10 p-2 hover:bg-gray-700/50 rounded-lg text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
              title="Previous (←)"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>

            {/* Media content */}
            {isVideo ? (
              <video
                ref={videoRef}
                key={mediaUrl} // Force remount when URL changes
                src={mediaUrl}
                controls
                autoPlay
                className="max-h-full max-w-full rounded-lg shadow-2xl"
                style={{ maxHeight: "calc(100% - 16px)" }}
              >
                Your browser does not support the video tag.
              </video>
            ) : (
              <img
                ref={imgRef}
                src={mediaUrl}
                alt={currentAttachment.fileName || "Preview"}
                className="max-h-full max-w-full transition-transform duration-200 rounded-lg shadow-2xl"
                style={{
                  transform: `scale(${zoom / 100})`,
                }}
              />
            )}

            {/* Next button */}
            <button
              onClick={handleNext}
              disabled={currentIndex === attachments.length - 1}
              className="absolute right-2 z-10 p-2 hover:bg-gray-700/50 rounded-lg text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next (→)"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          </>
        ) : (
          <div className="text-white">No media available</div>
        )}
      </div>

      {/* Carousel at the bottom */}
      {attachments.length > 1 && (
        <div className="h-20 border-t border-gray-700 overflow-x-auto px-2 py-2 flex gap-2 flex-shrink-0">
          {attachments.map((attachment, index) => (
            <button
              key={attachment.id}
              onClick={() => {
                setCurrentIndex(index);
                setZoom(100);
              }}
              className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden transition relative ${
                index === currentIndex
                  ? "ring-2 ring-blue-500"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              <CarouselThumbnail
                attachment={attachment}
                messageId={messageId}
              />
              {attachment.type === "video" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Film className="w-4 h-4 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Carousel thumbnail component
 * Uses cached URLs to avoid redundant API calls
 */
function CarouselThumbnail({
  attachment,
  messageId,
}: {
  attachment: Attachment;
  messageId: string;
}) {
  // Use optimized hook for thumbnail loading
  const { url: thumbnailUrl, loading } = useMediaUrl(messageId, attachment.id, {
    loadThumbnail: true,
    handleCloudApi: true,
  });

  if (loading || !thumbnailUrl) {
    return (
      <div className="w-full h-full bg-gray-700 flex items-center justify-center">
        {loading ? (
          <div className="animate-spin rounded-full h-4 w-4 border border-white border-t-transparent" />
        ) : (
          <span className="text-xs text-gray-400">?</span>
        )}
      </div>
    );
  }

  return (
    <img
      src={thumbnailUrl}
      alt="Thumbnail"
      className="w-full h-full object-cover"
    />
  );
}
