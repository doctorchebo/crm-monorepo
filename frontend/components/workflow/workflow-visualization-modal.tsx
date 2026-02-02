/**
 * Workflow Visualization Modal
 *
 * Displays a read-only view of the workflow canvas showing
 * the current execution state and path taken through the workflow.
 *
 * Features:
 * - Read-only canvas with nodes and connections
 * - Execution path highlighting with clear visual differentiation
 * - Current node indicator with pulsing animation
 * - Completed nodes with checkmark overlay
 * - Status badge reflecting actual workflow state
 * - Zoom controls (in/out/fit)
 * - MiniMap with proper contrast for light/dark modes
 * - History panel showing execution steps with timestamps
 * - Step selection to view progress at any point in time
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  WorkflowExecutionPathStep,
  WorkflowVisualizationData,
} from "@/lib/types/workflow.types";
import { cn } from "@/lib/utils";
import { getEdgeColor } from "@/lib/workflow/branch-utils";
import {
  Background,
  BackgroundVariant,
  type Edge,
  MiniMap,
  type Node,
  type NodeTypes,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  History,
  Loader2,
  Maximize2,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  Timer,
  Workflow,
  XCircle,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

// Import node components for rendering
import { ActionNode } from "./nodes/action-node";
import { BranchNode } from "./nodes/branch-node";
import { ConditionNode } from "./nodes/condition-node";
import { DelayNode } from "./nodes/delay-node";
import { EndNode } from "./nodes/end-node";
import { SubWorkflowNode } from "./nodes/sub-workflow-node";
import { TriggerNode } from "./nodes/trigger-node";

// ============================================================================
// Types
// ============================================================================

interface WorkflowVisualizationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: WorkflowVisualizationData | null;
  isLoading?: boolean;
}

// ============================================================================
// Node Types Map
// ============================================================================

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  trigger_message: TriggerNode,
  trigger_time: TriggerNode,
  trigger_webhook: TriggerNode,
  trigger_manual: TriggerNode,
  trigger_tag: TriggerNode,
  trigger_stage_enter: TriggerNode,
  condition: ConditionNode,
  condition_ai_classification: ConditionNode,
  condition_keyword: ConditionNode,
  condition_contact_field: ConditionNode,
  condition_time: ConditionNode,
  condition_chat_property: ConditionNode,
  condition_expression: ConditionNode,
  action: ActionNode,
  action_move_stage: ActionNode,
  action_send_template: ActionNode,
  action_send_message: ActionNode,
  action_assign_agent: ActionNode,
  action_add_tag: ActionNode,
  action_remove_tag: ActionNode,
  action_set_field: ActionNode,
  action_http_webhook: ActionNode,
  action_delay: ActionNode,
  action_pause_ai: ActionNode,
  action_resume_ai: ActionNode,
  action_request_handoff: ActionNode,
  action_send_email: ActionNode,
  action_internal_note: ActionNode,
  delay: DelayNode,
  branch: BranchNode,
  sub_workflow: SubWorkflowNode,
  end: EndNode,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a human-readable label for the action type
 */
function getActionLabel(action: string): string {
  const actionLabels: Record<string, string> = {
    entered: "Started",
    executed: "Completed",
    error: "Error",
    skipped: "Skipped",
    waiting: "Waiting",
  };
  return actionLabels[action] || action;
}

/**
 * Get the icon for a node type
 */
function getNodeTypeIcon(nodeType: string): React.ReactNode {
  if (nodeType.startsWith("trigger")) {
    return <Zap className="h-3 w-3" />;
  }
  if (nodeType.startsWith("condition")) {
    return <ChevronRight className="h-3 w-3" />;
  }
  if (nodeType.startsWith("action")) {
    return <Play className="h-3 w-3" />;
  }
  if (nodeType === "delay") {
    return <Timer className="h-3 w-3" />;
  }
  return <Workflow className="h-3 w-3" />;
}

/**
 * Format duration in milliseconds to human-readable
 */
