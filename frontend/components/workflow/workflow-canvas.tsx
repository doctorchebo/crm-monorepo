"use client";

import type {
  ConnectionCondition,
  WorkflowConnectionType,
  WorkflowNodeType,
  WorkflowWithDetails,
} from "@/lib/types/workflow.types";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Connection,
  MiniMap,
  Node,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type NodeTypes,
  type OnConnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Maximize2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { ActionNode } from "./nodes/action-node";
import { BranchNode } from "./nodes/branch-node";
import { ConditionNode } from "./nodes/condition-node";
import { DelayNode } from "./nodes/delay-node";
import { EndNode } from "./nodes/end-node";
import { SubWorkflowNode } from "./nodes/sub-workflow-node";
import { TriggerNode } from "./nodes/trigger-node";

interface WorkflowCanvasProps {
  workflow: WorkflowWithDetails;
  onUpdate: (updates: Partial<WorkflowWithDetails>) => void;
  onNodeSelect?: (nodeId: string | null) => void;
}

// Map workflow node types to ReactFlow node types
const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
  delay: DelayNode,
  branch: BranchNode,
  sub_workflow: SubWorkflowNode,
  end: EndNode,
};

// Convert workflow nodes to ReactFlow format
function workflowNodesToReactFlow(nodes: WorkflowWithDetails["nodes"]): Node[] {
  return nodes.map((node) => ({
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
  }));
}

// Convert workflow connections to ReactFlow edges
function workflowConnectionsToReactFlow(
  connections: WorkflowWithDetails["connections"],
): Edge[] {
  return connections.map((conn) => ({
    id: conn.id,
    source: conn.sourceNodeId,
    target: conn.targetNodeId,
    sourceHandle: conn.sourceHandle || undefined,
    targetHandle: conn.targetHandle || undefined,
    label: conn.label || undefined,
    type: "smoothstep",
    animated: conn.type === "default",
    style: {
      stroke: getEdgeColor(conn.type),
      strokeWidth: 2,
    },
    data: {
      connectionType: conn.type,
      condition: conn.condition,
      priority: conn.priority,
    },
  }));
}

function getEdgeColor(type: string): string {
  switch (type) {
    case "success":
    case "condition_true":
      return "#22c55e";
    case "failure":
    case "condition_false":
      return "#ef4444";
    case "timeout":
      return "#f59e0b";
    default:
      return "#64748b";
  }
}

