/**
 * Workflow Builder Schema
 * Visual canvas-based workflow automation for WhatsApp CRM
 *
 * Architecture:
 * - Team-scoped workflows (multi-tenant)
 * - Canvas nodes with visual positions
 * - Connector-based conditions (edges between nodes)
 * - Sub-workflow support for reusability
 * - Execution tracking per chat
 *
 * Node Types:
 * - trigger: Entry points (message received, time-based, webhook, manual)
 * - condition: Branching logic (AI classification, keyword, custom field)
 * - action: Perform operations (move stage, send template, assign agent, tag, webhook, delay)
 * - sub_workflow: Reference to another workflow
 */

import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { chats, teams, users } from './schema';

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Workflow status - controls whether automation runs
 */
export const workflowStatusEnum = pgEnum('workflow_status', [
  'draft', // Being edited, not active
  'published', // Published and ready to run
  'active', // Running and processing chats
  'paused', // Temporarily disabled
  'archived', // Soft deleted, not shown in UI
  'disabled', // Explicitly disabled
]);

/**
 * Node types for the visual workflow builder
 * Includes both generic types (for backward compatibility) and specific action types
 */
export const workflowNodeTypeEnum = pgEnum('workflow_node_type', [
  // Generic types (legacy)
  'trigger',
  'condition',
  'action',
  'delay',
  'branch',
  'sub_workflow',
  'end',

  // Entry points (specific)
  'trigger_message', // New message received
  'trigger_time', // Time-based (delay, schedule)
  'trigger_webhook', // External webhook call
  'trigger_manual', // User manually enters chat
  'trigger_tag', // Contact tagged
  'trigger_stage_enter', // Chat enters a stage

  // Conditions (branching)
  'condition_ai_classification', // AI classifies message (intent, sentiment)
  'condition_keyword', // Keyword matching
  'condition_contact_field', // Contact custom field value
  'condition_time', // Time of day, day of week
  'condition_chat_property', // Chat metadata (unread count, last message time)
  'condition_expression', // Custom expression

  // Actions
  'action_move_stage', // Move chat to different stage
  'action_send_template', // Send WhatsApp template message
  'action_send_message', // Send AI-generated or static message
  'action_assign_agent', // Assign chat to team member
  'action_add_tag', // Add tag to contact/chat
  'action_remove_tag', // Remove tag from contact/chat
  'action_set_field', // Set custom field on contact
  'action_http_webhook', // Call external HTTP endpoint
  'action_delay', // Wait for specified time
  'action_pause_ai', // Pause AI for this chat
  'action_resume_ai', // Resume AI for this chat
  'action_request_handoff', // Request human handoff
  'action_send_email', // Send email notification
  'action_internal_note', // Add internal note to chat
]);

/**
 * Connection branch types for conditional logic
 * @deprecated This enum is no longer used. The branch field is now text to support
 * dynamic AI classification categories. Kept for documentation of common values.
 * Common values: 'default', 'true', 'false', 'timeout', 'error'
 * AI classification: category names like 'interested', 'support', 'billing', etc.
 */
export const connectionBranchEnum = pgEnum('workflow_connection_branch', [
  'default', // Default path (no condition or condition not met)
  'true', // Condition evaluated to true
  'false', // Condition evaluated to false
  'timeout', // Timeout branch for delays
  'error', // Error handling branch
]);

/**
 * Execution status for workflow runs
 */
export const workflowExecutionStatusEnum = pgEnum('workflow_execution_status', [
  'running', // Currently executing
  'waiting', // Waiting for condition/delay
  'completed', // Finished successfully
  'failed', // Error occurred
  'cancelled', // User cancelled
  'timeout', // Execution timed out
]);

/**
 * Trigger types for execution tracking
 */
export const executionTriggerTypeEnum = pgEnum('execution_trigger_type', [
  'message', // Triggered by incoming message
  'time', // Triggered by time schedule
  'webhook', // Triggered by webhook
  'manual', // Manually triggered by user
  'tag', // Triggered by tag change
  'stage_change', // Triggered by stage change
  'sub_workflow', // Called from parent workflow
]);

