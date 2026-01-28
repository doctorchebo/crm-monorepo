/**
 * Workflow Builder DTOs
 * Request/Response DTOs for the visual workflow builder API
 */

import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

// ============================================================================
// Enums (matching schema)
// ============================================================================

export enum WorkflowStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ARCHIVED = 'archived',
}

export enum WorkflowNodeType {
  // Triggers
  TRIGGER_MESSAGE = 'trigger_message',
  TRIGGER_TIME = 'trigger_time',
  TRIGGER_WEBHOOK = 'trigger_webhook',
  TRIGGER_MANUAL = 'trigger_manual',
  TRIGGER_TAG = 'trigger_tag',
  TRIGGER_STAGE_ENTER = 'trigger_stage_enter',
  // Conditions
  CONDITION_AI_CLASSIFICATION = 'condition_ai_classification',
  CONDITION_KEYWORD = 'condition_keyword',
  CONDITION_CONTACT_FIELD = 'condition_contact_field',
  CONDITION_TIME = 'condition_time',
  CONDITION_CHAT_PROPERTY = 'condition_chat_property',
  CONDITION_EXPRESSION = 'condition_expression',
  // Actions
  ACTION_MOVE_STAGE = 'action_move_stage',
  ACTION_SEND_TEMPLATE = 'action_send_template',
  ACTION_SEND_MESSAGE = 'action_send_message',
  ACTION_ASSIGN_AGENT = 'action_assign_agent',
  ACTION_ADD_TAG = 'action_add_tag',
  ACTION_REMOVE_TAG = 'action_remove_tag',
  ACTION_SET_FIELD = 'action_set_field',
  ACTION_HTTP_WEBHOOK = 'action_http_webhook',
  ACTION_DELAY = 'action_delay',
  ACTION_PAUSE_AI = 'action_pause_ai',
  ACTION_RESUME_AI = 'action_resume_ai',
  ACTION_REQUEST_HANDOFF = 'action_request_handoff',
  ACTION_SEND_EMAIL = 'action_send_email',
  ACTION_INTERNAL_NOTE = 'action_internal_note',
  // Sub-workflow
  SUB_WORKFLOW = 'sub_workflow',
}

export enum ConnectionBranch {
  DEFAULT = 'default',
  TRUE = 'true',
  FALSE = 'false',
  TIMEOUT = 'timeout',
  ERROR = 'error',
}

export enum VariableType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  ARRAY = 'array',
  OBJECT = 'object',
}

// ============================================================================
// Workflow CRUD DTOs
// ============================================================================

export class CreateWorkflowDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsBoolean()
  isExclusive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxExecutionsPerChat?: number;
}

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;

  @IsOptional()
  @IsBoolean()
  isExclusive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxExecutionsPerChat?: number;

  @IsOptional()
  @IsObject()
  triggerConfig?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  viewportX?: number;

  @IsOptional()
  @IsNumber()
  viewportY?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(3)
  viewportZoom?: number;
}

// ============================================================================
// Node CRUD DTOs
// ============================================================================

export class CreateNodeDto {
  @IsUUID()
  workflowId: string;

  @IsEnum(WorkflowNodeType)
  nodeType: WorkflowNodeType;

  @IsNumber()
  positionX: number;

  @IsNumber()
  positionY: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  aiInstructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  aiTone?: string;

  @IsOptional()
  @IsString()
  aiGoal?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  allowedKbTemplates?: string[];

  @IsOptional()
  @IsUUID()
  onErrorNodeId?: string;

  @IsOptional()
  @IsBoolean()
  continueOnError?: boolean;
}

export class UpdateNodeDto {
  @IsOptional()
  @IsEnum(WorkflowNodeType)
  nodeType?: WorkflowNodeType;

  @IsOptional()
  @IsNumber()
  positionX?: number;

  @IsOptional()
  @IsNumber()
  positionY?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  aiInstructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  aiTone?: string;

  @IsOptional()
  @IsString()
  aiGoal?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  allowedKbTemplates?: string[];

  @IsOptional()
  @IsUUID()
  onErrorNodeId?: string;

  @IsOptional()
  @IsBoolean()
  continueOnError?: boolean;
}

