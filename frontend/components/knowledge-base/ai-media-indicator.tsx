/**
 * AI Media Indicator Component
 *
 * Displays information about AI-sent media in chat messages, including
 * the reason for sending and feedback controls.
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  kbMediaApi,
  type MediaDecisionAudit,
  type MediaFeedbackType,
} from "@/lib/api/kb-media";
import {
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  FileImage,
  Loader2,
  MessageSquare,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import useSWR from "swr";

interface AiMediaIndicatorProps {
  messageId: string;
  variant?: "inline" | "badge" | "tooltip";
  showFeedback?: boolean;
  className?: string;
}

/**
 * Compact inline indicator showing this media was AI-selected
 */
export function AiMediaIndicator({
  messageId,
  variant = "badge",
  showFeedback = true,
  className,
}: AiMediaIndicatorProps) {
  const t = useTranslations("knowledgeBase.aiMedia");
  const [isOpen, setIsOpen] = useState(false);

  // Fetch the decision audit for this message
  const {
    data: decision,
    isLoading,
    mutate,
  } = useSWR<MediaDecisionAudit | null>(
    messageId ? ["media-decision", messageId] : null,
    () => kbMediaApi.getMessageDecision(messageId),
    { revalidateOnFocus: false }
  );

  // If no decision found or media wasn't sent, don't show anything
  if (isLoading) {
    return variant === "badge" ? (
      <Badge variant="outline" className={className}>
        <Loader2 className="h-3 w-3 animate-spin" />
      </Badge>
    ) : null;
  }

  if (!decision || !decision.mediaSent) {
    return null;
  }

  if (variant === "tooltip") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`inline-flex items-center gap-1 ${className}`}>
              <Bot className="h-3 w-3 text-muted-foreground" />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-xs text-xs">{decision.selectionReason}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (variant === "inline") {
    return (
      <span className={`text-xs text-muted-foreground ${className}`}>
        <Bot className="h-3 w-3 inline mr-1" />
        {t("aiSelected")}
      </span>
    );
  }

  // Default: badge with popover
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Badge
          variant="secondary"
          className={`cursor-pointer gap-1 ${className}`}
        >
          <Bot className="h-3 w-3" />
          {t("aiSelected")}
          <ChevronDown className="h-3 w-3" />
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <AiMediaDecisionDetails
          decision={decision}
          showFeedback={showFeedback}
          onFeedbackSubmit={() => mutate()}
        />
      </PopoverContent>
    </Popover>
  );
}

interface AiMediaDecisionDetailsProps {
  decision: MediaDecisionAudit;
  showFeedback?: boolean;
  onFeedbackSubmit?: () => void;
}

/**
 * Detailed view of an AI media decision
 */
