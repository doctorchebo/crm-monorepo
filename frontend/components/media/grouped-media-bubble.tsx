"use client";

/**
 * Grouped Media Message Bubble
 * Displays multiple media items from consecutive messages in a single WhatsApp-style bubble
 * Shows up to 4 items in a grid with +N overlay for additional items
 */

import { useMediaUrl } from "@/hooks/use-media-url";
import { mediaApi } from "@/lib/media/api";
import { Attachment } from "@/lib/media/types";
import { Film, Play } from "lucide-react";
import { memo, useEffect, useState } from "react";

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
}: {
  attachment: Attachment;
  messageId: string;
  onClick?: () => void;
  showOverlay?: boolean;
  overlayCount?: number;
}) {
  const { url, loading } = useMediaUrl(messageId, attachment.id, {
    loadThumbnail: true,
    handleCloudApi: true,
  });
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const isVideo = attachment.type === "video";

  useEffect(() => {
    if (!attachment.thumbnailKey) return;

    const loadThumbnail = async () => {
      try {
        const thumbUrl = await mediaApi.getThumbnailUrl(
          messageId,
          attachment.id
        );
        setThumbnailUrl(thumbUrl);
      } catch (err) {
        // Thumbnail load failed
      }
    };

    loadThumbnail();
  }, [attachment.id, attachment.thumbnailKey, messageId]);

  const displayUrl = thumbnailUrl || url;

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
  // Flatten all attachments from all messages
  const allMedia: {
    attachment: Attachment;
    messageId: string;
    originalIndex: number;
  }[] = [];
  let globalIndex = 0;

  messages.forEach((msg) => {
    const messageId = msg.messageId || msg.id?.toString() || "";
    msg.attachments?.forEach((attachment) => {
      if (attachment.type === "image" || attachment.type === "video") {
        allMedia.push({ attachment, messageId, originalIndex: globalIndex });
        globalIndex++;
      }
    });
  });

  const displayCount = Math.min(allMedia.length, 4);
  const extraCount = allMedia.length - 4;

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
            const isLastWithMore = index === 3 && extraCount > 0;

            return (
              <div
                key={`${item.messageId}-${item.attachment.id}`}
                className={getAspectClass(index)}
              >
                <MediaThumbnail
                  attachment={item.attachment}
                  messageId={item.messageId}
                  onClick={() =>
                    onImageClick?.(
                      firstMessageId,
                      allAttachments,
                      item.originalIndex
                    )
                  }
                  showOverlay={isLastWithMore}
                  overlayCount={extraCount}
                />
              </div>
            );
          })}
        </div>

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