// ============================================================================
// WORKFLOW DEFINITIONS
// ============================================================================

/**
 * Workflows table - main container for visual workflow definitions
 * Team-scoped for multi-tenant support
 */
export const workflows = pgTable(
  'workflows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    // Workflow identification
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    icon: varchar('icon', { length: 50 }).default('workflow'),
    color: varchar('color', { length: 20 }).default('#3b82f6'),

    // Status & versioning
    status: workflowStatusEnum('status').notNull().default('draft'),
    version: integer('version').notNull().default(1),
    publishedAt: timestamp('published_at'), // When last activated

    // Behavior settings
    isExclusive: boolean('is_exclusive').default(true), // Only one workflow per chat at a time
    priority: integer('priority').default(0), // Higher = evaluated first when multiple match
    maxExecutionsPerChat: integer('max_executions_per_chat'), // Limit re-entries

    // Trigger configuration (which triggers activate this workflow)
    triggerConfig: jsonb('trigger_config').default('{}'),

    // Canvas viewport (for UI restoration)
    viewportX: real('viewport_x').default(0),
    viewportY: real('viewport_y').default(0),
    viewportZoom: real('viewport_zoom').default(1),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    deletedAt: timestamp('deleted_at'), // Soft delete - null means active
  },
  (table) => ({
    teamIdIndex: index('idx_workflows_team_id').on(table.teamId),
    statusIndex: index('idx_workflows_status').on(table.status),
    priorityIndex: index('idx_workflows_priority').on(table.priority),
    deletedAtIndex: index('idx_workflows_deleted_at').on(table.deletedAt),
    teamNameUnique: unique('uq_workflows_team_name').on(
      table.teamId,
      table.name,
    ),
  }),
);

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;

// ============================================================================
// WORKFLOW NODES
// ============================================================================

/**
 * Workflow Nodes table - visual canvas nodes
 * Each node represents a trigger, condition, action, or sub-workflow
 */
export const workflowNodes = pgTable(
  'workflow_nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),

    // Node type
    nodeType: workflowNodeTypeEnum('node_type').notNull(),

    // Visual positioning (for canvas)
    positionX: real('position_x').notNull().default(0),
    positionY: real('position_y').notNull().default(0),

    // Node display
    label: varchar('label', { length: 200 }),
    description: text('description'),

    // Node configuration (type-specific JSON)
    config: jsonb('config').notNull().default('{}'),

    // AI-specific settings for action nodes
    aiInstructions: text('ai_instructions'), // Stage-specific AI behavior
    aiTone: varchar('ai_tone', { length: 50 }), // friendly, professional, etc.
    aiGoal: text('ai_goal'), // What the AI should accomplish

    // Knowledge base restrictions
    allowedKbTemplates: jsonb('allowed_kb_templates').default('[]'), // Array of template IDs

    // Error handling
    onErrorNodeId: uuid('on_error_node_id'), // Jump to this node on error
    continueOnError: boolean('continue_on_error').default(false),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    workflowIdIndex: index('idx_workflow_nodes_workflow_id').on(
      table.workflowId,
    ),
    nodeTypeIndex: index('idx_workflow_nodes_type').on(table.nodeType),
  }),
);

export type WorkflowNode = typeof workflowNodes.$inferSelect;
export type NewWorkflowNode = typeof workflowNodes.$inferInsert;

// ============================================================================
// WORKFLOW CONNECTIONS
// ============================================================================

/**
 * Workflow Connections table - edges between nodes
 * Represents the flow between nodes including conditional branches
 */
