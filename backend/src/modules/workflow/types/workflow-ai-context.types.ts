/**
 * Workflow AI Context Types
 * Type definitions for workflow-aware AI response generation
 *
 * This module defines the contract between the workflow system and AI response generation.
 * It ensures that AI responses respect workflow configurations, node instructions,
 * and properly handle edge cases like workflow changes or unassignment.
 */

import type { WorkflowStageConfig } from './workflow.types';

// ============================================================================
// Core Workflow Context
// ============================================================================

/**
 * Represents the current workflow assignment state for a chat
 */
export interface WorkflowAssignmentState {
  /** Whether a workflow is currently assigned */
  isAssigned: boolean;
  /** The workflow ID if assigned */
  workflowId: string | null;
  /** The workflow name (for logging/display) */
  workflowName: string | null;
  /** The workflow version being executed */
  workflowVersion: number | null;
  /** Current execution ID if in active execution */
  executionId: string | null;
  /** When the workflow was assigned to this chat */
  assignedAt: Date | null;
  /** Source of assignment (auto, manual, trigger) */
  assignmentSource: 'auto' | 'manual' | 'trigger' | null;
}

/**
 * Node-specific AI instructions from the workflow
 */
export interface WorkflowNodeAIInstructions {
  /** The node ID these instructions come from */
  nodeId: string;
  /** Node type for context */
  nodeType: string;
  /** Custom AI instructions defined in the node */
  instructions: string | null;
  /** AI tone setting (friendly, professional, etc.) */
  tone: string | null;
  /** Goal description for this node */
  goal: string | null;
  /** Allowed knowledge base templates (restrict KB access) */
  allowedKbTemplates: string[];
}

/**
 * Trigger configuration that activated the workflow
 */
export interface WorkflowTriggerContext {
  /** Type of trigger that activated */
  triggerType:
    | 'message'
    | 'time'
    | 'webhook'
    | 'manual'
    | 'tag'
    | 'stage_change';
  /** Message that triggered (if message trigger) */
  triggerMessageId: string | null;
  /** Keywords matched (if keyword trigger) */
  matchedKeywords: string[];
  /** AI classification that triggered (if AI condition) */
  aiClassification: {
    category: string | null;
    intent: string | null;
    sentiment: string | null;
    confidence: number;
  } | null;
}

/**
 * Complete workflow context for AI response generation
 */
export interface WorkflowAIContext {
  /** Workflow assignment state */
  assignment: WorkflowAssignmentState;
  /** Current node AI instructions (if in a workflow) */
  nodeInstructions: WorkflowNodeAIInstructions | null;
  /** Trigger context (how the workflow was activated) */
  triggerContext: WorkflowTriggerContext | null;
  /** Current workflow stage (if applicable) */
  currentStage: WorkflowStageConfig | null;
  /** Variables accumulated during workflow execution */
  workflowVariables: Record<string, unknown>;
  /** Whether AI should be active based on workflow state */
  aiEnabled: boolean;
  /** Reason if AI is disabled */
  aiDisabledReason: string | null;
}

// ============================================================================
// Workflow Change Detection
// ============================================================================

/**
 * Types of workflow changes that can occur
 */
export type WorkflowChangeType =
  | 'workflow_assigned' // New workflow assigned to chat
  | 'workflow_unassigned' // Workflow removed from chat
  | 'workflow_changed' // Different workflow assigned
  | 'node_changed' // Moved to different node in same workflow
  | 'workflow_version_updated' // Same workflow, new version
  | 'workflow_paused' // Workflow execution paused
  | 'workflow_resumed'; // Workflow execution resumed

/**
 * Represents a change in workflow state
 */
