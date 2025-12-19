"use client";

/**
 * Attachment Display Components
 * Displays different media types in messages
 *
 * Optimizations:
 * - Uses useMediaUrl hook for automatic caching and cleanup
 * - Thumbnail + full image URLs are cached to avoid redundant API calls
 * - Cloud API media uses blob URL cache with lifecycle management
 * - AbortController prevents race conditions on unmount
 * - Progressive loading with blurhash placeholders
 */

import { useMediaUrl } from "@/hooks/use-media-url";
import { mediaApi } from "@/lib/media/api";
import { Attachment, formatDuration, formatFileSize } from "@/lib/media/types";
import {
  Download,
  FileText,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VoiceMessageBubble } from "../voice-message-bubble";
import { ThumbnailSkeleton } from "./thumbnail-skeleton";
import { GifAttachment } from "./gif-attachment";
import { StickerAttachment } from "./sticker-attachment";

interface AttachmentDisplayProps {
  attachment: Attachment;
  messageId: string;
  onDelete?: (attachmentId: string) => void;
  isSquare?: boolean; // For gallery view with multiple images
  onPreview?: (attachmentIndex: number) => void; // Called when clicking to preview
}

/**
 * Image Attachment Viewer
 * Now with progressive loading support via thumbnails and blurhash
 */
export function ImageAttachment({
  attachment,
  messageId,
  onDelete,
  isSquare = false,
  onPreview,
}: AttachmentDisplayProps) {
  // Use enhanced hook for media loading with thumbnail support
  const {
    url: imageUrl,
    thumbnailUrl,
    loading,
    error,
    thumbnailStatus,
    hasThumbnail,
    blurhash,
    dimensions,
  } = useMediaUrl(messageId, attachment.id, {
    loadThumbnail: true,
    handleCloudApi: true,
    attachment,
  });

  // Show skeleton while thumbnail is being generated or loading
  const showSkeleton =
    !thumbnailUrl &&
    !imageUrl &&
    (loading ||
      thumbnailStatus === "pending" ||
      thumbnailStatus === "processing");

  // Determine which URL to display (prefer thumbnail for initial view)
  const displayUrl = thumbnailUrl || imageUrl;

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div
      className={`relative group ${
        isSquare ? "w-full h-full" : "inline-block"
      } cursor-pointer`}
      onClick={() => onPreview?.(0)}
    >
      {!isSquare && (
        // Single image: constrained width container to prevent overflow
        <div className="relative max-w-xs bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden">
          {showSkeleton ? (
            <ThumbnailSkeleton
              width={dimensions?.width || 280}
              height={dimensions?.height || 200}
              blurhash={blurhash}
              variant="medium"
            />
          ) : displayUrl ? (
            <img
              src={displayUrl}
              alt={attachment.fileName}
              className="w-full h-auto object-cover transition-opacity duration-300"
            />
          ) : null}

          {loading && displayUrl && (
            <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-blue-500" />
            </div>
          )}
        </div>
      )}

      {isSquare && (
        <>
          {showSkeleton ? (
            <ThumbnailSkeleton
              width="100%"
              height="100%"
              blurhash={blurhash}
              variant="medium"
              className="rounded-lg"
            />
          ) : displayUrl ? (
            <img
              src={displayUrl}
              alt={attachment.fileName}
              className="w-full h-full object-cover rounded-lg transition-opacity duration-300"
            />
          ) : null}

          {loading && displayUrl && (
            <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-blue-500" />
            </div>
          )}
        </>
      )}

      {/* Delete button on hover - only shown on hover */}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(attachment.id);
          }}
          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-10"
          title="Delete attachment"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Video Attachment Viewer
 * With progressive loading via thumbnails and blurhash
 * Click to open preview modal where video autoplays
 */
