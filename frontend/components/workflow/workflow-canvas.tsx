"use client";

import type {
  ConnectionCondition,
  WorkflowConnectionType,
  WorkflowNodeType,
  WorkflowWithDetails,
} from "@/lib/types/workflow.types";
import { getEdgeColor } from "@/lib/workflow/branch-utils";
import {
  addEdge,
  applyEdgeChanges as applyReactFlowEdgeChanges,
  applyNodeChanges as applyReactFlowNodeChanges,
  Background,
  BackgroundVariant,
  Connection,
  EdgeChange,
  MiniMap,
  Node,
  NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type NodeTypes,
  type OnConnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Maximize2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/**
 * Convert a single workflow node to ReactFlow format
 */
function workflowNodeToReactFlow(node: WorkflowWithDetails["nodes"][0]): Node {
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
  };
}

/**
 * Convert a single workflow connection to ReactFlow edge format
 */
function workflowConnectionToReactFlow(
  conn: WorkflowWithDetails["connections"][0],
): Edge {
  // Use sourceHandle for color when available (for branch-specific colors)
  const edgeColor = getEdgeColor(conn.type, conn.sourceHandle);

  return {
    id: conn.id,
    source: conn.sourceNodeId,
    target: conn.targetNodeId,
    sourceHandle: conn.sourceHandle || undefined,
    targetHandle: conn.targetHandle || undefined,
    label: conn.label || undefined,
    type: "smoothstep",
    animated: conn.type === "default",
    style: {
      stroke: edgeColor,
      strokeWidth: 2,
    },
    data: {
      connectionType: conn.type,
      condition: conn.condition,
      priority: conn.priority,
    },
  };
}

/**
 * Generate unique ID for new nodes
 */
function generateNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate unique ID for new edges
 */
