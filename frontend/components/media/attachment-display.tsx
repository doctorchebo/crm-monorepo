"use client";

/**
 * Attachment Display Components
 * Displays different media types in messages
 */

import { mediaApi } from "@/lib/media/api";
import {
  Attachment,
  formatDuration,
  formatFileSize,
  getMediaIcon,
} from "@/lib/media/types";
import {
  ChevronDown,
  Download,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface AttachmentDisplayProps {
  attachment: Attachment;
  messageId: string;
  onDelete?: (attachmentId: string) => void;
  isSquare?: boolean; // For gallery view with multiple images
  onPreview?: (attachmentIndex: number) => void; // Called when clicking to preview
}

/**
 * Image Attachment Viewer
 */
export function ImageAttachment({
  attachment,
  messageId,
  onDelete,
  isSquare = false,
  onPreview,
}: AttachmentDisplayProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadImage = async () => {
      try {
        // Try to load thumbnail first
        if (attachment.thumbnailKey) {
          const thumbUrl = await mediaApi.getThumbnailUrl(
            messageId,
            attachment.id
          );
          setThumbnailUrl(thumbUrl);
        }

        // Load full image
        const urlResponse = await mediaApi.getDownloadUrl(
          messageId,
          attachment.id
        );
        let url = urlResponse.url;

        // Handle Cloud API media (inbound from Meta)
        // Use the frontend API proxy which includes authentication
        if (url.startsWith("cloud-api://")) {
          const mediaId = url.replace("cloud-api://", "");
          // Use the proxy endpoint which handles authentication via cookies
          url = `/api/whatsapp/media/cloud-api/${mediaId}`;
        }

        setImageUrl(url);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load image");
      } finally {
        setLoading(false);
      }
    };

    loadImage();
  }, [attachment, messageId]);

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
        <div className="relative max-w-xs bg-gray-200 rounded-lg overflow-hidden">
          {(thumbnailUrl || imageUrl) && (
            <img
              src={thumbnailUrl || imageUrl || ""}
              alt={attachment.fileName}
              className="w-full h-auto object-cover"
            />
          )}

          {loading && (
            <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-blue-500" />
            </div>
          )}
        </div>
      )}

      {isSquare && (thumbnailUrl || imageUrl) && (
        <img
          src={thumbnailUrl || imageUrl || ""}
          alt={attachment.fileName}
          className="w-full h-full object-cover rounded-lg"
        />
      )}

      {isSquare && loading && (
        <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-blue-500" />
        </div>
      )}

      {/* Delete button on hover - only shown on hover */}
      {onDelete && (
        <button
          onClick={() => onDelete(attachment.id)}
          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
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
 */
export function VideoAttachment({
  attachment,
  messageId,
  onDelete,
}: AttachmentDisplayProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const loadVideo = async () => {
      try {
        // Try to load thumbnail
        if (attachment.thumbnailKey) {
          const thumbUrl = await mediaApi.getThumbnailUrl(
            messageId,
            attachment.id
          );
          setThumbnailUrl(thumbUrl);
        }

        // Load video
        const urlResponse = await mediaApi.getDownloadUrl(
          messageId,
          attachment.id
        );
        let url = urlResponse.url;

        // Handle Cloud API media (inbound from Meta)
        if (url.startsWith("cloud-api://")) {
          const mediaId = url.replace("cloud-api://", "");
          url = `/api/whatsapp/media/cloud-api/${mediaId}`;
        }

        setVideoUrl(url);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load video");
      } finally {
        setLoading(false);
      }
    };

    loadVideo();
  }, [attachment, messageId]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="relative group inline-block max-w-xs">
      {(videoUrl || thumbnailUrl) && (
        <video
          src={videoUrl || undefined}
          poster={thumbnailUrl || undefined}
          controls={playing}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className="rounded-lg max-w-full h-auto"
        />
      )}

      {loading && (
        <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-blue-500" />
        </div>
      )}

      {!playing && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-lg transition-colors flex items-center justify-center">
          <Play className="w-12 h-12 text-white opacity-75 group-hover:opacity-100" />
        </div>
      )}

      {/* Overlay actions */}
      <div className="absolute top-2 right-2 gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex">
        {videoUrl && (
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white text-black rounded-full p-2 hover:bg-gray-200"
            title="Download video"
          >
            <Download className="w-4 h-4" />
          </a>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(attachment.id)}
            className="bg-red-500 text-white rounded-full p-2 hover:bg-red-600"
            title="Delete attachment"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
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
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const loadAudio = async () => {
      try {
        const urlResponse = await mediaApi.getDownloadUrl(
          messageId,
          attachment.id
        );
        let url = urlResponse.url;

        // Handle Cloud API media (inbound from Meta)
        // Use the frontend API proxy which includes authentication
        if (url.startsWith("cloud-api://")) {
          const mediaId = url.replace("cloud-api://", "");
          url = `/api/whatsapp/media/cloud-api/${mediaId}`;
        }

        setAudioUrl(url);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load audio");
      } finally {
        setLoading(false);
      }
    };

    loadAudio();
  }, [attachment, messageId]);

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
 * Document Attachment Link
 */
