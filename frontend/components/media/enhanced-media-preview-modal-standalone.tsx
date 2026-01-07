"use client";

/**
 * Enhanced Media Preview Modal (Standalone)
 *
 * Full-screen media viewer with WhatsApp-like features:
 * - Fullscreen overlay with click-outside-to-close
 * - Auto-playing videos that fill available space
 * - Navigation arrows and thumbnail strip
 * - Action toolbar (go to message, reply, pin, react, download, close)
 * - Keyboard navigation (arrows, Escape)
 *
 * This is the standalone version that receives all props directly
 * instead of using context, making it easier to integrate with existing code.
 */

import { ReactionPicker } from "@/components/emoji-picker/reaction-picker";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMediaUrl } from "@/hooks/use-media-url";
import { Attachment } from "@/lib/media/types";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Film,
  Pin,
  Reply,
  Smile,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A media item that can be previewed.
 * Groups attachment with its parent message info.
 */
export interface PreviewableMediaItem {
  /** The attachment data */
  attachment: Attachment;
  /** The message ID containing this attachment */
  messageId: string;
  /** Index within the message's attachments array */
  attachmentIndex: number;
}

export interface EnhancedMediaPreviewModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** All media items available for navigation */
  mediaItems: PreviewableMediaItem[];
  /** Initial index to display */
  initialIndex?: number;
  /** Close the modal */
  onClose: () => void;

  // Action handlers (all optional)
  /** Navigate to the message in chat and highlight it */
  onGoToMessage?: (messageId: string) => void;
  /** Start a reply to the message */
  onReply?: (messageId: string) => void;
  /** Open pin modal for the message */
  onPin?: (messageId: string) => void;
  /** Handle reaction selection for the message */
  onReact?: (messageId: string, emoji: string) => void;
}

/**
 * Enhanced Media Preview Modal Component
 */
