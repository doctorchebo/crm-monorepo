"use client";

/**
 * Quoted Message Component
 * WhatsApp-style quoted message block displayed in reply messages
 *
 * Features:
 * - Shows original message preview
 * - Click to scroll to original message
 * - Media thumbnail support
 * - Handles unavailable messages gracefully
 */

import { useMediaUrl } from "@/hooks/use-media-url";
import { Attachment } from "@/lib/media/types";
import {
  getReplyMediaIcon,
  ReplyPreview,
  truncateReplyText,
} from "@/lib/types/reply.types";
import { useTranslations } from "next-intl";
import { memo } from "react";

interface QuotedMessageProps {
  replyPreview: ReplyPreview;
  originalMessageId: string;
  isOutbound: boolean;
  onClick?: () => void;
  attachment?: Attachment;
}

export const QuotedMessage = memo(function QuotedMessage({
  replyPreview,
  originalMessageId,
  isOutbound,
  onClick,
  attachment,
}: QuotedMessageProps) {
  const t = useTranslations("chats");

  // Get media thumbnail if replying to media
  const hasMedia =
    replyPreview.media &&
    ["image", "video"].includes(replyPreview.type) &&
    (replyPreview.media.thumbnailUrl || attachment?.thumbnailKey);

  const { url: thumbnailUrl } = useMediaUrl(
    originalMessageId,
    hasMedia && attachment?.id ? attachment.id : "",
    { handleCloudApi: true, loadThumbnail: true, attachment }
  );

  const isOriginalOutbound = replyPreview.senderType === "agent";
  const displayName = isOriginalOutbound ? t("you") : replyPreview.senderName;

  // Get preview text with media icon
  const getPreviewText = () => {
    if (replyPreview.unavailable) {
      return t("messageUnavailable");
    }

    const icon = getReplyMediaIcon(replyPreview.type);
    const text = replyPreview.text || "";

    if (icon && !text) {
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
      }
    }

    if (icon) {
      return `${icon} ${truncateReplyText(text, 60)}`;
    }

    return truncateReplyText(text, 60);
  };

  return (
    <div
      className={`flex items-stretch rounded-lg overflow-hidden mb-1 cursor-pointer transition-colors ${
        isOutbound
          ? "bg-primary/20 border-l-2 border-primary-foreground/50"
          : "bg-muted/50 border-l-2 border-emerald-500"
      } ${onClick ? "hover:bg-opacity-80" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {/* Media Thumbnail */}
      {hasMedia && thumbnailUrl && (
        <div className="w-10 h-10 flex-shrink-0 bg-black/10">
          <img
            src={thumbnailUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 px-2 py-1">
        {/* Sender Name */}
        <p
          className={`text-xs font-semibold truncate ${
            isOriginalOutbound
              ? isOutbound
                ? "text-primary-foreground/90"
                : "text-primary"
              : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {displayName}
        </p>

        {/* Message Preview */}
        <p
          className={`text-xs truncate ${
            replyPreview.unavailable ? "italic" : ""
          } ${
            isOutbound ? "text-primary-foreground/70" : "text-muted-foreground"
          }`}
        >
          {getPreviewText()}
        </p>
      </div>
    </div>
  );
});

QuotedMessage.displayName = "QuotedMessage";
