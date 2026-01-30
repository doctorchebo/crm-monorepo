/**
 * Workflow Builder Types
 * TypeScript interfaces for the visual workflow editor
 */

// ============================================================================
// Enums and Constants
// ============================================================================

export type WorkflowStatus = "draft" | "published" | "archived" | "disabled";

export type WorkflowNodeType =
  // Base types (used by visualization and ReactFlow)
  | "trigger"
  | "condition"
  | "action"
  | "delay"
  | "branch"
  | "sub_workflow"
  | "end"
  // Specific trigger types
  | "trigger_message"
  | "trigger_time"
  | "trigger_webhook"
  | "trigger_manual"
  | "trigger_tag"
  | "trigger_stage_enter";

export type WorkflowExecutionStatus =
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";

export type ExecutionTriggerType =
  | "message"
  | "time_based"
  | "webhook"
  | "manual"
  | "tag_added"
  | "stage_entered"
  | "sub_workflow";

export type WorkflowConnectionType =
  | "default"
  | "true"
  | "false"
  | "success"
  | "failure"
  | "timeout"
  | "error"
  | "condition_true"
  | "condition_false"
  | "branch";

export type WorkflowVariableType =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "date";

export type WorkflowVariableScope =
  | "workflow"
  | "execution"
  | "chat"
  | "global";

// ============================================================================
// Core Entities
// ============================================================================