export const workflowConnections = pgTable(
  'workflow_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),

    // Source and target nodes
    fromNodeId: uuid('from_node_id')
      .notNull()
      .references(() => workflowNodes.id, { onDelete: 'cascade' }),
    toNodeId: uuid('to_node_id')
      .notNull()
      .references(() => workflowNodes.id, { onDelete: 'cascade' }),

    // Connection branch type (text for flexibility with AI classification categories)
    // Common values: 'default', 'true', 'false', 'timeout', 'error'
    // AI classification: category names like 'interested', 'support', 'billing', etc.
    branch: text('branch').notNull().default('default'),

    // Optional condition for this specific connection
    // (allows multiple conditions from same node)
    conditionLabel: varchar('condition_label', { length: 100 }),
    conditionConfig: jsonb('condition_config'), // Branch-specific condition

    // Visual styling
    label: varchar('label', { length: 100 }),
    animated: boolean('animated').default(false),

    // Ordering (for multiple connections from same node)
    sortOrder: integer('sort_order').default(0),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    workflowIdIndex: index('idx_workflow_connections_workflow_id').on(
      table.workflowId,
    ),
    fromNodeIndex: index('idx_workflow_connections_from').on(table.fromNodeId),
    toNodeIndex: index('idx_workflow_connections_to').on(table.toNodeId),
    uniqueConnection: unique('uq_workflow_connection').on(
      table.fromNodeId,
      table.toNodeId,
      table.branch,
    ),
  }),
);

export type WorkflowConnection = typeof workflowConnections.$inferSelect;
export type NewWorkflowConnection = typeof workflowConnections.$inferInsert;

// ============================================================================
// SUB-WORKFLOWS
// ============================================================================

/**
 * Sub-workflow references - links workflow nodes to other workflows
 * Enables modular, reusable workflow components
 */
export const workflowSubWorkflows = pgTable(
  'workflow_sub_workflows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The node that contains this sub-workflow reference
    nodeId: uuid('node_id')
      .notNull()
      .references(() => workflowNodes.id, { onDelete: 'cascade' }),
    // The workflow being referenced
    targetWorkflowId: uuid('target_workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),

    // Input/output mapping (pass variables between workflows)
    inputMapping: jsonb('input_mapping').default('{}'),
    outputMapping: jsonb('output_mapping').default('{}'),

    // Behavior
    waitForCompletion: boolean('wait_for_completion').default(true),

    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    nodeIdIndex: index('idx_workflow_sub_node_id').on(table.nodeId),
    targetIndex: index('idx_workflow_sub_target').on(table.targetWorkflowId),
  }),
);

export type WorkflowSubWorkflow = typeof workflowSubWorkflows.$inferSelect;
export type NewWorkflowSubWorkflow = typeof workflowSubWorkflows.$inferInsert;

// ============================================================================
// WORKFLOW VARIABLES
// ============================================================================

/**
 * Workflow Variables - reusable variables within a workflow
 * Can be set by actions and used in conditions
 */
export const workflowVariables = pgTable(
  'workflow_variables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),

    // Variable type for validation
    variableType: varchar('variable_type', { length: 50 })
      .notNull()
      .default('string'), // string, number, boolean, array, object
    defaultValue: jsonb('default_value'),

    // Scope
    isInput: boolean('is_input').default(false), // Can be passed in externally
    isOutput: boolean('is_output').default(false), // Returned after execution

    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    workflowIdIndex: index('idx_workflow_vars_workflow_id').on(
      table.workflowId,
    ),
    uniqueName: unique('uq_workflow_var_name').on(table.workflowId, table.name),
  }),
);

export type WorkflowVariable = typeof workflowVariables.$inferSelect;
export type NewWorkflowVariable = typeof workflowVariables.$inferInsert;

// ============================================================================
// WORKFLOW VERSIONS (for rollback support)
// ============================================================================

/**
 * Workflow Versions - snapshots of workflow definitions
 * Enables version history and rollback
 */
export const workflowVersions = pgTable(
  'workflow_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),

    version: integer('version').notNull(),
    publishedBy: integer('published_by').references(() => users.id),

    // Snapshot of entire workflow (nodes, connections, variables)
    snapshot: jsonb('snapshot').notNull(),

    // Changelog
    changeNotes: text('change_notes'),

    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    workflowVersionIndex: index('idx_workflow_versions_workflow').on(
      table.workflowId,
    ),
    uniqueVersion: unique('uq_workflow_version').on(
      table.workflowId,
      table.version,
    ),
  }),
);

