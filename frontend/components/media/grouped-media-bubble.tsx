"use client";

/**
 * Grouped Media Message Bubble
 * Displays multiple media items from consecutive messages in a single WhatsApp-style bubble
 * Shows up to 4 items in a grid with +N overlay for additional items
 * Includes expand chevron to view all media in a grid
 */

import { useMediaUrl } from "@/hooks/use-media-url";
import { Attachment, hasAccessibleMediaSource } from "@/lib/media/types";
import { ChevronDown, ChevronUp, Film, ImageOff, Play } from "lucide-react";
import { memo, useState } from "react";

interface Message {
  id?: number;
  messageId: string;
  text?: string | null;
  sender: string;
  direction: "inbound" | "outbound";
  timestamp: string;
  type: string;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  attachments?: Attachment[];
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  editedAt?: string;
}

interface GroupedMediaBubbleProps {
  messages: Message[];
  onImageClick?: (
    messageId: string,
    attachments: Attachment[],
    index: number
  ) => void;
  statusIcon?: React.ReactNode;
  timeString: string;
}

// Individual media thumbnail component
function MediaThumbnail({
  attachment,
  messageId,
  onClick,
  showOverlay,
  overlayCount,
  isAccessible,
}: {
  attachment: Attachment;
  messageId: string;
  onClick?: () => void;
  showOverlay?: boolean;
  overlayCount?: number;
  isAccessible: boolean;
}) {
  // Use the enhanced useMediaUrl hook which now has module-level caching
  // No need for separate thumbnail loading effect - the hook handles it
  // Only load media if it's accessible
  const { url, thumbnailUrl, loading } = useMediaUrl(messageId, attachment.id, {
    loadThumbnail: true,
    handleCloudApi: true,
    attachment, // Pass attachment for metadata (blurhash, dimensions, etc.)
    enabled: isAccessible, // Only fetch if accessible
  });
  const isVideo = attachment.type === "video";

  // Prefer thumbnail URL over full URL
  const displayUrl = thumbnailUrl || url;

  // If not accessible, show unavailable state
  if (!isAccessible) {
    return (
      <div className="relative w-full h-full overflow-hidden bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
        <div className="flex flex-col items-center text-gray-400 dark:text-gray-500">
          <ImageOff className="w-6 h-6 mb-1" />
          <span className="text-xs">Unavailable</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-full h-full cursor-pointer overflow-hidden"
      onClick={onClick}
    >
      {displayUrl ? (
        <img
          src={displayUrl}
          alt={attachment.fileName}
          className="w-full h-full object-cover"
        />
      ) : loading ? (
        <div className="w-full h-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center animate-pulse">
          {isVideo ? (
            <Film className="w-6 h-6 text-gray-500" />
          ) : (
            <div className="w-6 h-6 rounded bg-gray-400 dark:bg-gray-600" />
          )}
        </div>
      ) : (
        <div className="w-full h-full bg-gray-300 flex items-center justify-center">
          {isVideo ? (
            <Film className="w-6 h-6 text-gray-500" />
          ) : (
            <div className="animate-pulse bg-gray-400 w-full h-full" />
          )}
        </div>
      )}

      {/* Video play icon */}
      {isVideo && !showOverlay && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
            <Play className="w-4 h-4 text-white" />
          </div>
        </div>
      )}

      {/* +N overlay for additional items */}
      {showOverlay && overlayCount && overlayCount > 0 && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
          <span className="text-white text-2xl font-bold">+{overlayCount}</span>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-blue-500" />
        </div>
      )}
    </div>
  );
}

