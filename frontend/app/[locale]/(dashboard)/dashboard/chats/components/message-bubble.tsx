"use client";

/**
 * Message Bubble Component
 * A complete message bubble with unified reaction support
 * Handles inbound/outbound styling, actions menu, and aggregated reaction display
 */

import { AttachmentGallery } from "@/components/media/attachment-display";
import { MessageActionsMenu } from "@/components/message-actions-menu";
import { QuotedMessage } from "@/components/quoted-message";
import {
  ReactionsDetailsOverlay,
  ReactionsSummary,
  ReactionTrigger,
  toCrmReaction,
  toCustomerReaction,
  type UnifiedReaction,
} from "@/components/reactions";
import { AIMessageIndicator } from "@/components/ui/ai-message-indicator";
import { MessageText } from "@/components/ui/message-text";
import { WhatsAppStatusIcon } from "@/components/whatsapp-status-icon";
import { Attachment } from "@/lib/media/types";
import { cn } from "@/lib/utils";
import { Pin } from "lucide-react";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import type { Chat, Message, MessageReaction } from "../types";
import { InteractiveButtonsDisplay } from "./interactive-buttons-display";

interface MessageBubbleProps {
  message: Message;
  isOutbound: boolean;
  isDeleted: boolean;
  isHighlighted: boolean;
  isPinned?: boolean;
  timeString: string;
  selectedChat: Chat | null;
  autoPlayGifs: boolean;
  /** Current user's ID for identifying own reactions */
  currentUserId?: number;
  /** Current user's reaction on this message */
  userReaction?: MessageReaction;
  /** Customer's reaction on this message (from WhatsApp user) */
  customerReaction?: {
    messageId: string;
    emoji: string;
    senderPhone: string;
    timestamp?: string;
  };
  /** All CRM reactions on this message */
  reactions?: MessageReaction[];
  /** Whether reaction just changed (for animation) */
  reactionAnimating?: boolean;
  /**
   * Whether reactions are disabled (outside 24-hour window)
   */
  isReactionDisabled?: boolean;
  /**
   * Tooltip text explaining why reactions are disabled
   */
  reactionDisabledTooltip?: string;
  isSelectionMode?: boolean;
  // Event handlers
  onReply?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onDownload?: (messageId: string) => void;
  onPin?: (messageId: string) => void;
  onUnpin?: (messageId: string) => void;
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
  isPinned = false,
  timeString,
  selectedChat,
  autoPlayGifs,
  currentUserId,
  userReaction,
  customerReaction,
  reactions,
  reactionAnimating = false,
  isReactionDisabled = false,
  reactionDisabledTooltip,
  isSelectionMode,
  onReply,
  onDelete,
  onDownload,
  onPin,
  onUnpin,
  onImageClick,
  onShowDownloadMenu,
  onVideoPlay,
  onScrollToMessage,
  onReactionSelect,
  t,
}: MessageBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const reactionSummaryRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [showReactionsOverlay, setShowReactionsOverlay] = useState(false);

  // Convert all reactions to unified format
  const unifiedReactions = useMemo((): UnifiedReaction[] => {
    const result: UnifiedReaction[] = [];

    // Add CRM user reactions
    if (reactions && reactions.length > 0) {
      for (const r of reactions) {
        result.push(toCrmReaction(r));
      }
    }

    // Add customer reaction
    if (customerReaction) {
      result.push(
        toCustomerReaction(
          customerReaction,
          selectedChat?.participantName || "Customer"
        )
      );
    }

    return result;
  }, [reactions, customerReaction, selectedChat?.participantName]);

  const hasReactionsToDisplay = unifiedReactions.length > 0;

  const handleReactionSelect = useCallback(
    (emoji: string) => {
      if (message.messageId && onReactionSelect) {
        onReactionSelect(message.messageId, emoji);
      }
    },
    [message.messageId, onReactionSelect]
  );

  const handleOpenReactionsOverlay = useCallback(() => {
    setShowReactionsOverlay(true);
  }, []);

  const handleCloseReactionsOverlay = useCallback(() => {
    setShowReactionsOverlay(false);
  }, []);

  const handleRemoveReaction = useCallback(
    (emoji: string) => {
      // Removing a reaction is done by selecting the same emoji again
      if (message.messageId && onReactionSelect) {
        onReactionSelect(message.messageId, emoji);
      }
    },
    [message.messageId, onReactionSelect]
  );

  // Determine if message has downloadable media
  const hasDownloadableMedia = message.attachments?.some(
    (a) => a.type === "image" || a.type === "video" || a.type === "gif"
  );

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
      {/* Reaction trigger - only shown for INBOUND messages (customer messages) */}
      {/* WhatsApp Cloud API only supports reactions on messages received from customers */}
      {/* For inbound: trigger on RIGHT (order-last with flex-row puts it right) */}
      {!isDeleted && !isOutbound && (
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
            disabled={isReactionDisabled}
            disabledTooltip={reactionDisabledTooltip}
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
          hasReactionsToDisplay && "mb-5"
        )}
      >
        {/* Actions menu - positioned in top-right corner */}
        {!isDeleted && !isSelectionMode && (
          <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
            <MessageActionsMenu
              messageId={message.messageId}
              messageTimestamp={message.timestamp}
              isOutbound={isOutbound}
              hasDownloadableMedia={hasDownloadableMedia}
              isPinned={isPinned}
              onReply={onReply ? () => onReply(message.messageId) : undefined}
              onDelete={
                isOutbound && onDelete
                  ? () => onDelete(message.messageId)
                  : undefined
              }
              onDownload={
                onDownload ? () => onDownload(message.messageId) : undefined
              }
              onPin={onPin ? () => onPin(message.messageId) : undefined}
              onUnpin={onUnpin ? () => onUnpin(message.messageId) : undefined}
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

            {/* Interactive buttons display for messages with reply options */}
            {message.metadata?.interactiveType &&
              message.metadata.interactiveData && (
                <InteractiveButtonsDisplay
                  metadata={message.metadata}
                  isOutbound={isOutbound}
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
          <span className="flex items-center gap-1">
            {/* Pin icon shown on pinned messages */}
            {isPinned && <Pin className="h-3 w-3 inline-block" />}
            {/* AI indicator for AI-generated messages */}
            {message.isAiGenerated && (
              <AIMessageIndicator
                isAiGenerated={message.isAiGenerated}
                aiModel={message.aiModel}
                aiProvider={message.aiProvider}
                wasManuallyOverridden={message.wasManuallyOverridden}
                isOutbound={isOutbound}
              />
            )}
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

        {/* Reaction display - unified reactions summary */}
        {hasReactionsToDisplay && (
          <div
            ref={reactionSummaryRef}
            className={cn(
              "absolute -bottom-4",
              // Position based on message direction
              isOutbound ? "-right-1" : "-left-1"
            )}
          >
            <ReactionsSummary
              reactions={unifiedReactions}
              isOutbound={isOutbound}
              animate={reactionAnimating}
              onClick={handleOpenReactionsOverlay}
            />
          </div>
        )}

        {/* Reactions details overlay */}
        <ReactionsDetailsOverlay
          reactions={unifiedReactions}
          currentUserId={currentUserId}
          customerName={selectedChat?.participantName || "Customer"}
          isOpen={showReactionsOverlay}
          onClose={handleCloseReactionsOverlay}
          onRemoveReaction={handleRemoveReaction}
          anchorRef={reactionSummaryRef as React.RefObject<HTMLElement>}
          isOutbound={isOutbound}
        />
      </div>
    </div>
  );
});

MessageBubble.displayName = "MessageBubble";