export type WorkflowVersion = typeof workflowVersions.$inferSelect;
export type NewWorkflowVersion = typeof workflowVersions.$inferInsert;

// ============================================================================
// WORKFLOW EXECUTIONS (Runtime tracking)
// ============================================================================

/**
 * Workflow Executions - tracks workflow runs per chat
 * One record per workflow entry (a chat can re-enter multiple times)
 */
export const workflowExecutions = pgTable(
  'workflow_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    chatId: varchar('chat_id')
      .notNull()
      .references(() => chats.chatId, { onDelete: 'cascade' }),

    // Which version of the workflow is running
    workflowVersion: integer('workflow_version').notNull(),

    // Execution status
    status: workflowExecutionStatusEnum('status').notNull().default('running'),

    // Current position in workflow
    currentNodeId: uuid('current_node_id').references(() => workflowNodes.id, {
      onDelete: 'set null',
    }),

    // Trigger information
    triggerType: executionTriggerTypeEnum('trigger_type').notNull(),
    triggerNodeId: uuid('trigger_node_id').references(() => workflowNodes.id, {
      onDelete: 'set null',
    }),
    triggerMessageId: varchar('trigger_message_id'), // If triggered by message
    triggeredBy: integer('triggered_by').references(() => users.id), // If manual

    // Parent execution (for sub-workflows)
    parentExecutionId: uuid('parent_execution_id'),
    parentNodeId: uuid('parent_node_id'),

    // Runtime variables (accumulated during execution)
    variables: jsonb('variables').default('{}'),

    // Error tracking
    errorMessage: text('error_message'),
    errorNodeId: uuid('error_node_id'),

    // Timing
    startedAt: timestamp('started_at').defaultNow(),
    completedAt: timestamp('completed_at'),
    scheduledResumeAt: timestamp('scheduled_resume_at'), // For delays

    // Metrics
    nodesExecuted: integer('nodes_executed').default(0),
    totalDurationMs: integer('total_duration_ms'),
  },
  (table) => ({
    workflowIdIndex: index('idx_workflow_exec_workflow_id').on(
      table.workflowId,
    ),
    chatIdIndex: index('idx_workflow_exec_chat_id').on(table.chatId),
    statusIndex: index('idx_workflow_exec_status').on(table.status),
    scheduledIndex: index('idx_workflow_exec_scheduled').on(
      table.scheduledResumeAt,
    ),
    parentIndex: index('idx_workflow_exec_parent').on(table.parentExecutionId),
  }),
);

export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type NewWorkflowExecution = typeof workflowExecutions.$inferInsert;

// ============================================================================
// WORKFLOW EXECUTION LOGS
// ============================================================================

/**
 * Execution Logs - detailed step-by-step log of each node execution
 * Used for debugging and analytics
 */
export const workflowExecutionLogs = pgTable(
  'workflow_execution_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    executionId: uuid('execution_id')
      .notNull()
      .references(() => workflowExecutions.id, { onDelete: 'cascade' }),
    nodeId: uuid('node_id').references(() => workflowNodes.id, {
      onDelete: 'set null',
    }),

    // What happened
    action: varchar('action', { length: 50 }).notNull(), // 'entered', 'executed', 'exited', 'error', 'skipped'
    nodeType: varchar('node_type', { length: 50 }),

    // Input/output for this step
    input: jsonb('input'),
    output: jsonb('output'),

    // Condition evaluation result (for condition nodes)
    conditionResult: boolean('condition_result'),
    conditionDetails: jsonb('condition_details'),

    // AI classification (if applicable)
    aiClassification: jsonb('ai_classification'),
    aiConfidence: real('ai_confidence'),

    // Error details (if action = 'error')
    errorMessage: text('error_message'),
    errorStack: text('error_stack'),

    // Timing
    durationMs: integer('duration_ms'),
    executedAt: timestamp('executed_at').defaultNow(),
  },
  (table) => ({
    executionIdIndex: index('idx_workflow_logs_execution').on(
      table.executionId,
    ),
    nodeIdIndex: index('idx_workflow_logs_node').on(table.nodeId),
    executedAtIndex: index('idx_workflow_logs_executed_at').on(
      table.executedAt,
    ),
  }),
);

