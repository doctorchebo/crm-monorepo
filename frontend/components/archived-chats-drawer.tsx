/**
 * ArchivedChatsDrawer
 * A slide-over panel that displays archived chats
 * Replaces the main chat list when opened
 */

"use client";

import { Archive, ArrowLeft, Loader2, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { ChatsSenderSection } from "@/components/chats-sender-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { backendApi } from "@/lib/api/endpoints";

export interface ArchivedChat {
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
  isArchived?: boolean;
  archivedAt?: string | null;
}

interface Sender {
  id: number;
  phoneNumber: string;
  displayName?: string | null;
}

interface ArchivedChatsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onUnarchiveChat: (chatId: string) => Promise<void>;
  onDeleteChat: (chatId: string, participantName?: string) => void;
  onSelectArchivedChat: (chat: ArchivedChat) => void;
  selectedChatId: string | null;
  deletedChatId: string | null;
  senders: Sender[];
}

export function ArchivedChatsDrawer({
  isOpen,
  onClose,
  onUnarchiveChat,
  onDeleteChat,
  onSelectArchivedChat,
  selectedChatId,
  deletedChatId,
  senders,
}: ArchivedChatsDrawerProps) {
  const t = useTranslations("chats.chatList");
  const [archivedChats, setArchivedChats] = useState<ArchivedChat[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const TAKE = 20;

  // Fetch archived chats
  const fetchArchivedChats = useCallback(
    async (reset = false) => {
      if (!isOpen) return;

      setLoading(true);
      try {
        const currentSkip = reset ? 0 : skip;
        const response = (await backendApi.chats.listArchived(
          currentSkip,
          TAKE
        )) as { chats: ArchivedChat[]; total: number };

        if (reset) {
          setArchivedChats(response.chats || []);
          setSkip(TAKE);
        } else {
          setArchivedChats((prev) => [...prev, ...(response.chats || [])]);
          setSkip((prev) => prev + TAKE);
        }

        setTotalCount(response.total || 0);
        setHasMore((response.chats || []).length === TAKE);
      } catch (error) {
        console.error("Failed to fetch archived chats:", error);
      } finally {
        setLoading(false);
      }
    },
    [isOpen, skip]
  );

  // Load archived chats when drawer opens
  useEffect(() => {
    if (isOpen) {
      setSkip(0);
      setArchivedChats([]);
      fetchArchivedChats(true);
    }
  }, [isOpen]);

  // Remove deleted chat from local state
  useEffect(() => {
    if (deletedChatId) {
      setArchivedChats((prev) =>
        prev.filter((c) => c.chatId !== deletedChatId)
      );
      setTotalCount((prev) => Math.max(0, prev - 1));
    }
  }, [deletedChatId]);

  // Handle unarchive
  const handleUnarchive = async (chatId: string) => {
    try {
      await onUnarchiveChat(chatId);
      // Remove from local state
      setArchivedChats((prev) => prev.filter((c) => c.chatId !== chatId));
      setTotalCount((prev) => prev - 1);
    } catch (error) {
      console.error("Failed to unarchive chat:", error);
    }
  };

  // Handle delete
  const handleDelete = (chatId: string) => {
    const chat = archivedChats.find((c) => c.chatId === chatId);
    onDeleteChat(chatId, chat?.participantName || chat?.participantPhone);
  };

  // Filter chats by search query
  const filteredChats = searchQuery
    ? archivedChats.filter((chat) => {
        const name = chat.participantName?.toLowerCase() || "";
        const phone = chat.participantPhone.toLowerCase();
        const query = searchQuery.toLowerCase();
        return name.includes(query) || phone.includes(query);
      })
    : archivedChats;

  // Group chats by sender
  const groupedChats = senders.reduce((acc, sender) => {
    const chats = filteredChats.filter((c) => c.senderId === sender.id);
    if (chats.length > 0) {
      acc.push({ sender, chats });
    }
    return acc;
  }, [] as { sender: Sender; chats: ArchivedChat[] }[]);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-10 bg-background flex flex-col">
      {/* Header */}
      <div className="p-4 border-b flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="font-semibold flex items-center gap-2">
            <Archive className="h-4 w-4" />
            {t("archivedChats")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("archivedChatsCount", { count: totalCount })}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchArchived")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Archived Chats List */}
      <div className="flex-1 overflow-y-auto">
        {loading && archivedChats.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <Archive className="h-12 w-12 text-muted-foreground mb-3 opacity-40" />
            <p className="text-muted-foreground">
              {searchQuery ? t("noSearchResults") : t("noArchivedChats")}
            </p>
          </div>
        ) : (
          <>
            {groupedChats.map(({ sender, chats }) => (
              <ChatsSenderSection
                key={sender.id}
                senderPhoneNumber={sender.phoneNumber}
                senderDisplayName={sender.displayName}
                chats={chats}
                selectedChatId={selectedChatId}
                onSelectChat={(chatId) => {
                  // Find the chat and pass it to the parent
                  const chat = chats.find((c) => c.chatId === chatId);
                  if (chat) {
                    onSelectArchivedChat(chat);
                  }
                }}
                onUnarchiveChat={handleUnarchive}
                onDeleteChat={handleDelete}
                isArchivedView={true}
              />
            ))}

            {/* Load More Button */}
            {hasMore && !searchQuery && (
              <div className="p-4 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => fetchArchivedChats(false)}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("loading")}
                    </>
                  ) : (
                    t("loadMore")
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