export function EnhancedMediaPreviewModal({
  isOpen,
  mediaItems,
  initialIndex = 0,
  onClose,
  onGoToMessage,
  onReply,
  onPin,
  onReact,
}: EnhancedMediaPreviewModalProps) {
  const t = useTranslations("chats");

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const mediaContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setReactionPickerOpen(false);
      setIsVideoLoaded(false);
    }
  }, [isOpen, initialIndex]);

  const currentItem = mediaItems[currentIndex] || null;
  const isVideo = currentItem?.attachment.type === "video";
  const hasNext = currentIndex < mediaItems.length - 1;
  const hasPrevious = currentIndex > 0;

  // Load media URL
  const {
    url: mediaUrl,
    loading: urlLoading,
    error: urlError,
  } = useMediaUrl(
    currentItem?.messageId || "",
    currentItem?.attachment.id || "",
    {
      handleCloudApi: true,
    }
  );

  // Reset video loaded state when changing items
  useEffect(() => {
    setIsVideoLoaded(false);
  }, [currentIndex]);

  // Handle video loaded
  const handleVideoCanPlay = useCallback(() => {
    setIsVideoLoaded(true);
    // Auto-play video
    if (videoRef.current) {
      videoRef.current.play().catch((err) => {
        console.warn("Auto-play was prevented:", err);
      });
    }
  }, []);

  // Navigation functions
  const goToNext = useCallback(() => {
    if (currentIndex < mediaItems.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentIndex, mediaItems.length]);

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  const goToIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < mediaItems.length) {
        setCurrentIndex(index);
      }
    },
    [mediaItems.length]
  );

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if reaction picker is open
      if (reactionPickerOpen) return;

      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          goToPrevious();
          break;
        case "ArrowRight":
          goToNext();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, goToNext, goToPrevious, reactionPickerOpen]);

  // Handle click outside media to close
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target === overlayRef.current ||
        target === mediaContainerRef.current
      ) {
        onClose();
      }
    },
    [onClose]
  );

  // Action handlers
  const handleGoToMessage = useCallback(() => {
    if (!currentItem || !onGoToMessage) return;
    onGoToMessage(currentItem.messageId);
    onClose();
  }, [currentItem, onGoToMessage, onClose]);

  const handleReply = useCallback(() => {
    if (!currentItem || !onReply) return;
    onReply(currentItem.messageId);
    onClose();
  }, [currentItem, onReply, onClose]);

  const handlePin = useCallback(() => {
    if (!currentItem || !onPin) return;
    onPin(currentItem.messageId);
    // Don't close - pin modal should show on top
  }, [currentItem, onPin]);

  const handleReactClick = useCallback(() => {
    setReactionPickerOpen(!reactionPickerOpen);
  }, [reactionPickerOpen]);

  const handleReactionSelect = useCallback(
    (emoji: string) => {
      if (!currentItem || !onReact) return;
      onReact(currentItem.messageId, emoji);
      setReactionPickerOpen(false);
    },
    [currentItem, onReact]
  );

  const handleDownload = useCallback(async () => {
    if (!currentItem) return;

    try {
      const { mediaApi } = await import("@/lib/media/api");
      const blob = await mediaApi.downloadMediaViaStream(
        currentItem.messageId,
        currentItem.attachment.id
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        currentItem.attachment.fileName ||
        `${isVideo ? "video" : "image"}_${currentIndex + 1}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Failed to download media:", err);
    }
  }, [currentItem, currentIndex, isVideo]);

  // Don't render if not open or no items
  if (!isOpen || !currentItem || mediaItems.length === 0) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] bg-black/95 flex flex-col"
      onClick={handleOverlayClick}
    >
      {/* Top Toolbar */}
      <div
        className="flex items-center justify-between h-14 px-4 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left side - counter */}
        <div className="flex items-center gap-3">
          <span className="text-white/80 text-sm font-medium">
            {currentIndex + 1} / {mediaItems.length}
          </span>
          {isVideo && (
            <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
              <Film className="w-3 h-3" />
              {t("mediaTypes.video")}
            </span>
          )}
        </div>

        {/* Right side - action buttons */}
        <div className="flex items-center gap-1">
          <TooltipProvider delayDuration={300}>
            {/* Go to Message */}
            {onGoToMessage && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleGoToMessage}
                    className="text-white/80 hover:text-white hover:bg-white/10"
                  >
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {t("goToMessage")}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Reply */}
            {onReply && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleReply}
                    className="text-white/80 hover:text-white hover:bg-white/10"
                  >
                    <Reply className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {t("replyMessage")}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Pin */}
            {onPin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handlePin}
                    className="text-white/80 hover:text-white hover:bg-white/10"
                  >
                    <Pin className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("pinMessage")}</TooltipContent>
              </Tooltip>
            )}

            {/* React */}
            {onReact && (
              <div className="relative">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleReactClick}
                      className={cn(
                        "text-white/80 hover:text-white hover:bg-white/10",
                        reactionPickerOpen && "bg-white/10 text-white"
                      )}
                    >
                      <Smile className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {t("reactions.react") || "React"}
                  </TooltipContent>
                </Tooltip>

                {/* Reaction Picker Popup */}
                {reactionPickerOpen && (
                  <div
                    className="absolute top-full right-0 mt-2 z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ReactionPicker
                      onReactionSelect={handleReactionSelect}
                      className="shadow-xl"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="w-px h-6 bg-white/20 mx-1" />

            {/* Download */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDownload}
                  className="text-white/80 hover:text-white hover:bg-white/10"
                >
                  <Download className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("downloadMessage")}
              </TooltipContent>
            </Tooltip>

            {/* Close */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="text-white/80 hover:text-white hover:bg-white/10"
                >
                  <X className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("cancel")} (Esc)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Main Media Area */}
      <div
        ref={mediaContainerRef}
        className="flex-1 flex items-center justify-center relative min-h-0 px-16"
      >
        {/* Loading State */}
        {urlLoading && (
          <div className="text-white flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-blue-500" />
            <span className="text-sm text-white/70">Loading...</span>
          </div>
        )}

        {/* Error State */}
        {urlError && (
          <div className="text-red-400 text-center p-4">
            <p>Failed to load media</p>
            <p className="text-sm text-white/50 mt-1">{urlError}</p>
          </div>
        )}

        {/* Media Content */}
        {!urlLoading && !urlError && mediaUrl && (
          <>
            {/* Previous Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                goToPrevious();
              }}
              disabled={!hasPrevious}
              className={cn(
                "absolute left-4 z-10 p-3 rounded-full transition-all",
                "bg-black/40 hover:bg-black/60 text-white",
                "disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-black/40"
              )}
              aria-label="Previous"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>

            {/* Media Display */}
            <div
              className="flex items-center justify-center max-w-full max-h-full"
              onClick={(e) => e.stopPropagation()}
            >
              {isVideo ? (
                <video
                  ref={videoRef}
                  key={`${currentItem.messageId}-${currentItem.attachment.id}`}
                  src={mediaUrl}
                  controls
                  onCanPlay={handleVideoCanPlay}
                  className={cn(
                    "max-h-[calc(100vh-200px)] max-w-full rounded-lg transition-opacity duration-300",
                    isVideoLoaded ? "opacity-100" : "opacity-0"
                  )}
                  style={{ objectFit: "contain" }}
                  playsInline
                >
                  Your browser does not support the video tag.
                </video>
              ) : (
                <img
                  src={mediaUrl}
                  alt={currentItem.attachment.fileName || "Preview"}
                  className="max-h-[calc(100vh-200px)] max-w-full rounded-lg object-contain"
                  draggable={false}
                />
              )}
            </div>

            {/* Next Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                goToNext();
              }}
              disabled={!hasNext}
              className={cn(
                "absolute right-4 z-10 p-3 rounded-full transition-all",
                "bg-black/40 hover:bg-black/60 text-white",
                "disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-black/40"
              )}
              aria-label="Next"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          </>
        )}
      </div>

      {/* Thumbnail Strip */}
      {mediaItems.length > 1 && (
        <div
          className="h-24 flex items-center justify-center gap-2 px-4 py-3 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex gap-2 overflow-x-auto max-w-full px-2 py-1">
            {mediaItems.map((item, index) => (
              <ThumbnailButton
                key={`${item.messageId}-${item.attachment.id}`}
                item={item}
                isSelected={index === currentIndex}
                onClick={() => goToIndex(index)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Thumbnail button component for the strip at the bottom
 */
interface ThumbnailButtonProps {
  item: PreviewableMediaItem;
  isSelected: boolean;
  onClick: () => void;
}

function ThumbnailButton({ item, isSelected, onClick }: ThumbnailButtonProps) {
  const { url: thumbnailUrl, loading } = useMediaUrl(
    item.messageId,
    item.attachment.id,
    {
      loadThumbnail: true,
      handleCloudApi: true,
    }
  );

  const isVideo = item.attachment.type === "video";

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden transition-all",
        "border-2 relative",
        isSelected
          ? "border-white ring-2 ring-white/30 scale-105"
          : "border-transparent opacity-60 hover:opacity-100 hover:border-white/30"
      )}
    >
      {loading || !thumbnailUrl ? (
        <div className="w-full h-full bg-white/10 flex items-center justify-center">
          {loading ? (
            <div className="animate-spin rounded-full h-4 w-4 border border-white border-t-transparent" />
          ) : (
            <span className="text-xs text-white/50">?</span>
          )}
        </div>
      ) : (
        <img
          src={thumbnailUrl}
          alt=""
          className="w-full h-full object-cover"
          draggable={false}
        />
      )}

      {/* Video indicator overlay */}
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Film className="w-4 h-4 text-white" />
        </div>
      )}
    </button>
  );
}