export type WorkflowExecutionLog = typeof workflowExecutionLogs.$inferSelect;
export type NewWorkflowExecutionLog = typeof workflowExecutionLogs.$inferInsert;

// ============================================================================
// WORKFLOW CHAT STATE
// ============================================================================

/**
 * Workflow Chat State - current workflow state per chat
 * Lightweight table for quick lookups (which workflow is a chat in?)
 */
export const workflowChatState = pgTable(
  'workflow_chat_state',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chatId: varchar('chat_id')
      .notNull()
      .unique()
      .references(() => chats.chatId, { onDelete: 'cascade' }),

    // Current active workflow/execution
    activeWorkflowId: uuid('active_workflow_id').references(
      () => workflows.id,
      { onDelete: 'set null' },
    ),
    activeExecutionId: uuid('active_execution_id').references(
      () => workflowExecutions.id,
      { onDelete: 'set null' },
    ),

    // Quick access to current node for AI context
    currentNodeId: uuid('current_node_id').references(() => workflowNodes.id, {
      onDelete: 'set null',
    }),

    // Cached AI instructions from current node (denormalized for performance)
    currentAiInstructions: text('current_ai_instructions'),
    currentAiTone: varchar('current_ai_tone', { length: 50 }),
    currentAiGoal: text('current_ai_goal'),
    allowedKbTemplates: jsonb('allowed_kb_templates'),

    // State flags
    isPaused: boolean('is_paused').default(false),
    pausedAt: timestamp('paused_at'),
    pausedBy: integer('paused_by').references(() => users.id),
    pauseReason: text('pause_reason'),

    // Timestamps
    enteredWorkflowAt: timestamp('entered_workflow_at'),
    lastNodeChangeAt: timestamp('last_node_change_at'),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    workflowIdIndex: index('idx_workflow_chat_state_workflow').on(
      table.activeWorkflowId,
    ),
    executionIdIndex: index('idx_workflow_chat_state_execution').on(
      table.activeExecutionId,
    ),
  }),
);

export type WorkflowChatState = typeof workflowChatState.$inferSelect;
export type NewWorkflowChatState = typeof workflowChatState.$inferInsert;

// ============================================================================
// WORKFLOW TEMPLATE CATEGORIES
// ============================================================================

/**
 * Workflow Template Categories - organize workflow templates
 */
export const workflowTemplateCategories = pgTable(
  'workflow_template_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull().unique(),
    description: text('description'),
    icon: varchar('icon', { length: 50 }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow(),
  },
);

export type WorkflowTemplateCategory =
  typeof workflowTemplateCategories.$inferSelect;
export type NewWorkflowTemplateCategory =
  typeof workflowTemplateCategories.$inferInsert;

// ============================================================================
// WORKFLOW TEMPLATES (Pre-built workflows)
// ============================================================================

/**
 * Workflow Templates - shareable/importable workflow definitions
 * Uses category_id referencing workflow_template_categories
 */
export const workflowTemplates = pgTable(
  'workflow_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id').references(
      () => workflowTemplateCategories.id,
      { onDelete: 'set null' },
    ),

    // Template info
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    icon: varchar('icon', { length: 50 }),
    previewImageUrl: text('preview_image_url'),

    // Full workflow definition (nodes, connections, variables)
    definition: jsonb('definition').notNull(),

    // Display settings
    isFeatured: boolean('is_featured').notNull().default(false),

    // Usage stats
    useCount: integer('use_count').notNull().default(0),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    categoryIdIndex: index('idx_workflow_templates_category_id').on(
      table.categoryId,
    ),
    isFeaturedIndex: index('idx_workflow_templates_is_featured').on(
      table.isFeatured,
    ),
  }),
);

