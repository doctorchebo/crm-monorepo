/**
 * Workflow AI Testing DTOs
 * Data transfer objects for workflow AI testing endpoints
 */

import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

// ============================================================================
// Test Message DTO
// ============================================================================

export class TestMessageDto {
  /** Order in the sequence (1-based) */
  @IsNumber()
  @Min(1)
  sequence: number;

  /** Message content */
  @IsString()
  content: string;

  /** Message type */
  @IsEnum(['text', 'image', 'document', 'button_reply', 'list_reply'])
  type: 'text' | 'image' | 'document' | 'button_reply' | 'list_reply';

  /** Button ID for button replies */
  @IsOptional()
  @IsString()
  buttonId?: string;

  /** Row ID for list replies */
  @IsOptional()
  @IsString()
  rowId?: string;

  /** Delay before sending (ms) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(60000)
  delayMs?: number;
}

// ============================================================================
// Expected Outcome DTO
// ============================================================================

export class ExpectedOutcomeDto {
  /** Type of assertion */
  @IsEnum([
    'response_contains',
    'response_tone',
    'stage_transition',
    'node_transition',
    'handoff_requested',
    'kb_used',
    'media_attached',
  ])
  type:
    | 'response_contains'
    | 'response_tone'
    | 'stage_transition'
    | 'node_transition'
    | 'handoff_requested'
    | 'kb_used'
    | 'media_attached';

  /** Expected value (string, boolean, or object) */
  value: string | boolean | Record<string, unknown>;

  /** Tolerance for fuzzy matching (0-1) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  tolerance?: number;

  /** Custom failure message */
  @IsOptional()
  @IsString()
  failureMessage?: string;
}

// ============================================================================
// Test Scenario DTO
// ============================================================================

export class CreateTestScenarioDto {
  /** Human-readable scenario name */
  @IsString()
  name: string;

  /** Description of what is being tested */
  @IsString()
  description: string;

  /** Workflow ID to test */
  @IsUUID()
  workflowId: string;

  /** Starting node ID (uses trigger if not specified) */
  @IsOptional()
  @IsUUID()
  startingNodeId?: string;

  /** Test messages to send */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestMessageDto)
  testMessages: TestMessageDto[];

  /** Expected outcomes */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpectedOutcomeDto)
  expectedOutcomes: ExpectedOutcomeDto[];

  /** Tags for categorization */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

// ============================================================================
// Run Test Request DTOs
// ============================================================================

export class RunTestScenarioDto {
  /** Scenario to run */
  @ValidateNested()
  @Type(() => CreateTestScenarioDto)
  scenario: CreateTestScenarioDto;

  /** Dry run (no actual messages sent) */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  /** Collect verbose debug info */
  @IsOptional()
  @IsBoolean()
  verbose?: boolean;

  /** Timeout per message (ms) */
  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(120000)
  messageTimeoutMs?: number;
}

export class RunMultipleTestsDto {
  /** Scenarios to run */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTestScenarioDto)
  scenarios: CreateTestScenarioDto[];

  /** Dry run (no actual messages sent) */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  /** Collect verbose debug info */
  @IsOptional()
  @IsBoolean()
  verbose?: boolean;
}

export class GenerateScenariosDto {
  /** Workflow ID to generate scenarios for */
  @IsUUID()
  workflowId: string;

  /** Include edge case scenarios */
  @IsOptional()
  @IsBoolean()
  includeEdgeCases?: boolean;

  /** Include classification branch scenarios */
  @IsOptional()
  @IsBoolean()
  includeClassificationBranches?: boolean;
}

// ============================================================================
// Debug Context Request DTOs
// ============================================================================

export class GetAIContextDto {
  /** Chat ID to get context for */
  @IsString()
  chatId: string;
}

export class SimulateMessageDto {
  /** Chat ID to simulate for */
  @IsString()
  chatId: string;

  /** Message content */
  @IsString()
  message: string;

  /** Return debug context */
  @IsOptional()
  @IsBoolean()
  debug?: boolean;

  /** Skip workflow context (test default behavior) */
  @IsOptional()
  @IsBoolean()
  skipWorkflowContext?: boolean;
}

// ============================================================================
// Response DTOs
// ============================================================================

export class AssertionResultDto {
  /** The expected outcome */
  outcome: ExpectedOutcomeDto;

  /** Whether the assertion passed */
  passed: boolean;

  /** Actual value observed */
  actualValue: unknown;

  /** Details about the comparison */
  details: string;
}

export class TimelineEventDto {
  /** Event timestamp */
  timestamp: Date;

  /** Event type */
  type: string;

  /** Event data */
  data: Record<string, unknown>;
}

export class TestResultDto {
  /** Scenario ID */
  scenarioId: string;

  /** Overall pass/fail */
  passed: boolean;

  /** Assertion results */
  assertions: AssertionResultDto[];

  /** Actual responses generated */
  actualResponses: Array<{
    sequence: number;
    response: string;
    nodeId: string | null;
  }>;

  /** Execution timeline */
  timeline: TimelineEventDto[];

  /** Total duration (ms) */
  durationMs: number;

  /** Errors encountered */
  errors: string[];
}

export class TestSummaryDto {
  /** Total scenarios run */
  total: number;

  /** Scenarios passed */
  passed: number;

  /** Scenarios failed */
  failed: number;

  /** Pass rate (percentage) */
  passRate: number;

  /** Total duration (ms) */
  totalDurationMs: number;

  /** Results by scenario ID */
  results: Record<string, TestResultDto>;
}

export class AIContextResponseDto {
  /** Workflow assignment state */
  assignment: {
    isAssigned: boolean;
    workflowId: string | null;
    workflowName: string | null;
    workflowVersion: number | null;
    executionId: string | null;
  };

  /** Node AI instructions */
  nodeInstructions: {
    nodeId: string;
    nodeType: string;
    instructions: string | null;
    tone: string | null;
    goal: string | null;
    allowedKbTemplates: string[];
  } | null;

  /** Current stage */
  currentStage: {
    id: string;
    name: string;
    description?: string;
    aiAutoReply: boolean;
  } | null;

  /** AI enabled status */
  aiEnabled: boolean;

  /** AI disabled reason */
  aiDisabledReason: string | null;

  /** Validation result */
  validation: {
    canProceed: boolean;
    errors: Array<{ code: string; message: string }>;
    warnings: Array<{ code: string; message: string }>;
  };
}

export class SimulateResponseDto {
  /** Generated response content */
  content: string;

  /** Whether response should be sent */
  shouldSend: boolean;

  /** Whether escalation was triggered */
  escalationTriggered: boolean;

  /** Escalation reason if triggered */
  escalationReason?: string;

  /** Warnings generated */
  warnings: string[];

  /** Debug context (if requested) */
  debugContext?: Record<string, unknown>;
}