export const GroupedMediaBubble = memo(function GroupedMediaBubble({
  messages,
  onImageClick,
  statusIcon,
  timeString,
}: GroupedMediaBubbleProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Flatten all attachments from all messages, tracking accessibility
  const allMedia: {
    attachment: Attachment;
    messageId: string;
    originalIndex: number;
    isAccessible: boolean;
  }[] = [];
  let globalIndex = 0;

  messages.forEach((msg) => {
    const messageId = msg.messageId || msg.id?.toString() || "";
    msg.attachments?.forEach((attachment) => {
      if (attachment.type === "image" || attachment.type === "video") {
        allMedia.push({
          attachment,
          messageId,
          originalIndex: globalIndex,
          isAccessible: hasAccessibleMediaSource(attachment),
        });
        globalIndex++;
      }
    });
  });

  // Count only accessible media for display purposes
  const accessibleMedia = allMedia.filter((m) => m.isAccessible);

  const displayCount = Math.min(allMedia.length, 4);
  const extraCount = allMedia.length - 4;
  const hasMoreThanFour = allMedia.length > 4;

  // Determine grid layout
  const getGridClass = () => {
    if (displayCount === 1) return "grid-cols-1";
    if (displayCount === 2) return "grid-cols-2";
    return "grid-cols-2";
  };

  const getAspectClass = (index: number) => {
    if (displayCount === 1) return "aspect-[4/3]";
    if (displayCount === 2) return "aspect-square";
    if (displayCount === 3 && index === 0) return "col-span-2 aspect-[2/1]";
    return "aspect-square";
  };

  // Get the first message's attachments for preview modal
  const firstMessageId =
    messages[0]?.messageId || messages[0]?.id?.toString() || "";
  const allAttachments = messages.flatMap((m) => m.attachments || []);

  return (
    <div className="flex justify-end">
      <div className="max-w-[280px] bg-primary text-primary-foreground rounded-lg overflow-hidden">
        {/* Media Grid */}
        <div className={`grid ${getGridClass()} gap-0.5`}>
          {allMedia.slice(0, 4).map((item, index) => {
            const isLastWithMore = index === 3 && extraCount > 0 && !isExpanded;

            return (
              <div
                key={`${item.messageId}-${item.attachment.id}`}
                className={getAspectClass(index)}
              >
                <MediaThumbnail
                  attachment={item.attachment}
                  messageId={item.messageId}
                  isAccessible={item.isAccessible}
                  onClick={
                    item.isAccessible
                      ? () =>
                          onImageClick?.(
                            firstMessageId,
                            allAttachments,
                            item.originalIndex
                          )
                      : undefined
                  }
                  showOverlay={isLastWithMore}
                  overlayCount={extraCount}
                />
              </div>
            );
          })}
        </div>

        {/* Expanded Grid - Shows all items when expanded */}
        {isExpanded && hasMoreThanFour && (
          <div className="grid grid-cols-3 gap-0.5 mt-0.5">
            {allMedia.slice(4).map((item) => (
              <div
                key={`expanded-${item.messageId}-${item.attachment.id}`}
                className="aspect-square"
              >
                <MediaThumbnail
                  attachment={item.attachment}
                  messageId={item.messageId}
                  isAccessible={item.isAccessible}
                  onClick={
                    item.isAccessible
                      ? () =>
                          onImageClick?.(
                            firstMessageId,
                            allAttachments,
                            item.originalIndex
                          )
                      : undefined
                  }
                />
              </div>
            ))}
          </div>
        )}

        {/* Expand/Collapse Chevron - Only show when more than 4 items */}
        {hasMoreThanFour && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full py-1 flex items-center justify-center gap-1 hover:bg-white/10 transition-colors text-primary-foreground/80 hover:text-primary-foreground"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                <span className="text-xs">Show less</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                <span className="text-xs">
                  Show all {allMedia.length} items
                </span>
              </>
            )}
          </button>
        )}

        {/* Timestamp & Status */}
        <div className="px-3 py-1 flex items-center justify-end gap-1.5 text-xs text-primary-foreground/70">
          <span>{timeString}</span>
          {statusIcon}
        </div>
      </div>
    </div>
  );
});

GroupedMediaBubble.displayName = "GroupedMediaBubble";