export function DocumentAttachment({
  attachment,
  messageId,
  onDelete,
}: AttachmentDisplayProps) {
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDocument = async () => {
      try {
        const urlResponse = await mediaApi.getDownloadUrl(
          messageId,
          attachment.id
        );
        let url = urlResponse.url;

        // Handle Cloud API media (inbound from Meta)
        // Use the frontend API proxy which includes authentication
        if (url.startsWith("cloud-api://")) {
          const mediaId = url.replace("cloud-api://", "");
          url = `/api/whatsapp/media/cloud-api/${mediaId}`;
        }

        setDocumentUrl(url);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load document"
        );
      } finally {
        setLoading(false);
      }
    };

    loadDocument();
  }, [attachment, messageId]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-3 group">
      <div className="bg-gray-200 rounded p-2 flex-shrink-0">
        <span className="text-xl">{getMediaIcon("document")}</span>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">
          {attachment.fileName}
        </p>
        <p className="text-xs text-gray-500">
          {formatFileSize(attachment.size)}
        </p>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {documentUrl && !loading && (
          <a
            href={documentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-blue-500 text-white rounded-full p-2 hover:bg-blue-600"
            title="Download document"
          >
            <Download className="w-4 h-4" />
          </a>
        )}

        {loading && (
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-blue-500" />
        )}

        {onDelete && (
          <button
            onClick={() => onDelete(attachment.id)}
            className="bg-red-500 text-white rounded-full p-2 hover:bg-red-600"
            title="Delete attachment"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Attachment Gallery - Displays multiple attachments
 */
interface AttachmentGalleryProps {
  attachments: Attachment[];
  messageId: string;
  onDelete?: (attachmentId: string) => void;
  onImageClick?: (imageIndex: number) => void;
  onShowDownloadMenu?: (position: { x: number; y: number }) => void;
}

export function AttachmentGallery({
  attachments,
  messageId,
  onDelete,
  onImageClick,
  onShowDownloadMenu,
}: AttachmentGalleryProps) {
  const galleryRef = useRef<HTMLDivElement>(null);

  if (attachments.length === 0) {
    return null;
  }

  // Separate attachments by type
  const images = attachments.filter((a) => a.type === "image");
  const videos = attachments.filter((a) => a.type === "video");
  const audios = attachments.filter((a) => a.type === "audio");
  const documents = attachments.filter((a) => a.type === "document");

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

  return (
    <div className="space-y-3 relative group/gallery" ref={galleryRef}>
      {/* Download button on top right (shown on hover) */}
      {(images.length > 0 || videos.length > 0) && (
        <button
          onClick={handleDownloadClick}
          className="absolute -top-2 -right-2 opacity-0 group-hover/gallery:opacity-100 transition-opacity p-1.5 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-lg z-20 shadow-md border border-gray-200 dark:border-gray-700"
          title="Download options"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      )}

      {/* Images grid - show up to 4 in square format */}
      {images.length > 0 && (
        <div
          className={`gap-1 ${
            images.length === 1
              ? "flex w-full"
              : images.length === 2
              ? "grid grid-cols-2"
              : images.length === 3
              ? "grid grid-cols-3"
              : "grid grid-cols-2"
          }`}
        >
          {images.slice(0, 4).map((attachment, index) => (
            <div key={attachment.id} className="relative">
              {/* Show +N badge for additional images */}
              {index === 3 && images.length > 4 && (
                <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center z-10">
                  <span className="text-white text-2xl font-bold">
                    +{images.length - 4}
                  </span>
                </div>
              )}

              {/* Square image container for multiple images */}
              {images.length > 1 ? (
                <div className="w-24 h-24 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                  <ImageAttachment
                    attachment={attachment}
                    messageId={messageId}
                    onDelete={onDelete}
                    isSquare={true}
                    onPreview={() => onImageClick?.(index)}
                  />
                </div>
              ) : (
                // Single image - constrained width with max-w
                <div className="max-w-xs w-full">
                  <ImageAttachment
                    attachment={attachment}
                    messageId={messageId}
                    onDelete={onDelete}
                    isSquare={false}
                    onPreview={() => onImageClick?.(0)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Videos */}
      {videos.length > 0 && (
        <div className="space-y-2">
          {videos.map((attachment) => (
            <VideoAttachment
              key={attachment.id}
              attachment={attachment}
              messageId={messageId}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {/* Audio */}
      {audios.length > 0 && (
        <div className="space-y-2">
          {audios.map((attachment) => (
            <AudioAttachment
              key={attachment.id}
              attachment={attachment}
              messageId={messageId}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {/* Documents */}
      {documents.length > 0 && (
        <div className="space-y-2">
          {documents.map((attachment) => (
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
}
