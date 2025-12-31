"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMediaUrl } from "@/hooks/use-media-url";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  File,
  Image,
  MoreVertical,
  Paperclip,
  Pin,
  PinOff,
  Video,
  Volume2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import type { PinnedMessage } from "../types";

interface PinnedMessagesSectionProps {
  pinnedMessages: PinnedMessage[];
  currentIndex: number;
  onPinClick: (messageId: string) => void;
  onUnpin: (messageId: string) => void;
  onGoToMessage: (messageId: string) => void;
  onIndexChange: (index: number) => void;
}

/**
 * Get an icon for the message type
 */
function getMediaIcon(type: string) {
  switch (type) {
    case "image":
    case "gif":
    case "sticker":
      return <Image className="h-4 w-4 text-muted-foreground flex-shrink-0" />;
    case "video":
      return <Video className="h-4 w-4 text-muted-foreground flex-shrink-0" />;
    case "audio":
      return (
        <Volume2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      );
    case "document":
      return <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />;
    default:
      return (
        <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      );
  }
}

/**
 * Get description for media type
 */
function getMediaDescription(type: string, t: (key: string) => string) {
  switch (type) {
    case "image":
      return t("mediaTypes.image");
    case "gif":
      return t("mediaTypes.gif");
    case "sticker":
      return t("mediaTypes.sticker");
    case "video":
      return t("mediaTypes.video");
    case "audio":
      return t("mediaTypes.audio");
    case "document":
      return t("mediaTypes.document");
    case "contacts":
      return t("mediaTypes.contacts");
    default:
      return t("mediaTypes.attachment");
  }
}

/**
 * Single pinned message indicator bar
 */
const PinIndicatorBar = memo(function PinIndicatorBar({
  isActive,
  onClick,
  index,
}: {
  isActive: boolean;
  onClick: () => void;
  index: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-1 h-full rounded-full transition-colors",
        isActive
          ? "bg-primary"
          : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
      )}
      aria-label={`Go to pinned message ${index + 1}`}
    />
  );
});

/**
 * Check if an attachment type should show a thumbnail
 * Audio, documents, contacts, and stickers should not show thumbnails in the pin section
 */
function shouldShowThumbnail(attachment: any): boolean {
  if (!attachment) return false;

  const type = attachment.type;

  // These types don't have/need thumbnails
  const noThumbnailTypes = [
    "audio",
    "document",
    "contacts",
    "sticker",
    "location",
  ];

  if (noThumbnailTypes.includes(type)) {
    return false;
  }

  // For images, videos, and gifs - check if thumbnail is actually available
  // thumbnailKey indicates a generated thumbnail exists
  // thumbnailStatus "ready" means it's processed
  // mediaUrl can be used for Cloud API media
  const hasThumbnailKey = !!attachment.thumbnailKey;
  const hasThumbnailReady = attachment.thumbnailStatus === "ready";
  const hasMediaUrl = !!attachment.mediaUrl;

  // Only show thumbnail if we have evidence one exists or can be loaded
  return hasThumbnailKey || hasThumbnailReady || hasMediaUrl;
}

/**
 * Thumbnail for media attachments
 */
const MediaThumbnail = memo(function MediaThumbnail({
  attachment,
  messageId,
}: {
  attachment: any;
  messageId: string;
}) {
  // Always call the hook unconditionally (React rules of hooks)
  const { url: thumbnailUrl } = useMediaUrl(messageId, attachment?.id || "", {
    loadThumbnail: true,
    handleCloudApi: true,
    attachment,
  });

  // Check if this attachment type should show a thumbnail
  if (!shouldShowThumbnail(attachment)) {
    return null;
  }

  // If no URL available, don't render anything
  if (!thumbnailUrl) {
    return null;
  }

  return (
    <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0">
      <img
        src={thumbnailUrl}
        alt=""
        className="w-full h-full object-cover"
        loading="lazy"
      />
    </div>
  );
});

/**
 * Pinned messages section that appears at the top of the chat
 */
export const PinnedMessagesSection = memo(function PinnedMessagesSection({
  pinnedMessages,
  currentIndex,
  onPinClick,
  onUnpin,
  onGoToMessage,
  onIndexChange,
}: PinnedMessagesSectionProps) {
  const t = useTranslations("chats");

  // Don't render if no pinned messages
  if (pinnedMessages.length === 0) return null;

  const currentPin = pinnedMessages[currentIndex];
  if (!currentPin) return null;

  const currentMessage = currentPin.message;

  // Determine what to display
  const attachments = currentMessage?.attachments ?? [];
  const hasMedia = attachments.length > 0;
  const firstAttachment = hasMedia ? attachments[0] : null;
  const isMediaOnly = hasMedia && !currentMessage?.text;

  const displayText =
    currentMessage?.text ||
    (isMediaOnly && firstAttachment
      ? getMediaDescription(firstAttachment.type, t)
      : t("pinnedMessage"));

  const senderName =
    currentMessage?.senderName ||
    (currentMessage?.direction === "outbound" ? t("you") : t("contact"));

  const handleSectionClick = () => {
    // Navigate to the message
    onPinClick(currentPin.messageId);
    // Move to next pin for display
    if (pinnedMessages.length > 1) {
      onIndexChange((currentIndex + 1) % pinnedMessages.length);
    }
  };

  return (
    <div className="border-b bg-muted/30 px-4 py-2 flex items-center gap-2">
      {/* Pin indicator bars - only show if multiple pins */}
      {pinnedMessages.length > 1 && (
        <div className="flex flex-col gap-0.5 h-9 py-1">
          {pinnedMessages.map((_, idx) => (
            <PinIndicatorBar
              key={idx}
              isActive={idx === currentIndex}
              onClick={() => onIndexChange(idx)}
              index={idx}
            />
          ))}
        </div>
      )}

      {/* Pin icon */}
      <Pin className="h-4 w-4 text-primary flex-shrink-0" />

      {/* Message content - clickable */}
      <button
        onClick={handleSectionClick}
        className="flex-1 min-w-0 flex items-center gap-2 text-left hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
      >
        <div className="flex-1 min-w-0">
          {/* Sender name in bold */}
          <span className="font-semibold text-sm">{senderName}: </span>

          {/* Message text or media description */}
          {isMediaOnly && firstAttachment ? (
            <span className="text-sm text-muted-foreground inline-flex items-center gap-1">
              {getMediaIcon(firstAttachment.type)}
              {displayText}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground truncate inline">
              {displayText}
            </span>
          )}
        </div>

        {/* Media thumbnail */}
        {hasMedia && firstAttachment && (
          <MediaThumbnail
            attachment={firstAttachment}
            messageId={currentPin.messageId}
          />
        )}
      </button>

      {/* Actions menu */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button className="p-1 hover:bg-muted rounded transition-colors">
            <MoreVertical className="h-4 w-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={() => onGoToMessage(currentPin.messageId)}>
            <ChevronDown className="h-4 w-4 mr-2" />
            {t("goToMessage")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onUnpin(currentPin.messageId)}
            className="text-red-600 dark:text-red-400"
          >
            <PinOff className="h-4 w-4 mr-2" />
            {t("unpinMessage")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

PinnedMessagesSection.displayName = "PinnedMessagesSection";
