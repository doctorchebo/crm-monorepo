"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Download, Reply } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useRef } from "react";

interface MessageActionsMenuProps {
  messageId: string;
  messageTimestamp: string;
  isOutbound: boolean;
  hasDownloadableMedia?: boolean;
  onDelete?: (messageId: string) => void;
  onDownload?: (messageId: string) => void;
  onReply?: (messageId: string) => void;
}

export const MessageActionsMenu = memo(function MessageActionsMenu({
  messageId,
  messageTimestamp,
  isOutbound,
  hasDownloadableMedia,
  onDelete,
  onDownload,
  onReply,
}: MessageActionsMenuProps) {
  const t = useTranslations("chats");
  // Track if reply was clicked to prevent focus return to trigger
  const replyClickedRef = useRef(false);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button className="p-1 transition-colors text-current">
          <ChevronDown className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-36"
        onCloseAutoFocus={(e) => {
          // Prevent focus from returning to trigger when reply was clicked
          // This allows the message input to keep focus
          if (replyClickedRef.current) {
            e.preventDefault();
            replyClickedRef.current = false;
          }
        }}
      >
        {onReply && (
          <DropdownMenuItem
            onClick={() => {
              replyClickedRef.current = true;
              onReply(messageId);
            }}
          >
            <Reply className="h-4 w-4 mr-2" />
            {t("replyMessage")}
          </DropdownMenuItem>
        )}
        {hasDownloadableMedia && onDownload && (
          <DropdownMenuItem onClick={() => onDownload(messageId)}>
            <Download className="h-4 w-4 mr-2" />
            {t("downloadMessage")}
          </DropdownMenuItem>
        )}
        {isOutbound && onDelete && (
          <DropdownMenuItem
            onClick={() => onDelete(messageId)}
            className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
          >
            {t("deleteMessage")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

MessageActionsMenu.displayName = "MessageActionsMenu";
