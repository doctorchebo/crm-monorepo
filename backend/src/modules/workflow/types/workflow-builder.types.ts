/**
 * Workflow Builder Types
 * Type definitions for the visual workflow builder
 */

// ============================================================================
// Node Type Configurations
// ============================================================================

/**
 * Trigger: New message received
 */
export interface TriggerMessageConfig {
  // Filter by message type
  messageTypes?: (
    | 'text'
    | 'image'
    | 'video'
    | 'audio'
    | 'document'
    | 'location'
    | 'contact'
  )[];
  // Filter by sender (e.g., only new contacts, or specific phone patterns)
  senderFilter?: {
    isNewContact?: boolean;
    phonePattern?: string; // Regex pattern
    hasTag?: string[];
    missingTag?: string[];
  };
  // Filter by content
  contentFilter?: {
    keywords?: string[];
    keywordMatchMode?: 'any' | 'all';
    regex?: string;
    minLength?: number;
    maxLength?: number;
  };
}

/**
 * Trigger: Time-based (schedule or delay)
 */
export interface TriggerTimeConfig {
  type: 'schedule' | 'delay_since_last_message' | 'delay_since_stage_enter';
  // For schedule type
  schedule?: {
    cron?: string; // Cron expression
    timezone?: string;
    daysOfWeek?: number[]; // 0-6, Sunday = 0
    timeRanges?: { start: string; end: string }[]; // HH:mm format
  };
  // For delay types
  delay?: {
    value: number;
    unit: 'minutes' | 'hours' | 'days';
  };
}

/**
 * Trigger: Webhook
 */
export interface TriggerWebhookConfig {
  webhookId: string; // Generated unique ID for the webhook endpoint
  secretKey?: string; // For webhook verification
  payloadMapping?: Record<string, string>; // Map webhook fields to variables
}

/**
 * Trigger: Manual entry
 */
export interface TriggerManualConfig {
  buttonLabel?: string; // Label for the manual trigger button
  requireConfirmation?: boolean;
  allowedRoles?: string[]; // Which team roles can trigger
}

/**
 * Trigger: Tag added/removed
 */
export interface TriggerTagConfig {
  action: 'added' | 'removed' | 'any';
  tags: string[]; // Tag names to watch
  matchMode: 'any' | 'all';
}

/**
 * Trigger: Stage enter
 */
export interface TriggerStageEnterConfig {
  stageIds: string[]; // Which stages trigger this
  fromStageIds?: string[]; // Optional: only if coming from specific stages
}

// ============================================================================
// Condition Configurations
// ============================================================================

/**
 * Condition: AI Classification
 */
export interface ConditionAiClassificationConfig {
  classifyType: 'intent' | 'sentiment' | 'category' | 'custom';
  // For intent/category/sentiment
  expectedValues?: string[];
  matchMode?: 'any' | 'all';
  // For custom classification
  customPrompt?: string;
  expectedOutcome?: string;
  // Confidence threshold
  minConfidence?: number; // 0-100
}

/**
 * Condition: Keyword matching
 */
export interface ConditionKeywordConfig {
  keywords: string[];
  matchMode: 'any' | 'all' | 'exact' | 'regex';
  caseSensitive: boolean;
  source: 'last_message' | 'conversation_history' | 'contact_notes';
}

/**
 * Condition: Contact field
 */
export interface ConditionContactFieldConfig {
  fieldName: string;
  operator:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'not_contains'
    | 'greater_than'
    | 'less_than'
    | 'is_empty'
    | 'is_not_empty'
    | 'in_list'
    | 'not_in_list';
  value?: unknown;
  values?: unknown[]; // For in_list/not_in_list
}

/**
 * Condition: Time-based
 */
export interface ConditionTimeConfig {
  type: 'time_of_day' | 'day_of_week' | 'date_range' | 'business_hours';
  timezone?: string;
  // For time_of_day
  timeRange?: { start: string; end: string }; // HH:mm
  // For day_of_week
  days?: number[]; // 0-6
  // For date_range
  dateRange?: { start: string; end: string }; // ISO date
  // For business_hours
  businessHours?: {
    [day: number]: { start: string; end: string }[];
  };
}

/**
 * Condition: Chat property
 */
export interface ConditionChatPropertyConfig {
  property:
    | 'unread_count'
    | 'last_message_time'
    | 'messages_in_session'
    | 'time_since_last_agent_reply'
    | 'assigned_agent'
    | 'is_archived';
  operator:
    | 'equals'
    | 'not_equals'
    | 'greater_than'
    | 'less_than'
    | 'is_empty'
    | 'is_not_empty';
  value?: unknown;
}

/**
 * Condition: Custom expression
 */
export interface ConditionExpressionConfig {
  expression: string; // JavaScript-like expression
  // Available variables documented for user
  description?: string;
}