function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ============================================================================
// Status Badge Component
// ============================================================================

function StatusBadge({
  status,
}: {
  status: WorkflowVisualizationData["status"];
}) {
  const statusConfig = {
    running: {
      label: "In Progress",
      icon: <Play className="h-3 w-3" />,
      className:
        "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400",
    },
    waiting: {
      label: "Waiting",
      icon: <Clock className="h-3 w-3" />,
      className:
        "bg-yellow-500/10 text-yellow-600 border-yellow-500/30 dark:text-yellow-400",
    },
    completed: {
      label: "Completed",
      icon: <CheckCircle2 className="h-3 w-3" />,
      className:
        "bg-green-500/10 text-green-600 border-green-500/30 dark:text-green-400",
    },
    failed: {
      label: "Failed",
      icon: <XCircle className="h-3 w-3" />,
      className:
        "bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400",
    },
    no_workflow: {
      label: "No Workflow",
      icon: <AlertCircle className="h-3 w-3" />,
      className: "bg-muted text-muted-foreground border-muted",
    },
  };

  const config = statusConfig[status];

  return (
    <Badge
      variant="outline"
      className={cn("flex items-center gap-1.5 font-medium", config.className)}
    >
      {config.icon}
      {config.label}
    </Badge>
  );
}

// ============================================================================
// Canvas Zoom Controls
// ============================================================================

function ZoomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const handleZoomIn = useCallback(() => {
    zoomIn({ duration: 200 });
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    zoomOut({ duration: 200 });
  }, [zoomOut]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 300 });
  }, [fitView]);

  return (
    <div className="react-flow__panel absolute bottom-3 left-3 z-10 flex flex-col gap-1 rounded-lg border bg-background p-1 shadow-sm">
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={handleZoomIn}
        title="Zoom in"
      >
        <Plus className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={handleZoomOut}
        title="Zoom out"
      >
        <Minus className="h-4 w-4" />
      </button>
      <div className="mx-1 h-px bg-border" />
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={handleFitView}
        title="Fit view"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ============================================================================
// History Panel Component
// ============================================================================

interface HistoryPanelProps {
  executionPath: WorkflowExecutionPathStep[];
  selectedStepIndex: number | null;
  onSelectStep: (index: number | null) => void;
  execution: WorkflowVisualizationData["execution"];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

function HistoryPanel({
  executionPath,
  selectedStepIndex,
  onSelectStep,
  execution,
  isCollapsed,
  onToggleCollapse,
}: HistoryPanelProps) {
  if (executionPath.length === 0) {
    return (
      <div
        className={cn(
          "border-l bg-muted/30 flex flex-col transition-all duration-200",
          isCollapsed ? "w-10" : "w-72",
        )}
      >
        <div className="flex items-center justify-between p-2 border-b">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onToggleCollapse}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
          {!isCollapsed && (
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              History
            </span>
          )}
        </div>
        {!isCollapsed && (
          <div className="flex-1 flex items-center justify-center p-4">
            <p className="text-xs text-muted-foreground text-center">
              No execution history yet.
              <br />
              Messages will trigger workflow execution.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border-l bg-muted/30 flex flex-col transition-all duration-200",
        isCollapsed ? "w-10" : "w-72",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0"
          onClick={onToggleCollapse}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
        {!isCollapsed && (
          <>
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              History
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => onSelectStep(null)}
              disabled={selectedStepIndex === null}
            >
              Show All
            </Button>
          </>
        )}
      </div>

      {/* Execution metadata */}
      {!isCollapsed && execution && (
        <div className="px-3 py-2 border-b text-[10px] text-muted-foreground space-y-1">
          {execution.startedAt && (
            <div className="flex justify-between">
              <span>Started</span>
              <span className="font-medium">
                {formatDistanceToNow(new Date(execution.startedAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Steps</span>
            <span className="font-medium">{executionPath.length}</span>
          </div>
        </div>
      )}

      {/* Steps list */}
      {!isCollapsed && (
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {executionPath.map((step, index) => {
              const isSelected = selectedStepIndex === index;
              const isError = step.action === "error";
              const isCompleted = step.action === "executed";

              return (
                <TooltipProvider key={`${step.nodeId}-${index}`}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "w-full text-left p-2 rounded-md transition-colors",
                          "hover:bg-muted",
                          isSelected && "bg-primary/10 ring-1 ring-primary/30",
                          isError && "bg-red-500/5",
                        )}
                        onClick={() => onSelectStep(isSelected ? null : index)}
                      >
                        <div className="flex items-start gap-2">
                          {/* Step indicator */}
                          <div
                            className={cn(
                              "mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0",
                              isError
                                ? "bg-red-500/20 text-red-600 dark:text-red-400"
                                : isCompleted
                                  ? "bg-green-500/20 text-green-600 dark:text-green-400"
                                  : "bg-blue-500/20 text-blue-600 dark:text-blue-400",
                            )}
                          >
                            {isError ? (
                              <XCircle className="h-3 w-3" />
                            ) : isCompleted ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              getNodeTypeIcon(step.nodeType)
                            )}
                          </div>

                          {/* Step details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-medium truncate">
                                {step.nodeName}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">
                                {getActionLabel(step.action)}
                              </span>
                              {step.durationMs !== null && (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                  <Timer className="h-2.5 w-2.5" />
                                  {formatDuration(step.durationMs)}
                                </span>
                              )}
                            </div>
                            {step.errorMessage && (
                              <p className="text-[10px] text-red-500 mt-1 truncate">
                                {step.errorMessage}
                              </p>
                            )}
                          </div>

                          {/* Step number */}
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">
                            #{index + 1}
                          </span>
                        </div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <div className="space-y-1">
                        <p className="font-medium">{step.nodeName}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(step.executedAt).toLocaleString()}
                        </p>
                        {step.conditionResult !== null && (
                          <p className="text-xs">
                            Condition:{" "}
                            <span
                              className={
                                step.conditionResult
                                  ? "text-green-500"
                                  : "text-red-500"
                              }
                            >
                              {step.conditionResult ? "True" : "False"}
                            </span>
                          </p>
                        )}
                        {step.errorMessage && (
                          <p className="text-xs text-red-500">
                            {step.errorMessage}
                          </p>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ============================================================================
// Canvas Inner Component (needs ReactFlow context)
// ============================================================================

interface VisualizationCanvasInnerProps {
  data: WorkflowVisualizationData;
  visibleStepCount: number | null; // null means show all steps
}

/**
 * Helper function to convert a workflow node to ReactFlow format.
 * This is the same transformation used in the workflow builder canvas.
 */
function nodeToReactFlow(
  node: WorkflowVisualizationData["nodes"][0],
  isVisited: boolean,
  isCurrent: boolean,
  hasExecutionPath: boolean,
): Node {
  // Only dim nodes when there's an execution path AND the node hasn't been visited
  // When there's no execution path, show all nodes at full opacity
  const shouldDim = hasExecutionPath && !isVisited && !isCurrent;

  return {
    id: node.id,
    type: node.type,
    position: { x: node.positionX, y: node.positionY },
    data: {
      label: node.name,
      description: node.description,
      config: node.config,
      isEntryPoint: node.isEntryPoint,
      isExitPoint: node.isExitPoint,
      metadata: node.metadata,
    },
    className: cn(
      // Current node gets a highlight ring
      isCurrent && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      // Dim unvisited nodes only when there's an execution path
      shouldDim && "opacity-40",
    ),
    selectable: false,
    draggable: false,
  };
}

/**
 * Helper function to convert a workflow connection to ReactFlow edge format.
 * This mirrors the transformation used in the workflow builder canvas.
 */
function connectionToReactFlowEdge(
  conn: WorkflowVisualizationData["connections"][0],
  isTraversed: boolean,
  hasExecutionPath: boolean,
): Edge {
  const edgeColor = getEdgeColor(
    conn.type as Parameters<typeof getEdgeColor>[0],
    conn.sourceHandle,
  );

  // When there's an execution path, highlight traversed edges and dim others
  // When there's no execution path, show all edges normally
  const showHighlighted = hasExecutionPath && isTraversed;
  const shouldDim = hasExecutionPath && !isTraversed;

  return {
    id: conn.id,
    source: conn.sourceNodeId,
    target: conn.targetNodeId,
    sourceHandle: conn.sourceHandle || undefined,
    targetHandle: conn.targetHandle || undefined,
    label: conn.label || undefined,
    type: "smoothstep",
    animated: showHighlighted,
    style: {
      stroke: showHighlighted ? edgeColor : "hsl(var(--muted-foreground))",
      strokeWidth: showHighlighted ? 3 : 2,
      opacity: shouldDim ? 0.3 : 1,
    },
    data: {
      connectionType: conn.type,
    },
  };
}

function VisualizationCanvasInner({
  data,
  visibleStepCount,
}: VisualizationCanvasInnerProps) {
  const { fitView } = useReactFlow();

  // Get the execution path up to the selected step
  const visibleExecutionPath = useMemo(() => {
    if (visibleStepCount === null) {
      return data.executionPath;
    }
    // Include steps up to and including the selected index
    return data.executionPath.slice(0, visibleStepCount + 1);
  }, [data.executionPath, visibleStepCount]);

  // Determine if we have an execution path to show
  const hasExecutionPath = visibleExecutionPath.length > 0;

  // Build set of visited node IDs for highlighting
  const visitedNodeIds = useMemo(() => {
    return new Set(visibleExecutionPath.map((step) => step.nodeId));
  }, [visibleExecutionPath]);

  // Determine current node - either the last visible step or the actual current node
  const currentNodeId = useMemo(() => {
    if (visibleStepCount !== null && visibleExecutionPath.length > 0) {
      // When viewing a specific step, the "current" node is that step
      return visibleExecutionPath[visibleExecutionPath.length - 1].nodeId;
    }
    return data.currentNodeId;
  }, [visibleStepCount, visibleExecutionPath, data.currentNodeId]);

  // Build set of traversed connection IDs
  const traversedConnectionIds = useMemo(() => {
    const pathNodeIds = visibleExecutionPath.map((step) => step.nodeId);
    const traversed = new Set<string>();

    for (let i = 0; i < pathNodeIds.length - 1; i++) {
      const fromNodeId = pathNodeIds[i];
      const toNodeId = pathNodeIds[i + 1];

      const connection = data.connections.find(
        (c) => c.sourceNodeId === fromNodeId && c.targetNodeId === toNodeId,
      );

      if (connection) {
        traversed.add(connection.id);
      }
    }

    return traversed;
  }, [visibleExecutionPath, data.connections]);

  // Convert workflow nodes to ReactFlow format
  const nodes: Node[] = useMemo(() => {
    return data.nodes.map((node) => {
      const isVisited = visitedNodeIds.has(node.id);
      const isCurrent = node.id === currentNodeId;
      return nodeToReactFlow(node, isVisited, isCurrent, hasExecutionPath);
    });
  }, [data.nodes, visitedNodeIds, currentNodeId, hasExecutionPath]);

  // Convert workflow connections to ReactFlow edges
  const edges: Edge[] = useMemo(() => {
    return data.connections.map((conn) => {
      const isTraversed = traversedConnectionIds.has(conn.id);
      return connectionToReactFlowEdge(conn, isTraversed, hasExecutionPath);
    });
  }, [data.connections, traversedConnectionIds, hasExecutionPath]);

  // Fit view on mount and when nodes change
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.2, duration: 300 });
    }, 100);
    return () => clearTimeout(timer);
  }, [fitView, nodes]);

  // MiniMap node color function
  const getMiniMapNodeColor = useCallback(
    (node: Node): string => {
      if (!hasExecutionPath) {
        // No execution path - use neutral color for all nodes
        return "#64748b"; // slate-500
      }

      const isVisited = visitedNodeIds.has(node.id);
      const isCurrent = node.id === currentNodeId;

      if (isCurrent) return "#3b82f6"; // blue-500
      if (isVisited) return "#22c55e"; // green-500
      return "#94a3b8"; // slate-400 (dimmed)
    },
    [visitedNodeIds, currentNodeId, hasExecutionPath],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnScroll
      zoomOnScroll
      minZoom={0.1}
      maxZoom={2}
      defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
      proOptions={{ hideAttribution: true }}
      className="bg-muted/20"
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={16}
        size={1}
        className="!fill-muted-foreground/20"
      />
      <ZoomControls />
      <MiniMap
        nodeStrokeWidth={3}
        pannable
        zoomable
        nodeColor={getMiniMapNodeColor}
        nodeBorderRadius={4}
        style={{
          backgroundColor: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
        }}
        maskColor="rgba(0, 0, 0, 0.1)"
      />
    </ReactFlow>
  );
}

// ============================================================================
// No Workflow State
// ============================================================================

function NoWorkflowState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Workflow className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No Active Workflow</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        This conversation doesn&apos;t have an active workflow assigned. Assign
        a workflow to see the execution path here.
      </p>
    </div>
  );
}

// ============================================================================
// Loading State
// ============================================================================

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center h-full space-y-4">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Loading workflow...</p>
    </div>
  );
}

// ============================================================================
// Main Modal Component
// ============================================================================

export function WorkflowVisualizationModal({
  open,
  onOpenChange,
  data,
  isLoading,
}: WorkflowVisualizationModalProps) {
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(
    null,
  );
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);

  const hasWorkflow = data?.workflow !== null && data?.status !== "no_workflow";

  // Reset selected step when modal opens/closes or data changes
  useEffect(() => {
    if (!open) {
      setSelectedStepIndex(null);
    }
  }, [open]);

  // Compute effective status
  const effectiveStatus = useMemo(() => {
    if (!data) return "no_workflow";
    if (data.status === "no_workflow") return "no_workflow";

    if (data.executionPath.length > 0) {
      if (data.currentNodeId) {
        return "running" as const;
      }
      return data.status;
    }

    return data.status;
  }, [data]);

  // Handle step selection
  const handleSelectStep = useCallback((index: number | null) => {
    setSelectedStepIndex(index);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0"
        aria-describedby="workflow-visualization-description"
      >
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Workflow className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg">
                  {data?.workflow?.name || "Workflow Progress"}
                </DialogTitle>
                <DialogDescription
                  id="workflow-visualization-description"
                  className="text-sm text-muted-foreground mt-0.5"
                >
                  {data?.workflow?.description ||
                    "View the current workflow execution state and path"}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedStepIndex !== null && (
                <Badge variant="secondary" className="text-xs">
                  Viewing step {selectedStepIndex + 1} of{" "}
                  {data?.executionPath.length || 0}
                </Badge>
              )}
              {data && <StatusBadge status={effectiveStatus} />}
            </div>
          </div>
        </DialogHeader>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Canvas Area */}
          <div className="flex-1 relative overflow-hidden">
            {isLoading ? (
              <LoadingState />
            ) : !hasWorkflow ? (
              <NoWorkflowState />
            ) : data ? (
              <ReactFlowProvider>
                <VisualizationCanvasInner
                  data={data}
                  visibleStepCount={selectedStepIndex}
                />
              </ReactFlowProvider>
            ) : null}
          </div>

          {/* History Panel */}
          {hasWorkflow && data && (
            <HistoryPanel
              executionPath={data.executionPath}
              selectedStepIndex={selectedStepIndex}
              onSelectStep={handleSelectStep}
              execution={data.execution}
              isCollapsed={isHistoryCollapsed}
              onToggleCollapse={() =>
                setIsHistoryCollapsed(!isHistoryCollapsed)
              }
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
