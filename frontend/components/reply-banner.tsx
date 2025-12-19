"use client";

/**
 * Reply Banner Component
 * WhatsApp-style reply preview banner above the message input
 *
 * Features:
 * - Shows sender name and message preview
 * - Displays media thumbnail when replying to media
 * - X button to cancel reply
 * - Matches WhatsApp Web styling
 */

import { useMediaUrl } from "@/hooks/use-media-url";
import { Attachment } from "@/lib/media/types";
import {
  getReplyMediaIcon,
  ReplyPreview,
  truncateReplyText,
} from "@/lib/types/reply.types";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

interface ReplyBannerProps {
  replyPreview: ReplyPreview;
  messageId: string;
  attachmentId?: string; // Attachment ID for loading thumbnail
  attachment?: Attachment; // Full attachment data for thumbnail loading
  onCancel: () => void;
}

export const ReplyBanner = memo(function ReplyBanner({
  replyPreview,
  messageId,
  attachmentId,
  attachment,
  onCancel,
}: ReplyBannerProps) {
  const t = useTranslations("chats");

  // Get media thumbnail URL if replying to media
  const hasMedia =
    replyPreview.media &&
    ["image", "video"].includes(replyPreview.type) &&
    (replyPreview.media.thumbnailUrl || attachmentId);

  const { url: thumbnailUrl } = useMediaUrl(
    messageId,
    hasMedia && attachmentId ? attachmentId : "",
    { handleCloudApi: true, loadThumbnail: true, attachment }
  );

  const isOutbound = replyPreview.senderType === "agent";
  const displayName = isOutbound ? t("you") : replyPreview.senderName;

  // Get preview text with media icon prefix
  const getPreviewText = () => {
    if (replyPreview.unavailable) {
      return t("messageUnavailable");
    }

    const icon = getReplyMediaIcon(replyPreview.type);
    const text = replyPreview.text || "";

    if (icon && !text) {
      // Media without caption
      switch (replyPreview.type) {
        case "image":
          return `${icon} ${t("photo")}`;
        case "video":
          return `${icon} ${t("video")}`;
        case "audio":
          return `${icon} ${t("audioMessage")}`;
        case "document":
          return replyPreview.media?.fileName
            ? `${icon} ${replyPreview.media.fileName}`
            : `${icon} ${t("document")}`;
        case "contacts":
          return `${icon} ${t("contact")}`;
        case "sticker":
          return `${icon} Sticker`;
        case "gif":
          return `${icon} GIF`;
      }
    }

    if (icon) {
      return `${icon} ${truncateReplyText(text)}`;
    }

    return truncateReplyText(text);
  };

  return (
    <div className="flex items-stretch bg-muted/50 border-l-4 border-primary rounded-r-lg mx-3 mb-2 overflow-hidden">
      {/* Media Thumbnail */}
      {hasMedia && thumbnailUrl && (
        <div className="w-12 h-12 flex-shrink-0 bg-muted">
          <img
            src={thumbnailUrl}
            alt="Reply preview"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 px-3 py-2">
        {/* Sender Name */}
        <p
          className={`text-xs font-semibold truncate ${
            isOutbound
              ? "text-primary"
              : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {displayName}
        </p>

        {/* Message Preview */}
        <p
          className={`text-xs truncate ${
            replyPreview.unavailable
              ? "text-muted-foreground italic"
              : "text-muted-foreground"
          }`}
        >
          {getPreviewText()}
        </p>
      </div>

      {/* Cancel Button */}
      <button
        onClick={onCancel}
        className="px-3 flex items-center justify-center hover:bg-muted/80 transition-colors"
        aria-label={t("cancelReply")}
      >
        <X className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
});

ReplyBanner.displayName = "ReplyBanner";
