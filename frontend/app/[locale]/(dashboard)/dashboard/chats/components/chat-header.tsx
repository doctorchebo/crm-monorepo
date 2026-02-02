"use client";

import { ChatAIControls } from "@/components/chat-ai-controls";
import { AssigneeSelector } from "@/components/chat/assignee-selector";
import { HandoffBanner } from "@/components/handoff-banner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  WorkflowResumeModal,
  WorkflowVisualizationModal,
} from "@/components/workflow";
import { useHandoff } from "@/hooks/use-handoff";
import { useWorkflowResume } from "@/hooks/use-workflow-resume";
import { workflowBuilderApi } from "@/lib/api/workflow-builder";
import type { WorkflowVisualizationData } from "@/lib/types/workflow.types";
import {
  ChevronDown,
  Eye,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Settings2,
  Workflow,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import useSWR from "swr";
import type { Chat } from "../types";
import { WorkflowAssignmentDialog } from "./workflow-assignment-dialog";

interface ChatHeaderProps {
  chat: Chat;
  onSearchClick?: () => void;
  isSearchOpen?: boolean;
  onAIToggle?: (enabled: boolean) => Promise<void>;
  isRateLimited?: boolean;
  onConfigSaved?: () => void;
  /** Whether the sidebar panel is expanded */
  isSidebarExpanded?: boolean;
  /** Callback when sidebar toggle is clicked */
  onSidebarToggle?: () => void;
  /** Callback to refresh parent's handoff state after workflow resume */
  onWorkflowResumed?: () => void;
}

export function ChatHeader({
  chat,
  onSearchClick,
  isSearchOpen,
  onAIToggle,
  isRateLimited,
  onConfigSaved: parentOnConfigSaved,
  isSidebarExpanded,
  onSidebarToggle,
  onWorkflowResumed,
}: ChatHeaderProps) {
  const t = useTranslations("chats.search");
  const tSidebar = useTranslations("chats.sidebar");
  const {
    handoffStatus,
    aiStatus,
    isLoading,
    isAIPaused,
    isAwaitingHandoff,
    pauseAI,
    resumeAI,
    requestHandoff,
    resolveHandoff,
    refetch,
  } = useHandoff(chat.chatId);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWorkflowDialogOpen, setIsWorkflowDialogOpen] = useState(false);
  const [isVisualizationOpen, setIsVisualizationOpen] = useState(false);
  const [visualizationData, setVisualizationData] =
    useState<WorkflowVisualizationData | null>(null);
  const [isVisualizationLoading, setIsVisualizationLoading] = useState(false);

  /**
   * Complete the AI resume process when NO workflow modal is needed.
   * This triggers the parent's handler which may auto-generate AI response.
   *
   * NOTE: This should NOT be called when resuming via workflow modal,
   * because resumeWorkflowFromNode already executes the workflow and sends response.
   */
  const completeAIResumeWithoutWorkflow = useCallback(async () => {
    try {
      // If parent provides a handler, use it (for auto-trigger logic)
      if (onAIToggle) {
        await onAIToggle(true);
      } else {
        await resumeAI();
      }
      refetch();
    } catch (error) {
      console.error("Failed to complete AI resume:", error);
    }
  }, [onAIToggle, resumeAI, refetch]);

  // Workflow resume hook - handles modal and resume logic
  const workflowResume = useWorkflowResume({
    chatId: chat.chatId,
    onResumeComplete: () => {
      // IMPORTANT: When resuming via workflow modal, the backend resumeWorkflowFromNode already:
      // 1. Unpaused the workflow state (workflowChatState.isPaused = false)
      // 2. Unpaused the chat AI (chatStageAssignments.aiPaused = false)
      // 3. Executed the workflow from the selected node
      // 4. Sent any AI responses as part of workflow execution
      //
      // We ONLY need to refresh the UI state to reflect the new AI status.
      // Do NOT call completeAIResumeWithoutWorkflow() here as it would:
      // - Call /ai/resume endpoint which triggers ANOTHER workflow execution
      // - Cause duplicate AI responses
      refetch();
      // Also refresh parent's handoff state so the UI toggle updates immediately
      onWorkflowResumed?.();
    },
  });

  // Fetch current workflow state
  const { data: workflowState } = useSWR(
    ["chat-workflow-state", chat.chatId],
    () => workflowBuilderApi.chatState.get(chat.chatId),
  );

  const activeWorkflowName = workflowState?.activeWorkflow?.name;
  const hasActiveWorkflow = !!workflowState?.activeWorkflowId;

  // Fetch visualization data when modal opens
  const handleOpenVisualization = useCallback(async () => {
    setIsVisualizationOpen(true);
    setIsVisualizationLoading(true);

    try {
      const data = await workflowBuilderApi.chatState.getVisualization(
        chat.chatId,
      );
      setVisualizationData(data);
    } catch (error) {
      console.error("Failed to fetch workflow visualization:", error);
      setVisualizationData(null);
    } finally {
      setIsVisualizationLoading(false);
    }
  }, [chat.chatId]);

  /**
   * Handle AI toggle with workflow resume modal support.
   *
   * When enabling AI:
   * 1. Check if there's an active workflow that needs user input
   * 2. If yes, show the workflow resume modal to select where to continue
   * 3. If no workflow or fresh start, resume AI immediately
   *
   * When disabling AI:
   * - Pause the AI using parent handler if available (to update parent state)
   */
  const handleToggleAI = useCallback(
    async (shouldEnable: boolean) => {
      console.log(
        "[ChatHeader] handleToggleAI called, shouldEnable:",
        shouldEnable,
      );
      // Disabling AI - use parent handler if available to ensure state sync
      if (!shouldEnable) {
        try {
          if (onAIToggle) {
            // Use parent's handler to ensure page state is updated
            await onAIToggle(false);
          } else {
            await pauseAI();
          }
          refetch();
        } catch (error) {
          console.error("Failed to pause AI:", error);
        }
        return;
      }

      // Enabling AI - check if we need workflow selection
      try {
        console.log("[ChatHeader] Checking if workflow selection is needed...");
        const needsWorkflowSelection =
          await workflowResume.checkNeedsWorkflowSelection();
        console.log(
          "[ChatHeader] needsWorkflowSelection:",
          needsWorkflowSelection,
        );

        if (needsWorkflowSelection) {
          // Show the modal - onResumeComplete will just refresh UI state
          // The workflow execution handles the actual AI response
          console.log("[ChatHeader] Opening workflow resume modal...");
          await workflowResume.openModal();
        } else {
          // No workflow or no selection needed - use parent handler to trigger AI response
          console.log(
            "[ChatHeader] No workflow selection needed, completing resume...",
          );
          await completeAIResumeWithoutWorkflow();
        }
      } catch (error) {
        console.error("Failed to check workflow state:", error);
        // On error, fall back to direct resume
        await completeAIResumeWithoutWorkflow();
      }
    },
    [
      onAIToggle,
      pauseAI,
      refetch,
      workflowResume,
      completeAIResumeWithoutWorkflow,
    ],
  );

  const handleRequestHandoff = async () => {
    await requestHandoff("Manual handoff requested by user");
  };

  const handleResolveHandoff = async () => {
    await resolveHandoff(true, "Resolved by user (AI Resumed)");
  };

  const handleResolveManual = async () => {
    // Resolve handoff but keep AI paused (Manual Mode)
    await resolveHandoff(false, "Resolved by user (Manual Mode)");
  };

  /**
   * Handle resolve handoff with workflow resume modal support.
   * Similar to handleToggleAI but for the handoff resolution flow.
   *
   * Note: When using the workflow modal, the workflow execution resumes AI and
   * sends the response. Resolving handoff is handled separately since the
   * backend resumeWorkflowFromNode already unpauses AI.
   */
  const handleResolveHandoffWithWorkflow = useCallback(async () => {
    try {
      const needsWorkflowSelection =
        await workflowResume.checkNeedsWorkflowSelection();

      if (needsWorkflowSelection) {
        // Show the modal - workflow execution will handle AI resume and response
        // The handoff is effectively resolved since AI is enabled via workflow resume
        await workflowResume.openModal();
      } else {
        // No workflow selection needed - resolve and resume directly
        await resolveHandoff(true, "Resolved by user (AI Resumed)");
      }
    } catch (error) {
      console.error("Failed to check workflow state:", error);
      // On error, fall back to direct resolve
      await resolveHandoff(true, "Resolved by user (AI Resumed)");
    }
  }, [resolveHandoff, workflowResume]);

  const handleConfigSaved = () => {
    // Refresh the AI status after configuration is saved
    refetch();
    // Notify parent if handler provided (to clear rate limit)
    parentOnConfigSaved?.();
  };

  // Determine if we should show the banner
  const showHandoffBanner =
    handoffStatus &&
    handoffStatus.awaitingHandoff &&
    handoffStatus.status !== "resolved";

  return (
    <div className="flex-shrink-0">
      {/* Header bar */}
      <div className="border-b px-6 py-2 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {chat.participantName || chat.participantPhone}
          </h2>
          <p className="text-xs text-muted-foreground">
            {chat.participantPhone}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Assignee Selector */}
          <AssigneeSelector
            chatId={chat.chatId}
            assigneeId={chat.assignedTo}
            teamId={chat.teamId}
          />

          {/* Workflow Controls - Dropdown with options */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1.5 h-8"
                title={
                  activeWorkflowName
                    ? `Active Workflow: ${activeWorkflowName}`
                    : "Workflow Options"
                }
              >
                <Workflow className="h-4 w-4" />
                <span className="hidden sm:inline-block max-w-[100px] truncate">
                  {activeWorkflowName || "Workflow"}
                </span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {/* View Progress - Only if workflow is assigned */}
              <DropdownMenuItem
                onClick={handleOpenVisualization}
                disabled={!hasActiveWorkflow}
              >
                <Eye className="h-4 w-4 mr-2" />
                View Progress
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/* Change/Assign Workflow */}
              <DropdownMenuItem onClick={() => setIsWorkflowDialogOpen(true)}>
                <Settings2 className="h-4 w-4 mr-2" />
                {hasActiveWorkflow ? "Change Workflow" : "Assign Workflow"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* AI Controls */}
          <ChatAIControls
            chatId={chat.chatId}
            chatName={chat.participantName || chat.participantPhone}
            isAIPaused={isAIPaused ?? true}
            hasActiveHandoff={isAwaitingHandoff}
            handoffPriority={handoffStatus?.priority}
            isLoading={isLoading}
            isRateLimited={isRateLimited}
            onToggleAI={handleToggleAI}
            onRequestHandoff={handleRequestHandoff}
            onResolveHandoff={handleResolveHandoff}
            onConfigSaved={handleConfigSaved}
            isConfigModalOpen={isSettingsOpen}
            onOpenConfigModal={setIsSettingsOpen}
            aiConfigEnabled={aiStatus?.aiConfigEnabled ?? false}
          />

          {/* Search button */}
          <Button
            variant={isSearchOpen ? "default" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={onSearchClick}
            title={t("title")}
          >
            <Search className="h-4 w-4" />
            <span className="sr-only">{t("title")}</span>
          </Button>

          {/* Sidebar toggle button - only visible on xl screens where sidebar can be shown */}
          {onSidebarToggle && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hidden xl:flex"
                  onClick={onSidebarToggle}
                >
                  {isSidebarExpanded ? (
                    <PanelRightClose className="h-4 w-4" />
                  ) : (
                    <PanelRightOpen className="h-4 w-4" />
                  )}
                  <span className="sr-only">
                    {isSidebarExpanded
                      ? tSidebar("collapsePanel")
                      : tSidebar("expandPanel")}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isSidebarExpanded
                  ? tSidebar("collapsePanel")
                  : tSidebar("expandPanel")}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Handoff banner - shown when intervention is needed */}
      {showHandoffBanner && (
        <HandoffBanner
          chatId={chat.chatId}
          priority={handoffStatus.priority || "medium"}
          status={handoffStatus.status || "pending"}
          reason={handoffStatus.reason || handoffStatus.handoffReason}
          aiReasoning={handoffStatus.aiReasoning}
          triggeredAt={
            handoffStatus.triggeredAt ||
            handoffStatus.handoffRequestedAt ||
            new Date().toISOString()
          }
          acknowledgedAt={handoffStatus.acknowledgedAt}
          isAIPaused={isAIPaused ?? false}
          onResolve={handleResolveHandoffWithWorkflow}
          onResolveManual={handleResolveManual}
          onResumeAI={() => handleToggleAI(true)}
          onPauseAI={pauseAI}
          className="mx-4 mt-2"
        />
      )}

      {/* Workflow Assignment Dialog */}
      <WorkflowAssignmentDialog
        chatId={chat.chatId}
        activeWorkflowId={workflowState?.activeWorkflowId || null}
        open={isWorkflowDialogOpen}
        onOpenChange={setIsWorkflowDialogOpen}
      />

      {/* Workflow Visualization Modal */}
      <WorkflowVisualizationModal
        open={isVisualizationOpen}
        onOpenChange={setIsVisualizationOpen}
        data={visualizationData}
        isLoading={isVisualizationLoading}
      />

      {/* Workflow Resume Modal - shown when AI is resumed and workflow needs step selection */}
      <WorkflowResumeModal
        open={workflowResume.isModalOpen}
        onOpenChange={workflowResume.closeModal}
        workflowState={workflowResume.workflowState}
        onResume={workflowResume.executeResume}
        isLoading={workflowResume.isLoading}
        error={workflowResume.error}
      />
    </div>
  );
}
