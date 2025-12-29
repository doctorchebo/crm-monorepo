/**
 * ChatsSenderSection
 * Collapsible section for chats grouped by sender number
 * Each sender has its own inbox with ability to expand/collapse
 * Shows unread message badges per chat item (WhatsApp-style)
 */

"use client";

import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  FileIcon,
  ImageIcon,
  Mic,
  Sticker,
  Video,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

interface Chat {
  id?: number;
  chatId: string;
  senderId: number;
  businessPhone?: string;
  participantPhone: string;
  participantName?: string;
  lastMessage?: string | null;
  lastMessageType?: string | null;
  lastMessageTime?: string | null;
  unreadCount?: number;
}

interface ChatsSenderSectionProps {
  senderPhoneNumber: string;
  senderDisplayName?: string | null;
  chats: Chat[];
  selectedChatId?: string | null;
  onSelectChat: (chatId: string) => void;
}

export function ChatsSenderSection({
  senderPhoneNumber,
  senderDisplayName,
  chats,
  selectedChatId,
  onSelectChat,
}: ChatsSenderSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const t = useTranslations("chats.chatList");

  // Calculate total unread count for this sender section
  const totalUnreadCount = useMemo(() => {
    return chats.reduce((sum, chat) => sum + (chat.unreadCount || 0), 0);
  }, [chats]);

  if (chats.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1 border-t py-2 first:border-t-0">
      {/* Section Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
          isExpanded ? "bg-muted/50" : ""
        )}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}

        <div className="flex flex-1 items-center gap-2">
          <span className="truncate">
            {senderDisplayName || senderPhoneNumber}
          </span>
          <span className="text-xs text-muted-foreground">
            {senderPhoneNumber}
          </span>
        </div>

        {totalUnreadCount > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25D366] px-1.5 text-xs font-bold text-white">
            {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
          </span>
        )}

        <span className="text-xs text-muted-foreground">({chats.length})</span>
      </button>

      {/* Chat List */}
      {isExpanded && (
        <div className="space-y-1 pl-6">
          {chats.map((chat) => (
            <ChatListItem
              key={chat.chatId}
              chat={chat}
              isSelected={selectedChatId === chat.chatId}
              onSelect={() => onSelectChat(chat.chatId)}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Individual chat list item with unread badge
 */
interface ChatListItemProps {
  chat: Chat;
  isSelected: boolean;
  onSelect: () => void;
  t: ReturnType<typeof useTranslations>;
}

/**
 * Get the icon component for a message type
 */
function getMessageTypeIcon(type: string | undefined) {
  switch (type) {
    case "gif":
      return (
        <span className="mr-1 text-xs opacity-70" title="GIF">
          GIF
        </span>
      );
    case "sticker":
      return <Sticker className="mr-1 h-3 w-3 flex-shrink-0" />;
    case "image":
      return <ImageIcon className="mr-1 h-3 w-3 flex-shrink-0" />;
    case "video":
      return <Video className="mr-1 h-3 w-3 flex-shrink-0" />;
    case "audio":
    case "voice":
      return <Mic className="mr-1 h-3 w-3 flex-shrink-0" />;
    case "document":
      return <FileIcon className="mr-1 h-3 w-3 flex-shrink-0" />;
    default:
      return null;
  }
}

/**
 * Get the preview text for a message type with translations
 */
function getMessageTypePreview(
  type: string | undefined,
  textContent: string | undefined,
  t: ReturnType<typeof useTranslations>
): string {
  // If there's text content, use it
  if (textContent && textContent.trim()) {
    return textContent;
  }

  // Otherwise, show type-based placeholder with translations
  switch (type) {
    case "gif":
      return t("mediaTypes.gif");
    case "sticker":
      return t("mediaTypes.sticker");
    case "image":
      return t("mediaTypes.photo");
    case "video":
      return t("mediaTypes.video");
    case "audio":
    case "voice":
      return t("mediaTypes.voiceMessage");
    case "document":
      return t("mediaTypes.document");
    default:
      return "";
  }
}

function ChatListItem({ chat, isSelected, onSelect, t }: ChatListItemProps) {
  const hasUnread = (chat.unreadCount || 0) > 0;
  const icon = getMessageTypeIcon(chat.lastMessageType);
  const previewText = getMessageTypePreview(
    chat.lastMessageType,
    chat.lastMessage,
    t
  );

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
        isSelected && "bg-primary/10 font-medium",
        hasUnread && !isSelected && "bg-muted/50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p
              className={cn(
                "truncate",
                hasUnread ? "font-semibold" : "font-medium"
              )}
            >
              {chat.participantName || chat.participantPhone}
            </p>
          </div>
          {previewText && (
            <p
              className={cn(
                "flex items-center truncate text-xs",
                hasUnread
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              )}
            >
              {icon}
              <span className="truncate">{previewText}</span>
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {chat.lastMessageTime && (
            <span
              className={cn(
                "whitespace-nowrap text-xs",
                hasUnread
                  ? "text-[#25D366] font-medium"
                  : "text-muted-foreground"
              )}
            >
              {formatTime(new Date(chat.lastMessageTime), t)}
            </span>
          )}

          {/* Unread Badge - WhatsApp Style */}
          {hasUnread && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25D366] px-1.5 text-xs font-bold text-white">
              {chat.unreadCount! > 99 ? "99+" : chat.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/**
 * Formats a date to a relative time string with translations
 * Uses short format for recent times (now, minutes, hours) and days for older
 * Falls back to formatted date for messages older than a week
 */
function formatTime(date: Date, t: ReturnType<typeof useTranslations>): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return t("dates.now");
  if (diffMins < 60) return t("dates.minutesAgo", { count: diffMins });
  if (diffHours < 24) return t("dates.hoursAgo", { count: diffHours });
  if (diffDays === 1) return t("dates.yesterday");
  if (diffDays < 7) return t("dates.daysAgo", { count: diffDays });

  // For older dates, use locale-aware date formatting
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}
