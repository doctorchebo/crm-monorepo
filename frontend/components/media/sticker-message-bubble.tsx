"use client";

/**
 * Sticker Message Bubble Component
 * WhatsApp-style sticker message display - no bubble background
 *
 * Features:
 * - Displays stickers without the standard message bubble
 * - Shows timestamp and status below the sticker
 * - Supports reply action via hover menu
 * - Clean, minimal appearance like WhatsApp Web
 */

import { Attachment } from "@/lib/media/types";
import { cn } from "@/lib/utils";
import { memo } from "react";
import { MessageActionsMenu } from "../message-actions-menu";
import { WhatsAppStatusIcon } from "../whatsapp-status-icon";
import { StickerAttachment } from "./sticker-attachment";

interface StickerMessageBubbleProps {
  /** The sticker attachment */
  attachment: Attachment;
  /** Message ID */
  messageId: string;
  /** Whether this is an outbound message */
  isOutbound: boolean;
  /** Formatted timestamp string */
  timestamp: string;
  /** Message timestamp for actions menu */
  messageTimestamp: string;
  /** Message status */
  status?: "pending" | "sent" | "delivered" | "read" | "failed";
  /** Delivered timestamp */
  deliveredAt?: string;
  /** Read timestamp */
  readAt?: string;
  /** Reply handler */
  onReply?: (messageId: string) => void;
  /** Delete handler (only for outbound) */
  onDelete?: (messageId: string) => void;
}

export const StickerMessageBubble = memo(function StickerMessageBubble({
  attachment,
  messageId,
  isOutbound,
  timestamp,
  messageTimestamp,
  status = "sent",
  deliveredAt,
  readAt,
  onReply,
  onDelete,
}: StickerMessageBubbleProps) {
  return (
    <div
      className={cn(
        "flex flex-col group relative",
        isOutbound ? "items-end" : "items-start"
      )}
    >
      {/* Actions menu - positioned relative to sticker */}
      <div
        className={cn(
          "absolute -top-1 opacity-0 group-hover:opacity-100 transition-opacity z-20",
          isOutbound ? "-left-8" : "-right-8"
        )}
      >
        <MessageActionsMenu
          messageId={messageId}
          messageTimestamp={messageTimestamp}
          isOutbound={isOutbound}
          onReply={onReply}
          onDelete={isOutbound && onDelete ? onDelete : undefined}
        />
      </div>

      {/* Sticker display */}
      <StickerAttachment
        attachment={attachment}
        messageId={messageId}
        isOutbound={isOutbound}
      />

      {/* Timestamp and status - shown below sticker */}
      <div
        className={cn(
          "flex items-center gap-1 mt-1 text-xs",
          "text-muted-foreground"
        )}
      >
        <span>{timestamp}</span>
        {isOutbound && (
          <WhatsAppStatusIcon
            status={status}
            deliveredAt={deliveredAt}
            readAt={readAt}
            className="ml-0.5"
          />
        )}
      </div>
    </div>
  );
});

StickerMessageBubble.displayName = "StickerMessageBubble";