export interface Workflow {
  id: string;
  teamId: number;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  status: WorkflowStatus;
  version: number;
  isTemplate: boolean;
  triggerConfig: Record<string, unknown>;
  settings: WorkflowSettings;
  canvasState: CanvasState;
  createdBy: number;
  updatedBy?: number | null;
  publishedAt?: string | null;
  publishedBy?: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface WorkflowSettings {
  maxExecutionTime?: number; // seconds
  maxRetries?: number;
  retryDelay?: number; // seconds
  allowConcurrentExecutions?: boolean;
  pauseOnError?: boolean;
  notifyOnComplete?: boolean;
  notifyOnError?: boolean;
}

export interface CanvasState {
  zoom?: number;
  panX?: number;
  panY?: number;
  selectedNodeIds?: string[];
}

export interface WorkflowNode {
  id: string;
  workflowId: string;
  type: WorkflowNodeType;
  name: string;
  description?: string | null;
  config: NodeConfig;
  positionX: number;
  positionY: number;
  width?: number | null;
  height?: number | null;
  isEntryPoint: boolean;
  isExitPoint: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowConnection {
  id: string;
  workflowId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type: WorkflowConnectionType;
  label?: string | null;
  condition?: ConnectionCondition | null;
  priority: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowVariable {
  id: string;
  workflowId: string;
  name: string;
  type: WorkflowVariableType;
  scope: WorkflowVariableScope;
  defaultValue?: unknown;
  description?: string | null;
  isRequired: boolean;
  validation?: VariableValidation | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowVersion: number;
  chatId?: string | null;
  contactId?: string | null;
  triggerType: ExecutionTriggerType;
  triggerData: Record<string, unknown>;
  status: WorkflowExecutionStatus;
  currentNodeId?: string | null;
  variables: Record<string, unknown>;
  context: Record<string, unknown>;
  error?: string | null;
  errorDetails?: Record<string, unknown> | null;
  startedAt: string;
  completedAt?: string | null;
  parentExecutionId?: string | null;
  metadata: Record<string, unknown>;
  workflow?: { name: string; icon?: string; color?: string };
}

export interface WorkflowExecutionLog {
  id: string;
  executionId: string;
  nodeId?: string | null;
  nodeName?: string | null;
  nodeType?: WorkflowNodeType | null;
  action: string;
  status: string;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  error?: string | null;
  errorStack?: string | null;
  durationMs?: number | null;
  createdAt: string;
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  version: number;
  snapshot: WorkflowSnapshot;
  changeSummary?: string | null;
  createdBy: number;
  createdAt: string;
}

export interface WorkflowSnapshot {
  workflow: Partial<Workflow>;
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  variables: WorkflowVariable[];
}

// ============================================================================
// Node Configurations
// ============================================================================

export type NodeConfig =
  | TriggerNodeConfig
  | ConditionNodeConfig
  | ActionNodeConfig
  | DelayNodeConfig
  | BranchNodeConfig
  | SubWorkflowNodeConfig
  | EndNodeConfig;

// Trigger Configs
export interface TriggerNodeConfig {
  triggerType: ExecutionTriggerType;
  filters?: TriggerFilter[];
}

export interface TriggerFilter {
  field: string;
  operator: "equals" | "contains" | "startsWith" | "endsWith" | "regex" | "in";
  value: string | string[];
}

// Condition Configs
export interface ConditionNodeConfig {
  conditionType:
    | "ai_classification"
    | "keyword_match"
    | "contact_field"
    | "time_based"
    | "chat_property"
    | "expression";
  aiClassification?: AiClassificationConfig;
  keywordMatch?: KeywordMatchConfig;
  contactField?: ContactFieldConfig;
  timeBased?: TimeBasedConfig;
  chatProperty?: ChatPropertyConfig;
  expression?: ExpressionConfig;
}

export interface AiClassificationConfig {
  prompt: string;
  categories: Array<{
    name: string;
    description: string;
    connectionId?: string;
  }>;
  fallbackCategory?: string;
}

export interface KeywordMatchConfig {
  keywords: string[];
  matchType: "any" | "all" | "exact";
  caseSensitive?: boolean;
}

export interface ContactFieldConfig {
  fieldPath: string;
  operator:
    | "equals"
    | "notEquals"
    | "contains"
    | "gt"
    | "lt"
    | "gte"
    | "lte"
    | "isEmpty"
    | "isNotEmpty";
  value?: unknown;
}

export interface TimeBasedConfig {
  schedule?: string; // cron expression
  timezone?: string;
  dayOfWeek?: number[];
  timeRange?: { start: string; end: string };
}

export interface ChatPropertyConfig {
  property: "stage" | "assignee" | "tags" | "lastMessageTime" | "unreadCount";
  operator: "equals" | "notEquals" | "contains" | "gt" | "lt";
  value?: unknown;
}

export interface ExpressionConfig {
  expression: string; // JavaScript-like expression
  variables?: string[];
}

// Action Configs
export interface ActionNodeConfig {
  actionType:
    | "move_stage"
    | "send_template"
    | "send_message"
    | "assign_agent"
    | "add_tag"
    | "remove_tag"
    | "set_contact_field"
    | "http_webhook"
    | "delay"
    | "pause_ai"
    | "resume_ai"
    | "request_handoff"
    | "send_email"
    | "add_internal_note"
    | "update_ai_instructions";

  // AI Configuration for this step
  aiInstructions?: string;
  aiTone?: string;
  aiGoal?: string;
  allowedKbTemplates?: string[];

  // Action-specific configs
  moveStage?: MoveStageConfig;
  sendTemplate?: SendTemplateConfig;
  sendMessage?: SendMessageConfig;
  assignAgent?: AssignAgentConfig;
  tagConfig?: TagConfig;
  setContactField?: SetContactFieldConfig;
  httpWebhook?: HttpWebhookConfig;
  delayConfig?: DelayConfig;
  emailConfig?: EmailConfig;
  internalNote?: InternalNoteConfig;
}

export interface MoveStageConfig {
  stageId: number;
}

export interface SendTemplateConfig {
  templateId: number;
  variables?: Record<string, string>;
}

export interface SendMessageConfig {
  message: string;
  useAi?: boolean;
}

export interface AssignAgentConfig {
  agentId?: number;
  assignmentStrategy?: "specific" | "round_robin" | "least_busy";
}

export interface TagConfig {
  tagIds: number[];
}

export interface SetContactFieldConfig {
  fieldPath: string;
  value: string;
  valueType: "static" | "variable" | "expression";
}

export interface HttpWebhookConfig {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

export interface DelayConfig {
  duration: number;
  unit: "seconds" | "minutes" | "hours" | "days";
}

export interface EmailConfig {
  to: string;
  subject: string;
  body: string;
  isHtml?: boolean;
}

export interface InternalNoteConfig {
  content: string;
}

// Delay Node Config
export interface DelayNodeConfig {
  duration: number;
  unit: "seconds" | "minutes" | "hours" | "days";
  resumeCondition?: "timer" | "message_received" | "manual";
}

// Branch Node Config
export interface BranchNodeConfig {
  branches: Array<{
    name: string;
    condition: ConditionNodeConfig;
    connectionId?: string;
  }>;
  defaultBranch?: string;
}

// Sub-Workflow Config
export interface SubWorkflowNodeConfig {
  workflowId: string;
  inputMapping?: Record<string, string>;
  outputMapping?: Record<string, string>;
  waitForCompletion?: boolean;
}

// End Node Config
export interface EndNodeConfig {
  exitType?: "success" | "failure" | "cancelled";
  message?: string;
}

// ============================================================================
// Connection Condition
// ============================================================================

export interface ConnectionCondition {
  type: "expression" | "output_value" | "ai_category" | "always";
  expression?: string;
  outputPath?: string;
  expectedValue?: unknown;
  aiCategory?: string;
}

// ============================================================================
// Variable Validation
// ============================================================================

export interface VariableValidation {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  enum?: unknown[];
}

// ============================================================================
// DTOs for API Requests
// ============================================================================

export interface CreateWorkflowDto {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  triggerConfig?: Record<string, unknown>;
  settings?: WorkflowSettings;
}

export interface UpdateWorkflowDto extends Partial<CreateWorkflowDto> {}

export interface CreateNodeDto {
  type: WorkflowNodeType;
  name: string;
  description?: string;
  config: NodeConfig;
  positionX: number;
  positionY: number;
  isEntryPoint?: boolean;
  isExitPoint?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateNodeDto extends Partial<CreateNodeDto> {}

export interface CreateConnectionDto {
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: WorkflowConnectionType;
  label?: string;
  condition?: ConnectionCondition;
  priority?: number;
}

export interface UpdateConnectionDto extends Partial<CreateConnectionDto> {}

export interface CreateVariableDto {
  name: string;
  type: WorkflowVariableType;
  scope?: WorkflowVariableScope;
  defaultValue?: unknown;
  description?: string;
  isRequired?: boolean;
  validation?: VariableValidation;
}

export interface UpdateVariableDto extends Partial<CreateVariableDto> {}

// Canvas DTOs matching backend expectations
export interface SaveCanvasNodeDto {
  id?: string;
  tempId?: string;
  nodeType: WorkflowNodeType;
  positionX: number;
  positionY: number;
  label?: string;
  description?: string;
  config?: NodeConfig;
  aiInstructions?: string;
  aiTone?: string;
  aiGoal?: string;
  allowedKbTemplates?: string[];
}

export type ConnectionBranch =
  | "default"
  | "true"
  | "false"
  | "timeout"
  | "error";

export interface SaveCanvasConnectionDto {
  id?: string;
  fromNodeId: string;
  toNodeId: string;
  branch?: ConnectionBranch;
  conditionLabel?: string;
  conditionConfig?: Record<string, unknown>;
  label?: string;
  animated?: boolean;
}

export interface SaveCanvasDto {
  nodes: SaveCanvasNodeDto[];
  connections: SaveCanvasConnectionDto[];
  deletedNodeIds?: string[];
  deletedConnectionIds?: string[];
  viewportX?: number;
  viewportY?: number;
  viewportZoom?: number;
}

export interface PublishWorkflowDto {
  changeSummary?: string;
}

export interface TriggerWorkflowDto {
  chatId: string;
  triggerData?: Record<string, unknown>;
}

// ============================================================================
// Query DTOs
// ============================================================================

export interface ListWorkflowsQuery {
  status?: WorkflowStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ListExecutionsQuery {
  workflowId?: string;
  chatId?: string;
  status?: WorkflowExecutionStatus;
  page?: number;
  limit?: number;
}

export interface WorkflowAnalyticsQuery {
  workflowId?: string;
  startDate?: string;
  endDate?: string;
}

// ============================================================================
// Response Types
// ============================================================================

export interface WorkflowWithDetails extends Workflow {
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  variables: WorkflowVariable[];
  _count?: {
    nodes: number;
    executions: number;
  };
}

export interface WorkflowAnalytics {
  workflowId: string;
  totalExecutions: number;
  completedExecutions: number;
  failedExecutions: number;
  averageDuration: number;
  successRate: number;
  executionsByDay: Array<{
    date: string;
    count: number;
  }>;
  nodePerformance: Array<{
    nodeId: string;
    nodeName: string;
    executionCount: number;
    averageDuration: number;
    errorRate: number;
  }>;
}

export interface OverviewAnalytics {
  totalWorkflows: number;
  activeWorkflows: number;
  totalExecutions: number;
  completedExecutions: number;
  failedExecutions: number;
  successRate: number;
}

// ============================================================================
// ReactFlow Types (for the canvas)
// ============================================================================

export interface WorkflowCanvasNode {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  data: {
    label: string;
    description?: string;
    config: NodeConfig;
    isEntryPoint?: boolean;
    isExitPoint?: boolean;
    metadata?: Record<string, unknown>;
  };
  selected?: boolean;
  dragging?: boolean;
}

export interface WorkflowCanvasEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
  label?: string;
  data?: {
    connectionType: WorkflowConnectionType;
    condition?: ConnectionCondition;
    priority?: number;
  };
}

// ============================================================================
// Workflow Visualization Types
// ============================================================================

/**
 * Visualization node - simplified node for read-only canvas display
 */
export interface WorkflowVisualizationNode {
  id: string;
  type: string;
  name: string;
  description: string | null;
  positionX: number;
  positionY: number;
  config: Record<string, unknown>;
  isEntryPoint: boolean;
  isExitPoint: boolean;
  metadata: Record<string, unknown>;
}

/**
 * Visualization connection - simplified connection for read-only canvas display
 */
export interface WorkflowVisualizationConnection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  type: string;
  label: string | null;
}

/**
 * Execution path step - represents a node that was visited during execution
 */
export interface WorkflowExecutionPathStep {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  action: string;
  executedAt: string;
  durationMs: number | null;
  conditionResult: boolean | null;
  errorMessage: string | null;
  output: Record<string, unknown> | null;
}

/**
 * Execution metadata for history panel
 */
export interface WorkflowExecutionMetadata {
  id: string;
  startedAt: string | null;
  completedAt: string | null;
}

/**
 * Workflow visualization data - complete data for rendering a read-only workflow canvas
 */
export interface WorkflowVisualizationData {
  workflow: {
    id: string;
    name: string;
    description: string | null;
    icon: string | null;
    color: string | null;
  } | null;
  nodes: WorkflowVisualizationNode[];
  connections: WorkflowVisualizationConnection[];
  executionPath: WorkflowExecutionPathStep[];
  currentNodeId: string | null;
  status: "running" | "waiting" | "completed" | "failed" | "no_workflow";
  execution: WorkflowExecutionMetadata | null;
}

// ============================================================================
// Template Types
// ============================================================================

export interface WorkflowTemplate {
  id: string;
  categoryId?: string | null;
  name: string;
  description?: string | null;
  icon?: string | null;
  previewImageUrl?: string | null;
  definition: WorkflowSnapshot;
  isFeatured: boolean;
  useCount: number;
  createdAt: string;
  updatedAt: string;
  category?: WorkflowTemplateCategory;
}

export interface WorkflowTemplateCategory {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  sortOrder: number;
  createdAt: string;
}