function generateEdgeId(): string {
  return `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Convert React Flow node back to workflow node format
 */
function reactFlowNodeToWorkflow(
  node: Node,
  workflowId: string,
  existingNode?: WorkflowWithDetails["nodes"][0],
): WorkflowWithDetails["nodes"][0] {
  return {
    id: node.id,
    workflowId,
    type: node.type as WorkflowNodeType,
    name: (node.data?.label as string) || "Unnamed",
    description: (node.data?.description as string) || null,
    config: (node.data?.config as Record<string, unknown>) || {},
    positionX: node.position.x,
    positionY: node.position.y,
    width: node.measured?.width || null,
    height: node.measured?.height || null,
    isEntryPoint: Boolean(node.data?.isEntryPoint),
    isExitPoint: Boolean(node.data?.isExitPoint),
    metadata: (node.data?.metadata as Record<string, unknown>) || {},
    createdAt: existingNode?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Convert React Flow edge back to workflow connection format
 */
function reactFlowEdgeToWorkflow(
  edge: Edge,
  workflowId: string,
  existingConnection?: WorkflowWithDetails["connections"][0],
): WorkflowWithDetails["connections"][0] {
  return {
    id: edge.id,
    workflowId,
    sourceNodeId: edge.source,
    targetNodeId: edge.target,
    sourceHandle: edge.sourceHandle || null,
    targetHandle: edge.targetHandle || null,
    type: (edge.data?.connectionType as WorkflowConnectionType) || "default",
    label: (edge.label as string) || null,
    condition: (edge.data?.condition as ConnectionCondition) || null,
    priority: (edge.data?.priority as number) || 0,
    metadata: {},
    createdAt: existingConnection?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Generate a signature for workflow data to detect changes
 */
function getWorkflowSignature(
  nodes: WorkflowWithDetails["nodes"],
  connections: WorkflowWithDetails["connections"],
): string {
  const nodeIds = nodes
    .map((n) => n.id)
    .sort()
    .join(",");
  const connIds = connections
    .map((c) => c.id)
    .sort()
    .join(",");
  return `${nodeIds}|${connIds}`;
}

/**
 * Pending update type for queueing changes
 */
type PendingUpdate = {
  type: "nodes" | "connections" | "both";
  nodes?: WorkflowWithDetails["nodes"];
  connections?: WorkflowWithDetails["connections"];
};

function WorkflowCanvasInner({
  workflow,
  onUpdate,
  onNodeSelect,
}: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView, zoomIn, zoomOut } = useReactFlow();

  /**
   * Track whether we're currently syncing from workflow prop.
   * When true, we skip propagating changes back to parent.
   */
  const isSyncingFromWorkflowRef = useRef(false);

  /**
   * Track the current workflow ID for detecting workflow switches
   */
  const currentWorkflowIdRef = useRef(workflow.id);

  /**
   * Store a signature of the workflow data to detect external changes.
   */
  const workflowSignatureRef = useRef(
    getWorkflowSignature(workflow.nodes, workflow.connections),
  );

  /**
   * Queue for pending updates to be propagated to parent.
   * This is the KEY to avoiding the React render error - we queue updates
   * and process them in useEffect, NOT during render.
   */
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(
    null,
  );

  /**
   * Convert workflow data to React Flow format (memoized)
   */
  const initialNodes = useMemo(
    () => workflow.nodes.map(workflowNodeToReactFlow),
    [workflow.nodes],
  );

  const initialEdges = useMemo(
    () => workflow.connections.map(workflowConnectionToReactFlow),
    [workflow.connections],
  );

  /**
   * React Flow state
   */
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

  /**
   * Refs to track latest state for use in callbacks without stale closures
   */
  const nodesRef = useRef<Node[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);

  // Keep refs in sync with state
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  /**
   * EFFECT: Sync FROM workflow prop TO React Flow state.
   * This runs when the workflow prop changes from parent.
   */
  useEffect(() => {
    const newSignature = getWorkflowSignature(
      workflow.nodes,
      workflow.connections,
    );
    const workflowSwitched = currentWorkflowIdRef.current !== workflow.id;

    // If signature hasn't changed, this is our own update bouncing back - skip
    if (!workflowSwitched && newSignature === workflowSignatureRef.current) {
      return;
    }

    // Update tracking refs
    currentWorkflowIdRef.current = workflow.id;
    workflowSignatureRef.current = newSignature;

    // Mark that we're syncing from workflow
    isSyncingFromWorkflowRef.current = true;

    // Update React Flow state and refs
    setNodes(initialNodes);
    setEdges(initialEdges);
    nodesRef.current = initialNodes;
    edgesRef.current = initialEdges;

    // Fit view on workflow switch
    if (workflowSwitched) {
      setTimeout(() => {
        fitView({ duration: 200 });
      }, 50);
    }

    // Clear sync flag after React processes the update
    const timeoutId = setTimeout(() => {
      isSyncingFromWorkflowRef.current = false;
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [
    workflow.id,
    workflow.nodes,
    workflow.connections,
    initialNodes,
    initialEdges,
    fitView,
  ]);

  /**
   * EFFECT: Process pending updates and propagate to parent.
   * This is called AFTER render, avoiding the React error.
   */
  useEffect(() => {
    if (!pendingUpdate || isSyncingFromWorkflowRef.current) {
      return;
    }

    // Update the signature to prevent echo
    if (pendingUpdate.nodes && pendingUpdate.connections) {
      workflowSignatureRef.current = getWorkflowSignature(
        pendingUpdate.nodes,
        pendingUpdate.connections,
      );
    } else if (pendingUpdate.nodes) {
      workflowSignatureRef.current = getWorkflowSignature(
        pendingUpdate.nodes,
        workflow.connections,
      );
    } else if (pendingUpdate.connections) {
      workflowSignatureRef.current = getWorkflowSignature(
        workflow.nodes,
        pendingUpdate.connections,
      );
    }

    // Call onUpdate with the pending changes
    const updates: Partial<WorkflowWithDetails> = {};
    if (pendingUpdate.nodes) {
      updates.nodes = pendingUpdate.nodes;
    }
    if (pendingUpdate.connections) {
      updates.connections = pendingUpdate.connections;
    }

    onUpdate(updates);

    // Clear the pending update
    setPendingUpdate(null);
  }, [pendingUpdate, workflow.nodes, workflow.connections, onUpdate]);

  /**
   * Queue an update to be propagated to parent
   */
  const queueUpdate = useCallback(
    (updatedNodes: Node[] | null, updatedEdges: Edge[] | null) => {
      if (isSyncingFromWorkflowRef.current) return;

      const workflowNodes = updatedNodes
        ? updatedNodes.map((node) => {
            const existingNode = workflow.nodes.find((wn) => wn.id === node.id);
            return reactFlowNodeToWorkflow(node, workflow.id, existingNode);
          })
        : undefined;

      const workflowConnections = updatedEdges
        ? updatedEdges.map((edge) => {
            const existingConn = workflow.connections.find(
              (c) => c.id === edge.id,
            );
            return reactFlowEdgeToWorkflow(edge, workflow.id, existingConn);
          })
        : undefined;

      setPendingUpdate({
        type:
          workflowNodes && workflowConnections
            ? "both"
            : workflowNodes
              ? "nodes"
              : "connections",
        nodes: workflowNodes,
        connections: workflowConnections,
      });
    },
    [workflow.id, workflow.nodes, workflow.connections],
  );

  /**
   * Handle node changes from React Flow
   */
  const handleNodesChange = useCallback(
    (changes: NodeChange<Node>[]) => {
      setNodes((currentNodes) => {
        const newNodes = applyReactFlowNodeChanges(changes, currentNodes);
        // Update ref immediately so it's available for queueUpdate
        nodesRef.current = newNodes;
        return newNodes;
      });

      // Check if there are meaningful changes (position drag completed)
      const hasPositionEnd = changes.some(
        (c) => c.type === "position" && c.dragging === false,
      );

      if (hasPositionEnd && !isSyncingFromWorkflowRef.current) {
        // Use setTimeout to ensure we're outside React's render phase
        setTimeout(() => {
          queueUpdate(nodesRef.current, edgesRef.current);
        }, 0);
      }
    },
    [queueUpdate],
  );

  /**
   * Handle edge changes from React Flow
   */
  const handleEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      setEdges((currentEdges) => {
        const newEdges = applyReactFlowEdgeChanges(changes, currentEdges);
        // Update ref immediately so it's available for queueUpdate
        edgesRef.current = newEdges;
        return newEdges;
      });

      // Propagate deletions
      const hasDeletions = changes.some((c) => c.type === "remove");
      if (hasDeletions && !isSyncingFromWorkflowRef.current) {
        setTimeout(() => {
          queueUpdate(nodesRef.current, edgesRef.current);
        }, 0);
      }
    },
    [queueUpdate],
  );

  /**
   * Handle new connections from React Flow
   */
  const handleConnect: OnConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;

      // Determine connection type from source handle
      // For dynamic branches (like AI classification categories), we use "branch" as type
      // The actual branch identification is stored in sourceHandle
      let connectionType: WorkflowConnectionType = "default";
      if (params.sourceHandle) {
        if (params.sourceHandle === "true" || params.sourceHandle === "yes") {
          connectionType = "true";
        } else if (
          params.sourceHandle === "false" ||
          params.sourceHandle === "no"
        ) {
          connectionType = "false";
        } else if (params.sourceHandle === "timeout") {
          connectionType = "timeout";
        } else if (params.sourceHandle === "error") {
          connectionType = "error";
        } else if (params.sourceHandle !== "output") {
          // For dynamic branches (AI classification, etc.), use "branch" type
          connectionType = "branch";
        }
      }

      const newEdgeId = generateEdgeId();
      // Get color based on source handle for consistent coloring with node handles
      const edgeColor = getEdgeColor(connectionType, params.sourceHandle);

      const newEdge: Edge = {
        id: newEdgeId,
        source: params.source,
        target: params.target,
        sourceHandle: params.sourceHandle || undefined,
        targetHandle: params.targetHandle || undefined,
        type: "smoothstep",
        animated: connectionType === "default",
        style: { stroke: edgeColor, strokeWidth: 2 },
        data: { connectionType, priority: 0 },
      };

      // Create workflow connection for parent update
      const newConnection: WorkflowWithDetails["connections"][0] = {
        id: newEdgeId,
        workflowId: workflow.id,
        sourceNodeId: params.source,
        targetNodeId: params.target,
        sourceHandle: params.sourceHandle || null,
        targetHandle: params.targetHandle || null,
        type: connectionType,
        label: null,
        condition: null,
        priority: 0,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Update local state
      setEdges((eds) => {
        const newEdges = addEdge(newEdge, eds);
        edgesRef.current = newEdges;
        return newEdges;
      });

      // Queue update for parent (NOT during render)
      const newWorkflowConnections = [...workflow.connections, newConnection];
      setPendingUpdate({
        type: "connections",
        connections: newWorkflowConnections,
      });
    },
    [workflow.id, workflow.connections],
  );

  /**
   * Handle node selection
   */
  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node[] }) => {
      if (selectedNodes.length === 1) {
        onNodeSelect?.(selectedNodes[0].id);
      } else {
        onNodeSelect?.(null);
      }
    },
    [onNodeSelect],
  );

  /**
   * Handle drop from sidebar (add new node)
   */
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const data = event.dataTransfer.getData("application/workflow-node");
      if (!data) return;

      const nodeData = JSON.parse(data);
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNodeId = generateNodeId();

      // Create React Flow node
      const newRFNode: Node = {
        id: newNodeId,
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

      // Create workflow node for parent update
      const newWorkflowNode: WorkflowWithDetails["nodes"][0] = {
        id: newNodeId,
        workflowId: workflow.id,
        type: nodeData.type as WorkflowNodeType,
        name: nodeData.label,
        description: null,
        config: {},
        positionX: position.x,
        positionY: position.y,
        width: null,
        height: null,
        isEntryPoint: nodeData.type === "trigger",
        isExitPoint: nodeData.type === "end",
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Update local state
      setNodes((nds) => {
        const newNodes = [...nds, newRFNode];
        nodesRef.current = newNodes;
        return newNodes;
      });

      // Queue update for parent (NOT during render)
      const newWorkflowNodes = [...workflow.nodes, newWorkflowNode];
      setPendingUpdate({
        type: "nodes",
        nodes: newWorkflowNodes,
      });
    },
    [screenToFlowPosition, workflow.id, workflow.nodes],
  );

  /**
   * Handle node deletion
   */
  const handleNodesDelete = useCallback(
    (deleted: Node[]) => {
      const deletedIds = new Set(deleted.map((n) => n.id));

      // Update local edge state
      setEdges((eds) => {
        const newEdges = eds.filter(
          (e) => !deletedIds.has(e.source) && !deletedIds.has(e.target),
        );
        edgesRef.current = newEdges;
        return newEdges;
      });

      // Calculate remaining nodes and connections for parent
      const remainingNodes = workflow.nodes.filter(
        (n) => !deletedIds.has(n.id),
      );
      const remainingConnections = workflow.connections.filter(
        (c) =>
          !deletedIds.has(c.sourceNodeId) && !deletedIds.has(c.targetNodeId),
      );

      // Queue update for parent (NOT during render)
      setPendingUpdate({
        type: "both",
        nodes: remainingNodes,
        connections: remainingConnections,
      });
    },
    [workflow.nodes, workflow.connections],
  );

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onNodesDelete={handleNodesDelete}
        onSelectionChange={handleSelectionChange}
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
        {/* Custom controls panel */}
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