export interface WorkflowChangeEvent {
  /** Type of change */
  changeType: WorkflowChangeType;
  /** Chat affected */
  chatId: string;
  /** Previous workflow ID (if applicable) */
  previousWorkflowId: string | null;
  /** New workflow ID (if applicable) */
  newWorkflowId: string | null;
  /** Previous node ID (if applicable) */
  previousNodeId: string | null;
  /** New node ID (if applicable) */
  newNodeId: string | null;
  /** When the change occurred */
  timestamp: Date;
  /** Who/what triggered the change */
  triggeredBy: 'system' | 'user' | 'rule' | 'manual';
  /** User ID if triggered by user */
  userId?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// AI Instruction Resolution
// ============================================================================

/**
 * Priority levels for instruction sources
 * Higher priority overrides lower priority
 */
export enum InstructionPriority {
  /** Default system instructions (lowest) */
  SYSTEM_DEFAULT = 0,
  /** User-level AI configuration */
  USER_CONFIG = 10,
  /** Workflow default settings */
  WORKFLOW_DEFAULT = 20,
  /** Stage-specific settings */
  STAGE_CONFIG = 30,
  /** Node-specific instructions */
  NODE_INSTRUCTIONS = 40,
  /** Chat-level overrides (highest) */
  CHAT_OVERRIDE = 50,
}

/**
 * Source of an AI instruction
 */
export interface InstructionSource {
  /** Where this instruction came from */
  type:
    | 'system'
    | 'user_config'
    | 'workflow'
    | 'stage'
    | 'node'
    | 'chat_override';
  /** Priority for conflict resolution */
  priority: InstructionPriority;
  /** ID of the source (workflow ID, node ID, etc.) */
  sourceId: string | null;
  /** Human-readable description */
  description: string;
}

/**
 * Resolved AI instructions with provenance tracking
 */
export interface ResolvedWorkflowAIInstructions {
  /** Final merged instructions */
  systemPromptAddition: string;
  /** AI tone to use */
  tone: string;
  /** AI goal/objective */
  goal: string | null;
  /** Formality level */
  formalityLevel: string;
  /** Maximum response length */
  maxResponseLength: number;
  /** Temperature for LLM */
  temperature: number;
  /** Topics to avoid */
  avoidTopics: string[];
  /** Allowed KB templates (empty = all allowed) */
  allowedKbTemplates: string[];
  /** Language preference */
  languagePreference: string | null;
  /** Whether free-text replies are allowed */
  allowFreeTextReplies: boolean;
  /** Whether to use templates only */
  useTemplatesOnly: boolean;
  /** Escalation triggers */
  escalationTriggers: string[];
  /** Source tracking for each setting */
  sources: {
    systemPromptAddition: InstructionSource;
    tone: InstructionSource;
    goal: InstructionSource | null;
    formalityLevel: InstructionSource;
    maxResponseLength: InstructionSource;
    temperature: InstructionSource;
    allowedKbTemplates: InstructionSource;
  };
}

// ============================================================================
// Workflow State Validation
// ============================================================================

/**
 * Result of validating workflow state before AI response
 */
export interface WorkflowStateValidation {
  /** Whether AI can proceed */
  canProceed: boolean;
  /** Validation errors (if any) */
  errors: WorkflowValidationError[];
  /** Validation warnings (non-blocking) */
  warnings: WorkflowValidationWarning[];
  /** Recommended actions */
  recommendations: string[];
}

export interface WorkflowValidationError {
  code: WorkflowValidationErrorCode;
  message: string;
  /** Should fallback to default behavior? */
  fallbackAllowed: boolean;
}

export interface WorkflowValidationWarning {
  code: string;
  message: string;
}

export type WorkflowValidationErrorCode =
  | 'WORKFLOW_NOT_FOUND' // Assigned workflow doesn't exist
  | 'WORKFLOW_NOT_ACTIVE' // Workflow is paused/archived
  | 'WORKFLOW_VERSION_MISMATCH' // Execution using old version
  | 'NODE_NOT_FOUND' // Current node doesn't exist
  | 'EXECUTION_INVALID' // Execution state is corrupted
  | 'AI_DISABLED_BY_WORKFLOW' // Workflow explicitly disables AI
  | 'WORKFLOW_PAUSED' // Workflow execution is paused
  | 'MISSING_REQUIRED_CONFIG'; // Required configuration missing

// ============================================================================
// AI Response Context (for testing/debugging)
// ============================================================================

/**
 * Complete context used for AI response generation
 * Useful for testing and debugging workflow AI behavior
 */
export interface AIResponseGenerationContext {
  /** Chat being responded to */
  chatId: string;
  /** User ID */
  userId: number;
  /** The customer's message */
  customerMessage: string;
  /** Workflow context */
  workflowContext: WorkflowAIContext;
  /** Resolved instructions */
  resolvedInstructions: ResolvedWorkflowAIInstructions;
  /** State validation result */
  validation: WorkflowStateValidation;
  /** Final system prompt sent to LLM */
  finalSystemPrompt: string;
  /** Knowledge base context included */
  knowledgeBaseContext: string | null;
  /** Media context (if media will be attached) */
  mediaContext: {
    willHaveMedia: boolean;
    mediaType: string | null;
    mediaDescription: string | null;
  } | null;
  /** Timestamp */
  timestamp: Date;
}

// ============================================================================
// Workflow AI Testing Types
// ============================================================================

/**
 * Test scenario for workflow AI behavior
 */
export interface WorkflowAITestScenario {
  /** Unique ID for the scenario */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what's being tested */
  description: string;
  /** The workflow to test */
  workflowId: string;
  /** Starting node (optional - uses trigger if not specified) */
  startingNodeId?: string;
  /** Test input messages */
  testMessages: TestMessage[];
  /** Expected outcomes */
  expectedOutcomes: ExpectedOutcome[];
  /** Tags for categorization */
  tags: string[];
}

export interface TestMessage {
  /** Order in the sequence */
  sequence: number;
  /** Message content */
  content: string;
  /** Message type */
  type: 'text' | 'image' | 'document' | 'button_reply' | 'list_reply';
  /** For interactive responses */
  interactiveData?: {
    buttonId?: string;
    rowId?: string;
  };
  /** Delay before sending (ms) */
  delayMs?: number;
}

export interface ExpectedOutcome {
  /** What to verify */
  type:
    | 'response_contains'
    | 'response_tone'
    | 'stage_transition'
    | 'node_transition'
    | 'handoff_requested'
    | 'kb_used'
    | 'media_attached';
  /** Expected value */
  value: string | boolean | Record<string, unknown>;
  /** Tolerance/threshold for fuzzy matching */
  tolerance?: number;
  /** Error message if assertion fails */
  failureMessage?: string;
}

/**
 * Result of running a workflow AI test
 */
export interface WorkflowAITestResult {
  /** Scenario that was tested */
  scenarioId: string;
  /** Overall pass/fail */
  passed: boolean;
  /** Individual assertion results */
  assertions: AssertionResult[];
  /** Actual AI responses generated */
  actualResponses: {
    sequence: number;
    response: string;
    nodeId: string | null;
    workflowContext: WorkflowAIContext;
  }[];
  /** Execution timeline */
  timeline: TimelineEvent[];
  /** Total duration (ms) */
  durationMs: number;
  /** Errors encountered */
  errors: string[];
}

export interface AssertionResult {
  /** Outcome being verified */
  outcome: ExpectedOutcome;
  /** Whether it passed */
  passed: boolean;
  /** Actual value observed */
  actualValue: unknown;
  /** Details about the comparison */
  details: string;
}

export interface TimelineEvent {
  timestamp: Date;
  type:
    | 'message_sent'
    | 'response_generated'
    | 'node_entered'
    | 'stage_changed'
    | 'handoff_requested';
  data: Record<string, unknown>;
}