export function VideoAttachment({
  attachment,
  messageId,
  onDelete,
  onPreview,
}: AttachmentDisplayProps) {
  // Use enhanced hook for media loading with thumbnail support
  const {
    url: videoUrl,
    thumbnailUrl,
    loading,
    error,
    thumbnailStatus,
    blurhash,
    dimensions,
  } = useMediaUrl(messageId, attachment.id, {
    loadThumbnail: true,
    handleCloudApi: true,
    attachment,
  });

  // Show skeleton while thumbnail is being generated or loading
  // For videos, we wait for thumbnail instead of downloading full video
  const showSkeleton =
    loading ||
    (!thumbnailUrl &&
      (thumbnailStatus === "pending" || thumbnailStatus === "processing"));

  // Display URL is thumbnail for poster display (prefer thumbnail over video)
  const displayUrl = thumbnailUrl;

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div
      className="relative group inline-block max-w-xs cursor-pointer"
      onClick={() => onPreview?.(0)}
    >
      {showSkeleton ? (
        <ThumbnailSkeleton
          width={dimensions?.width || 320}
          height={dimensions?.height || 180}
          blurhash={blurhash}
          variant="medium"
          mediaType="video"
        />
      ) : displayUrl ? (
        <div className="relative">
          {/* Show thumbnail/poster image instead of video element */}
          <img
            src={displayUrl}
            alt={attachment.fileName}
            className="rounded-lg max-w-full h-auto"
          />
          {/* Video duration badge */}
          {attachment.duration && (
            <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
              {formatDuration(attachment.duration)}
            </div>
          )}
        </div>
      ) : (
        // No thumbnail available yet - show video placeholder with play button
        <div className="w-64 h-40 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-gray-500 dark:text-gray-400">
            <Play className="w-10 h-10" />
            <span className="text-xs">
              {thumbnailStatus === "pending" || thumbnailStatus === "processing"
                ? "Generating preview..."
                : "Video"}
            </span>
          </div>
        </div>
      )}

      {loading && displayUrl && (
        <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-blue-500" />
        </div>
      )}

      {/* Play button overlay - shown when we have a thumbnail */}
      {!showSkeleton && displayUrl && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-14 h-14 rounded-full bg-black/50 flex items-center justify-center">
            <Play className="w-7 h-7 text-white ml-1" fill="white" />
          </div>
        </div>
      )}

      {/* Delete button on hover */}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(attachment.id);
          }}
          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-10"
          title="Delete attachment"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Video Thumbnail for Grid Display
 * Shows video thumbnail with play icon overlay - used in multi-media grids
 * With progressive loading via thumbnails and blurhash
 */
export function VideoThumbnail({
  attachment,
  messageId,
  onDelete,
  isSquare = false,
  onPreview,
}: AttachmentDisplayProps) {
  const {
    url: videoUrl,
    thumbnailUrl,
    loading,
    error,
    thumbnailStatus,
    blurhash,
    dimensions,
  } = useMediaUrl(messageId, attachment.id, {
    loadThumbnail: true,
    handleCloudApi: true,
    attachment,
  });

  // Show skeleton while thumbnail is being generated
  const showSkeleton =
    !thumbnailUrl &&
    (loading ||
      thumbnailStatus === "pending" ||
      thumbnailStatus === "processing");

  if (error) {
    return (
      <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
        <Play className="w-6 h-6 text-gray-400" />
      </div>
    );
  }

  return (
    <div
      className={`relative w-full h-full cursor-pointer group`}
      onClick={() => onPreview?.(0)}
    >
      {showSkeleton ? (
        <ThumbnailSkeleton
          width="100%"
          height="100%"
          blurhash={blurhash}
          variant="small"
        />
      ) : thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={attachment.fileName}
          className="w-full h-full object-cover transition-opacity duration-300"
        />
      ) : (
        <div className="w-full h-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
          <Play className="w-6 h-6 text-gray-500" />
        </div>
      )}

      {/* Video play icon overlay */}
      {!showSkeleton && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
            <Play className="w-4 h-4 text-white" />
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-blue-500" />
        </div>
      )}

      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(attachment.id);
          }}
          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
          title="Delete attachment"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

/**
 * Audio Attachment Player
 */
