"use client";

/**
 * Template Message Bubble
 *
 * Renders a WhatsApp template message in the chat with all its parts:
 * header (text/image/video/document), body, footer, and buttons.
 *
 * Reuses the same container/timestamp/status/actions patterns as MessageBubble
 * so it feels native in the chat list.
 */

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
import { backendApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { Copy, ExternalLink, MessageCircle, Phone, Pin } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chat, Message, MessageMetadata, MessageReaction } from "../types";
import { TemplateHeaderMedia } from "./template-header-media";

// ─── Helpers ──────────────────────────────────────────────────────────

/** Button type → icon mapping */
function getButtonIcon(type?: string) {
  switch (type?.toUpperCase()) {
    case "URL":
      return ExternalLink;
    case "PHONE_NUMBER":
      return Phone;
    case "QUICK_REPLY":
      return MessageCircle;
    case "COPY_CODE":
      return Copy;
    default:
      return MessageCircle;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────

function TemplateFooter({
  footer,
  isOutbound,
}: {
  footer: string;
  isOutbound: boolean;
}) {
  return (
    <div
      className={cn(
        "text-[10px] mt-1 opacity-60",
        isOutbound ? "text-primary-foreground/70" : "text-muted-foreground",
      )}
    >
      {footer}
    </div>
  );
}

function TemplateButtons({
  buttons,
  isOutbound,
}: {
  buttons: Array<Record<string, any>>;
  isOutbound: boolean;
}) {
  if (!buttons || buttons.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-1 border-t border-current/10 pt-1">
      {buttons.map((button, index) => {
        const Icon = getButtonIcon(button.type);
        return (
          <button
            key={index}
            className={cn(
              "flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors w-full",
              isOutbound
                ? "text-primary-foreground/80 hover:bg-primary-foreground/10"
                : "text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20",
            )}
            disabled
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{button.text || "Button"}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────

interface TemplateMessageBubbleProps {
  message: Message;
  isOutbound: boolean;
  isDeleted: boolean;
  isHighlighted: boolean;
  isPinned?: boolean;
  timeString: string;
  selectedChat: Chat | null;
  currentUserId?: number;
  userReaction?: MessageReaction;
  customerReaction?: {
    messageId: string;
    emoji: string;
    senderPhone: string;
    timestamp?: string;
  };
  reactions?: MessageReaction[];
  reactionAnimating?: boolean;
  isReactionDisabled?: boolean;
  reactionDisabledTooltip?: string;
  isSelectionMode?: boolean;
  onReply?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onPin?: (messageId: string) => void;
  onUnpin?: (messageId: string) => void;
  onScrollToMessage?: (messageId: string) => void;
  onReactionSelect?: (messageId: string, emoji: string) => void;
  t: (key: string) => string;
}

export const TemplateMessageBubble = memo(function TemplateMessageBubble({
  message,
  isOutbound,
  isDeleted,
  isHighlighted,
  isPinned = false,
  timeString,
  selectedChat,
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
  onPin,
  onUnpin,
  onScrollToMessage,
  onReactionSelect,
  t,
}: TemplateMessageBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const reactionSummaryRef = useRef<HTMLDivElement>(null);
  const [, setIsHovered] = useState(false);
  const [showReactionsOverlay, setShowReactionsOverlay] = useState(false);

  const metadata = message.metadata as MessageMetadata | null | undefined;
  const variables = metadata?.variables ?? {};

  // Unified reactions (same pattern as MessageBubble)
  const unifiedReactions = useMemo((): UnifiedReaction[] => {
    const result: UnifiedReaction[] = [];
    if (reactions && reactions.length > 0) {
      for (const r of reactions) result.push(toCrmReaction(r));
    }
    if (customerReaction) {
      result.push(
        toCustomerReaction(
          customerReaction,
          selectedChat?.participantName || "Customer",
        ),
      );
    }
    return result;
  }, [reactions, customerReaction, selectedChat?.participantName]);

  const hasReactionsToDisplay = unifiedReactions.length > 0;

  const handleReactionSelect = useCallback(
    (emoji: string) => {
      if (message.messageId && onReactionSelect)
        onReactionSelect(message.messageId, emoji);
    },
    [message.messageId, onReactionSelect],
  );
  const handleOpenReactionsOverlay = useCallback(
    () => setShowReactionsOverlay(true),
    [],
  );
  const handleCloseReactionsOverlay = useCallback(
    () => setShowReactionsOverlay(false),
    [],
  );
  const handleRemoveReaction = useCallback(
    (emoji: string) => {
      if (message.messageId && onReactionSelect)
        onReactionSelect(message.messageId, emoji);
    },
    [message.messageId, onReactionSelect],
  );

  // Extract template parts from metadata
  const templateName =
    metadata?.templateDisplayName || metadata?.templateName || "";
  const headerFormat = metadata?.headerFormat ?? null;
  const footer = metadata?.footer ?? null;
  const buttons = (metadata?.buttons ?? []) as Array<Record<string, any>>;
  const bodyText = message.text || "";

  // Build header media props from stored metadata.
  // Primary source: metadata.components.header (the approved template asset)
  // Fallback: metadata.variables (pre-filled header variable values)
  //
  // For media headers (IMAGE/VIDEO/DOCUMENT) the presigned URLs stored at
  // send time expire after 1 hour. We resolve a fresh URL on mount using
  // the permanent S3 key stored in metadata.headerMediaS3Key.
  const [freshMediaUrl, setFreshMediaUrl] = useState<string | null>(null);
  const [freshThumbnailUrl, setFreshThumbnailUrl] = useState<string | null>(
    null,
  );

  const headerMediaS3Key = (metadata as Record<string, any> | null)
    ?.headerMediaS3Key as string | undefined;
  const headerThumbnailS3Key = useMemo(() => {
    // Prefer the explicitly stored thumbnail key
    const explicit = (metadata as Record<string, any> | null)
      ?.headerThumbnailS3Key as string | undefined;
    if (explicit) return explicit;

    // For older messages, derive the thumbnail S3 key from compHeader.link
    // which is a presigned URL to the thumbnail (e.g. .../_thumb.jpg?X-Amz-...)
    const link = (
      (metadata?.components as Record<string, any>)?.header as
        | Record<string, any>
        | undefined
    )?.link as string | undefined;
    if (!link) return undefined;
    try {
      const url = new URL(link);
      // Extract path: /bucket/key or just /key for virtual-hosted style
      const pathname = decodeURIComponent(url.pathname);
      // Virtual-hosted: chatflowai-dev.s3... → pathname is /key
      // Path-style: s3.../chatflowai-dev/key → pathname is /bucket/key
      const isVirtualHosted = url.hostname.includes(".s3.");
      const key = isVirtualHosted
        ? pathname.slice(1) // remove leading /
        : pathname.split("/").slice(2).join("/"); // remove /bucket/
      if (key.startsWith("templates/media/")) return key;
    } catch {
      // Not a valid URL — ignore
    }
    return undefined;
  }, [metadata?.components, metadata]);

  useEffect(() => {
    let cancelled = false;

    // Resolve fresh video URL
    if (headerMediaS3Key) {
      backendApi.templates
        .getMediaPresignedDownloadUrl(headerMediaS3Key)
        .then((res) => {
          if (!cancelled && res?.url) setFreshMediaUrl(res.url);
        })
        .catch(() => {});
    }

    // Resolve fresh thumbnail URL for the video poster
    if (headerThumbnailS3Key) {
      backendApi.templates
        .getMediaPresignedDownloadUrl(headerThumbnailS3Key)
        .then((res) => {
          if (!cancelled && res?.url) setFreshThumbnailUrl(res.url);
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [headerMediaS3Key, headerThumbnailS3Key]);

  const headerMediaProps = useMemo(() => {
    if (!headerFormat) return null;
    const fmt = headerFormat.toUpperCase();
    const compHeader =
      (metadata?.components as Record<string, any>)?.header ?? {};

    // For media headers, prefer the freshly resolved URL
    const mediaUrl = freshMediaUrl || compHeader.link || null;

    switch (fmt) {
      case "TEXT":
        return { format: "TEXT" as const, text: metadata?.header ?? null };
      case "IMAGE":
        return {
          format: "IMAGE" as const,
          imageUrl:
            mediaUrl ||
            compHeader.thumbnailUrl ||
            variables.header_image ||
            null,
        };
      case "VIDEO":
        // For VIDEO, compHeader.link typically points to the thumbnail JPG
        // (not the actual video), so only use freshMediaUrl as the video source.
        // Use the freshly resolved thumbnail URL as poster; fall back to
        // the stale compHeader.link (works if not yet expired).
        return {
          format: "VIDEO" as const,
          videoUrl: freshMediaUrl || variables.header_video || null,
          thumbnailUrl:
            freshThumbnailUrl ||
            compHeader.thumbnailUrl ||
            compHeader.link ||
            null,
        };
      case "DOCUMENT":
        return {
          format: "DOCUMENT" as const,
          documentUrl: mediaUrl || variables.header_document || null,
          documentFilename:
            compHeader.filename || variables.header_document_filename || null,
        };
      case "LOCATION":
        return {
          format: "LOCATION" as const,
          latitude:
            variables.header_location_latitude || variables.latitude || null,
          longitude:
            variables.header_location_longitude || variables.longitude || null,
          locationName: variables.header_location_name || null,
          locationAddress: variables.header_location_address || null,
        };
      default:
        return null;
    }
  }, [
    headerFormat,
    variables,
    metadata?.header,
    metadata?.components,
    freshMediaUrl,
    freshThumbnailUrl,
  ]);

  return (
    <div
      className={cn(
        "group relative flex items-center gap-1",
        isOutbound ? "flex-row-reverse" : "flex-row",
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Reaction trigger — inbound only */}
      {!isDeleted && !isOutbound && (
        <div
          className={cn(
            "flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150",
            "order-last",
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

      {/* Bubble */}
      <div
        ref={bubbleRef}
        className={cn(
          "relative px-3 py-1.5 rounded-lg text-xs max-w-xs",
          isOutbound ? "bg-primary text-primary-foreground" : "bg-muted",
          hasReactionsToDisplay && "mb-5",
        )}
      >
        {/* Actions menu */}
        {!isDeleted && !isSelectionMode && (
          <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
            <MessageActionsMenu
              messageId={message.messageId}
              messageTimestamp={message.timestamp}
              isOutbound={isOutbound}
              hasDownloadableMedia={false}
              isPinned={isPinned}
              onReply={onReply ? () => onReply(message.messageId) : undefined}
              onDelete={
                isOutbound && onDelete
                  ? () => onDelete(message.messageId)
                  : undefined
              }
              onPin={onPin ? () => onPin(message.messageId) : undefined}
              onUnpin={onUnpin ? () => onUnpin(message.messageId) : undefined}
            />
          </div>
        )}

        {isDeleted ? (
          <p className="text-xs italic opacity-60">
            {t("thisMessageWasDeleted")}
          </p>
        ) : (
          <>
            {/* Quoted message */}
            {message.replyPreview && (
              <QuotedMessage
                replyPreview={
                  {
                    ...message.replyPreview,
                    senderName:
                      message.replyPreview.senderType === "customer"
                        ? selectedChat?.participantName ||
                          message.replyPreview.senderName
                        : message.replyPreview.senderName,
                  } as any
                }
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

            {/* Template label */}
            {templateName && (
              <div
                className={cn(
                  "text-[10px] font-medium uppercase tracking-wide mb-1 opacity-60",
                  isOutbound
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground",
                )}
              >
                Template
              </div>
            )}

            {/* Header via shared component */}
            {headerMediaProps && (
              <TemplateHeaderMedia
                {...headerMediaProps}
                variant="bubble"
                isOutbound={isOutbound}
              />
            )}

            {/* Body */}
            {bodyText && (
              <MessageText
                text={bodyText}
                isOutbound={isOutbound}
                showPreviews={false}
              />
            )}

            {/* Footer */}
            {footer && (
              <TemplateFooter footer={footer} isOutbound={isOutbound} />
            )}

            {/* Buttons */}
            {buttons.length > 0 && (
              <TemplateButtons buttons={buttons} isOutbound={isOutbound} />
            )}
          </>
        )}

        {/* Timestamp + status */}
        <div
          className={cn(
            "text-xs mt-0.5 flex items-center justify-between gap-1",
            isOutbound ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          <span className="flex items-center gap-1">
            {isPinned && <Pin className="h-3 w-3 inline-block" />}
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

        {/* Reactions */}
        {hasReactionsToDisplay && (
          <div
            ref={reactionSummaryRef}
            className={cn(
              "absolute -bottom-4",
              isOutbound ? "-right-1" : "-left-1",
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

TemplateMessageBubble.displayName = "TemplateMessageBubble";
