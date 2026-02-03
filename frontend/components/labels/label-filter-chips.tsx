"use client";

/**
 * Label Filter Chips
 * A chip-based filter for filtering chats by label
 *
 * Features:
 * - "All" chip to show all chats (removes filter)
 * - "Labels" chip with dropdown to select a label for filtering
 * - Clean and intuitive UX matching WhatsApp style
 */

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LabelResponse } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { LabelColorDot } from "./label-color-picker";

interface LabelFilterChipsProps {
  labels: LabelResponse[];
  selectedLabelId: string | null;
  onSelectLabel: (labelId: string | null) => void;
  className?: string;
}

/**
 * Chip-based filter for labels
 * "All" chip always visible, "Labels" chip with dropdown
 */
export function LabelFilterChips({
  labels,
  selectedLabelId,
  onSelectLabel,
  className,
}: LabelFilterChipsProps) {
  const t = useTranslations("labels");

  const selectedLabel = selectedLabelId
    ? labels.find((l) => l.id === selectedLabelId)
    : null;

  const isAllSelected = !selectedLabelId;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* All Chip */}
      <Button
        variant={isAllSelected ? "default" : "outline"}
        size="sm"
        className={cn(
          "h-7 px-3 text-xs font-medium rounded-full",
          isAllSelected && "bg-primary text-primary-foreground",
        )}
        onClick={() => onSelectLabel(null)}
      >
        {t("all")}
      </Button>

      {/* Labels Dropdown Chip */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={selectedLabelId ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-7 px-3 text-xs font-medium rounded-full gap-1.5",
              selectedLabelId && "bg-primary text-primary-foreground",
            )}
          >
            {selectedLabel ? (
              <>
                <LabelColorDot color={selectedLabel.color} size="sm" />
                {selectedLabel.emoji && (
                  <span className="mr-0.5">{selectedLabel.emoji}</span>
                )}
                <span className="truncate max-w-[80px]">
                  {selectedLabel.name}
                </span>
              </>
            ) : (
              <span>{t("labels")}</span>
            )}
            <ChevronDown className="h-3 w-3 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-56 max-h-[300px] overflow-y-auto"
        >
          {labels.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              {t("noLabelsYet")}
            </div>
          ) : (
            labels.map((label) => (
              <DropdownMenuItem
                key={label.id}
                onClick={() => onSelectLabel(label.id)}
                className="gap-2 cursor-pointer"
              >
                <div className="w-4 flex justify-center">
                  {selectedLabelId === label.id && (
                    <Check className="h-3.5 w-3.5" />
                  )}
                </div>
                <LabelColorDot color={label.color} size="sm" />
                <span className="flex-1 truncate">
                  {label.emoji && <span className="mr-1">{label.emoji}</span>}
                  {label.name}
                </span>
                {label.isSystem && (
                  <span className="text-xs text-muted-foreground">
                    {t("system")}
                  </span>
                )}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
