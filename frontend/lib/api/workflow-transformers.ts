/**
 * Workflow Data Transformers
 *
 * Transforms data between backend API format and frontend format.
 * The backend uses different field names (e.g., nodeType, label, fromNodeId)
 * than the frontend expects (e.g., type, name, sourceNodeId).
 *
 * This provides a clean separation between the API layer and the UI layer,
 * making it easy to update either without affecting the other.
 */

import type {
  WorkflowConnection,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowVariable,
  WorkflowVisualizationData,
  WorkflowWithDetails,
} from "@/lib/types/workflow.types";

// ============================================================================
// Node Type Mapping
// ============================================================================

/**
 * Maps specific backend node types to their base frontend node types.
 * This ensures React Flow can find the correct component to render.
 *
 * Backend uses specific types like 'trigger_message', 'action_send_message'
 * Frontend React Flow needs generic types like 'trigger', 'action'
 */
const NODE_TYPE_PREFIXES = [
  "trigger",
  "condition",
  "action",
  "delay",
  "branch",
  "sub_workflow",
  "end",
] as const;

/**
 * Extract the base node type from a specific node type.
 * Examples:
 *   - 'trigger_message' → 'trigger'
 *   - 'action_send_message' → 'action'
 *   - 'condition_ai_classification' → 'condition'
 *   - 'trigger' → 'trigger' (already base type)
 *   - 'end' → 'end'
 */
export function getBaseNodeType(nodeType: string): WorkflowNodeType {
  // Direct match - already a base type
  if (
    NODE_TYPE_PREFIXES.includes(nodeType as (typeof NODE_TYPE_PREFIXES)[number])
  ) {
    return nodeType as WorkflowNodeType;
  }

  // Find the prefix that matches
  for (const prefix of NODE_TYPE_PREFIXES) {
    if (nodeType.startsWith(`${prefix}_`) || nodeType === prefix) {
      return prefix as WorkflowNodeType;
    }
  }

  // Default fallback - try to infer from common patterns
  if (nodeType.includes("trigger")) return "trigger";
  if (nodeType.includes("condition")) return "condition";
  if (nodeType.includes("action")) return "action";
  if (nodeType.includes("delay")) return "delay";
  if (nodeType.includes("branch")) return "branch";
  if (nodeType.includes("end")) return "end";

  // Ultimate fallback
  console.warn(`Unknown node type: ${nodeType}, defaulting to 'action'`);
  return "action";
}

/**
 * Check if a node type represents an entry point (trigger)
 */
export function isEntryPointNodeType(nodeType: string): boolean {
  return getBaseNodeType(nodeType) === "trigger";
}

/**
 * Check if a node type represents an exit point (end)
 */
export function isExitPointNodeType(nodeType: string): boolean {
  return getBaseNodeType(nodeType) === "end";
}

// ============================================================================
// Backend Response Types (what the API actually returns)
// ============================================================================

/**
 * Node as returned from the backend API
 */