// ============================================================================
// Action Configurations
// ============================================================================

/**
 * Action: Move to stage
 */
export interface ActionMoveStageConfig {
  stageId: string;
  reason?: string; // Audit log reason
}

/**
 * Action: Send template message
 */
export interface ActionSendTemplateConfig {
  templateId: string;
  templateName?: string; // For display
  // Variable mapping for template placeholders
  variableMapping?: Record<string, string>;
  // Delay before sending
  delaySeconds?: number;
}

/**
 * Action: Send message (AI or static)
 */
export interface ActionSendMessageConfig {
  messageType: 'ai_generated' | 'static' | 'from_variable';
  // For static message
  staticContent?: string;
  // For AI generated
  aiPrompt?: string;
  aiTone?: string;
  includeKnowledgeBase?: boolean;
  allowedKbTemplates?: string[];
  // For variable
  variableName?: string;
  // Delivery options
  delaySeconds?: number;
  replyToLastMessage?: boolean;
}

/**
 * Action: Assign agent
 */
export interface ActionAssignAgentConfig {
  assignmentType:
    | 'specific'
    | 'round_robin'
    | 'least_busy'
    | 'by_tag'
    | 'by_skill';
  // For specific
  agentUserId?: number;
  // For by_tag/skill
  requiredTags?: string[];
  requiredSkills?: string[];
  // Fallback if no agent available
  fallbackAgentId?: number;
  notifyAgent?: boolean;
}

/**
 * Action: Add/Remove tag
 */
export interface ActionTagConfig {
  tags: string[];
  target: 'contact' | 'chat';
}

/**
 * Action: Set custom field
 */
export interface ActionSetFieldConfig {
  fieldName: string;
  valueType: 'static' | 'from_variable' | 'from_message' | 'from_ai';
  value?: unknown;
  variableName?: string;
  aiPrompt?: string; // For extracting value via AI
}

/**
 * Action: HTTP Webhook
 */
export interface ActionHttpWebhookConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  bodyTemplate?: string; // Template with variable substitution
  // Response handling
  saveResponseTo?: string; // Variable name
  expectedStatusCodes?: number[];
  timeoutMs?: number;
  retryCount?: number;
}

/**
 * Action: Delay
 */
export interface ActionDelayConfig {
  duration: number;
  unit: 'seconds' | 'minutes' | 'hours' | 'days';
  // Business hours only
  businessHoursOnly?: boolean;
  timezone?: string;
}

/**
 * Action: Pause/Resume AI
 */
export interface ActionAiControlConfig {
  reason?: string;
  // For pause
  duration?: {
    value: number;
    unit: 'minutes' | 'hours' | 'days';
  };
  // Auto-resume conditions
  autoResumeOnMessage?: boolean;
  autoResumeOnAgentReply?: boolean;
}

/**
 * Action: Request handoff
 */
export interface ActionHandoffConfig {
  reason?: string;
  urgency: 'low' | 'normal' | 'high' | 'urgent';
  notifyMessage?: string; // Message to show customer
  preferredAgentId?: number;
}

/**
 * Action: Send email
 */
export interface ActionSendEmailConfig {
  toType: 'static' | 'contact_email' | 'agent_email' | 'team_email';
  staticEmail?: string;
  subject: string;
  bodyTemplate: string;
  includeConversationHistory?: boolean;
  attachments?: string[]; // Variable names containing file URLs
}

/**
 * Action: Internal note
 */
export interface ActionInternalNoteConfig {
  content: string;
  includeMetadata?: boolean; // Include workflow execution info
  mentionUsers?: number[];
}

// ============================================================================
// Sub-workflow Configuration
// ============================================================================

export interface SubWorkflowConfig {
  targetWorkflowId: string;
  inputMapping: Record<string, string>; // Map parent variables to child inputs
  outputMapping: Record<string, string>; // Map child outputs to parent variables
  waitForCompletion: boolean;
  timeoutMs?: number;
  onTimeoutBranch?: 'continue' | 'error' | 'skip';
}

// ============================================================================
// Node Configuration Union Type
// ============================================================================

