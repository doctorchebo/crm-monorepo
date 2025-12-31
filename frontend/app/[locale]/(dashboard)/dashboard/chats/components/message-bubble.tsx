"use client";

/**
 * Message Bubble Component
 * A complete message bubble with reaction support
 * Handles inbound/outbound styling, actions menu, and reaction display/trigger
 */

import { AttachmentGallery } from "@/components/media/attachment-display";
import { MessageActionsMenu } from "@/components/message-actions-menu";
import { QuotedMessage } from "@/components/quoted-message";
import {
  MessageReactionDisplay,
  ReactionTrigger,
} from "@/components/reactions";
import { MessageText } from "@/components/ui/message-text";
import { WhatsAppStatusIcon } from "@/components/whatsapp-status-icon";
import { Attachment } from "@/lib/media/types";
import { cn } from "@/lib/utils";
import { memo, useCallback, useRef, useState } from "react";
import type { Chat, Message, MessageReaction } from "../types";

interface MessageBubbleProps {
  message: Message;
  isOutbound: boolean;
  isDeleted: boolean;
  isHighlighted: boolean;
  timeString: string;
  selectedChat: Chat | null;
  autoPlayGifs: boolean;
  /** Current user's reaction on this message */
  userReaction?: MessageReaction;
  /** All reactions on this message */
  reactions?: MessageReaction[];
  /** Whether reaction just changed (for animation) */
  reactionAnimating?: boolean;
  // Event handlers
  onReply?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onDownload?: (messageId: string) => void;
  onImageClick?: (
    messageId: string,
    attachments: Attachment[],
    index: number
  ) => void;
  onShowDownloadMenu?: (
    messageId: string,
    attachments: Attachment[],
    position: { x: number; y: number }
  ) => void;
  onVideoPlay?: (videoId: string, url: string) => void;
  onScrollToMessage?: (messageId: string) => void;
  onReactionSelect?: (messageId: string, emoji: string) => void;
  // Translations
  t: (key: string) => string;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isOutbound,
  isDeleted,
  isHighlighted,
  timeString,
  selectedChat,
  autoPlayGifs,
  userReaction,
  reactions,
  reactionAnimating = false,
  onReply,
  onDelete,
  onDownload,
  onImageClick,
  onShowDownloadMenu,
  onVideoPlay,
  onScrollToMessage,
  onReactionSelect,
  t,
}: MessageBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleReactionSelect = useCallback(
    (emoji: string) => {
      if (message.messageId && onReactionSelect) {
        onReactionSelect(message.messageId, emoji);
      }
    },
    [message.messageId, onReactionSelect]
  );

  const handleReactionClick = useCallback(() => {
    // When clicking on existing reaction, allow changing it
    // This is handled by opening the reaction trigger picker
  }, []);

  // Determine if message has downloadable media
  const hasDownloadableMedia = message.attachments?.some(
    (a) => a.type === "image" || a.type === "video" || a.type === "gif"
  );

  // Get the first (and typically only) reaction to display
  // In WhatsApp-style, we show the user's own reaction prominently
  const displayReaction = userReaction || (reactions && reactions[0]);

  // Check if this is a single image/gif message (affects width)
  const isSingleMediaMessage =
    message.attachments?.length === 1 &&
    (message.attachments[0].type === "image" ||
      message.attachments[0].type === "gif") &&
    !message.text &&
    !isDeleted;

  return (
    <div
      className={cn(
        "group relative flex items-center gap-1",
        isOutbound ? "flex-row-reverse" : "flex-row"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Reaction trigger - positioned outside bubble on opposite side */}
      {/* For outbound: trigger on LEFT (order-last with flex-row-reverse puts it left) */}
      {/* For inbound: trigger on RIGHT (order-last with flex-row puts it right) */}
      {!isDeleted && (
        <div
          className={cn(
            "flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150",
            "order-last"
          )}
        >
          <ReactionTrigger
            isOutbound={isOutbound}
            onReactionSelect={handleReactionSelect}
            currentReaction={userReaction?.emoji}
          />
        </div>
      )}

      {/* Message bubble */}
      <div
        ref={bubbleRef}
        className={cn(
          "relative px-3 py-1 rounded-lg text-xs",
          // Width handling
          isSingleMediaMessage ? "max-w-md" : "max-w-xs",
          // Colors
          isOutbound ? "bg-primary text-primary-foreground" : "bg-muted",
          // Add margin at bottom if there's a reaction to make room for overflow
          displayReaction && "mb-5"
        )}
      >
        {/* Actions menu - positioned in top-right corner */}
        {!isDeleted && (
          <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
            <MessageActionsMenu
              messageId={message.messageId}
              messageTimestamp={message.timestamp}
              isOutbound={isOutbound}
              hasDownloadableMedia={hasDownloadableMedia}
              onReply={onReply ? () => onReply(message.messageId) : undefined}
              onDelete={
                isOutbound && onDelete
                  ? () => onDelete(message.messageId)
                  : undefined
              }
              onDownload={
                onDownload ? () => onDownload(message.messageId) : undefined
              }
            />
          </div>
        )}

        {/* Message content */}
        {isDeleted ? (
          <p className="text-xs italic opacity-60">
            {t("thisMessageWasDeleted")}
          </p>
        ) : (
          <>
            {/* Quoted message block for replies */}
            {message.replyPreview && (
              <QuotedMessage
                replyPreview={{
                  ...message.replyPreview,
                  senderName:
                    message.replyPreview.senderType === "customer"
                      ? selectedChat?.participantName ||
                        message.replyPreview.senderName
                      : message.replyPreview.senderName,
                }}
                originalMessageId={message.replyPreview.messageId}
                isOutbound={isOutbound}
                onClick={() => {
                  if (
                    message.replyPreview?.messageId &&
                    !message.replyPreview?.unavailable &&
                    onScrollToMessage
                  ) {
                    onScrollToMessage(message.replyPreview.messageId);
                  }
                }}
              />
            )}

            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className={message.text ? "mb-2" : ""}>
                <AttachmentGallery
                  attachments={message.attachments}
                  messageId={message.messageId || message.id?.toString() || ""}
                  onImageClick={(index) =>
                    onImageClick?.(
                      message.messageId || message.id?.toString() || "",
                      message.attachments || [],
                      index
                    )
                  }
                  onShowDownloadMenu={(position) =>
                    onShowDownloadMenu?.(
                      message.messageId || message.id?.toString() || "",
                      message.attachments || [],
                      position
                    )
                  }
                  isOutbound={isOutbound}
                  onMessageDelete={onDelete}
                  senderName={
                    isOutbound
                      ? "You"
                      : selectedChat?.participantName ||
                        selectedChat?.participantPhone
                  }
                  autoPlayGifs={autoPlayGifs}
                />
              </div>
            )}

            {/* Text content */}
            {message.text && (
              <MessageText
                text={message.text}
                isOutbound={isOutbound}
                showPreviews={!message.attachments?.length}
                onVideoPlay={onVideoPlay}
              />
            )}
          </>
        )}

        {/* Timestamp and status */}
        <div
          className={cn(
            "text-xs mt-0.5 flex items-center justify-between gap-1",
            isOutbound ? "text-primary-foreground/70" : "text-muted-foreground"
          )}
        >
          <span>
            {timeString}
            {message.editedAt && (
              <span className="ml-1 opacity-60">({t("messageEdited")})</span>
            )}
          </span>
          {isOutbound && !isDeleted && (
            <WhatsAppStatusIcon
              status={message.status || "pending"}
              deliveredAt={message.deliveredAt}
              readAt={message.readAt}
              className="ml-1"
            />
          )}
        </div>

        {/* Reaction display - positioned at bottom corner */}
        {displayReaction && (
          <MessageReactionDisplay
            emoji={displayReaction.emoji}
            isOutbound={isOutbound}
            userName={displayReaction.userName}
            onClick={handleReactionClick}
            isOwnReaction={displayReaction.userId === userReaction?.userId}
            animate={reactionAnimating}
          />
        )}
      </div>
    </div>
  );
});

MessageBubble.displayName = "MessageBubble";