export function AudioAttachment({
  attachment,
  messageId,
  onDelete,
}: AttachmentDisplayProps) {
  // Use optimized hook for media loading
  const {
    url: audioUrl,
    loading,
    error,
  } = useMediaUrl(messageId, attachment.id, {
    handleCloudApi: true,
  });

  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlayPause = () => {
    if (audioRef.current) {
      if (playing) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setPlaying(!playing);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    setPlaying(false);
  };

  // Update audio volume when volume or muted state changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="bg-gray-100 rounded-lg p-3 space-y-2 max-w-xs">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
        />
      )}

      {loading && (
        <div className="flex items-center justify-center h-12">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-blue-500" />
        </div>
      )}

      {!loading && (
        <>
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlayPause}
              className="bg-blue-500 text-white rounded-full p-2 hover:bg-blue-600 disabled:opacity-50"
              disabled={!audioUrl}
            >
              {playing ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </button>

            <div className="flex-1">
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={(e) => {
                  if (audioRef.current) {
                    audioRef.current.currentTime = parseFloat(e.target.value);
                    setCurrentTime(parseFloat(e.target.value));
                  }
                }}
                className="w-full"
              />
            </div>

            <span className="text-xs text-gray-600 min-w-fit">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-1 hover:bg-gray-200 rounded"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>

            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-16"
              disabled={isMuted}
            />

            {onDelete && (
              <button
                onClick={() => onDelete(attachment.id)}
                className="ml-auto bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                title="Delete attachment"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Voice Note Attachment (WhatsApp-style PTT message)
 * Uses the VoiceMessageBubble component with global audio playback context
 */
interface VoiceNoteAttachmentProps {
  attachment: Attachment;
  messageId: string;
  isOutbound?: boolean;
  senderName?: string;
  senderAvatar?: string;
}

export function VoiceNoteAttachment({
  attachment,
  messageId,
  isOutbound = false,
  senderName,
  senderAvatar,
}: VoiceNoteAttachmentProps) {
  // Use stream URL directly - browser handles caching, audio loads on-demand when user clicks play
  // This avoids creating blob URLs that get cleaned up on component unmount and re-fetched
  const audioUrl = useMemo(
    () => mediaApi.getStreamUrl(messageId, attachment.id),
    [messageId, attachment.id]
  );

  return (
    <VoiceMessageBubble
      audioId={`${messageId}-${attachment.id}`}
      audioUrl={audioUrl}
      duration={attachment.duration || 0}
      waveformData={attachment.waveformData}
      isOutgoing={isOutbound}
      senderName={senderName}
      senderAvatar={senderAvatar}
    />
  );
}

/**
 * Document Attachment with Thumbnail Preview (WhatsApp-style)
 * Shows thumbnail of first page for PDFs, with file info below
 */
export function DocumentAttachment({
  attachment,
  messageId,
  onDelete,
}: AttachmentDisplayProps) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use media URL hook for thumbnail loading (for PDFs with thumbnails)
  const {
    thumbnailUrl,
    loading: thumbnailLoading,
    thumbnailStatus,
    blurhash,
  } = useMediaUrl(messageId, attachment.id, {
    loadThumbnail: true,
    handleCloudApi: true,
    attachment,
  });

  // Check if this is a PDF with thumbnail support
  const isPdf = attachment.mimeType === "application/pdf";
  const hasThumbnail = isPdf && thumbnailStatus === "ready" && thumbnailUrl;
  const isGeneratingThumbnail =
    isPdf &&
    (thumbnailStatus === "pending" || thumbnailStatus === "processing");

  // Get document format display name
  const getFormatName = (mimeType: string): string => {
    const formats: Record<string, string> = {
      "application/pdf": "PDF",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        "DOCX",
      "application/msword": "DOC",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        "XLSX",
      "application/vnd.ms-excel": "XLS",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation":
        "PPTX",
      "application/vnd.ms-powerpoint": "PPT",
      "text/plain": "TXT",
      "text/csv": "CSV",
      "application/zip": "ZIP",
      "application/x-rar-compressed": "RAR",
      // Audio formats
      "audio/mpeg": "MP3",
      "audio/mp3": "MP3",
      "audio/wav": "WAV",
      "audio/ogg": "OGG",
      "audio/webm": "WEBM",
      "audio/aac": "AAC",
      "audio/m4a": "M4A",
      "audio/x-m4a": "M4A",
      "audio/flac": "FLAC",
    };
    return (
      formats[mimeType] || (mimeType.startsWith("audio/") ? "AUDIO" : "FILE")
    );
  };

  // Get document icon based on type
  const getDocIcon = (mimeType: string): string => {
    if (mimeType === "application/pdf") return "📄";
    if (mimeType.includes("word")) return "📝";
    if (mimeType.includes("excel") || mimeType.includes("spreadsheet"))
      return "📊";
    if (mimeType.includes("powerpoint") || mimeType.includes("presentation"))
      return "📽️";
    if (mimeType.includes("text")) return "📃";
    if (mimeType.includes("zip") || mimeType.includes("rar")) return "📦";
    if (mimeType.startsWith("audio/")) return "🎵";
    return "📄";
  };

  // Direct download handler
  const handleDownload = useCallback(async () => {
    setDownloading(true);
    setError(null);

    try {
      // Use streaming endpoint to download the file
      const blob = await mediaApi.downloadMediaViaStream(
        messageId,
        attachment.id
      );

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = attachment.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }, [messageId, attachment.id, attachment.fileName]);

  const formatName = getFormatName(attachment.mimeType);
  const pageCount = attachment.pageCount || attachment.duration; // duration stores page count for PDFs

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="relative group max-w-xs">
      {/* Main container with thumbnail preview */}
      <div
        className="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden cursor-pointer"
        onClick={handleDownload}
      >
        {/* Thumbnail area (top half) */}
        {isPdf && (
          <div className="relative w-full h-32 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
            {hasThumbnail ? (
              <img
                src={thumbnailUrl}
                alt={`Preview of ${attachment.fileName}`}
                className="w-full h-full object-cover"
              />
            ) : isGeneratingThumbnail || thumbnailLoading ? (
              <ThumbnailSkeleton
                width="100%"
                height="100%"
                blurhash={blurhash}
                variant="medium"
              />
            ) : (
              <FileText className="w-12 h-12 text-gray-400" />
            )}

            {/* Download overlay on hover */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {downloading ? (
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent" />
              ) : (
                <Download className="w-8 h-8 text-white" />
              )}
            </div>
          </div>
        )}

        {/* File info area (bottom half) */}
        <div className="p-3 flex items-center gap-3">
          {/* Document icon */}
          <div className="flex-shrink-0 w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
            <span className="text-lg">{getDocIcon(attachment.mimeType)}</span>
          </div>

          {/* File details */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
              {attachment.fileName}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {pageCount && pageCount > 0 ? `${pageCount} pages • ` : ""}
              {formatName} • {formatFileSize(attachment.size)}
            </p>
          </div>

          {/* Download button (visible without hover for non-PDF) */}
          {!isPdf && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
              disabled={downloading}
              className="flex-shrink-0 p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {downloading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Delete button on hover */}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(attachment.id);
          }}
          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-10"
          title="Delete attachment"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Attachment Gallery Component
 */
interface AttachmentGalleryProps {
  attachments: Attachment[];
  messageId: string;
  onDelete?: (attachmentId: string) => void;
  onImageClick?: (imageIndex: number) => void;
  onShowDownloadMenu?: (position: { x: number; y: number }) => void;
  onMessageDelete?: (messageId: string) => void;
  isOutbound?: boolean;
  senderName?: string;
  senderAvatar?: string;
  /**
   * Auto-play GIFs in this gallery (3 loops)
   * Used for recently received messages when opening a chat
   */
  autoPlayGifs?: boolean;
}

export const AttachmentGallery = memo(function AttachmentGallery({
  attachments,
  messageId,
  onDelete,
  onImageClick,
  onShowDownloadMenu,
  onMessageDelete,
  isOutbound = false,
  senderName,
  senderAvatar,
  autoPlayGifs = false,
}: AttachmentGalleryProps) {
  const t = useTranslations("chats");
  const galleryRef = useRef<HTMLDivElement>(null);

  if (attachments.length === 0) {
    return null;
  }

  // Separate attachments by type
  const images = attachments.filter((a) => a.type === "image");
  const videos = attachments.filter((a) => a.type === "video");
  const gifs = attachments.filter((a) => a.type === "gif");
  const stickers = attachments.filter((a) => a.type === "sticker");
  const visualMedia = [...images, ...videos]; // Combined for grid display (not gifs/stickers)
  const audios = attachments.filter((a) => a.type === "audio");
  const voiceNotes = audios.filter((a) => a.isVoiceNote);
  const audioFiles = audios.filter((a) => !a.isVoiceNote); // Non-voice audio treated as documents
  const documents = attachments.filter((a) => a.type === "document");
  // Combine regular audio files with documents - they should download on click
  const downloadableFiles = [...documents, ...audioFiles];

  const displayCount = Math.min(visualMedia.length, 4);
  const extraCount = visualMedia.length - 4;

  const handleDownloadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = galleryRef.current?.getBoundingClientRect();
    if (rect) {
      onShowDownloadMenu?.({
        x: rect.right - 40,
        y: rect.top - 10,
      });
    }
  };

  // Determine grid layout class
  const getGridClass = () => {
    if (displayCount === 1) return "flex w-full";
    if (displayCount === 2) return "grid grid-cols-2";
    if (displayCount === 3) return "grid grid-cols-3";
    return "grid grid-cols-2"; // 4 items in 2x2 grid
  };

  return (
    <div className="space-y-3 relative group/gallery" ref={galleryRef}>
      {/* GIFs - displayed inline with play/pause functionality */}
      {gifs.length > 0 && (
        <div className="space-y-2">
          {gifs.map((attachment) => (
            <GifAttachment
              key={attachment.id}
              attachment={attachment}
              messageId={messageId}
              isOutbound={isOutbound}
              onDelete={onDelete}
              autoPlay={autoPlayGifs}
            />
          ))}
        </div>
      )}

      {/* Stickers - displayed without bubble background */}
      {stickers.length > 0 && (
        <div className="space-y-2">
          {stickers.map((attachment) => (
            <StickerAttachment
              key={attachment.id}
              attachment={attachment}
              messageId={messageId}
              isOutbound={isOutbound}
            />
          ))}
        </div>
      )}

      {/* Combined Visual Media Grid (Images + Videos) */}
      {visualMedia.length > 0 && (
        <div className={`gap-1 ${getGridClass()}`}>
          {visualMedia.slice(0, 4).map((attachment, index) => {
            const isLastWithMore = index === 3 && extraCount > 0;
            const isVideo = attachment.type === "video";

            return (
              <div key={attachment.id} className="relative">
                {/* Show +N badge for additional media */}
                {isLastWithMore && (
                  <div
                    className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center z-10 cursor-pointer"
                    onClick={() => onImageClick?.(index)}
                  >
                    <span className="text-white text-2xl font-bold">
                      +{extraCount}
                    </span>
                  </div>
                )}

                {/* Square container for multiple media */}
                {visualMedia.length > 1 ? (
                  <div className="w-24 h-24 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                    {isVideo ? (
                      <VideoThumbnail
                        attachment={attachment}
                        messageId={messageId}
                        onDelete={onDelete}
                        isSquare={true}
                        onPreview={() => onImageClick?.(index)}
                      />
                    ) : (
                      <ImageAttachment
                        attachment={attachment}
                        messageId={messageId}
                        onDelete={onDelete}
                        isSquare={true}
                        onPreview={() => onImageClick?.(index)}
                      />
                    )}
                  </div>
                ) : (
                  // Single media - constrained width with max-w
                  <div className="max-w-xs w-full">
                    {isVideo ? (
                      <VideoAttachment
                        attachment={attachment}
                        messageId={messageId}
                        onDelete={onDelete}
                        onPreview={() => onImageClick?.(0)}
                      />
                    ) : (
                      <ImageAttachment
                        attachment={attachment}
                        messageId={messageId}
                        onDelete={onDelete}
                        isSquare={false}
                        onPreview={() => onImageClick?.(0)}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Voice Notes (WhatsApp-style) */}
      {voiceNotes.length > 0 && (
        <div className="space-y-2">
          {voiceNotes.map((attachment) => (
            <VoiceNoteAttachment
              key={attachment.id}
              attachment={attachment}
              messageId={messageId}
              isOutbound={isOutbound}
              senderName={senderName}
              senderAvatar={senderAvatar}
            />
          ))}
        </div>
      )}

      {/* Documents and Audio Files (download on click) */}
      {downloadableFiles.length > 0 && (
        <div className="space-y-2">
          {downloadableFiles.map((attachment) => (
            <DocumentAttachment
              key={attachment.id}
              attachment={attachment}
              messageId={messageId}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
});

AttachmentGallery.displayName = "AttachmentGallery";
