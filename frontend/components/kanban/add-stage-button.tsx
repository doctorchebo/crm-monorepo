"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

interface AddStageButtonProps {
  /** Click handler */
  onClick: () => void;
  /** Position indicator for accessibility */
  position: "start" | "middle" | "end";
  /** Whether in edit mode (only visible in edit mode) */
  isEditMode?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * Add Stage Button
 *
 * Displays a circular "+" button for adding new stages.
 * - Shows at the start, between stages, or at the end
 * - Only visible in edit mode
 * - Has tooltip explaining action
 */
export const AddStageButton = memo(function AddStageButton({
  onClick,
  position,
  isEditMode = true,
  className,
}: AddStageButtonProps) {
  const t = useTranslations("kanban");

  if (!isEditMode) return null;

  const getTooltipText = () => {
    switch (position) {
      case "start":
        return t("addStageAtStart");
      case "end":
        return t("addStageAtEnd");
      default:
        return t("addStageBetween");
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            onClick={onClick}
            className={cn(
              "h-10 w-10 rounded-full shrink-0",
              "border-dashed border-2 border-muted-foreground/30",
              "hover:border-primary hover:bg-primary/10",
              "transition-all duration-200",
              className,
            )}
          >
            <Plus className="h-5 w-5 text-muted-foreground" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{getTooltipText()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

/**
 * Vertical Add Stage Divider
 *
 * A full-height divider that shows "+" on hover for adding stages between columns
 */
export const AddStageDivider = memo(function AddStageDivider({
  onClick,
  isEditMode = true,
}: {
  onClick: () => void;
  isEditMode?: boolean;
}) {
  const t = useTranslations("kanban");

  if (!isEditMode) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            onClick={onClick}
            className={cn(
              "group flex items-center justify-center",
              "w-6 min-h-[200px] shrink-0 cursor-pointer",
              "transition-all duration-200",
            )}
          >
            <div
              className={cn(
                "flex items-center justify-center",
                "w-6 h-6 rounded-full",
                "bg-transparent border-2 border-dashed border-transparent",
                "group-hover:border-primary group-hover:bg-primary/10",
                "transition-all duration-200",
              )}
            >
              <Plus
                className={cn(
                  "h-4 w-4 text-transparent",
                  "group-hover:text-primary",
                  "transition-all duration-200",
                )}
              />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{t("addStageBetween")}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