export function AiMediaDecisionDetails({
  decision,
  showFeedback = true,
  onFeedbackSubmit,
}: AiMediaDecisionDetailsProps) {
  const t = useTranslations("knowledgeBase.aiMedia");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const handleFeedback = async (type: MediaFeedbackType) => {
    setFeedbackSubmitting(true);
    setFeedbackError(null);

    try {
      await kbMediaApi.submitFeedback(decision.id, type);
      setFeedbackSubmitted(true);
      onFeedbackSubmit?.();
    } catch (err) {
      console.error("Failed to submit feedback:", err);
      setFeedbackError(t("feedbackError"));
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-primary" />
        <span className="font-medium">{t("decisionTitle")}</span>
      </div>

      {/* Reason */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">{t("reason")}</p>
        <p className="text-sm">{decision.selectionReason}</p>
      </div>

      {/* User Intent */}
      {decision.userIntent && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("detectedIntent")}</p>
          <p className="text-sm">{decision.userIntent}</p>
        </div>
      )}

      {/* Confidence Score */}
      {decision.similarityScore !== null && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("confidence")}</span>
          <Badge variant="outline">
            {Math.round(
              (decision.rankingScore || decision.similarityScore) * 100
            )}
            %
          </Badge>
        </div>
      )}

      {/* Guardrails Applied */}
      {decision.guardrailsApplied && decision.guardrailsApplied.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("guardrails")}</p>
          <div className="flex flex-wrap gap-1">
            {decision.guardrailsApplied.map((guardrail, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                <Check className="h-3 w-3 mr-1 text-green-500" />
                {guardrail}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Timestamp */}
      <p className="text-xs text-muted-foreground">
        {new Date(decision.timestamp).toLocaleString()}
      </p>

      {/* Feedback Section */}
      {showFeedback && !feedbackSubmitted && (
        <div className="pt-2 border-t space-y-2">
          <p className="text-xs text-muted-foreground">{t("feedbackPrompt")}</p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleFeedback("correct")}
              disabled={feedbackSubmitting}
              className="flex-1"
            >
              <ThumbsUp className="h-4 w-4 mr-1" />
              {t("correct")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleFeedback("incorrect")}
              disabled={feedbackSubmitting}
              className="flex-1"
            >
              <ThumbsDown className="h-4 w-4 mr-1" />
              {t("incorrect")}
            </Button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleFeedback("inappropriate")}
            disabled={feedbackSubmitting}
            className="w-full text-destructive hover:text-destructive"
          >
            <AlertCircle className="h-4 w-4 mr-1" />
            {t("inappropriate")}
          </Button>
          {feedbackError && (
            <p className="text-xs text-destructive">{feedbackError}</p>
          )}
        </div>
      )}

      {/* Feedback Submitted */}
      {feedbackSubmitted && (
        <div className="pt-2 border-t">
          <p className="text-xs text-green-600 flex items-center gap-1">
            <Check className="h-3 w-3" />
            {t("feedbackThanks")}
          </p>
        </div>
      )}
    </div>
  );
}

interface AiMediaBlockedIndicatorProps {
  chatId: string;
  reason?: string;
  className?: string;
}

/**
 * Indicator shown when AI wanted to send media but was blocked by guardrails
 */
export function AiMediaBlockedIndicator({
  chatId,
  reason,
  className,
}: AiMediaBlockedIndicatorProps) {
  const t = useTranslations("knowledgeBase.aiMedia");

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`inline-flex items-center gap-1 text-xs text-muted-foreground ${className}`}
          >
            <FileImage className="h-3 w-3 opacity-50" />
            <X className="h-3 w-3 text-orange-500" />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="max-w-xs space-y-1">
            <p className="font-medium">{t("mediaBlocked")}</p>
            <p className="text-xs">{reason || t("blockedByGuardrails")}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface MediaDecisionLogProps {
  chatId: string;
}

/**
 * List of all AI media decisions for a chat
 */
export function MediaDecisionLog({ chatId }: MediaDecisionLogProps) {
  const t = useTranslations("knowledgeBase.aiMedia");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useSWR(
    chatId ? ["media-decisions", chatId, page] : null,
    () => kbMediaApi.getDecisionLogs(chatId, { page, pageSize: 20 })
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.logs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>{t("noDecisions")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{t("decisionLog")}</h3>
        <Badge variant="outline">
          {t("totalDecisions", { count: data.total })}
        </Badge>
      </div>

      <div className="space-y-2">
        {data.logs.map((log) => (
          <div
            key={log.id}
            className="flex items-start gap-3 p-3 border rounded-lg"
          >
            <div
              className={`p-2 rounded-full ${
                log.mediaSent
                  ? "bg-green-100 text-green-600"
                  : "bg-orange-100 text-orange-600"
              }`}
            >
              {log.mediaSent ? (
                <FileImage className="h-4 w-4" />
              ) : (
                <X className="h-4 w-4" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">
                  {log.mediaSent ? t("mediaSent") : t("mediaNotSent")}
                </p>
                <span className="text-xs text-muted-foreground">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-sm text-muted-foreground truncate">
                {log.selectionReason}
              </p>
              {log.objectName && (
                <Badge variant="outline" className="mt-1 text-xs">
                  {log.objectName}
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {data.total > data.pageSize && (
        <div className="flex items-center justify-between pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            {t("previous")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t("pageOf", {
              page,
              total: Math.ceil(data.total / data.pageSize),
            })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page * data.pageSize >= data.total}
          >
            {t("next")}
          </Button>
        </div>
      )}
    </div>
  );
}

export default AiMediaIndicator;
