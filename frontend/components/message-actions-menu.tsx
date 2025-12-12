"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Download } from "lucide-react";
import { useTranslations } from "next-intl";

interface MessageActionsMenuProps {
  messageId: string;
  messageTimestamp: string;
  isOutbound: boolean;
  onDelete?: (messageId: string) => void;
  onDownload?: () => void;
}

export function MessageActionsMenu({
  messageId,
  messageTimestamp,
  isOutbound,
  onDelete,
  onDownload,
}: MessageActionsMenuProps) {
  const t = useTranslations("chats");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="p-1 hover:bg-white/20 rounded transition-colors text-current">
          <ChevronDown className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {onDownload && (
          <DropdownMenuItem onClick={onDownload}>
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
}
