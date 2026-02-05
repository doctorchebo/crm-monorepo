/**
 * CatalogSendToContactsModal
 * Modal for selecting contacts/chats to send catalog items to via WhatsApp
 *
 * Features:
 * - Search bar to filter contacts by name or phone
 * - Checkbox selection for multiple recipients
 * - Shows contact avatar, name, phone number
 * - Preview of selected catalog items
 * - Send button with count of selected recipients
 */

"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { backendApi } from "@/lib/api/endpoints";
import { Loader2, Search, Send, ShoppingBag, User, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

interface CatalogItem {
  id: string;
  name: string;
  price: number;
  salePrice: number | null;
  currency: string;
  mainThumbnailUrl: string | null;
  mainImageUrl: string | null;
}

interface CatalogSendToContactsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedItems: CatalogItem[];
  onSend: (chatIds: string[], itemIds: string[]) => Promise<void>;
}

interface ChatResult {
  chatId: string;
  senderId: number;
  businessPhone?: string;
  participantPhone: string;
  participantName?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
}

function getInitials(name?: string, phone?: string): string {
  if (name) {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (phone) {
    return phone.slice(-2);
  }
  return "??";
}

function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
  }).format(price);
}

export function CatalogSendToContactsModal({
  open,
  onOpenChange,
  selectedItems,
  onSend,
}: CatalogSendToContactsModalProps) {
  const t = useTranslations("catalog.send");
  const tCommon = useTranslations("common");

  // State
  const [chats, setChats] = useState<ChatResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(
    new Set(),
  );
  const {
    value: searchQuery,
    debouncedValue: debouncedSearch,
    setValue: setSearchQuery,
  } = useDebouncedValue("", { delay: 300 });

  // Fetch chats based on search
  const fetchChats = useCallback(async (search?: string) => {
    setIsLoading(true);
    try {
      if (search && search.trim()) {
        // Search chats by name or phone
        const result = await backendApi.chats.search(search, { take: 50 });
        setChats(result.results);
      } else {
        // Get recent chats
        const result = await backendApi.chats.list(0, 50);
        // Transform to ChatResult format
        const chatList = (result as any[]).map((chat: any) => ({
          chatId: chat.chatId,
          senderId: chat.senderId,
          businessPhone: chat.businessPhone,
          participantPhone: chat.participantPhone,
          participantName: chat.participantName,
          lastMessage: chat.lastMessage,
          lastMessageTime: chat.lastMessageTime,
          unreadCount: chat.unreadCount || 0,
        }));
        setChats(chatList);
      }
    } catch (error) {
      console.error("Error fetching chats:", error);
      setChats([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch chats when modal opens or search changes
  useEffect(() => {
    if (open) {
      fetchChats(debouncedSearch);
    }
  }, [open, debouncedSearch, fetchChats]);

  // Track previous open state to detect close
  const prevOpenRef = useRef(open);

  // Reset state when modal closes
  useEffect(() => {
    // Only reset when transitioning from open to closed
    if (prevOpenRef.current && !open) {
      setSelectedChatIds(new Set());
      setSearchQuery("");
    }
    prevOpenRef.current = open;
  }, [open]); // Intentionally excluding setSearchQuery - it's stable from useCallback

  // Toggle chat selection
  const toggleChat = (chatId: string) => {
    const newSelected = new Set(selectedChatIds);
    if (newSelected.has(chatId)) {
      newSelected.delete(chatId);
    } else {
      if (newSelected.size < 50) {
        // Max 50 recipients
        newSelected.add(chatId);
      }
    }
    setSelectedChatIds(newSelected);
  };

  // Select/deselect all
  const toggleSelectAll = () => {
    if (selectedChatIds.size === chats.length) {
      setSelectedChatIds(new Set());
    } else {
      const allIds = chats.slice(0, 50).map((c) => c.chatId);
      setSelectedChatIds(new Set(allIds));
    }
  };

  // Handle send
  const handleSend = async () => {
    if (selectedChatIds.size === 0 || selectedItems.length === 0) return;

    setIsSending(true);
    try {
      const chatIds = Array.from(selectedChatIds);
      const itemIds = selectedItems.map((item) => item.id);
      await onSend(chatIds, itemIds);
      onOpenChange(false);
    } catch (error) {
      console.error("Error sending catalog items:", error);
    } finally {
      setIsSending(false);
    }
  };

  // Calculate if all visible chats are selected
  const allSelected = chats.length > 0 && selectedChatIds.size === chats.length;
  const someSelected = selectedChatIds.size > 0 && !allSelected;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            {t("sendTo")}
          </DialogTitle>
          <DialogDescription>
            {t("selectedItems", { count: selectedItems.length })}
          </DialogDescription>
        </DialogHeader>

        {/* Selected Items Preview */}
        {selectedItems.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg">
            {selectedItems.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 bg-background rounded-md px-2 py-1 text-sm"
              >
                {item.mainThumbnailUrl || item.mainImageUrl ? (
                  <img
                    src={item.mainThumbnailUrl || item.mainImageUrl || ""}
                    alt={item.name}
                    className="w-6 h-6 rounded object-cover"
                  />
                ) : (
                  <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="truncate max-w-[100px]">{item.name}</span>
                <Badge variant="secondary" className="text-xs">
                  {formatPrice(item.salePrice || item.price, item.currency)}
                </Badge>
              </div>
            ))}
            {selectedItems.length > 5 && (
              <Badge variant="outline">
                +{selectedItems.length - 5} {tCommon("more")}
              </Badge>
            )}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchContacts")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Select All / Selected Count */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Checkbox
              id="select-all"
              checked={allSelected}
              onCheckedChange={toggleSelectAll}
              className={
                someSelected ? "data-[state=checked]:bg-primary/50" : ""
              }
            />
            <label
              htmlFor="select-all"
              className="text-sm text-muted-foreground cursor-pointer"
            >
              {tCommon("selectAll")}
            </label>
          </div>
          <span className="text-sm text-muted-foreground">
            {t("selectedContacts", { count: selectedChatIds.size })}
          </span>
        </div>

        {/* Contacts List */}
        <ScrollArea className="flex-1 min-h-[200px] max-h-[300px] border rounded-lg">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <User className="h-12 w-12 text-muted-foreground/50 mb-2" />
              <p className="text-muted-foreground">
                {searchQuery ? t("noResults") : "No chats found"}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {chats.map((chat) => {
                const isSelected = selectedChatIds.has(chat.chatId);
                return (
                  <div
                    key={chat.chatId}
                    className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                      isSelected ? "bg-primary/5" : ""
                    }`}
                    onClick={() => toggleChat(chat.chatId)}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleChat(chat.chatId)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>
                        {getInitials(
                          chat.participantName,
                          chat.participantPhone,
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {chat.participantName || chat.participantPhone}
                      </p>
                      {chat.participantName && (
                        <p className="text-sm text-muted-foreground truncate">
                          {chat.participantPhone}
                        </p>
                      )}
                    </div>
                    {chat.unreadCount > 0 && (
                      <Badge variant="default" className="h-5 min-w-5 px-1.5">
                        {chat.unreadCount}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {t("maxContacts", { max: 50 })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSending}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              onClick={handleSend}
              disabled={selectedChatIds.size === 0 || isSending}
            >
              {isSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tCommon("sending")}
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  {t("send")} ({selectedChatIds.size})
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
