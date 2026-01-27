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
  Controls,
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

  // Initialize nodes and edges from workflow
  const initialNodes = useMemo(
    () => workflowNodesToReactFlow(workflow.nodes),
    [], // Only on initial mount
  );
  const initialEdges = useMemo(
    () => workflowConnectionsToReactFlow(workflow.connections),
    [], // Only on initial mount
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync nodes/edges changes back to parent
  useEffect(() => {
    const updatedNodes: WorkflowWithDetails["nodes"] = nodes.map((node) => ({
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const updatedConnections: WorkflowWithDetails["connections"] = edges.map(
      (edge) => ({
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );

    // Only update if something actually changed
    const nodesChanged =
      JSON.stringify(updatedNodes) !== JSON.stringify(workflow.nodes);
    const connectionsChanged =
      JSON.stringify(updatedConnections) !==
      JSON.stringify(workflow.connections);

    if (nodesChanged || connectionsChanged) {
      onUpdate({
        nodes: updatedNodes,
        connections: updatedConnections,
      });
    }
  }, [nodes, edges]);

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
        className="bg-muted/30"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="hsl(var(--muted-foreground) / 0.2)"
        />
        <Controls showInteractive={false} className="!bg-background !border">
          <button
            className="react-flow__controls-button"
            onClick={() => zoomIn()}
            title="Zoom in"
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            className="react-flow__controls-button"
            onClick={() => zoomOut()}
            title="Zoom out"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            className="react-flow__controls-button"
            onClick={() => fitView()}
            title="Fit view"
          >
            <Maximize2 className="h-3 w-3" />
          </button>
        </Controls>
        <MiniMap
          nodeStrokeWidth={3}
          pannable
          zoomable
          className="!bg-background !border"
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
