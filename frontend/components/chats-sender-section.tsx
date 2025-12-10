/**
 * ChatsSenderSection
 * Collapsible section for chats grouped by sender number
 * Each sender has its own inbox with ability to expand/collapse
 */

"use client";

import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

interface Chat {
  id?: number;
  chatId: string;
  senderId: number;
  businessPhone?: string;
  participantPhone: string;
  participantName?: string;
  lastMessage?: string;
  lastMessageTime?: string;
}

interface ChatsSenderSectionProps {
  senderPhoneNumber: string;
  senderDisplayName?: string;
  chats: Chat[];
  selectedChatId?: string | null;
  onSelectChat: (chatId: string) => void;
  unreadCount?: number;
}

export function ChatsSenderSection({
  senderPhoneNumber,
  senderDisplayName,
  chats,
  selectedChatId,
  onSelectChat,
  unreadCount = 0,
}: ChatsSenderSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

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

        {unreadCount > 0 && (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}

        <span className="text-xs text-muted-foreground">({chats.length})</span>
      </button>

      {/* Chat List */}
      {isExpanded && (
        <div className="space-y-1 pl-6">
          {chats.map((chat) => (
            <button
              key={chat.chatId}
              onClick={() => onSelectChat(chat.chatId)}
              className={cn(
                "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                selectedChatId === chat.chatId && "bg-primary/10 font-medium"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 truncate">
                  <p className="font-medium">
                    {chat.participantName || chat.participantPhone}
                  </p>
                  {chat.lastMessage && (
                    <p className="truncate text-xs text-muted-foreground">
                      {chat.lastMessage}
                    </p>
                  )}
                </div>

                {chat.lastMessageTime && (
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatTime(new Date(chat.lastMessageTime))}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
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
