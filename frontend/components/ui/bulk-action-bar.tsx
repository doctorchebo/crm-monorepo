"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";

export interface BulkActionBarProps {
  /** Number of selected items */
  selectedCount: number;
  /** Callback to clear all selections */
  onClearSelection: () => void;
  /** Callback when delete is clicked. Omit to hide the delete button. */
  onDelete?: () => void;
  /** Additional action buttons rendered in the right side */
  extraActions?: React.ReactNode;
}

/**
 * Shared bulk action bar that appears when items are selected.
 * Provides a consistent selection feedback pattern across all list pages.
 */
export function BulkActionBar({
  selectedCount,
  onClearSelection,
  onDelete,
  extraActions,
}: BulkActionBarProps) {
  const t = useTranslations("common");

  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg border animate-in fade-in slide-in-from-top-1">
      <div className="flex items-center gap-4 px-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClearSelection}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">
          {t("selected", { count: selectedCount })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {extraActions}
        {onDelete && (
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            className="h-8"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t("delete")}
          </Button>
        )}
      </div>
    </div>
  );
}

export interface SelectAllHeaderProps {
  /** Whether all current page items are selected */
  isAllSelected: boolean;
  /** Toggle select all */
  onToggleSelectAll: () => void;
  /** Label text */
  label?: string;
}

/**
 * Select-all checkbox header shown when in selection mode.
 */
export function SelectAllHeader({
  isAllSelected,
  onToggleSelectAll,
  label,
}: SelectAllHeaderProps) {
  const t = useTranslations("common");

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b mb-2">
      <Checkbox
        checked={isAllSelected}
        onCheckedChange={onToggleSelectAll}
        aria-label={label || t("selectAll")}
      />
      <span className="text-sm text-muted-foreground">
        {label || t("selectAll")}
      </span>
    </div>
  );
}