export type WorkflowTemplate = typeof workflowTemplates.$inferSelect;
export type NewWorkflowTemplate = typeof workflowTemplates.$inferInsert;

// ============================================================================
// ANALYTICS TABLES
// ============================================================================

/**
 * Workflow Analytics - aggregated metrics per workflow
 * Updated periodically for dashboard performance
 */
export const workflowAnalytics = pgTable(
  'workflow_analytics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),

    // Time period
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    periodType: varchar('period_type', { length: 20 }).notNull(), // hourly, daily, weekly

    // Execution metrics
    totalExecutions: integer('total_executions').default(0),
    completedExecutions: integer('completed_executions').default(0),
    failedExecutions: integer('failed_executions').default(0),
    avgDurationMs: integer('avg_duration_ms'),

    // Conversion metrics
    uniqueChats: integer('unique_chats').default(0),
    chatsCompletedGoal: integer('chats_completed_goal').default(0), // Reached final node

    // Per-node breakdown (JSON for flexibility)
    nodeMetrics: jsonb('node_metrics').default('{}'),

    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    workflowPeriodIndex: index('idx_workflow_analytics_workflow_period').on(
      table.workflowId,
      table.periodStart,
    ),
    periodTypeIndex: index('idx_workflow_analytics_type').on(table.periodType),
  }),
);

export type WorkflowAnalytics = typeof workflowAnalytics.$inferSelect;
export type NewWorkflowAnalytics = typeof workflowAnalytics.$inferInsert;

// ============================================================================
// RELATIONS
// ============================================================================

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  team: one(teams, {
    fields: [workflows.teamId],
    references: [teams.id],
  }),
  creator: one(users, {
    fields: [workflows.createdBy],
    references: [users.id],
  }),
  nodes: many(workflowNodes),
  connections: many(workflowConnections),
  variables: many(workflowVariables),
  versions: many(workflowVersions),
  executions: many(workflowExecutions),
  analytics: many(workflowAnalytics),
}));

export const workflowNodesRelations = relations(
  workflowNodes,
  ({ one, many }) => ({
    workflow: one(workflows, {
      fields: [workflowNodes.workflowId],
      references: [workflows.id],
    }),
    outgoingConnections: many(workflowConnections, {
      relationName: 'fromNode',
    }),
    incomingConnections: many(workflowConnections, {
      relationName: 'toNode',
    }),
    subWorkflow: one(workflowSubWorkflows),
  }),
);

export const workflowConnectionsRelations = relations(
  workflowConnections,
  ({ one }) => ({
    workflow: one(workflows, {
      fields: [workflowConnections.workflowId],
      references: [workflows.id],
    }),
    fromNode: one(workflowNodes, {
      fields: [workflowConnections.fromNodeId],
      references: [workflowNodes.id],
      relationName: 'fromNode',
    }),
    toNode: one(workflowNodes, {
      fields: [workflowConnections.toNodeId],
      references: [workflowNodes.id],
      relationName: 'toNode',
    }),
  }),
);

export const workflowSubWorkflowsRelations = relations(
  workflowSubWorkflows,
  ({ one }) => ({
    node: one(workflowNodes, {
      fields: [workflowSubWorkflows.nodeId],
      references: [workflowNodes.id],
    }),
    targetWorkflow: one(workflows, {
      fields: [workflowSubWorkflows.targetWorkflowId],
      references: [workflows.id],
    }),
  }),
);

export const workflowVariablesRelations = relations(
  workflowVariables,
  ({ one }) => ({
    workflow: one(workflows, {
      fields: [workflowVariables.workflowId],
      references: [workflows.id],
    }),
  }),
);