export class UpdateNodePositionDto {
  @IsNumber()
  positionX: number;

  @IsNumber()
  positionY: number;
}

export class BulkUpdateNodePositionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NodePositionUpdate)
  updates: NodePositionUpdate[];
}

class NodePositionUpdate {
  @IsUUID()
  nodeId: string;

  @IsNumber()
  positionX: number;

  @IsNumber()
  positionY: number;
}

// ============================================================================
// Connection CRUD DTOs
// ============================================================================

export class CreateConnectionDto {
  @IsUUID()
  workflowId: string;

  @IsUUID()
  fromNodeId: string;

  @IsUUID()
  toNodeId: string;

  @IsOptional()
  @IsEnum(ConnectionBranch)
  branch?: ConnectionBranch;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  conditionLabel?: string;

  @IsOptional()
  @IsObject()
  conditionConfig?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsBoolean()
  animated?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateConnectionDto {
  @IsOptional()
  @IsEnum(ConnectionBranch)
  branch?: ConnectionBranch;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  conditionLabel?: string;

  @IsOptional()
  @IsObject()
  conditionConfig?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsBoolean()
  animated?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

// ============================================================================
// Variable CRUD DTOs
// ============================================================================

export class CreateVariableDto {
  @IsUUID()
  workflowId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(VariableType)
  variableType?: VariableType;

  @IsOptional()
  defaultValue?: unknown;

  @IsOptional()
  @IsBoolean()
  isInput?: boolean;

  @IsOptional()
  @IsBoolean()
  isOutput?: boolean;
}

export class UpdateVariableDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(VariableType)
  variableType?: VariableType;

  @IsOptional()
  defaultValue?: unknown;

  @IsOptional()
  @IsBoolean()
  isInput?: boolean;

  @IsOptional()
  @IsBoolean()
  isOutput?: boolean;
}

// ============================================================================
// Execution DTOs
// ============================================================================

export class TriggerWorkflowDto {
  @IsUUID()
  workflowId: string;

  @IsString()
  chatId: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  messageId?: string;
}

export class CancelExecutionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

// ============================================================================
// Bulk Operations DTOs
// ============================================================================

export class SaveWorkflowCanvasDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CanvasNodeDto)
  nodes: CanvasNodeDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CanvasConnectionDto)
  connections: CanvasConnectionDto[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  deletedNodeIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  deletedConnectionIds?: string[];

  @IsOptional()
  @IsNumber()
  viewportX?: number;

  @IsOptional()
  @IsNumber()
  viewportY?: number;

  @IsOptional()
  @IsNumber()
  viewportZoom?: number;
}

class CanvasNodeDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsString()
  tempId?: string; // Frontend-generated temporary ID for new nodes

  @IsEnum(WorkflowNodeType)
  nodeType: WorkflowNodeType;

  @IsNumber()
  positionX: number;

  @IsNumber()
  positionY: number;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  aiInstructions?: string;

  @IsOptional()
  @IsString()
  aiTone?: string;

  @IsOptional()
  @IsString()
  aiGoal?: string;

  @IsOptional()
  @IsArray()
  allowedKbTemplates?: string[];
}

class CanvasConnectionDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  fromNodeId: string;

  @IsString()
  toNodeId: string;

  @IsOptional()
  @IsEnum(ConnectionBranch)
  branch?: ConnectionBranch;

  @IsOptional()
  @IsString()
  conditionLabel?: string;

  @IsOptional()
  @IsObject()
  conditionConfig?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsBoolean()
  animated?: boolean;
}

// ============================================================================
// Publishing DTOs
// ============================================================================

export class PublishWorkflowDto {
  @IsOptional()
  @IsString()
  changeNotes?: string;
}

export class DuplicateWorkflowDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}

// ============================================================================
// Import/Export DTOs
// ============================================================================

export class ImportWorkflowDto {
  @IsObject()
  definition: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}

export class UpdateTeamWorkflowSettingsDto {
  @IsOptional()
  @IsUUID()
  defaultWorkflowId?: string | null;
}

// ============================================================================
// Query DTOs
// ============================================================================

export class ListWorkflowsQueryDto {
  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}

export class BulkDeleteWorkflowsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  workflowIds: string[];
}

export class ListExecutionsQueryDto {
  @IsOptional()
  @IsUUID()
  workflowId?: string;

  @IsOptional()
  @IsString()
  chatId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}

// ============================================================================
// Analytics DTOs
// ============================================================================

export class WorkflowAnalyticsQueryDto {
  @IsOptional()
  @IsString()
  period?: 'today' | 'week' | 'month' | 'all';

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

// ============================================================================
// Response DTOs
// ============================================================================

export class WorkflowResponseDto {
  id: string;
  teamId: number;
  createdBy: number;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  status: WorkflowStatus;
  version: number;
  publishedAt?: Date;
  isExclusive: boolean;
  priority: number;
  maxExecutionsPerChat?: number;
  viewportX: number;
  viewportY: number;
  viewportZoom: number;
  createdAt: Date;
  updatedAt: Date;
  // Expanded relations
  nodes?: NodeResponseDto[];
  connections?: ConnectionResponseDto[];
  variables?: VariableResponseDto[];
}

export class NodeResponseDto {
  id: string;
  workflowId: string;
  nodeType: WorkflowNodeType;
  positionX: number;
  positionY: number;
  label?: string;
  description?: string;
  config: Record<string, unknown>;
  aiInstructions?: string;
  aiTone?: string;
  aiGoal?: string;
  allowedKbTemplates?: string[];
  onErrorNodeId?: string;
  continueOnError: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class ConnectionResponseDto {
  id: string;
  workflowId: string;
  fromNodeId: string;
  toNodeId: string;
  branch: ConnectionBranch;
  conditionLabel?: string;
  conditionConfig?: Record<string, unknown>;
  label?: string;
  animated: boolean;
  sortOrder: number;
  createdAt: Date;
}

export class VariableResponseDto {
  id: string;
  workflowId: string;
  name: string;
  description?: string;
  variableType: VariableType;
  defaultValue?: unknown;
  isInput: boolean;
  isOutput: boolean;
  createdAt: Date;
}

export class ExecutionResponseDto {
  id: string;
  workflowId: string;
  chatId: string;
  workflowVersion: number;
  status: string;
  currentNodeId?: string;
  triggerType: string;
  triggerNodeId?: string;
  triggerMessageId?: string;
  triggeredBy?: number;
  variables: Record<string, unknown>;
  errorMessage?: string;
  errorNodeId?: string;
  startedAt: Date;
  completedAt?: Date;
  scheduledResumeAt?: Date;
  nodesExecuted: number;
  totalDurationMs?: number;
}

export class ExecutionLogResponseDto {
  id: string;
  executionId: string;
  nodeId?: string;
  action: string;
  nodeType?: string;
  input?: unknown;
  output?: unknown;
  conditionResult?: boolean;
  conditionDetails?: unknown;
  aiClassification?: unknown;
  aiConfidence?: number;
  errorMessage?: string;
  durationMs?: number;
  executedAt: Date;
}

// ============================================================================
// WORKFLOW TEMPLATE DTOs
// ============================================================================

export class CreateWorkflowTemplateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateWorkflowTemplateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateWorkflowTemplateDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsString()
  previewImageUrl?: string;

  @IsObject()
  definition: {
    nodes: Array<{
      id: string;
      nodeType: string;
      label: string;
      description?: string;
      config: Record<string, unknown>;
      positionX: number;
      positionY: number;
    }>;
    connections: Array<{
      id: string;
      fromNodeId: string;
      toNodeId: string;
      branch: string;
      label?: string;
    }>;
    variables?: Array<{
      name: string;
      type: string;
      defaultValue?: unknown;
      scope: string;
      description?: string;
    }>;
  };

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;
}

export class UpdateWorkflowTemplateDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsString()
  previewImageUrl?: string;

  @IsOptional()
  @IsObject()
  definition?: CreateWorkflowTemplateDto['definition'];

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;
}

export class UseWorkflowTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;
}

export class ListWorkflowTemplatesQueryDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  featuredOnly?: boolean;

  @IsOptional()
  @IsString()
  search?: string;
}
