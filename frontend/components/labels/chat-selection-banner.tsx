"use client";

/**
 * Chat Selection Banner
 * A banner that appears when selection mode is active
 * Shows number of selected chats and action buttons
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckSquare, Tag, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";

interface ChatSelectionBannerProps {
  selectedCount: number;
  onCancel: () => void;
  onLabel: () => void;
  onDelete?: () => void;
  className?: string;
}

/**
 * Banner displayed during chat selection mode
 * Shows count and provides bulk action buttons
 */
export function ChatSelectionBanner({
  selectedCount,
  onCancel,
  onLabel,
  onDelete,
  className,
}: ChatSelectionBannerProps) {
  const t = useTranslations("labels");
  const tc = useTranslations("common");

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 bg-primary text-primary-foreground",
        "animate-in slide-in-from-top duration-200",
        className,
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onCancel}
        className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
      >
        <X className="h-4 w-4" />
      </Button>

      <div className="flex-1 flex items-center gap-2">
        <CheckSquare className="h-4 w-4" />
        <span className="font-medium">
          {t("chatsSelected", { count: selectedCount })}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onLabel}
          className="text-primary-foreground hover:bg-primary-foreground/20 gap-2"
          disabled={selectedCount === 0}
        >
          <Tag className="h-4 w-4" />
          {t("labelChats")}
        </Button>

        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-primary-foreground hover:bg-destructive/80 gap-2"
            disabled={selectedCount === 0}
          >
            <Trash2 className="h-4 w-4" />
            {tc("delete")}
          </Button>
        )}
      </div>
    </div>
  );
}

interface SelectionCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

/**
 * Checkbox for selecting individual chats
 * Used in chat list items during selection mode
 */
export function SelectionCheckbox({
  checked,
  onChange,
  className,
}: SelectionCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        "flex items-center justify-center w-5 h-5 rounded border-2 transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        checked
          ? "bg-primary border-primary"
          : "border-muted-foreground/50 hover:border-primary",
        className,
      )}
    >
      {checked && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3.5 h-3.5 text-primary-foreground"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}