export const workflowVersionsRelations = relations(
  workflowVersions,
  ({ one }) => ({
    workflow: one(workflows, {
      fields: [workflowVersions.workflowId],
      references: [workflows.id],
    }),
    publisher: one(users, {
      fields: [workflowVersions.publishedBy],
      references: [users.id],
    }),
  }),
);

export const workflowExecutionsRelations = relations(
  workflowExecutions,
  ({ one, many }) => ({
    workflow: one(workflows, {
      fields: [workflowExecutions.workflowId],
      references: [workflows.id],
    }),
    chat: one(chats, {
      fields: [workflowExecutions.chatId],
      references: [chats.chatId],
    }),
    currentNode: one(workflowNodes, {
      fields: [workflowExecutions.currentNodeId],
      references: [workflowNodes.id],
    }),
    triggeredByUser: one(users, {
      fields: [workflowExecutions.triggeredBy],
      references: [users.id],
    }),
    logs: many(workflowExecutionLogs),
  }),
);

export const workflowExecutionLogsRelations = relations(
  workflowExecutionLogs,
  ({ one }) => ({
    execution: one(workflowExecutions, {
      fields: [workflowExecutionLogs.executionId],
      references: [workflowExecutions.id],
    }),
    node: one(workflowNodes, {
      fields: [workflowExecutionLogs.nodeId],
      references: [workflowNodes.id],
    }),
  }),
);

export const workflowChatStateRelations = relations(
  workflowChatState,
  ({ one }) => ({
    chat: one(chats, {
      fields: [workflowChatState.chatId],
      references: [chats.chatId],
    }),
    activeWorkflow: one(workflows, {
      fields: [workflowChatState.activeWorkflowId],
      references: [workflows.id],
    }),
    activeExecution: one(workflowExecutions, {
      fields: [workflowChatState.activeExecutionId],
      references: [workflowExecutions.id],
    }),
    currentNode: one(workflowNodes, {
      fields: [workflowChatState.currentNodeId],
      references: [workflowNodes.id],
    }),
    pausedByUser: one(users, {
      fields: [workflowChatState.pausedBy],
      references: [users.id],
    }),
  }),
);

export const workflowTemplateCategoriesRelations = relations(
  workflowTemplateCategories,
  ({ many }) => ({
    templates: many(workflowTemplates),
  }),
);

export const workflowTemplatesRelations = relations(
  workflowTemplates,
  ({ one }) => ({
    category: one(workflowTemplateCategories, {
      fields: [workflowTemplates.categoryId],
      references: [workflowTemplateCategories.id],
    }),
  }),
);

export const workflowAnalyticsRelations = relations(
  workflowAnalytics,
  ({ one }) => ({
    workflow: one(workflows, {
      fields: [workflowAnalytics.workflowId],
      references: [workflows.id],
    }),
  }),
);

// ============================================================================
// TEAM WORKFLOW SETTINGS
// ============================================================================

/**
 * Team Workflow Settings - team-level workflow configuration
 * Stores default workflow for new customer-initiated chats
 */
export const teamWorkflowSettings = pgTable(
  'team_workflow_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: integer('team_id')
      .notNull()
      .unique()
      .references(() => teams.id, { onDelete: 'cascade' }),
    defaultWorkflowId: uuid('default_workflow_id').references(
      () => workflows.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    teamIdIndex: index('idx_team_workflow_settings_team').on(table.teamId),
    workflowIdIndex: index('idx_team_workflow_settings_workflow').on(
      table.defaultWorkflowId,
    ),
  }),
);

export type TeamWorkflowSettings = typeof teamWorkflowSettings.$inferSelect;
export type NewTeamWorkflowSettings = typeof teamWorkflowSettings.$inferInsert;

export const teamWorkflowSettingsRelations = relations(
  teamWorkflowSettings,
  ({ one }) => ({
    team: one(teams, {
      fields: [teamWorkflowSettings.teamId],
      references: [teams.id],
    }),
    defaultWorkflow: one(workflows, {
      fields: [teamWorkflowSettings.defaultWorkflowId],
      references: [workflows.id],
    }),
  }),
);
