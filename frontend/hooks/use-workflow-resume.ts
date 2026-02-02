/**
 * useWorkflowResume Hook
 *
 * Manages workflow resume state and modal for when AI is re-enabled.
 * Determines if the user needs to select a workflow step before AI can continue.
 *
 * Key Logic:
 * - If no workflow assigned to chat -> resume AI immediately
 * - If workflow assigned but no execution state -> resume from beginning
 * - If workflow paused with current node -> show modal to select resume point
 */

import type { ResumeAction, WorkflowResumeState } from "@/components/workflow";
import { workflowBuilderApi } from "@/lib/api/workflow-builder";
import { useCallback, useState } from "react";

// Re-export types for convenience
export type { ResumeAction, WorkflowResumeState };

export interface UseWorkflowResumeOptions {
  chatId: string | null;
  /** Called after a successful resume action */
  onResumeComplete?: () => void;
  /** Called when resume is cancelled */
  onCancel?: () => void;
}

export interface UseWorkflowResumeReturn {
  /** Whether the resume modal should be shown */
  isModalOpen: boolean;
  /** Open the modal and fetch workflow state */
  openModal: () => Promise<void>;
  /** Close the modal */
  closeModal: () => void;
  /** Current workflow resume state (fetched when modal opens) */
  workflowState: WorkflowResumeState | null;
  /** Whether workflow state is being fetched */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Execute a resume action */
  executeResume: (
    nodeId: string | null,
    action: ResumeAction,
  ) => Promise<boolean>;
  /**
   * Check if workflow resume modal should be shown before resuming AI.
   * Returns true if modal should be shown, false if AI can resume immediately.
   */
  checkNeedsWorkflowSelection: () => Promise<boolean>;
  /**
   * Resume AI without showing the modal (for cases when no workflow or no selection needed)
   */
  resumeImmediately: () => Promise<boolean>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useWorkflowResume({
  chatId,
  onResumeComplete,
  onCancel,
}: UseWorkflowResumeOptions): UseWorkflowResumeReturn {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [workflowState, setWorkflowState] =
    useState<WorkflowResumeState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch the workflow resume state for the chat
   */
  const fetchWorkflowState =
    useCallback(async (): Promise<WorkflowResumeState | null> => {
      console.log(
        "[useWorkflowResume] fetchWorkflowState called, chatId:",
        chatId,
      );
      if (!chatId) {
        console.log("[useWorkflowResume] No chatId, returning null");
        return null;
      }

      try {
        setIsLoading(true);
        setError(null);
        console.log(
          "[useWorkflowResume] Calling workflowBuilderApi.chatState.getResumeState...",
        );
        const state = await workflowBuilderApi.chatState.getResumeState(chatId);
        console.log("[useWorkflowResume] Got state:", state);
        setWorkflowState(state);
        return state;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch workflow state";
        setError(message);
        console.error("[useWorkflowResume] Failed to fetch state:", err);
        return null;
      } finally {
        setIsLoading(false);
      }
    }, [chatId]);

  /**
   * Check if the workflow resume modal should be shown.
   * Returns true if user needs to select a step, false if can resume immediately.
   *
   * Rules:
   * - No workflow assigned -> No modal (resume immediately)
   * - Workflow assigned but never started (no current node, not paused) -> No modal (start from beginning)
   * - Workflow paused with or without current node -> Show modal (user selects where to continue)
   * - Workflow has current node but not paused -> This is unusual, show modal to be safe
   */
  const checkNeedsWorkflowSelection =
    useCallback(async (): Promise<boolean> => {
      console.log(
        "[useWorkflowResume] checkNeedsWorkflowSelection called, chatId:",
        chatId,
      );
      if (!chatId) {
        console.log(
          "[useWorkflowResume] checkNeedsWorkflowSelection: no chatId, returning false",
        );
        return false;
      }

      const state = await fetchWorkflowState();
      console.log(
        "[useWorkflowResume] checkNeedsWorkflowSelection: fetched state:",
        state,
      );

      // No workflow state response - no modal needed
      if (!state) {
        console.log(
          "[useWorkflowResume] checkNeedsWorkflowSelection: no state, returning false",
        );
        return false;
      }

      // No workflow assigned to chat - no modal needed
      if (!state.workflowId) {
        console.log(
          "[useWorkflowResume] checkNeedsWorkflowSelection: no workflowId, returning false",
        );
        return false;
      }

      // Workflow is paused - always show modal to let user select resume point
      if (state.isPaused) {
        console.log(
          "[useWorkflowResume] checkNeedsWorkflowSelection: isPaused=true, returning true",
        );
        return true;
      }

      // Workflow has a current node (execution in progress but not paused)
      // This could happen if workflow is between steps - show modal to be safe
      if (state.currentNodeId) {
        console.log(
          "[useWorkflowResume] checkNeedsWorkflowSelection: has currentNodeId, returning true",
        );
        return true;
      }

      // Workflow assigned but no execution state (fresh start)
      // No modal needed - will start from beginning automatically
      console.log(
        "[useWorkflowResume] checkNeedsWorkflowSelection: no pause/currentNode, returning false",
      );
      return false;
    }, [chatId, fetchWorkflowState]);

  /**
   * Open the modal and fetch workflow state
   */
  const openModal = useCallback(async () => {
    await fetchWorkflowState();
    setIsModalOpen(true);
  }, [fetchWorkflowState]);

  /**
   * Close the modal
   */
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    onCancel?.();
  }, [onCancel]);

  /**
   * Execute a resume action (resume from node, restart, or cancel)
   */
  const executeResume = useCallback(
    async (nodeId: string | null, action: ResumeAction): Promise<boolean> => {
      if (!chatId) return false;

      try {
        setIsLoading(true);
        setError(null);

        const result = await workflowBuilderApi.chatState.resumeFromNode(
          chatId,
          nodeId,
          action,
        );

        if (result.success) {
          setIsModalOpen(false);
          onResumeComplete?.();
          return true;
        } else {
          setError(result.message || "Failed to resume workflow");
          return false;
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to resume workflow";
        setError(message);
        console.error("[useWorkflowResume] Resume failed:", err);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [chatId, onResumeComplete],
  );

  /**
   * Resume AI immediately without showing the modal.
   * Used when there's no workflow or no selection needed.
   */
  const resumeImmediately = useCallback(async (): Promise<boolean> => {
    if (!chatId) return false;

    // If there's a workflow state with nodes, restart from beginning
    if (workflowState?.workflowId && workflowState.nodes.length > 0) {
      return executeResume(null, "restart");
    }

    // No workflow - just return success (caller will handle actual AI resume)
    return true;
  }, [chatId, workflowState, executeResume]);

  return {
    isModalOpen,
    openModal,
    closeModal,
    workflowState,
    isLoading,
    error,
    executeResume,
    checkNeedsWorkflowSelection,
    resumeImmediately,
  };
}

export default useWorkflowResume;
