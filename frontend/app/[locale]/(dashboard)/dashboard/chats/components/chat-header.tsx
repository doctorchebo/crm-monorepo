"use client";

import type { Chat } from "../types";

interface ChatHeaderProps {
  chat: Chat;
}

export function ChatHeader({ chat }: ChatHeaderProps) {
  return (
    <div className="border-b px-6 py-2 flex items-center justify-between flex-shrink-0">
      <div>
        <h2 className="text-lg font-semibold">
          {chat.participantName || chat.participantPhone}
        </h2>
        <p className="text-xs text-muted-foreground">{chat.participantPhone}</p>
      </div>
    </div>
  );
}
