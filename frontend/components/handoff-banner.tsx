"use client";

/**
 * Handoff Banner Component
 * Displays at the top of chat when human intervention is needed
 *
 * Features:
 * - Visual alert for pending handoff requests
 * - Priority level indicators
 * - Quick action buttons (resolve, resume AI)
 * - Reason/context display
 */

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle,
  Clock,
  Hand,
  Loader2,
  PauseCircle,
  PlayCircle,
  User,
  XCircle,
} from "lucide-react";
import { useState } from "react";

export type HandoffPriority = "low" | "medium" | "high" | "critical";
export type HandoffStatus =
  | "pending"
  | "acknowledged"
  | "in_progress"
  | "resolved"
  | "escalated";

interface HandoffBannerProps {
  chatId: string;
  priority: HandoffPriority;
  status: HandoffStatus;
  reason?: string;
  aiReasoning?: string;
  triggeredAt: string;
  acknowledgedAt?: string;
  isAIPaused: boolean;
  onResolve?: () => Promise<void>;
  onResolveManual?: () => Promise<void>;
  onAcknowledge?: () => Promise<void>;
  onResumeAI?: () => Promise<void>;
  onPauseAI?: () => Promise<void>;
  onDismiss?: () => void;
  className?: string;
}

const priorityConfig: Record<
  HandoffPriority,
  { color: string; bgColor: string; icon: typeof AlertTriangle }
> = {
  low: {
    color: "text-blue-600 dark:text-blue-400",
    bgColor:
      "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
    icon: Clock,
  },
  medium: {
    color: "text-amber-600 dark:text-amber-400",
    bgColor:
      "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
    icon: AlertTriangle,
  },
  high: {
    color: "text-orange-600 dark:text-orange-400",
    bgColor:
      "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800",
    icon: AlertTriangle,
  },
  critical: {
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
    icon: XCircle,
  },
};

const statusLabels: Record<
  HandoffStatus,
  { label: string; icon: typeof Clock }
> = {
  pending: { label: "Pending", icon: Clock },
  acknowledged: { label: "Acknowledged", icon: CheckCircle },
  in_progress: { label: "In Progress", icon: ArrowRight },
  resolved: { label: "Resolved", icon: CheckCircle },
  escalated: { label: "Escalated", icon: AlertTriangle },
};

export function HandoffBanner({
  priority,
  status,
  reason,
  aiReasoning,
  triggeredAt,
  acknowledgedAt,
  isAIPaused,
  onResolve,
  onResolveManual,
  onAcknowledge,
  onResumeAI,
  onPauseAI,
  onDismiss,
  className,
}: HandoffBannerProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const config = priorityConfig[priority];
  const statusConfig = statusLabels[status];
  const PriorityIcon = config.icon;
  const StatusIcon = statusConfig.icon;

  const handleAction = async (
    action: () => Promise<void>,
    actionName: string
  ) => {
    setIsLoading(actionName);
    try {
      await action();
    } finally {
      setIsLoading(null);
    }
  };

  // Format time since triggered
  const timeSince = formatTimeSince(new Date(triggeredAt));

  // Don't show banner if resolved
  if (status === "resolved") return null;

  return (
    <Card className={cn("border-l-4 shadow-sm", config.bgColor, className)}>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "p-1.5 rounded-full",
                config.color,
                "bg-background/50"
              )}
            >
              <Hand className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                Human Intervention Required
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] uppercase font-bold",
                    config.color,
                    "bg-background/50"
                  )}
                >
                  {priority}
                </span>
              </CardTitle>
              <CardDescription className="text-xs flex items-center gap-2 mt-0.5">
                <StatusIcon className="h-3 w-3" />
                {statusConfig.label} • {timeSince}
              </CardDescription>
            </div>
          </div>

          {/* AI Status indicator */}
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                    isAIPaused
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                      : "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                  )}
                >
                  {isAIPaused ? (
                    <>
                      <PauseCircle className="h-3 w-3" />
                      <span>AI Paused</span>
                    </>
                  ) : (
                    <>
                      <Bot className="h-3 w-3" />
                      <span>AI Active</span>
                    </>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {isAIPaused
                  ? "AI responses are paused for this chat"
                  : "AI is actively handling this chat"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-3 pt-0">
        {/* Reason / Context */}
        {(reason || aiReasoning) && (
          <div className="mb-3 space-y-1.5">
            {reason && (
              <div className="flex items-start gap-2 text-xs">
                <User className="h-3 w-3 mt-0.5 shrink-0 opacity-70" />
                <span className="opacity-90">{reason}</span>
              </div>
            )}
            {aiReasoning && (
              <div className="flex items-start gap-2 text-xs">
                <Bot className="h-3 w-3 mt-0.5 shrink-0 opacity-70" />
                <span className="opacity-70 italic">{aiReasoning}</span>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Acknowledge button - only show for pending status */}
          {status === "pending" && onAcknowledge && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction(onAcknowledge, "acknowledge")}
              disabled={isLoading !== null}
              className="h-7 text-xs"
            >
              {isLoading === "acknowledge" ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <CheckCircle className="h-3 w-3 mr-1" />
              )}
              Acknowledge
            </Button>
          )}

          {/* Resolve button */}
          {onResolve && (
            <Button
              size="sm"
              onClick={() => handleAction(onResolve, "resolve")}
              disabled={isLoading !== null}
              className="h-7 text-xs"
            >
              {isLoading === "resolve" ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <CheckCircle className="h-3 w-3 mr-1" />
              )}
              Resolve & Resume AI
            </Button>
          )}

          {/* Resolve (Manual) button - Keep AI paused */}
          {onResolveManual && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction(onResolveManual, "resolveManual")}
              disabled={isLoading !== null}
              className="h-7 text-xs"
            >
              {isLoading === "resolveManual" ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <User className="h-3 w-3 mr-1" />
              )}
              Resolve (Manual)
            </Button>
          )}

          {/* Pause/Resume AI toggle */}
          {isAIPaused && onResumeAI ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleAction(onResumeAI, "resumeAI")}
              disabled={isLoading !== null}
              className="h-7 text-xs text-green-600 hover:text-green-700 hover:bg-green-50"
            >
              {isLoading === "resumeAI" ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <PlayCircle className="h-3 w-3 mr-1" />
              )}
              Resume AI
            </Button>
          ) : onPauseAI ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleAction(onPauseAI, "pauseAI")}
              disabled={isLoading !== null}
              className="h-7 text-xs text-gray-600 hover:text-gray-700"
            >
              {isLoading === "pauseAI" ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <PauseCircle className="h-3 w-3 mr-1" />
              )}
              Pause AI
            </Button>
          ) : null}

          {/* Dismiss (only for low priority acknowledged ones) */}
          {onDismiss && status === "acknowledged" && priority === "low" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDismiss}
              className="h-7 text-xs opacity-70"
            >
              Dismiss
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Compact Handoff Indicator - For chat list items
 */
interface HandoffIndicatorProps {
  priority: HandoffPriority;
  className?: string;
}

export function HandoffIndicator({
  priority,
  className,
}: HandoffIndicatorProps) {
  const config = priorityConfig[priority];

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex items-center justify-center h-5 w-5 rounded-full",
              config.color,
              "bg-background border",
              className
            )}
          >
            <Hand className="h-3 w-3" />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          Human intervention needed ({priority} priority)
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Helper to format time since
function formatTimeSince(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
