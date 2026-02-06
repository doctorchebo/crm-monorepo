"use client";

import { GlobalActivityPanel } from "@/components/ui/global-activity-panel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useTranslations } from "next-intl";

export interface ActivityHistorySheetProps {
  /** Whether the sheet is open */
  open: boolean;
  /** Callback when the open state changes */
  onOpenChange: (open: boolean) => void;
  /** Callback when a chat is clicked in the activity panel */
  onChatClick?: (chatId: string) => void;
  /** Initial page size for pagination */
  pageSize?: number;
  /** Whether to show date range filter */
  showDateFilter?: boolean;
  /** Optional chat ID to filter history */
  chatId?: string;
  /** Side from which the sheet slides in */
  side?: "left" | "right";
  /** Width of the sheet content */
  width?: string;
}

/**
 * A reusable sheet component that displays activity history in a slide-in panel.
 * Uses the GlobalActivityPanel internally with pagination support.
 *
 * @example
 * ```tsx
 * <ActivityHistorySheet
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   onChatClick={(chatId) => router.push(`/chats/${chatId}`)}
 *   showDateFilter
 * />
 * ```
 */
export function ActivityHistorySheet({
  open,
  onOpenChange,
  onChatClick,
  pageSize = 20,
  showDateFilter = true,
  chatId,
  side = "right",
  width = "w-[400px] sm:max-w-[400px]",
}: ActivityHistorySheetProps) {
  const t = useTranslations("kanban");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className={`${width} p-0 flex flex-col`}>
        <SheetHeader className="px-4 pt-4 pb-2 border-b shrink-0">
          <SheetTitle>{t("activityHistory")}</SheetTitle>
          <SheetDescription>{t("activityHistoryDescription")}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          <GlobalActivityPanel
            usePagination
            showDateFilter={showDateFilter}
            pageSize={pageSize}
            onChatClick={(id) => {
              onChatClick?.(id);
              onOpenChange(false);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
