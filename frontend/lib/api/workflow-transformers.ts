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
  WorkflowVariable,
  WorkflowWithDetails,
} from "@/lib/types/workflow.types";

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
  return {
    id: node.id,
    workflowId: node.workflowId,
    type: node.nodeType as WorkflowNode["type"], // Backend 'nodeType' → Frontend 'type'
    name: node.label || "Unnamed Node", // Backend 'label' → Frontend 'name'
    description: node.description,
    config: node.config as WorkflowNode["config"],
    positionX: node.positionX,
    positionY: node.positionY,
    width: null,
    height: null,
    isEntryPoint: node.nodeType === "trigger",
    isExitPoint: node.nodeType === "end",
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
  return {
    id: conn.id,
    workflowId: conn.workflowId,
    sourceNodeId: conn.fromNodeId, // Backend 'fromNodeId' → Frontend 'sourceNodeId'
    targetNodeId: conn.toNodeId, // Backend 'toNodeId' → Frontend 'targetNodeId'
    sourceHandle: null,
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

/**
 * Transform save canvas response (partial) and merge with existing workflow
 * The saveCanvas endpoint only returns { nodes, connections }
 */
export function transformSaveCanvasResponse(
  response: {
    nodes: BackendWorkflowNode[];
    connections: BackendWorkflowConnection[];
  },
  existingWorkflow: WorkflowWithDetails,
): WorkflowWithDetails {
  return {
    ...existingWorkflow,
    nodes: response.nodes.map(transformNodeToFrontend),
    connections: response.connections.map(transformConnectionToFrontend),
    // Variables are not returned by saveCanvas, preserve existing
    variables: existingWorkflow.variables || [],
  };
}