// Generate unique ID for new nodes
function generateNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function WorkflowCanvasInner({
  workflow,
  onUpdate,
  onNodeSelect,
}: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView, zoomIn, zoomOut, setViewport } =
    useReactFlow();

  /**
   * Track whether we're currently syncing FROM workflow prop TO React Flow state.
   * This prevents the circular update pattern:
   * workflow.nodes change → setNodes → nodes change → onUpdate → workflow.nodes change → ...
   */
  const isSyncingFromWorkflow = useRef(false);

  /**
   * Track the workflow ID to detect when we're loading a different workflow.
   */
  const currentWorkflowIdRef = useRef<string>(workflow.id);

  /**
   * Track the last known workflow node data to detect external changes.
   * We only need to track data properties (name, description, config) since
   * positions are managed by React Flow.
   */
  const lastSyncedNodeData = useRef<Map<string, string>>(new Map());

  // Convert workflow data to React Flow format
  const convertedNodes = useMemo(
    () => workflowNodesToReactFlow(workflow.nodes),
    [workflow.nodes],
  );

  const convertedEdges = useMemo(
    () => workflowConnectionsToReactFlow(workflow.connections),
    [workflow.connections],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(convertedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(convertedEdges);

  /**
   * Effect to fully reset React Flow state when loading a different workflow.
   * This handles the case when navigating between workflows or when initial
   * workflow data is loaded asynchronously after component mount.
   */
  useEffect(() => {
    // Check if this is a workflow change (different ID or initial load)
    const isWorkflowChange = currentWorkflowIdRef.current !== workflow.id;
    const isInitialLoad =
      nodes.length === 0 &&
      edges.length === 0 &&
      (workflow.nodes.length > 0 || workflow.connections.length > 0);

    if (isWorkflowChange || isInitialLoad) {
      currentWorkflowIdRef.current = workflow.id;
      isSyncingFromWorkflow.current = true;

      // Reset tracking map
      lastSyncedNodeData.current.clear();
      workflow.nodes.forEach((wn) => {
        lastSyncedNodeData.current.set(
          wn.id,
          JSON.stringify({
            name: wn.name,
            description: wn.description,
            config: wn.config,
          }),
        );
      });

      // Fully replace nodes and edges
      setNodes(convertedNodes);
      setEdges(convertedEdges);

      // Reset the flag after React processes the state update
      setTimeout(() => {
        isSyncingFromWorkflow.current = false;
        // Fit view after nodes are loaded
        fitView({ duration: 200 });
      }, 0);

      return; // Exit early - full reset handled
    }

    // For same workflow, just update tracking map (incremental sync is below)
  }, [
    workflow.id,
    workflow.nodes,
    workflow.connections,
    convertedNodes,
    convertedEdges,
    setNodes,
    setEdges,
    nodes.length,
    edges.length,
    fitView,
  ]);

  /**
   * Sync node data (name, description, config) FROM workflow prop TO React Flow state.
   * This enables external components (like NodeConfigPanel) to update node data
   * and have those changes reflected in the canvas.
   *
   * Only syncs when changes are detected that weren't caused by this component
   * (i.e., external changes from NodeConfigPanel).
   */
  useEffect(() => {
    // Check if any node data changed externally
    let hasExternalChanges = false;
    const updatedDataMap = new Map<
      string,
      { name: string; description: string | null | undefined; config: unknown }
    >();

    for (const workflowNode of workflow.nodes) {
      const currentDataString = JSON.stringify({
        name: workflowNode.name,
        description: workflowNode.description,
        config: workflowNode.config,
      });
      const lastSyncedString = lastSyncedNodeData.current.get(workflowNode.id);

      if (currentDataString !== lastSyncedString) {
        hasExternalChanges = true;
        updatedDataMap.set(workflowNode.id, {
          name: workflowNode.name,
          description: workflowNode.description ?? null,
          config: workflowNode.config,
        });
        // Update tracking
        lastSyncedNodeData.current.set(workflowNode.id, currentDataString);
      }
    }

    if (!hasExternalChanges) return;

    // Mark that we're syncing from workflow to prevent circular updates
    isSyncingFromWorkflow.current = true;

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const updatedData = updatedDataMap.get(node.id);
        if (!updatedData) return node;

        return {
          ...node,
          data: {
            ...node.data,
            label: updatedData.name,
            description: updatedData.description,
            config: updatedData.config,
          },
        };
      }),
    );

    // Reset the flag after React processes the state update
    // Using setTimeout to ensure it happens after the state update is processed
    setTimeout(() => {
      isSyncingFromWorkflow.current = false;
    }, 0);
  }, [workflow.nodes, setNodes]);

  // Sync nodes/edges changes back to parent (only for position/structure changes from React Flow)
  useEffect(() => {
    // Skip if this update was caused by syncing from workflow prop
    if (isSyncingFromWorkflow.current) return;

    const updatedNodes: WorkflowWithDetails["nodes"] = nodes.map((node) => {
      // Find the original workflow node to preserve timestamps and other metadata
      const originalNode = workflow.nodes.find((wn) => wn.id === node.id);

      return {
        id: node.id,
        workflowId: workflow.id,
        type: node.type as WorkflowNodeType,
        name: (node.data.label as string) || "Unnamed",
        description: (node.data.description as string) || null,
        config: (node.data.config as Record<string, unknown>) || {},
        positionX: node.position.x,
        positionY: node.position.y,
        width: node.measured?.width || null,
        height: node.measured?.height || null,
        isEntryPoint: Boolean(node.data.isEntryPoint),
        isExitPoint: Boolean(node.data.isExitPoint),
        metadata: (node.data.metadata as Record<string, unknown>) || {},
        createdAt: originalNode?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    const updatedConnections: WorkflowWithDetails["connections"] = edges.map(
      (edge) => {
        const originalConnection = workflow.connections.find(
          (c) => c.id === edge.id,
        );

        return {
          id: edge.id,
          workflowId: workflow.id,
          sourceNodeId: edge.source,
          targetNodeId: edge.target,
          sourceHandle: edge.sourceHandle || null,
          targetHandle: edge.targetHandle || null,
          type:
            (edge.data?.connectionType as WorkflowConnectionType) || "default",
          label: (edge.label as string) || null,
          condition: (edge.data?.condition as ConnectionCondition) || null,
          priority: (edge.data?.priority as number) || 0,
          metadata: {},
          createdAt: originalConnection?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      },
    );

    // Compare only the meaningful properties, not timestamps
    const nodesEqual =
      nodes.length === workflow.nodes.length &&
      nodes.every((node) => {
        const wn = workflow.nodes.find((w) => w.id === node.id);
        if (!wn) return false;
        return (
          node.position.x === wn.positionX &&
          node.position.y === wn.positionY &&
          node.data.label === wn.name &&
          node.data.description === wn.description &&
          JSON.stringify(node.data.config) === JSON.stringify(wn.config)
        );
      });

    const edgesEqual =
      edges.length === workflow.connections.length &&
      edges.every((edge) => {
        const wc = workflow.connections.find((c) => c.id === edge.id);
        if (!wc) return false;
        return (
          edge.source === wc.sourceNodeId && edge.target === wc.targetNodeId
        );
      });

    if (!nodesEqual || !edgesEqual) {
      onUpdate({
        nodes: updatedNodes,
        connections: updatedConnections,
      });
    }
  }, [
    nodes,
    edges,
    workflow.id,
    workflow.nodes,
    workflow.connections,
    onUpdate,
  ]);

  // Handle node selection
  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node[] }) => {
      if (selectedNodes.length === 1) {
        onNodeSelect?.(selectedNodes[0].id);
      } else {
        onNodeSelect?.(null);
      }
    },
    [onNodeSelect],
  );

  // Handle new connections
  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            id: `edge_${Date.now()}`,
            type: "smoothstep",
            animated: true,
            style: { stroke: "#64748b", strokeWidth: 2 },
            data: { connectionType: "default", priority: 0 },
          },
          eds,
        ),
      );
    },
    [setEdges],
  );

  // Handle drop from sidebar
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const data = event.dataTransfer.getData("application/workflow-node");
      if (!data) return;

      const nodeData = JSON.parse(data);
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: generateNodeId(),
        type: nodeData.type,
        position,
        data: {
          label: nodeData.label,
          description: "",
          config: {},
          isEntryPoint: nodeData.type === "trigger",
          isExitPoint: nodeData.type === "end",
          metadata: {},
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes],
  );

  // Handle node selection for editing
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    // TODO: Open node configuration panel
    console.log("Node clicked:", node);
  }, []);

  // Handle node deletion
  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      const deletedIds = new Set(deleted.map((n) => n.id));
      setEdges((eds) =>
        eds.filter(
          (e) => !deletedIds.has(e.source) && !deletedIds.has(e.target),
        ),
      );
    },
    [setEdges],
  );

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onNodesDelete={onNodesDelete}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{
          type: "smoothstep",
          animated: true,
        }}
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode={["Shift"]}
        className="bg-muted/30 dark:bg-muted/10"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          className="!fill-muted-foreground/30 dark:!fill-muted-foreground/50"
        />
        {/* Custom controls panel with proper dark mode styling */}
        <div className="react-flow__panel react-flow__controls absolute bottom-2 left-2 z-10 flex flex-col gap-1 rounded-lg border bg-background p-1 shadow-sm">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => zoomIn()}
            title="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => zoomOut()}
            title="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>
          <div className="mx-1 h-px bg-border" />
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => fitView()}
            title="Fit view"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
        <MiniMap
          nodeStrokeWidth={3}
          pannable
          zoomable
          className="!bg-background !border !border-border"
          maskColor="hsl(var(--muted) / 0.7)"
          nodeColor="hsl(var(--primary) / 0.8)"
        />
      </ReactFlow>
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <div className="flex-1 h-full">
      <ReactFlowProvider>
        <WorkflowCanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
