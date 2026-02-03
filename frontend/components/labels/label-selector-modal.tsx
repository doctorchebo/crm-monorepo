"use client";

import { Button } from "@/components/ui/button";
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
import type { LabelResponse } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { Check, Loader2, Plus, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LabelColorDot } from "./label-color-picker";
import { getNextAvailableColor } from "./label-colors";

interface LabelSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All available labels */
  labels: LabelResponse[];
  /** Currently selected label IDs */
  selectedLabelIds: string[];
  /** Loading state for the labels list */
  isLoading?: boolean;
  /** Callback when selection changes - called with full array of selected label IDs */
  onSelectionChange: (labelIds: string[]) => void;
  /** Callback to create a new label (optional) */
  onCreateLabel?: (
    name: string,
    color: string,
  ) => Promise<LabelResponse | null>;
  /** Callback when user confirms selection - can be async */
  onConfirm?: () => void | Promise<void>;
  /** Title override */
  title?: string;
  /** Description override */
  description?: string;
  /** Whether to show confirm button (false for instant apply mode) */
  showConfirmButton?: boolean;
}

/**
 * A modal for selecting labels to apply to chats
 * Supports multi-selection, search, and inline label creation
 */
export function LabelSelectorModal({
  open,
  onOpenChange,
  labels,
  selectedLabelIds,
  isLoading = false,
  onSelectionChange,
  onCreateLabel,
  onConfirm,
  title,
  description,
  showConfirmButton = true,
}: LabelSelectorModalProps) {
  const t = useTranslations("labels");
  const tc = useTranslations("common");

  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setIsCreating(false);
      setNewLabelName("");
    }
  }, [open]);

  // Filter labels based on search
  const filteredLabels = useMemo(() => {
    if (!searchQuery.trim()) return labels;
    const query = searchQuery.toLowerCase();
    return labels.filter(
      (label) =>
        label.name.toLowerCase().includes(query) ||
        label.description?.toLowerCase().includes(query),
    );
  }, [labels, searchQuery]);

  // Check if a label is selected
  const isLabelSelected = useCallback(
    (labelId: string) => selectedLabelIds.includes(labelId),
    [selectedLabelIds],
  );

  // Toggle label selection
  const toggleLabel = useCallback(
    (labelId: string) => {
      if (isLabelSelected(labelId)) {
        onSelectionChange(selectedLabelIds.filter((id) => id !== labelId));
      } else {
        onSelectionChange([...selectedLabelIds, labelId]);
      }
    },
    [isLabelSelected, selectedLabelIds, onSelectionChange],
  );

  // Get next available color for new label
  const nextColor = useMemo(() => {
    const usedColors = labels.map((l) => l.color);
    return getNextAvailableColor(usedColors);
  }, [labels]);

  // Handle create new label
  const handleCreateLabel = useCallback(async () => {
    if (!newLabelName.trim() || !onCreateLabel) return;

    setIsCreating(true);
    try {
      const newLabel = await onCreateLabel(newLabelName.trim(), nextColor);
      if (newLabel) {
        // Auto-select the new label
        onSelectionChange([...selectedLabelIds, newLabel.id]);
        setNewLabelName("");
      }
    } finally {
      setIsCreating(false);
    }
  }, [
    newLabelName,
    onCreateLabel,
    nextColor,
    selectedLabelIds,
    onSelectionChange,
  ]);

  // Handle confirm
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = useCallback(async () => {
    if (!onConfirm) {
      onOpenChange(false);
      return;
    }

    setIsConfirming(true);
    try {
      await onConfirm();
      // Modal will be closed by the onConfirm handler after success
    } catch (error) {
      console.error("Failed to apply labels:", error);
      // Keep modal open on error so user can retry
    } finally {
      setIsConfirming(false);
    }
  }, [onConfirm, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title || t("selectLabels")}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("searchLabels")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* New label button/input */}
          {onCreateLabel && (
            <div className="flex items-center gap-2">
              {newLabelName ? (
                <>
                  <LabelColorDot color={nextColor} size="md" />
                  <Input
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    placeholder={t("newLabelName")}
                    className="flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreateLabel();
                      } else if (e.key === "Escape") {
                        setNewLabelName("");
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={handleCreateLabel}
                    disabled={isCreating || !newLabelName.trim()}
                  >
                    {isCreating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setNewLabelName("")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => setNewLabelName(" ")}
                >
                  <Plus className="h-4 w-4" />
                  {t("createNewLabel")}
                </Button>
              )}
            </div>
          )}

          {/* Labels list */}
          <ScrollArea className="h-[280px] -mx-2 px-2">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredLabels.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                {searchQuery ? (
                  <p className="text-sm">{t("noLabelsFound")}</p>
                ) : (
                  <p className="text-sm">{t("noLabelsYet")}</p>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredLabels.map((label) => {
                  const isSelected = isLabelSelected(label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      onClick={() => toggleLabel(label.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                        "hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring",
                        isSelected && "bg-accent",
                      )}
                    >
                      <div
                        className={cn(
                          "flex items-center justify-center w-5 h-5 rounded border-2 transition-colors",
                          isSelected
                            ? "border-primary bg-primary"
                            : "border-muted-foreground/30",
                        )}
                      >
                        {isSelected && (
                          <Check className="h-3.5 w-3.5 text-primary-foreground" />
                        )}
                      </div>
                      <LabelColorDot color={label.color} size="md" />
                      <span className="flex-1 text-left truncate">
                        {label.emoji && (
                          <span className="mr-1.5">{label.emoji}</span>
                        )}
                        {label.name}
                      </span>
                      {label.isSystem && (
                        <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                          {t("system")}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter className="sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {selectedLabelIds.length > 0
              ? t("labelsSelected", { count: selectedLabelIds.length })
              : t("noLabelsSelected")}
          </p>
          {showConfirmButton && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isConfirming}
              >
                {tc("cancel")}
              </Button>
              <Button onClick={handleConfirm} disabled={isConfirming}>
                {isConfirming ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {tc("apply")}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
