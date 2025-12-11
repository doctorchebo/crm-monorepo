"use client";

/**
 * Media Preview Modal
 * Full-screen media viewer with carousel, toolbar, and zoom controls
 */

import { mediaApi } from "@/lib/media/api";
import { Attachment } from "@/lib/media/types";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  MessageCircle,
  Pin,
  Share2,
  Star,
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
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);

  const currentAttachment = attachments[currentIndex];

  // Load current image URL
  useEffect(() => {
    if (!isOpen || !currentAttachment) return;

    const loadImage = async () => {
      try {
        setLoading(true);
        const urlResponse = await mediaApi.getDownloadUrl(
          messageId,
          currentAttachment.id
        );
        let url = urlResponse.url;

        if (url.startsWith("cloud-api://")) {
          const mediaId = url.replace("cloud-api://", "");
          const response = await mediaApi.fetchCloudAPIMedia(mediaId);
          const blob = await response.blob();
          url = URL.createObjectURL(blob);
        }

        setImageUrl(url);
      } catch (err) {
        console.error("Failed to load preview image:", err);
      } finally {
        setLoading(false);
      }
    };

    loadImage();
  }, [currentIndex, isOpen, currentAttachment, messageId]);

  const handleNext = () => {
    if (currentIndex < attachments.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 10, 200));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 10, 50));
  };

  const handleDownload = async () => {
    if (!imageUrl) return;

    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = currentAttachment.fileName || `image_${currentIndex}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Failed to download image:", err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-white text-sm">
            {currentIndex + 1} / {attachments.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <button
            onClick={handleZoomOut}
            className="p-2 hover:bg-gray-700 rounded-lg text-white transition"
            title="Zoom out"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <span className="text-white text-xs w-12 text-center">{zoom}%</span>
          <button
            onClick={handleZoomIn}
            className="p-2 hover:bg-gray-700 rounded-lg text-white transition"
            title="Zoom in"
          >
            <ZoomIn className="w-5 h-5" />
          </button>

          <div className="w-px h-6 bg-gray-700 mx-2" />

          {/* Action buttons */}
          <button
            className="p-2 hover:bg-gray-700 rounded-lg text-white transition"
            title="Go to message"
          >
            <MessageCircle className="w-5 h-5" />
          </button>

          <button
            className="p-2 hover:bg-gray-700 rounded-lg text-white transition"
            title="Star"
          >
            <Star className="w-5 h-5" />
          </button>

          <button
            className="p-2 hover:bg-gray-700 rounded-lg text-white transition"
            title="Pin"
          >
            <Pin className="w-5 h-5" />
          </button>

          <button
            className="p-2 hover:bg-gray-700 rounded-lg text-white transition"
            title="React"
          >
            😊
          </button>

          <button
            className="p-2 hover:bg-gray-700 rounded-lg text-white transition"
            title="Forward"
          >
            <Share2 className="w-5 h-5" />
          </button>

          <button
            onClick={handleDownload}
            className="p-2 hover:bg-gray-700 rounded-lg text-white transition"
            title="Download"
          >
            <Download className="w-5 h-5" />
          </button>

          <div className="w-px h-6 bg-gray-700 mx-2" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg text-white transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Image viewer */}
      <div className="flex-1 flex items-center justify-center overflow-hidden relative">
        {loading ? (
          <div className="text-white">Loading...</div>
        ) : imageUrl ? (
          <>
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="absolute left-4 z-10 p-2 hover:bg-gray-700 rounded-lg text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
              title="Previous"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>

            <img
              ref={imgRef}
              src={imageUrl}
              alt="Preview"
              className="max-h-full max-w-full transition-transform duration-200"
              style={{
                transform: `scale(${zoom / 100})`,
              }}
            />

            <button
              onClick={handleNext}
              disabled={currentIndex === attachments.length - 1}
              className="absolute right-4 z-10 p-2 hover:bg-gray-700 rounded-lg text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
              title="Next"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          </>
        ) : (
          <div className="text-white">Failed to load image</div>
        )}
      </div>

      {/* Carousel at the bottom */}
      <div className="h-24 border-t border-gray-700 overflow-x-auto px-2 py-2 flex gap-2">
        {attachments.map((attachment, index) => (
          <button
            key={attachment.id}
            onClick={() => setCurrentIndex(index)}
            className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden transition ${
              index === currentIndex
                ? "ring-2 ring-blue-500"
                : "opacity-60 hover:opacity-100"
            }`}
          >
            <CarouselThumbnail attachment={attachment} messageId={messageId} />
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Carousel thumbnail component
 */
function CarouselThumbnail({
  attachment,
  messageId,
}: {
  attachment: Attachment;
  messageId: string;
}) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadThumbnail = async () => {
      try {
        let url: string | null = null;

        // Try to get thumbnail first
        if (attachment.thumbnailKey) {
          const thumbUrl = await mediaApi.getThumbnailUrl(
            messageId,
            attachment.id
          );
          url = thumbUrl;
        }

        // Fall back to full image if no thumbnail
        if (!url) {
          const downloadUrl = await mediaApi.getDownloadUrl(
            messageId,
            attachment.id
          );
          url = downloadUrl.url;
        }

        // Handle Cloud API media
        if (url.startsWith("cloud-api://")) {
          const mediaId = url.replace("cloud-api://", "");
          const response = await mediaApi.fetchCloudAPIMedia(mediaId);
          const blob = await response.blob();
          url = URL.createObjectURL(blob);
        }

        setThumbnailUrl(url);
      } catch (err) {
        console.error("Failed to load thumbnail:", err);
      }
    };

    loadThumbnail();
  }, [attachment, messageId]);

  if (!thumbnailUrl) {
    return (
      <div className="w-full h-full bg-gray-700 flex items-center justify-center">
        <span className="text-xs text-gray-400">Loading...</span>
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
