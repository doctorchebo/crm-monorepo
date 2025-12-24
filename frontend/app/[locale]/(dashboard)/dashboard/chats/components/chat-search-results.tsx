/**
 * ChatSearchResults
 * Displays search results for chat list search
 * Shows matching chats with highlighted match info
 */

"use client";

import { cn } from "@/lib/utils";
import {
  FileIcon,
  ImageIcon,
  Loader2,
  Mic,
  Sticker,
  Video,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

interface ChatSearchResult {
  chatId: string;
  senderId: number;
  businessPhone?: string;
  participantPhone: string;
  participantName?: string;
  lastMessage?: string;
  lastMessageType?: string;
  lastMessageTime?: string;
  unreadCount: number;
  matchedField?: "name" | "phone";
}

interface Sender {
  id: number;
  phoneNumber: string;
  displayName?: string | null;
}

interface ChatSearchResultsProps {
  results: ChatSearchResult[];
  senders: Sender[];
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
  searchQuery: string;
  hasMore: boolean;
  onLoadMore: () => void;
  isLoading: boolean;
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
 * Highlights matching text in a string
 */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return text;

  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);

  return (
    <>
      {before}
      <mark className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
        {match}
      </mark>
      {after}
    </>
  );
}

/**
 * Formats a date to a relative time string with translations
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

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export function ChatSearchResults({
  results,
  senders,
  selectedChatId,
  onSelectChat,
  searchQuery,
  hasMore,
  onLoadMore,
  isLoading,
}: ChatSearchResultsProps) {
  const t = useTranslations("chats.chatList");
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Infinite scroll observer
  useEffect(() => {
    if (!hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoading, onLoadMore]);

  // Get sender display name by ID
  const getSenderName = (senderId: number) => {
    const sender = senders.find((s) => s.id === senderId);
    return sender?.displayName || sender?.phoneNumber || "";
  };

  return (
    <div className="space-y-1 py-2">
      {results.map((chat) => {
        const hasUnread = (chat.unreadCount || 0) > 0;
        const icon = getMessageTypeIcon(chat.lastMessageType);
        const senderName = getSenderName(chat.senderId);

        // Get the preview text for the last message
        let previewText = chat.lastMessage || "";
        if (!previewText && chat.lastMessageType) {
          const typeKey = {
            gif: "mediaTypes.gif",
            sticker: "mediaTypes.sticker",
            image: "mediaTypes.photo",
            video: "mediaTypes.video",
            audio: "mediaTypes.voiceMessage",
            voice: "mediaTypes.voiceMessage",
            document: "mediaTypes.document",
          }[chat.lastMessageType];
          if (typeKey) previewText = t(typeKey);
        }

        return (
          <button
            key={chat.chatId}
            onClick={() => onSelectChat(chat.chatId)}
            className={cn(
              "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted mx-2",
              selectedChatId === chat.chatId && "bg-primary/10 font-medium",
              hasUnread && selectedChatId !== chat.chatId && "bg-muted/50"
            )}
            style={{ width: "calc(100% - 16px)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {/* Sender badge */}
                {senderName && (
                  <span className="text-[10px] text-muted-foreground mb-0.5 block truncate">
                    {senderName}
                  </span>
                )}
                {/* Contact name/phone with highlight */}
                <div className="flex items-center gap-2">
                  <p
                    className={cn(
                      "truncate",
                      hasUnread ? "font-semibold" : "font-medium"
                    )}
                  >
                    {chat.matchedField === "name" && chat.participantName
                      ? highlightMatch(chat.participantName, searchQuery)
                      : chat.participantName || chat.participantPhone}
                  </p>
                </div>
                {/* Phone number with highlight (if name is shown) */}
                {chat.participantName && (
                  <p className="text-xs text-muted-foreground truncate">
                    {chat.matchedField === "phone"
                      ? highlightMatch(chat.participantPhone, searchQuery)
                      : chat.participantPhone}
                  </p>
                )}
                {/* Last message preview */}
                {previewText && (
                  <p
                    className={cn(
                      "flex items-center truncate text-xs mt-0.5",
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
      })}

      {/* Load more trigger / Loading indicator */}
      <div ref={loadMoreRef} className="py-2 text-center">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">{t("loadingChats")}</span>
          </div>
        )}
        {hasMore && !isLoading && (
          <button
            onClick={onLoadMore}
            className="text-xs text-primary hover:underline"
          >
            {t("loadMore")}
          </button>
        )}
      </div>
    </div>
  );
}
