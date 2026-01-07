"use client";

/**
 * AI Message Indicator Component
 * Shows a visual badge for AI-generated messages
 *
 * Features:
 * - Sparkle icon indicating AI generation
 * - Tooltip with provider/model info
 * - Visual indicator for manually overridden messages
 */

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Bot, Edit3, Sparkles } from "lucide-react";

interface AIMessageIndicatorProps {
  isAiGenerated: boolean;
  aiModel?: string;
  aiProvider?: string;
  wasManuallyOverridden?: boolean;
  isOutbound?: boolean;
  className?: string;
  size?: "sm" | "md";
}

export function AIMessageIndicator({
  isAiGenerated,
  aiModel,
  aiProvider,
  wasManuallyOverridden,
  isOutbound = true,
  className,
  size = "sm",
}: AIMessageIndicatorProps) {
  // Don't render if not AI generated
  if (!isAiGenerated) return null;

  const iconSize = size === "sm" ? "h-3 w-3" : "h-4 w-4";

  // Build tooltip text
  const tooltipParts: string[] = [];

  if (aiProvider) {
    tooltipParts.push(`Provider: ${aiProvider}`);
  }
  if (aiModel) {
    tooltipParts.push(`Model: ${aiModel}`);
  }
  if (wasManuallyOverridden) {
    tooltipParts.push("• Edited before sending");
  }

  const tooltipText =
    tooltipParts.length > 0 ? tooltipParts.join(" | ") : "AI Generated";

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-0.5",
              isOutbound
                ? "text-primary-foreground/70"
                : "text-muted-foreground",
              className
            )}
          >
            <Sparkles className={cn(iconSize, "shrink-0")} />
            {wasManuallyOverridden && (
              <Edit3 className={cn(iconSize, "shrink-0 opacity-70")} />
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="flex items-center gap-1.5 text-xs"
        >
          <Bot className="h-3 w-3" />
          <span>{tooltipText}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * AI Badge - A more prominent indicator for the message list
 */
interface AIBadgeProps {
  aiProvider?: string;
  aiModel?: string;
  wasManuallyOverridden?: boolean;
  className?: string;
}

export function AIBadge({
  aiProvider,
  aiModel,
  wasManuallyOverridden,
  className,
}: AIBadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full",
        "bg-violet-500/10 text-violet-600 dark:text-violet-400",
        "text-[10px] font-medium",
        className
      )}
    >
      <Sparkles className="h-2.5 w-2.5" />
      <span>AI</span>
      {aiProvider && <span className="opacity-70">• {aiProvider}</span>}
      {wasManuallyOverridden && <span className="opacity-70">• edited</span>}
    </div>
  );
}