export type NodeConfig =
  // Triggers
  | { type: 'trigger_message'; config: TriggerMessageConfig }
  | { type: 'trigger_time'; config: TriggerTimeConfig }
  | { type: 'trigger_webhook'; config: TriggerWebhookConfig }
  | { type: 'trigger_manual'; config: TriggerManualConfig }
  | { type: 'trigger_tag'; config: TriggerTagConfig }
  | { type: 'trigger_stage_enter'; config: TriggerStageEnterConfig }
  // Conditions
  | {
      type: 'condition_ai_classification';
      config: ConditionAiClassificationConfig;
    }
  | { type: 'condition_keyword'; config: ConditionKeywordConfig }
  | { type: 'condition_contact_field'; config: ConditionContactFieldConfig }
  | { type: 'condition_time'; config: ConditionTimeConfig }
  | { type: 'condition_chat_property'; config: ConditionChatPropertyConfig }
  | { type: 'condition_expression'; config: ConditionExpressionConfig }
  // Actions
  | { type: 'action_move_stage'; config: ActionMoveStageConfig }
  | { type: 'action_send_template'; config: ActionSendTemplateConfig }
  | { type: 'action_send_message'; config: ActionSendMessageConfig }
  | { type: 'action_assign_agent'; config: ActionAssignAgentConfig }
  | { type: 'action_add_tag'; config: ActionTagConfig }
  | { type: 'action_remove_tag'; config: ActionTagConfig }
  | { type: 'action_set_field'; config: ActionSetFieldConfig }
  | { type: 'action_http_webhook'; config: ActionHttpWebhookConfig }
  | { type: 'action_delay'; config: ActionDelayConfig }
  | { type: 'action_pause_ai'; config: ActionAiControlConfig }
  | { type: 'action_resume_ai'; config: ActionAiControlConfig }
  | { type: 'action_request_handoff'; config: ActionHandoffConfig }
  | { type: 'action_send_email'; config: ActionSendEmailConfig }
  | { type: 'action_internal_note'; config: ActionInternalNoteConfig }
  // Sub-workflow
  | { type: 'sub_workflow'; config: SubWorkflowConfig };

// ============================================================================
// Workflow Definition Types (for import/export/versioning)
// ============================================================================

export interface WorkflowNodeDefinition {
  id: string;
  nodeType: string;
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
  continueOnError?: boolean;
}

export interface WorkflowConnectionDefinition {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  branch: 'default' | 'true' | 'false' | 'timeout' | 'error';
  conditionLabel?: string;
  conditionConfig?: Record<string, unknown>;
  label?: string;
  animated?: boolean;
  sortOrder?: number;
}

export interface WorkflowVariableDefinition {
  id: string;
  name: string;
  description?: string;
  variableType: string;
  defaultValue?: unknown;
  isInput?: boolean;
  isOutput?: boolean;
}

export interface WorkflowDefinition {
  version: number;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  nodes: WorkflowNodeDefinition[];
  connections: WorkflowConnectionDefinition[];
  variables: WorkflowVariableDefinition[];
  viewportX?: number;
  viewportY?: number;
  viewportZoom?: number;
}

// ============================================================================
// Execution Context Types
// ============================================================================

export interface ExecutionContext {
  executionId: string;
  workflowId: string;
  workflowVersion: number;
  chatId: string;
  variables: Record<string, unknown>;
  // Current message context
  message?: {
    id: string;
    content: string;
    type: string;
    direction: 'inbound' | 'outbound';
    timestamp: Date;
  };
  // Contact context
  contact?: {
    phone: string;
    name?: string;
    email?: string;
    tags: string[];
    customFields: Record<string, unknown>;
  };
  // Chat context
  chat?: {
    id: string;
    unreadCount: number;
    lastMessageTime?: Date;
    assignedTo?: number;
    currentStageId?: string;
  };
  // AI classification result (if applicable)
  aiClassification?: {
    intent?: string;
    sentiment?: string;
    category?: string;
    confidence: number;
    raw?: unknown;
  };
  // Parent execution (for sub-workflows)
  parentExecutionId?: string;
  parentNodeId?: string;
}

export interface NodeExecutionResult {
  success: boolean;
  nextNodeId?: string;
  // Branch can be a standard value or a custom category name from AI classification
  branch?: string;
  output?: unknown;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  // Updates to context variables
  variableUpdates?: Record<string, unknown>;
  // Logs to record
  logs?: string[];
  // Duration
  durationMs?: number;
  // Condition evaluation results
  conditionResult?: boolean;
  conditionDetails?: Record<string, unknown>;
  // AI classification (for condition nodes)
  aiClassification?: {
    intent?: string;
    sentiment?: string;
    category?: string;
    confidence: number;
    raw?: unknown;
  };
}

// ============================================================================
// Analytics Types
// ============================================================================

export interface WorkflowAnalyticsSummary {
  workflowId: string;
  period: 'today' | 'week' | 'month' | 'all';
  totalExecutions: number;
  completedExecutions: number;
  failedExecutions: number;
  avgDurationMs: number;
  uniqueChats: number;
  conversionRate: number; // % that reached final node
  nodeMetrics: {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    executions: number;
    avgDurationMs: number;
    errorRate: number;
    dropOffCount: number; // Chats that didn't proceed
  }[];
}

export interface WorkflowFunnelStep {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  enteredCount: number;
  exitedCount: number;
  dropOffCount: number;
  conversionRate: number;
  avgTimeInStepMs: number;
}
