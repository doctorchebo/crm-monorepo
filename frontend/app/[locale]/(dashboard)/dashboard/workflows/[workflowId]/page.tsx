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

/**
 * Helper to check if a string is a valid UUID
 */
function isValidUUID(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

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

  // Ref to track when we're applying save results to prevent re-marking as unsaved
  const isApplyingSaveResultRef = useRef(false);

  /**
   * Save version counter - incremented after each save to help canvas
   * identify when new data comes from a save operation vs user edit
   */
  const saveVersionRef = useRef(0);

  const [workflow, setWorkflow] = useState<WorkflowWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Track original metadata to detect changes that need separate API call
  const originalMetadataRef = useRef<{
    name: string;
    description?: string | null;
    icon?: string | null;
    color?: string | null;
  } | null>(null);

  const fetchWorkflow = useCallback(async () => {
    try {
      setLoading(true);
      const data = await workflowBuilderApi.get(workflowId);
      setWorkflow(data);
      // Store original metadata for change detection
      originalMetadataRef.current = {
        name: data.name,
        description: data.description,
        icon: data.icon,
        color: data.color,
      };
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

      // Check if workflow metadata has changed (name, description, icon, color)
      const original = originalMetadataRef.current;
      const metadataChanged =
        original &&
        (workflow.name !== original.name ||
          workflow.description !== original.description ||
          workflow.icon !== original.icon ||
          workflow.color !== original.color);

      // If metadata changed, update it via the update endpoint
      if (metadataChanged) {
        await workflowBuilderApi.update(workflowId, {
          name: workflow.name,
          description: workflow.description ?? undefined,
          icon: workflow.icon ?? undefined,
          color: workflow.color ?? undefined,
        });
        // Update original metadata ref after successful save
        originalMetadataRef.current = {
          name: workflow.name,
          description: workflow.description,
          icon: workflow.icon,
          color: workflow.color,
        };
      }

      // Create a mapping of temp IDs to their position in the arrays
      // This helps us match returned UUIDs back to the original items
      const nodeIdToIndex = new Map(
        workflow.nodes.map((node, index) => [node.id, index]),
      );
      const connIdToIndex = new Map(
        workflow.connections.map((conn, index) => [conn.id, index]),
      );

      // Build the save payload with the frontend's current state
      const savePayload = {
        nodes: workflow.nodes.map((node) => ({
          id: isValidUUID(node.id) ? node.id : undefined, // Only send valid UUIDs
          tempId: !isValidUUID(node.id) ? node.id : undefined, // Send temp ID for new nodes
          nodeType: node.type, // Backend expects 'nodeType', not 'type'
          label: node.name,
          description: node.description || undefined,
          config: node.config,
          positionX: node.positionX,
          positionY: node.positionY,
        })),
        connections: workflow.connections.map((conn) => {
          // Determine branch from type or sourceHandle
          let branch: string = conn.type || "default";
          if (
            conn.sourceHandle &&
            conn.sourceHandle !== "output" &&
            conn.sourceHandle !== "default"
          ) {
            branch = conn.sourceHandle;
          }

          // Get the source and target node IDs
          // These might be temp IDs if the nodes were just created
          const sourceNodeId = conn.sourceNodeId;
          const targetNodeId = conn.targetNodeId;

          return {
            id: isValidUUID(conn.id) ? conn.id : undefined, // Only send valid UUIDs
            fromNodeId: sourceNodeId,
            toNodeId: targetNodeId,
            branch: branch as
              | "default"
              | "true"
              | "false"
              | "timeout"
              | "error",
            label: conn.label || undefined,
            conditionConfig: conn.condition
              ? (conn.condition as unknown as Record<string, unknown>)
              : undefined,
          };
        }),
        viewportX: workflow.canvasState?.panX,
        viewportY: workflow.canvasState?.panY,
        viewportZoom: workflow.canvasState?.zoom,
      };

      // Save canvas and get the response with proper UUIDs
      const saveResponse = await workflowBuilderApi.saveCanvas(
        workflowId,
        savePayload,
      );

      // Mark that we're applying save results to prevent sync effects from re-marking as unsaved
      isApplyingSaveResultRef.current = true;
      saveVersionRef.current += 1;

      // CRITICAL: Completely replace the workflow nodes and connections with the saved versions
      // The backend returns ALL nodes and connections with proper UUIDs
      // We must use these to ensure IDs are consistent
      setWorkflow((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          nodes: saveResponse.nodes,
          connections: saveResponse.connections,
          // Ensure variables are preserved (saveCanvas doesn't return them)
          variables: prev.variables ?? [],
        };
      });

      // Clear unsaved changes flag
      unsavedChangesGuard.setHasUnsavedChanges(false);

      // Use a longer delay to ensure React has fully processed the state update
      // and the canvas has re-rendered with the new data
      setTimeout(() => {
        isApplyingSaveResultRef.current = false;
      }, 200);

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

      const { workflow: publishedWorkflow, version: publishedVersion } = await workflowBuilderApi.publish(workflowId);
      
      setWorkflow((prev) =>
        prev
          ? {
              ...prev,
              status: publishedWorkflow.status,
              version: publishedWorkflow.version,
              publishedAt: publishedWorkflow.publishedAt,
            }
          : null,
      );
      addNotification(
        `${t("notifications.published")}: ${t("notifications.publishedMessage", { version: String(publishedVersion.version) })}`,
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
      // Only mark as unsaved if we're not applying save results
      // This prevents the sync effects from re-marking as unsaved after a save
      if (!isApplyingSaveResultRef.current) {
        unsavedChangesGuard.setHasUnsavedChanges(true);
      }
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
      // Only mark as unsaved if we're not applying save results
      if (!isApplyingSaveResultRef.current) {
        unsavedChangesGuard.setHasUnsavedChanges(true);
      }
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
          onVersionRestore={fetchWorkflow}
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
