"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotification } from "@/hooks/use-notification";
import type { WorkflowStage } from "@/lib/api/endpoints";
import { backendApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Check,
  ChevronRight,
  GitBranch,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useEffect, useState } from "react";

interface PipelinePanelProps {
  chatId: string;
  /** Called when stage is changed - allows parent to update any relevant state */
  onStageChange?: (newStageId: string | null) => void;
  /** If true, shows a modal-like prompt when no stage is assigned */
  showAssignmentPrompt?: boolean;
}

interface StageItemProps {
  stage: WorkflowStage;
  isCurrentStage: boolean;
  isPastStage: boolean;
  isTransitioning: boolean;
  onSelect: (stageId: string) => void;
}

/**
 * Single stage item in the pipeline list
 */
const StageItem = memo(function StageItem({
  stage,
  isCurrentStage,
  isPastStage,
  isTransitioning,
  onSelect,
}: StageItemProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(stage.id)}
      disabled={isCurrentStage || isTransitioning}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-lg border transition-all",
        "hover:bg-accent/50 hover:border-primary/30",
        "focus:outline-none focus:ring-2 focus:ring-primary/20",
        "disabled:cursor-default disabled:hover:bg-transparent",
        isCurrentStage && "bg-primary/10 border-primary shadow-sm",
        isPastStage && !isCurrentStage && "opacity-60",
      )}
    >
      {/* Stage indicator */}
      <div
        className={cn(
          "w-4 h-4 rounded-full shrink-0 flex items-center justify-center",
          isCurrentStage ? "ring-2 ring-offset-2 ring-primary" : "",
        )}
        style={{ backgroundColor: stage.color }}
      >
        {isCurrentStage && <Check className="h-2.5 w-2.5 text-white" />}
      </div>

      {/* Stage name and badges */}
      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-sm font-medium truncate",
              isCurrentStage && "text-primary",
            )}
          >
            {stage.name}
          </span>
          {stage.isDefault && (
            <Badge variant="outline" className="text-[10px] h-4 px-1">
              Default
            </Badge>
          )}
          {stage.isFinal && (
            <Badge variant="outline" className="text-[10px] h-4 px-1">
              Final
            </Badge>
          )}
        </div>
        {stage.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {stage.description}
          </p>
        )}
      </div>

      {/* Action indicator */}
      {!isCurrentStage && !isTransitioning && (
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
      {isTransitioning && (
        <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
      )}
    </button>
  );
});

/**
 * No stage assigned state
 */
const NoStageAssigned = memo(function NoStageAssigned({
  onSelectStage,
}: {
  onSelectStage: () => void;
}) {
  const t = useTranslations("pipeline");

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <GitBranch className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="font-medium text-sm mb-1">{t("noStageAssigned")}</h3>
      <p className="text-xs text-muted-foreground mb-4 max-w-[200px]">
        {t("noStageDescription")}
      </p>
      <Button size="sm" onClick={onSelectStage}>
        {t("selectStage")}
      </Button>
    </div>
  );
});

/**
 * Error state
 */
const ErrorState = memo(function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const t = useTranslations("pipeline");

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <p className="text-sm text-muted-foreground mb-4">{message}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw className="h-4 w-4 mr-2" />
        {t("retry")}
      </Button>
    </div>
  );
});

/**
 * Loading skeleton
 */
const LoadingSkeleton = memo(function LoadingSkeleton() {
  return (
    <div className="p-4 space-y-3">
      <Skeleton className="h-4 w-24 mb-4" />
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
});

/**
 * Pipeline Panel - Shows workflow stages for a chat
 * Allows users to see current stage and move to different stages
 */
export const PipelinePanel = memo(function PipelinePanel({
  chatId,
  onStageChange,
}: PipelinePanelProps) {
  const t = useTranslations("pipeline");
  const { addNotification } = useNotification();

  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [currentStageId, setCurrentStageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transitioningToStageId, setTransitioningToStageId] = useState<
    string | null
  >(null);
  const [showStageSelector, setShowStageSelector] = useState(false);

  // Load stages and current chat status
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [stagesData, statusData] = await Promise.all([
        backendApi.stages.getStages(),
        backendApi.stages.getChatStatus(chatId),
      ]);

      setStages(stagesData.sort((a, b) => a.sortOrder - b.sortOrder));
      setCurrentStageId(statusData.currentStage?.id || null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("errorLoadingStages");
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [chatId, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle stage selection/transition
  const handleStageSelect = useCallback(
    async (stageId: string) => {
      if (stageId === currentStageId || transitioningToStageId) return;

      const targetStage = stages.find((s) => s.id === stageId);
      if (!targetStage) return;

      setTransitioningToStageId(stageId);

      try {
        await backendApi.stages.transitionChat({
          chatId,
          toStageId: stageId,
          reason: "pipeline_manual",
          metadata: {
            manual: true,
            source: "pipeline_panel",
            reasonKey: "pipeline_manual",
          },
        });

        setCurrentStageId(stageId);
        setShowStageSelector(false);
        onStageChange?.(stageId);

        addNotification(
          t("movedTo", { stageName: targetStage.name }),
          "success",
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : t("stageChangeFailed");
        addNotification(message, "error");
      } finally {
        setTransitioningToStageId(null);
      }
    },
    [
      chatId,
      currentStageId,
      stages,
      transitioningToStageId,
      onStageChange,
      addNotification,
      t,
    ],
  );

  // Show loading state
  if (loading) {
    return <LoadingSkeleton />;
  }

  // Show error state
  if (error) {
    return <ErrorState message={error} onRetry={loadData} />;
  }

  // Show no stage assigned state (if no current stage and not showing selector)
  if (!currentStageId && !showStageSelector && stages.length > 0) {
    return <NoStageAssigned onSelectStage={() => setShowStageSelector(true)} />;
  }

  // Find current stage index for "past stage" styling
  const currentStageIndex = stages.findIndex((s) => s.id === currentStageId);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t("title")}</span>
          </div>
          {currentStageId && (
            <Badge
              variant="secondary"
              className="text-xs"
              style={{
                backgroundColor: `${stages.find((s) => s.id === currentStageId)?.color}20`,
                color: stages.find((s) => s.id === currentStageId)?.color,
              }}
            >
              {stages.find((s) => s.id === currentStageId)?.name}
            </Badge>
          )}
        </div>
      </div>

      {/* Stages list */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {/* Progress connector line */}
          <div className="relative">
            {stages.map((stage, index) => (
              <div key={stage.id} className="relative">
                {/* Connector line */}
                {index < stages.length - 1 && (
                  <div
                    className={cn(
                      "absolute left-[22px] top-[52px] w-0.5 h-[calc(100%-8px)] -translate-x-1/2",
                      index < currentStageIndex ? "bg-primary" : "bg-border",
                    )}
                  />
                )}

                <StageItem
                  stage={stage}
                  isCurrentStage={stage.id === currentStageId}
                  isPastStage={
                    currentStageIndex >= 0 && index < currentStageIndex
                  }
                  isTransitioning={transitioningToStageId === stage.id}
                  onSelect={handleStageSelect}
                />

                {/* Spacing between items */}
                {index < stages.length - 1 && <div className="h-2" />}
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>

      {/* Footer hint */}
      <div className="px-4 py-2 border-t bg-muted/30">
        <p className="text-xs text-muted-foreground text-center">
          {t("moveToStage")}
        </p>
      </div>
    </div>
  );
});
