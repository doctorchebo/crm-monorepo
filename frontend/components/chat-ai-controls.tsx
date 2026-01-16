"use client";

/**
 * Chat Header AI Controls
 * Toggle AI on/off, request handoff, and view AI status
 *
 * Features:
 * - AI toggle switch
 * - Handoff request button
 * - Visual status indicator
 * - Quick actions dropdown
 * - AI configuration modal
 */

import { ChatAiConfigModal } from "@/components/chat-ai-config-modal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Bot,
  Hand,
  Loader2,
  MoreVertical,
  PauseCircle,
  PlayCircle,
  Settings,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

interface ChatAIControlsProps {
  chatId: string;
  chatName?: string;
  isAIPaused: boolean;
  hasActiveHandoff: boolean;
  handoffPriority?: "low" | "medium" | "high" | "critical";
  isLoading?: boolean;
  isRateLimited?: boolean; // Disable toggle when rate limited
  onToggleAI: (enabled: boolean) => Promise<void>;
  onRequestHandoff: () => Promise<void>;
  onResolveHandoff?: () => Promise<void>;
  onConfigSaved?: () => void;
  // Controlled modal state
  isConfigModalOpen?: boolean;
  onOpenConfigModal?: (open: boolean) => void;
  aiConfigEnabled?: boolean;
  className?: string;
}

export function ChatAIControls({
  chatId,
  chatName,
  isAIPaused,
  hasActiveHandoff,
  handoffPriority,
  isLoading = false,
  isRateLimited = false,
  onToggleAI,
  onRequestHandoff,
  onResolveHandoff,
  onConfigSaved,
  isConfigModalOpen: controlledIsOpen,
  onOpenConfigModal: controlledOnOpenChange,
  aiConfigEnabled = true,
  className,
}: ChatAIControlsProps) {
  const [isToggling, setIsToggling] = useState(false);
  const [isRequestingHandoff, setIsRequestingHandoff] = useState(false);
  const [internalIsConfigModalOpen, setInternalIsConfigModalOpen] = useState(false);

  const isConfigModalOpen = controlledIsOpen ?? internalIsConfigModalOpen;
  const setIsConfigModalOpen = controlledOnOpenChange ?? setInternalIsConfigModalOpen;

  const handleToggleAI = async () => {
    setIsToggling(true);
    try {
      // If AI is currently paused (isAIPaused=true), we want to enable it (pass true)
      // If AI is currently active (isAIPaused=false), we want to disable/pause it (pass false)
      await onToggleAI(isAIPaused);
    } finally {
      setIsToggling(false);
    }
  };

  const handleRequestHandoff = async () => {
    setIsRequestingHandoff(true);
    try {
      await onRequestHandoff();
    } finally {
      setIsRequestingHandoff(false);
    }
  };

  const handleConfigSaved = () => {
    onConfigSaved?.();
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* AI Status indicator with toggle - ONLY VISIBLE IF CONFIG ENABLED */}
      {aiConfigEnabled && (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5">
                <div
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors",
                    isAIPaused
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                      : "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400"
                  )}
                >
                  {isToggling || isLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : isAIPaused ? (
                    <PauseCircle className="h-3 w-3" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  <span className="hidden sm:inline">
                    {isAIPaused ? "Paused" : "AI Active"}
                  </span>
                </div>
                <Switch
                  checked={!isAIPaused}
                  onCheckedChange={() => handleToggleAI()}
                  disabled={isToggling || isLoading || isRateLimited}
                  className="scale-75"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {isAIPaused
                ? "AI responses are paused. Click to resume."
                : "AI is actively responding. Click to pause."}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Handoff button/indicator - ONLY VISIBLE IF CONFIG ENABLED */}
      {aiConfigEnabled && hasActiveHandoff ? (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={onResolveHandoff}
                className={cn(
                  "h-7 gap-1",
                  handoffPriority === "critical" &&
                  "border-red-500 text-red-600",
                  handoffPriority === "high" &&
                  "border-orange-500 text-orange-600",
                  handoffPriority === "medium" &&
                  "border-amber-500 text-amber-600"
                )}
              >
                <Hand className="h-3 w-3" />
                <span className="hidden sm:inline">Handoff Active</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Human intervention requested ({handoffPriority} priority). Click
              to resolve.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : aiConfigEnabled && !isAIPaused ? (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRequestHandoff}
                disabled={isRequestingHandoff || isLoading}
                className="h-7 gap-1"
              >
                {isRequestingHandoff ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Hand className="h-3 w-3" />
                )}
                <span className="hidden sm:inline">Request Handoff</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Request human intervention for this chat
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}

      {/* More options dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="text-xs">AI Controls</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {aiConfigEnabled && (
            <>
              <DropdownMenuItem onClick={() => handleToggleAI()}>
                {isAIPaused ? (
                  <>
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Resume AI
                  </>
                ) : (
                  <>
                    <PauseCircle className="h-4 w-4 mr-2" />
                    Pause AI
                  </>
                )}
              </DropdownMenuItem>
              {!isAIPaused && (
                <DropdownMenuItem onClick={handleRequestHandoff}>
                  <Hand className="h-4 w-4 mr-2" />
                  Request Handoff
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={() => setIsConfigModalOpen(true)}>
            <Settings className="h-4 w-4 mr-2" />
            AI Settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* AI Configuration Modal */}
      <ChatAiConfigModal
        chatId={chatId}
        chatName={chatName}
        open={isConfigModalOpen}
        onOpenChange={setIsConfigModalOpen}
        onSaved={handleConfigSaved}
      />
    </div>
  );
}

/**
 * Minimal AI Toggle - Just the switch
 */
interface AIToggleProps {
  isAIPaused: boolean;
  isLoading?: boolean;
  onChange: (enabled: boolean) => void;
  className?: string;
}

export function AIToggle({
  isAIPaused,
  isLoading,
  onChange,
  className,
}: AIToggleProps) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center gap-1.5", className)}>
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : (
              <Bot
                className={cn(
                  "h-3 w-3",
                  isAIPaused ? "text-muted-foreground" : "text-violet-500"
                )}
              />
            )}
            <Switch
              checked={!isAIPaused}
              onCheckedChange={(checked) => onChange(!checked)}
              disabled={isLoading}
              className="scale-75"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {isAIPaused ? "AI is paused" : "AI is active"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * AI Status Badge for chat list
 */
interface ChatAIStatusBadgeProps {
  isAIPaused: boolean;
  hasActiveHandoff: boolean;
  handoffPriority?: "low" | "medium" | "high" | "critical";
  className?: string;
}

export function ChatAIStatusBadge({
  isAIPaused,
  hasActiveHandoff,
  handoffPriority,
  className,
}: ChatAIStatusBadgeProps) {
  if (hasActiveHandoff) {
    const priorityColors = {
      low: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
      medium:
        "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
      high: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
      critical: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    };

    return (
      <div
        className={cn(
          "flex items-center justify-center h-5 w-5 rounded-full",
          priorityColors[handoffPriority || "medium"],
          className
        )}
      >
        <Hand className="h-3 w-3" />
      </div>
    );
  }

  if (isAIPaused) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-5 w-5 rounded-full",
          "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
          className
        )}
      >
        <PauseCircle className="h-3 w-3" />
      </div>
    );
  }

  // AI is active - show sparkle
  return (
    <div
      className={cn(
        "flex items-center justify-center h-5 w-5 rounded-full",
        "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
        className
      )}
    >
      <Sparkles className="h-3 w-3" />
    </div>
  );
}
