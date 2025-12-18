/**
 * ChatsSenderSection
 * Collapsible section for chats grouped by sender number
 * Each sender has its own inbox with ability to expand/collapse
 * Shows unread message badges per chat item (WhatsApp-style)
 */

"use client";

import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

interface Chat {
  id?: number;
  chatId: string;
  senderId: number;
  businessPhone?: string;
  participantPhone: string;
  participantName?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
}

interface ChatsSenderSectionProps {
  senderPhoneNumber: string;
  senderDisplayName?: string;
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
}

function ChatListItem({ chat, isSelected, onSelect }: ChatListItemProps) {
  const hasUnread = (chat.unreadCount || 0) > 0;

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
          {chat.lastMessage && (
            <p
              className={cn(
                "truncate text-xs",
                hasUnread
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              )}
            >
              {chat.lastMessage}
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
              {formatTime(new Date(chat.lastMessageTime))}
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
 * Formats a date to a relative time string (e.g., "2 hours ago", "Yesterday", "Dec 25")
 */
function formatTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}