export interface BackendWorkflowNode {
  id: string;
  workflowId: string;
  nodeType: string; // Backend uses 'nodeType' not 'type'
  positionX: number;
  positionY: number;
  label?: string | null; // Backend uses 'label' not 'name'
  description?: string | null;
  config: Record<string, unknown>;
  aiInstructions?: string | null;
  aiTone?: string | null;
  aiGoal?: string | null;
  allowedKbTemplates?: string[] | null;
  onErrorNodeId?: string | null;
  continueOnError?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Connection as returned from the backend API
 */
export interface BackendWorkflowConnection {
  id: string;
  workflowId: string;
  fromNodeId: string; // Backend uses 'fromNodeId' not 'sourceNodeId'
  toNodeId: string; // Backend uses 'toNodeId' not 'targetNodeId'
  branch: string;
  conditionLabel?: string | null;
  conditionConfig?: Record<string, unknown> | null;
  label?: string | null;
  animated?: boolean;
  sortOrder?: number;
  createdAt: string;
}

/**
 * Variable as returned from the backend API
 */
interface BackendWorkflowVariable {
  id: string;
  workflowId: string;
  name: string;
  type: string;
  defaultValue?: unknown;
  scope: string;
  description?: string | null;
  isRequired?: boolean;
  validation?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Complete workflow with details as returned from the backend API
 */
export interface BackendWorkflowWithDetails {
  id: string;
  teamId: number;
  createdBy: number;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  status: string;
  version: number;
  publishedAt?: string | null;
  isExclusive?: boolean;
  priority?: number;
  maxExecutionsPerChat?: number | null;
  triggerConfig?: Record<string, unknown>;
  viewportX?: number;
  viewportY?: number;
  viewportZoom?: number;
  createdAt: string;
  updatedAt: string;
  nodes?: BackendWorkflowNode[];
  connections?: BackendWorkflowConnection[];
  variables?: BackendWorkflowVariable[];
}

// ============================================================================
// Transformation Functions
// ============================================================================

/**
 * Transform a backend node to frontend format
 */
export function transformNodeToFrontend(
  node: BackendWorkflowNode,
): WorkflowNode {
  const baseType = getBaseNodeType(node.nodeType);

  return {
    id: node.id,
    workflowId: node.workflowId,
    type: baseType, // Use base type for React Flow component matching
    name: node.label || "Unnamed Node", // Backend 'label' → Frontend 'name'
    description: node.description,
    config: {
      ...node.config,
      // Preserve the original specific nodeType in config for component-level logic
      _originalNodeType: node.nodeType,
    } as WorkflowNode["config"],
    positionX: node.positionX,
    positionY: node.positionY,
    width: null,
    height: null,
    isEntryPoint: isEntryPointNodeType(node.nodeType),
    isExitPoint: isExitPointNodeType(node.nodeType),
    metadata: {
      aiInstructions: node.aiInstructions,
      aiTone: node.aiTone,
      aiGoal: node.aiGoal,
      allowedKbTemplates: node.allowedKbTemplates,
      onErrorNodeId: node.onErrorNodeId,
      continueOnError: node.continueOnError,
    },
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

/**
 * Transform a backend connection to frontend format
 */
export function transformConnectionToFrontend(
  conn: BackendWorkflowConnection,
): WorkflowConnection {
  // The branch field contains the handle ID (e.g., "true", "false", "default")
  // We need to restore this as the sourceHandle for React Flow to render correctly
  const sourceHandle =
    conn.branch && conn.branch !== "default" ? conn.branch : null;

  return {
    id: conn.id,
    workflowId: conn.workflowId,
    sourceNodeId: conn.fromNodeId, // Backend 'fromNodeId' → Frontend 'sourceNodeId'
    targetNodeId: conn.toNodeId, // Backend 'toNodeId' → Frontend 'targetNodeId'
    sourceHandle,
    targetHandle: null,
    type: conn.branch as WorkflowConnection["type"],
    label: conn.label,
    condition: conn.conditionConfig as WorkflowConnection["condition"],
    priority: conn.sortOrder || 0,
    metadata: {
      conditionLabel: conn.conditionLabel,
      animated: conn.animated,
    },
    createdAt: conn.createdAt,
    updatedAt: conn.createdAt, // Backend doesn't have updatedAt for connections
  };
}

/**
 * Transform a backend variable to frontend format
 */
export function transformVariableToFrontend(
  variable: BackendWorkflowVariable,
): WorkflowVariable {
  return {
    id: variable.id,
    workflowId: variable.workflowId,
    name: variable.name,
    type: variable.type as WorkflowVariable["type"],
    defaultValue: variable.defaultValue,
    scope: variable.scope as WorkflowVariable["scope"],
    description: variable.description,
    isRequired: variable.isRequired ?? false,
    validation: variable.validation ?? null,
    createdAt: variable.createdAt,
    updatedAt: variable.updatedAt,
  };
}

/**
 * Transform a complete workflow with details from backend to frontend format
 */
export function transformWorkflowToFrontend(
  workflow: BackendWorkflowWithDetails,
): WorkflowWithDetails {
  return {
    id: workflow.id,
    teamId: workflow.teamId,
    name: workflow.name,
    description: workflow.description,
    icon: workflow.icon,
    color: workflow.color,
    status: workflow.status as WorkflowWithDetails["status"],
    version: workflow.version,
    isTemplate: false,
    triggerConfig: workflow.triggerConfig || {},
    settings: {
      maxExecutionTime: undefined,
      maxRetries: undefined,
      retryDelay: undefined,
      allowConcurrentExecutions: !workflow.isExclusive,
      pauseOnError: false,
      notifyOnComplete: false,
      notifyOnError: false,
    },
    canvasState: {
      zoom: workflow.viewportZoom || 1,
      panX: workflow.viewportX || 0,
      panY: workflow.viewportY || 0,
      selectedNodeIds: [],
    },
    createdBy: workflow.createdBy,
    updatedBy: null,
    publishedAt: workflow.publishedAt,
    publishedBy: null,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    deletedAt: null,
    nodes: (workflow.nodes || []).map(transformNodeToFrontend),
    connections: (workflow.connections || []).map(
      transformConnectionToFrontend,
    ),
    variables: (workflow.variables || []).map(transformVariableToFrontend),
  };
}

// ============================================================================
// Save Canvas Response Types and Transformers
// ============================================================================

/**
 * Response from saveCanvas endpoint - contains ALL nodes/connections for the workflow
 * (not just the ones that were modified in this save operation)
 */
export interface SaveCanvasResponse {
  nodes: BackendWorkflowNode[];
  connections: BackendWorkflowConnection[];
}

/**
 * Frontend representation of save canvas response
 */
export interface TransformedSaveCanvasResponse {
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
}

/**
 * Transform save canvas response to frontend format.
 * The backend returns the complete state of all nodes/connections for the workflow.
 */
export function transformSaveCanvasResponse(
  response: SaveCanvasResponse,
): TransformedSaveCanvasResponse {
  return {
    nodes: response.nodes.map(transformNodeToFrontend),
    connections: response.connections.map(transformConnectionToFrontend),
  };
}

// ============================================================================
// Visualization Response Types and Transformers
// ============================================================================

/**
 * Backend response for workflow visualization endpoint
 */
export interface BackendVisualizationResponse {
  workflow: {
    id: string;
    name: string;
    description: string | null;
    icon: string | null;
    color: string | null;
  } | null;
  nodes: BackendWorkflowNode[];
  connections: BackendWorkflowConnection[];
  executionPath: Array<{
    nodeId: string;
    nodeName: string;
    nodeType: string;
    action: string;
    executedAt: string;
    durationMs: number | null;
    conditionResult: boolean | null;
    errorMessage: string | null;
    output: Record<string, unknown> | null;
  }>;
  currentNodeId: string | null;
  status: "running" | "waiting" | "completed" | "failed" | "no_workflow";
  execution: {
    id: string;
    startedAt: string | null;
    completedAt: string | null;
  } | null;
}

/**
 * Transform complete visualization response to frontend format.
 *
 * Reuses the same node/connection transformers as the workflow builder
 * to ensure consistent data format across the application.
 */
export function transformVisualizationResponse(
  response: BackendVisualizationResponse,
): WorkflowVisualizationData {
  return {
    workflow: response.workflow,
    nodes: response.nodes.map(transformNodeToFrontend),
    connections: response.connections.map(transformConnectionToFrontend),
    executionPath: response.executionPath,
    currentNodeId: response.currentNodeId,
    status: response.status,
    execution: response.execution,
  };
}
