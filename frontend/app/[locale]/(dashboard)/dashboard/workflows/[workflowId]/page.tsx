"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { UnsavedChangesDialog } from "@/components/ui/unsaved-changes-dialog";
import { NodeConfigPanel } from "@/components/workflow/node-config-panel";
import { WorkflowCanvas } from "@/components/workflow/workflow-canvas";
import { WorkflowHeader } from "@/components/workflow/workflow-header";
import { WorkflowSidebar } from "@/components/workflow/workflow-sidebar";
import { useNotification } from "@/hooks/use-notification";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { workflowBuilderApi } from "@/lib/api/workflow-builder";
import type {
  WorkflowNode,
  WorkflowWithDetails,
} from "@/lib/types/workflow.types";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export default function WorkflowEditorPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations("workflows.editor");
  const { addNotification } = useNotification();
  const workflowId = params.workflowId as string;

  // Unsaved changes guard - handles browser beforeunload and in-app navigation
  const unsavedChangesGuard = useUnsavedChangesGuard();

  // Ref to store the navigation callback for when user confirms leaving
  const pendingNavigationRef = useRef<(() => void) | null>(null);

  const [workflow, setWorkflow] = useState<WorkflowWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const fetchWorkflow = useCallback(async () => {
    try {
      setLoading(true);
      const data = await workflowBuilderApi.get(workflowId);
      setWorkflow(data);
    } catch (error) {
      addNotification(
        `${t("errors.loadFailed")}: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
      router.push("/dashboard/workflows");
    } finally {
      setLoading(false);
    }
  }, [workflowId, router, addNotification, t]);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  /**
   * Handle navigation request with unsaved changes guard.
   * Shows confirmation dialog if there are unsaved changes.
   */
  const handleNavigateBack = useCallback(() => {
    const destinationUrl = "/dashboard/workflows";

    if (!unsavedChangesGuard.hasUnsavedChanges) {
      router.push(destinationUrl);
      return;
    }

    // Store the navigation callback and show dialog
    pendingNavigationRef.current = () => router.push(destinationUrl);
    unsavedChangesGuard.requestNavigation(destinationUrl);
  }, [router, unsavedChangesGuard]);

  /**
   * Handle confirmed navigation (user clicked "Leave" in dialog)
   */
  const handleConfirmNavigation = useCallback(() => {
    unsavedChangesGuard.confirmNavigation();
    if (pendingNavigationRef.current) {
      pendingNavigationRef.current();
      pendingNavigationRef.current = null;
    }
  }, [unsavedChangesGuard]);

  const handleSave = useCallback(async () => {
    if (!workflow) return;

    try {
      setSaving(true);
      const updatedWorkflow = await workflowBuilderApi.saveCanvas(workflowId, {
        nodes: workflow.nodes.map((node) => ({
          id: node.id,
          nodeType: node.type, // Backend expects 'nodeType', not 'type'
          label: node.name,
          description: node.description || undefined,
          config: node.config,
          positionX: node.positionX,
          positionY: node.positionY,
        })),
        connections: workflow.connections.map((conn) => ({
          id: conn.id,
          fromNodeId: conn.sourceNodeId, // Backend expects 'fromNodeId'
          toNodeId: conn.targetNodeId, // Backend expects 'toNodeId'
          branch:
            (conn.type as "default" | "true" | "false" | "timeout" | "error") ||
            "default",
          label: conn.label || undefined,
          conditionConfig: conn.condition
            ? (conn.condition as unknown as Record<string, unknown>)
            : undefined,
        })),
        viewportX: workflow.canvasState?.panX,
        viewportY: workflow.canvasState?.panY,
        viewportZoom: workflow.canvasState?.zoom,
      });

      // Merge the save response with existing workflow state
      // saveCanvas only returns { nodes, connections }, so we preserve other fields
      setWorkflow((prev) => {
        if (!prev) return updatedWorkflow;
        return {
          ...prev,
          ...updatedWorkflow,
          // Ensure variables are preserved (saveCanvas doesn't return them)
          variables: prev.variables ?? [],
        };
      });
      unsavedChangesGuard.setHasUnsavedChanges(false);
      addNotification(t("notifications.saved"), "success");
    } catch (error) {
      addNotification(
        `${t("errors.saveFailed")}: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    } finally {
      setSaving(false);
    }
  }, [workflow, workflowId, addNotification, t, unsavedChangesGuard]);

  const handlePublish = useCallback(async () => {
    if (!workflow) return;

    try {
      // First save any pending changes
      if (unsavedChangesGuard.hasUnsavedChanges) {
        await handleSave();
      }

      const published = await workflowBuilderApi.publish(workflowId);
      setWorkflow((prev) =>
        prev
          ? {
              ...prev,
              status: published.status,
              version: published.version,
              publishedAt: published.publishedAt,
            }
          : null,
      );
      addNotification(
        `${t("notifications.published")}: ${t("notifications.publishedMessage", { version: published.version })}`,
        "success",
      );
    } catch (error) {
      addNotification(
        `${t("errors.publishFailed")}: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    }
  }, [
    workflow,
    workflowId,
    unsavedChangesGuard.hasUnsavedChanges,
    handleSave,
    addNotification,
    t,
  ]);

  const handleWorkflowUpdate = useCallback(
    (updates: Partial<WorkflowWithDetails>) => {
      setWorkflow((prev) => (prev ? { ...prev, ...updates } : null));
      unsavedChangesGuard.setHasUnsavedChanges(true);
    },
    [unsavedChangesGuard],
  );

  const handleNodeSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const handleNodeUpdate = useCallback(
    (nodeId: string, updates: Partial<WorkflowNode>) => {
      setWorkflow((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          nodes: prev.nodes.map((node) =>
            node.id === nodeId ? { ...node, ...updates } : node,
          ),
        };
      });
      unsavedChangesGuard.setHasUnsavedChanges(true);
    },
    [unsavedChangesGuard],
  );

  const selectedNode = workflow?.nodes.find((n) => n.id === selectedNodeId);

  if (loading) {
    return (
      <div className="h-screen flex flex-col">
        <div className="h-14 border-b px-4 flex items-center gap-4">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-6 w-48" />
          <div className="flex-1" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="flex-1 flex">
          <div className="w-64 border-r p-4 space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          <div className="flex-1 bg-muted/30">
            <div className="h-full flex items-center justify-center">
              <Skeleton className="h-64 w-96" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!workflow) {
    return null;
  }

  return (
    <>
      <div className="h-screen flex flex-col overflow-hidden">
        <WorkflowHeader
          workflow={workflow}
          saving={saving}
          hasUnsavedChanges={unsavedChangesGuard.hasUnsavedChanges}
          onSave={handleSave}
          onPublish={handlePublish}
          onUpdate={handleWorkflowUpdate}
          onBack={handleNavigateBack}
        />
        <div className="flex-1 flex overflow-hidden">
          <WorkflowSidebar
            workflow={workflow}
            onUpdate={handleWorkflowUpdate}
          />
          <WorkflowCanvas
            workflow={workflow}
            onUpdate={handleWorkflowUpdate}
            onNodeSelect={handleNodeSelect}
          />
          {selectedNode && (
            <NodeConfigPanel
              node={selectedNode}
              onUpdate={handleNodeUpdate}
              onClose={() => setSelectedNodeId(null)}
            />
          )}
        </div>
      </div>

      {/* Unsaved Changes Confirmation Dialog */}
      <UnsavedChangesDialog
        isOpen={unsavedChangesGuard.isDialogOpen}
        onConfirm={handleConfirmNavigation}
        onCancel={unsavedChangesGuard.cancelNavigation}
        title={t("dialogs.unsavedChanges.title")}
        description={t("dialogs.unsavedChanges.description")}
        confirmText={t("dialogs.unsavedChanges.leave")}
        cancelText={t("dialogs.unsavedChanges.stay")}
      />
    </>
  );
}
