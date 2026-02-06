"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotification } from "@/hooks/use-notification";
import type { WorkflowStage } from "@/lib/api/endpoints";
import { backendApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { AlertCircle, Check, GitBranch, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useEffect, useState } from "react";

interface StageAssignmentModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback when modal should close */
  onOpenChange: (open: boolean) => void;
  /** The chat ID to assign a stage to */
  chatId: string;
  /** Callback when a stage is successfully assigned */
  onStageAssigned?: (stageId: string) => void;
  /** Whether the modal can be dismissed without selecting a stage */
  allowSkip?: boolean;
}

/**
 * Stage Assignment Modal
 *
 * Shown when:
 * 1. A chat has no stage assigned (stageId is null)
 * 2. The user opens the chat after the previously assigned stage was deleted
 *
 * Allows the user to:
 * - Select a pipeline stage for the chat
 * - Skip assignment (if allowSkip is true)
 */
export const StageAssignmentModal = memo(function StageAssignmentModal({
  open,
  onOpenChange,
  chatId,
  onStageAssigned,
  allowSkip = true,
}: StageAssignmentModalProps) {
  const t = useTranslations("pipeline");
  const { addNotification } = useNotification();

  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  // Load available stages
  const loadStages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const stagesData = await backendApi.stages.getStages();
      setStages(stagesData.sort((a, b) => a.sortOrder - b.sortOrder));

      // Pre-select default stage if exists
      const defaultStage = stagesData.find((s) => s.isDefault);
      if (defaultStage) {
        setSelectedStageId(defaultStage.id);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("errorLoadingStages");
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (open) {
      loadStages();
    }
  }, [open, loadStages]);

  // Handle stage assignment
  const handleAssign = useCallback(async () => {
    if (!selectedStageId) return;

    const targetStage = stages.find((s) => s.id === selectedStageId);
    if (!targetStage) return;

    setAssigning(true);

    try {
      await backendApi.stages.transitionChat({
        chatId,
        toStageId: selectedStageId,
        reason: "Stage assignment from modal",
        metadata: { manual: true, source: "stage_assignment_modal" },
      });

      addNotification(t("movedTo", { stageName: targetStage.name }), "success");

      onStageAssigned?.(selectedStageId);
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("stageChangeFailed");
      addNotification(message, "error");
    } finally {
      setAssigning(false);
    }
  }, [
    chatId,
    selectedStageId,
    stages,
    onStageAssigned,
    onOpenChange,
    addNotification,
    t,
  ]);

  // Handle skip
  const handleSkip = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            {t("stageRequired")}
          </DialogTitle>
          <DialogDescription>{t("stageRequiredDescription")}</DialogDescription>
        </DialogHeader>

        {/* Loading state */}
        {loading && (
          <div className="py-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="py-4 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={loadStages}
            >
              {t("retry")}
            </Button>
          </div>
        )}

        {/* Stage selection */}
        {!loading && !error && (
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2 py-2">
              {stages.map((stage) => (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => setSelectedStageId(stage.id)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg border transition-all",
                    "hover:bg-accent/50",
                    "focus:outline-none focus:ring-2 focus:ring-primary/20",
                    selectedStageId === stage.id &&
                      "bg-primary/10 border-primary",
                  )}
                >
                  {/* Stage color indicator */}
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full shrink-0 flex items-center justify-center",
                      selectedStageId === stage.id &&
                        "ring-2 ring-offset-2 ring-primary",
                    )}
                    style={{ backgroundColor: stage.color }}
                  >
                    {selectedStageId === stage.id && (
                      <Check className="h-2.5 w-2.5 text-white" />
                    )}
                  </div>

                  {/* Stage name */}
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{stage.name}</span>
                      {stage.isDefault && (
                        <Badge
                          variant="outline"
                          className="text-[10px] h-4 px-1"
                        >
                          Default
                        </Badge>
                      )}
                    </div>
                    {stage.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {stage.description}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {allowSkip && (
            <Button variant="ghost" onClick={handleSkip} disabled={assigning}>
              {t("skipForNow")}
            </Button>
          )}
          <Button
            onClick={handleAssign}
            disabled={!selectedStageId || assigning || loading || !!error}
          >
            {assigning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("assignStage")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
