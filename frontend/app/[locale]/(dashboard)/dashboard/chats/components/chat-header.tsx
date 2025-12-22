"use client";

import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Chat } from "../types";

interface ChatHeaderProps {
  chat: Chat;
  onSearchClick?: () => void;
  isSearchOpen?: boolean;
}

export function ChatHeader({
  chat,
  onSearchClick,
  isSearchOpen,
}: ChatHeaderProps) {
  const t = useTranslations("chats.search");

  return (
    <div className="border-b px-6 py-2 flex items-center justify-between flex-shrink-0">
      <div>
        <h2 className="text-lg font-semibold">
          {chat.participantName || chat.participantPhone}
        </h2>
        <p className="text-xs text-muted-foreground">{chat.participantPhone}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant={isSearchOpen ? "default" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={onSearchClick}
          title={t("title")}
        >
          <Search className="h-4 w-4" />
          <span className="sr-only">{t("title")}</span>
        </Button>
      </div>
    </div>
  );
}
