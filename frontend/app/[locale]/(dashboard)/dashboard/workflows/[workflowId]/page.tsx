"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { NodeConfigPanel } from "@/components/workflow/node-config-panel";
import { WorkflowCanvas } from "@/components/workflow/workflow-canvas";
import { WorkflowHeader } from "@/components/workflow/workflow-header";
import { WorkflowSidebar } from "@/components/workflow/workflow-sidebar";
import { useNotification } from "@/hooks/use-notification";
import { workflowBuilderApi } from "@/lib/api/workflow-builder";
import type {
  WorkflowNode,
  WorkflowWithDetails,
} from "@/lib/types/workflow.types";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function WorkflowEditorPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations("workflows.editor");
  const { addNotification } = useNotification();
  const workflowId = params.workflowId as string;

  const [workflow, setWorkflow] = useState<WorkflowWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
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

  // Warn about unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleSave = useCallback(async () => {
    if (!workflow) return;

    try {
      setSaving(true);
      const updatedWorkflow = await workflowBuilderApi.saveCanvas(workflowId, {
        nodes: workflow.nodes.map((node) => ({
          id: node.id,
          type: node.type,
          name: node.name,
          description: node.description || undefined,
          config: node.config,
          positionX: node.positionX,
          positionY: node.positionY,
          isEntryPoint: node.isEntryPoint,
          isExitPoint: node.isExitPoint,
          metadata: node.metadata,
        })),
        connections: workflow.connections.map((conn) => ({
          id: conn.id,
          sourceNodeId: conn.sourceNodeId,
          targetNodeId: conn.targetNodeId,
          sourceHandle: conn.sourceHandle || undefined,
          targetHandle: conn.targetHandle || undefined,
          type: conn.type,
          label: conn.label || undefined,
          condition: conn.condition || undefined,
          priority: conn.priority,
        })),
        variables: workflow.variables.map((v) => ({
          id: v.id,
          name: v.name,
          type: v.type,
          scope: v.scope,
          defaultValue: v.defaultValue,
          description: v.description || undefined,
          isRequired: v.isRequired,
          validation: v.validation || undefined,
        })),
        canvasState: workflow.canvasState,
      });

      setWorkflow(updatedWorkflow);
      setHasUnsavedChanges(false);
      addNotification(t("notifications.saved"), "success");
    } catch (error) {
      addNotification(
        `${t("errors.saveFailed")}: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    } finally {
      setSaving(false);
    }
  }, [workflow, workflowId, addNotification, t]);

  const handlePublish = useCallback(async () => {
    if (!workflow) return;

    try {
      // First save any pending changes
      if (hasUnsavedChanges) {
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
  }, [workflow, workflowId, hasUnsavedChanges, handleSave, addNotification, t]);

  const handleWorkflowUpdate = useCallback(
    (updates: Partial<WorkflowWithDetails>) => {
      setWorkflow((prev) => (prev ? { ...prev, ...updates } : null));
      setHasUnsavedChanges(true);
    },
    [],
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
      setHasUnsavedChanges(true);
    },
    [],
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
    <div className="h-screen flex flex-col overflow-hidden">
      <WorkflowHeader
        workflow={workflow}
        saving={saving}
        hasUnsavedChanges={hasUnsavedChanges}
        onSave={handleSave}
        onPublish={handlePublish}
        onUpdate={handleWorkflowUpdate}
      />
      <div className="flex-1 flex overflow-hidden">
        <WorkflowSidebar workflow={workflow} onUpdate={handleWorkflowUpdate} />
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
  );
}
