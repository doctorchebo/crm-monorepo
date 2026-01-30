/**
 * Workflow AI Testing Service
 * Provides comprehensive testing capabilities for workflow AI behavior
 *
 * Features:
 * - Run test scenarios against workflows
 * - Verify AI responses follow workflow instructions
 * - Detect regressions in AI behavior
 * - Generate test reports
 * - Simulate edge cases
 */

import { db } from '@database/db.connection';
import {
  workflowChatState,
  workflows,
} from '@database/workflow-builder.schema';
import { Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import type {
  AssertionResult,
  ExpectedOutcome,
  TestMessage,
  TimelineEvent,
  WorkflowAIContext,
  WorkflowAITestResult,
  WorkflowAITestScenario,
} from '../types/workflow-ai-context.types';
import type { ClassificationResult } from './llm.service';
import { LLMService } from './llm.service';
import { WorkflowContextProviderService } from './workflow-context-provider.service';
import {
  WorkflowAwareAIResponse,
  WorkflowAwareAIResponseGenerator,
} from './workflow-engine/workflow-aware-ai-generator.service';

// ============================================================================
// Types
// ============================================================================

export interface TestRunOptions {
  /** Whether to actually send messages (false = dry run) */
  dryRun?: boolean;
  /** Whether to save test results to database */
  saveResults?: boolean;
  /** Timeout for each message (ms) */
  messageTimeoutMs?: number;
  /** Whether to collect detailed debug info */
  verbose?: boolean;
}

export interface WorkflowTestConfig {
  /** Workflow to test */
  workflowId: string;
  /** Team owning the workflow */
  teamId: number;
  /** User context for testing */
  userId: number;
}

export interface SimulatedChatContext {
  chatId: string;
  messageHistory: Array<{
    role: 'customer' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  workflowState: WorkflowAIContext | null;
  currentNodeId: string | null;
}

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class WorkflowAITestingService {
  private readonly logger = new Logger(WorkflowAITestingService.name);

  constructor(
    private readonly aiGenerator: WorkflowAwareAIResponseGenerator,
    private readonly contextProvider: WorkflowContextProviderService,
    private readonly llmService: LLMService,
  ) {}

  // ==========================================================================
  // Test Scenario Execution
  // ==========================================================================

  /**
   * Run a single test scenario
   */
  async runScenario(
    scenario: WorkflowAITestScenario,
    config: WorkflowTestConfig,
    options: TestRunOptions = {},
  ): Promise<WorkflowAITestResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const timeline: TimelineEvent[] = [];
    const actualResponses: WorkflowAITestResult['actualResponses'] = [];
    const assertions: AssertionResult[] = [];

    this.logger.log(
      `[Test] Starting scenario "${scenario.name}" for workflow ${scenario.workflowId}`,
    );

    // Validate workflow exists
    const workflow = await this.validateWorkflow(scenario.workflowId);
    if (!workflow) {
      return this.createFailedResult(
        scenario.id,
        ['Workflow not found'],
        startTime,
      );
    }

    // Create simulated chat context
    const chatContext = await this.createSimulatedChatContext(
      scenario,
      config,
      workflow,
    );

    try {
      // Process each test message
      for (const testMessage of scenario.testMessages.sort(
        (a, b) => a.sequence - b.sequence,
      )) {
        // Apply delay if specified
        if (testMessage.delayMs && testMessage.delayMs > 0 && !options.dryRun) {
          await this.delay(testMessage.delayMs);
        }

        timeline.push({
          timestamp: new Date(),
          type: 'message_sent',
          data: {
            sequence: testMessage.sequence,
            content: testMessage.content,
          },
        });

        // Classify the message
        const classification = await this.classifyTestMessage(
          testMessage,
          config.userId,
        );

        // Generate AI response
        const response = await this.generateTestResponse(
          chatContext,
          testMessage,
          classification,
          config.userId,
          options.verbose,
        );

        timeline.push({
          timestamp: new Date(),
          type: 'response_generated',
          data: {
            sequence: testMessage.sequence,
            response: response.content,
            shouldSend: response.shouldSend,
          },
        });

        // Record actual response
        actualResponses.push({
          sequence: testMessage.sequence,
          response: response.content,
          nodeId: chatContext.currentNodeId,
          workflowContext: chatContext.workflowState!,
        });

        // Update chat context
        this.updateChatContext(chatContext, testMessage, response);

        // Check for node transitions
        if (
          response.debugContext?.workflowContext.nodeInstructions?.nodeId !==
          chatContext.currentNodeId
        ) {
          timeline.push({
            timestamp: new Date(),
            type: 'node_entered',
            data: {
              previousNode: chatContext.currentNodeId,
              newNode:
                response.debugContext?.workflowContext.nodeInstructions?.nodeId,
            },
          });
          chatContext.currentNodeId =
            response.debugContext?.workflowContext.nodeInstructions?.nodeId ||
            null;
        }
      }

      // Run assertions
      for (const outcome of scenario.expectedOutcomes) {
        const result = await this.evaluateOutcome(
          outcome,
          actualResponses,
          chatContext,
          timeline,
        );
        assertions.push(result);
      }
    } catch (error) {
      errors.push(
        `Test execution error: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
      this.logger.error(
        `[Test] Error in scenario "${scenario.name}": ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    // Cleanup simulated chat
    await this.cleanupSimulatedChat(chatContext.chatId);

    const durationMs = Date.now() - startTime;
    const passed = assertions.every((a) => a.passed) && errors.length === 0;

    this.logger.log(
      `[Test] Scenario "${scenario.name}" ${passed ? 'PASSED' : 'FAILED'} in ${durationMs}ms`,
    );

    return {
      scenarioId: scenario.id,
      passed,
      assertions,
      actualResponses,
      timeline,
      durationMs,
      errors,
    };
  }

  /**
   * Run multiple test scenarios
   */
  async runScenarios(
    scenarios: WorkflowAITestScenario[],
    config: WorkflowTestConfig,
    options: TestRunOptions = {},
  ): Promise<Map<string, WorkflowAITestResult>> {
    const results = new Map<string, WorkflowAITestResult>();

    for (const scenario of scenarios) {
      const result = await this.runScenario(scenario, config, options);
      results.set(scenario.id, result);
    }

    return results;
  }

  // ==========================================================================
  // Test Scenario Generation
  // ==========================================================================

  /**
   * Generate test scenarios from a workflow definition
   */
  async generateScenariosFromWorkflow(
    workflowId: string,
  ): Promise<WorkflowAITestScenario[]> {
    const scenarios: WorkflowAITestScenario[] = [];

    const workflow = await db.query.workflows.findFirst({
      where: eq(workflows.id, workflowId),
      with: { nodes: true, connections: true },
    });

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    // Generate basic happy path scenario
    const happyPath = this.generateHappyPathScenario(workflow);
    if (happyPath) {
      scenarios.push(happyPath);
    }

    // Generate scenarios for each condition node
    for (const node of workflow.nodes.filter((n) =>
      n.nodeType.startsWith('condition_'),
    )) {
      const conditionScenarios = this.generateConditionScenarios(
        workflow,
        node,
      );
      scenarios.push(...conditionScenarios);
    }

    // Generate edge case scenarios
    scenarios.push(...this.generateEdgeCaseScenarios(workflow));

    return scenarios;
  }

  /**
   * Generate a happy path scenario
   */
  private generateHappyPathScenario(
    workflow: any,
  ): WorkflowAITestScenario | null {
    // Find trigger node
    const triggerNode = workflow.nodes.find((n: any) =>
      n.nodeType.startsWith('trigger_'),
    );
    if (!triggerNode) {
      return null;
    }

    return {
      id: `${workflow.id}-happy-path`,
      name: `${workflow.name} - Happy Path`,
      description: 'Basic flow through the workflow',
      workflowId: workflow.id,
      startingNodeId: triggerNode.id,
      testMessages: [
        {
          sequence: 1,
          content: 'Hello, I need help',
          type: 'text',
        },
        {
          sequence: 2,
          content: 'Yes, please tell me more',
          type: 'text',
        },
      ],
      expectedOutcomes: [
        {
          type: 'response_contains',
          value: '',
          failureMessage: 'AI should generate a non-empty response',
        },
      ],
      tags: ['happy-path', 'auto-generated'],
    };
  }

  /**
   * Generate scenarios for condition nodes
   */
  private generateConditionScenarios(
    workflow: any,
    conditionNode: any,
  ): WorkflowAITestScenario[] {
    const scenarios: WorkflowAITestScenario[] = [];
    const config = conditionNode.config as Record<string, any>;

    // For AI classification conditions
    if (conditionNode.nodeType === 'condition_ai_classification') {
      const expectedValues = config.expectedValues || [];

      for (const value of expectedValues) {
        scenarios.push({
          id: `${workflow.id}-${conditionNode.id}-${value}`,
          name: `${workflow.name} - Classification: ${value}`,
          description: `Test ${value} classification branch`,
          workflowId: workflow.id,
          startingNodeId: conditionNode.id,
          testMessages: [
            {
              sequence: 1,
              content: this.generateMessageForClassification(value),
              type: 'text',
            },
          ],
          expectedOutcomes: [
            {
              type: 'node_transition',
              value: value,
              failureMessage: `Should transition through ${value} branch`,
            },
          ],
          tags: ['classification', 'auto-generated', value],
        });
      }
    }

    // For keyword conditions
    if (conditionNode.nodeType === 'condition_keyword') {
      const keywords = config.keywords || [];
      if (keywords.length > 0) {
        scenarios.push({
          id: `${workflow.id}-${conditionNode.id}-keyword-match`,
          name: `${workflow.name} - Keyword Match`,
          description: 'Test keyword matching',
          workflowId: workflow.id,
          startingNodeId: conditionNode.id,
          testMessages: [
            {
              sequence: 1,
              content: `I want to know about ${keywords[0]}`,
              type: 'text',
            },
          ],
          expectedOutcomes: [
            {
              type: 'response_contains',
              value: keywords[0],
              tolerance: 0.5,
              failureMessage: `Response should reference keyword: ${keywords[0]}`,
            },
          ],
          tags: ['keyword', 'auto-generated'],
        });
      }
    }

    return scenarios;
  }

  /**
   * Generate edge case scenarios
   */
  private generateEdgeCaseScenarios(workflow: any): WorkflowAITestScenario[] {
    return [
      // Empty message
      {
        id: `${workflow.id}-edge-empty`,
        name: `${workflow.name} - Empty Message`,
        description: 'Handle empty or whitespace message',
        workflowId: workflow.id,
        testMessages: [
          {
            sequence: 1,
            content: '   ',
            type: 'text',
          },
        ],
        expectedOutcomes: [
          {
            type: 'response_contains',
            value: '',
            failureMessage: 'Should handle empty message gracefully',
          },
        ],
        tags: ['edge-case', 'auto-generated'],
      },
      // Very long message
      {
        id: `${workflow.id}-edge-long`,
        name: `${workflow.name} - Long Message`,
        description: 'Handle very long message',
        workflowId: workflow.id,
        testMessages: [
          {
            sequence: 1,
            content: 'Hello '.repeat(500),
            type: 'text',
          },
        ],
        expectedOutcomes: [
          {
            type: 'response_contains',
            value: '',
            failureMessage: 'Should handle long message gracefully',
          },
        ],
        tags: ['edge-case', 'auto-generated'],
      },
      // Escalation trigger
      {
        id: `${workflow.id}-edge-escalation`,
        name: `${workflow.name} - Escalation Request`,
        description: 'Handle explicit handoff request',
        workflowId: workflow.id,
        testMessages: [
          {
            sequence: 1,
            content: 'I want to speak with a human agent please',
            type: 'text',
          },
        ],
        expectedOutcomes: [
          {
            type: 'handoff_requested',
            value: true,
            failureMessage: 'Should trigger handoff on explicit request',
          },
        ],
        tags: ['edge-case', 'escalation', 'auto-generated'],
      },
    ];
  }

  // ==========================================================================
  // Assertion Evaluation
  // ==========================================================================

  private async evaluateOutcome(
    outcome: ExpectedOutcome,
    responses: WorkflowAITestResult['actualResponses'],
    chatContext: SimulatedChatContext,
    timeline: TimelineEvent[],
  ): Promise<AssertionResult> {
    switch (outcome.type) {
      case 'response_contains':
        return this.assertResponseContains(outcome, responses);

      case 'response_tone':
        return this.assertResponseTone(outcome, responses);

      case 'stage_transition':
        return this.assertStageTransition(outcome, timeline);

      case 'node_transition':
        return this.assertNodeTransition(outcome, timeline);

      case 'handoff_requested':
        return this.assertHandoffRequested(outcome, timeline);

      case 'kb_used':
        return this.assertKbUsed(outcome, responses);

      case 'media_attached':
        return this.assertMediaAttached(outcome, responses);

      default:
        return {
          outcome,
          passed: false,
          actualValue: null,
          details: `Unknown assertion type: ${outcome.type}`,
        };
    }
  }

  private assertResponseContains(
    outcome: ExpectedOutcome,
    responses: WorkflowAITestResult['actualResponses'],
  ): AssertionResult {
    const searchValue = (outcome.value as string).toLowerCase();
    const lastResponse = responses[responses.length - 1];

    if (!lastResponse) {
      return {
        outcome,
        passed: false,
        actualValue: null,
        details: 'No response generated',
      };
    }

    const responseText = lastResponse.response.toLowerCase();
    const contains =
      searchValue === ''
        ? responseText.length > 0
        : responseText.includes(searchValue);

    return {
      outcome,
      passed: contains,
      actualValue: lastResponse.response.substring(0, 200),
      details: contains
        ? `Found "${searchValue}" in response`
        : `"${searchValue}" not found in response`,
    };
  }

  private assertResponseTone(
    outcome: ExpectedOutcome,
    responses: WorkflowAITestResult['actualResponses'],
  ): AssertionResult {
    const expectedTone = outcome.value as string;
    const lastResponse = responses[responses.length - 1];

    if (!lastResponse) {
      return {
        outcome,
        passed: false,
        actualValue: null,
        details: 'No response generated',
      };
    }

    // Simple heuristic tone checking
    const toneIndicators: Record<string, string[]> = {
      friendly: ['!', 'happy', 'glad', 'great', '😊', 'wonderful'],
      professional: ['please', 'would', 'appreciate', 'assist'],
      urgent: ['immediately', 'urgent', 'asap', 'right away'],
    };

    const indicators = toneIndicators[expectedTone.toLowerCase()] || [];
    const responseText = lastResponse.response.toLowerCase();
    const matchCount = indicators.filter((i) =>
      responseText.includes(i),
    ).length;
    const passed = matchCount >= 1;

    return {
      outcome,
      passed,
      actualValue: `${matchCount}/${indicators.length} tone indicators found`,
      details: passed
        ? `Response matches ${expectedTone} tone`
        : `Response does not match ${expectedTone} tone`,
    };
  }

  private assertStageTransition(
    outcome: ExpectedOutcome,
    timeline: TimelineEvent[],
  ): AssertionResult {
    const stageChanges = timeline.filter((e) => e.type === 'stage_changed');
    const expectedStage = outcome.value as string;

    const found = stageChanges.some(
      (e) => (e.data as any).newStage === expectedStage,
    );

    return {
      outcome,
      passed: found,
      actualValue: stageChanges.map((e) => (e.data as any).newStage),
      details: found
        ? `Transitioned to stage "${expectedStage}"`
        : `No transition to stage "${expectedStage}" found`,
    };
  }

  private assertNodeTransition(
    outcome: ExpectedOutcome,
    timeline: TimelineEvent[],
  ): AssertionResult {
    const nodeChanges = timeline.filter((e) => e.type === 'node_entered');

    return {
      outcome,
      passed: nodeChanges.length > 0,
      actualValue: nodeChanges.map((e) => (e.data as any).newNode),
      details:
        nodeChanges.length > 0
          ? `Nodes visited: ${nodeChanges.length}`
          : 'No node transitions detected',
    };
  }

  private assertHandoffRequested(
    outcome: ExpectedOutcome,
    timeline: TimelineEvent[],
  ): AssertionResult {
    const handoffEvents = timeline.filter(
      (e) => e.type === 'handoff_requested',
    );
    const expected = outcome.value as boolean;
    const found = handoffEvents.length > 0;

    return {
      outcome,
      passed: found === expected,
      actualValue: found,
      details: found ? 'Handoff was requested' : 'No handoff requested',
    };
  }

  private assertKbUsed(
    outcome: ExpectedOutcome,
    responses: WorkflowAITestResult['actualResponses'],
  ): AssertionResult {
    const lastResponse = responses[responses.length - 1];

    if (!lastResponse || !lastResponse.workflowContext) {
      return {
        outcome,
        passed: false,
        actualValue: null,
        details: 'No response or context available',
      };
    }

    // Check if KB was referenced in the response
    const kbIndicators = [
      'based on',
      'according to',
      'information shows',
      'data indicates',
    ];
    const responseText = lastResponse.response.toLowerCase();
    const kbUsed = kbIndicators.some((i) => responseText.includes(i));

    return {
      outcome,
      passed: kbUsed === (outcome.value as boolean),
      actualValue: kbUsed,
      details: kbUsed
        ? 'Knowledge base was used in response'
        : 'Knowledge base was not used',
    };
  }

  private assertMediaAttached(
    outcome: ExpectedOutcome,
    responses: WorkflowAITestResult['actualResponses'],
  ): AssertionResult {
    // This would need integration with media service
    // For now, check if response mentions media
    const lastResponse = responses[responses.length - 1];

    if (!lastResponse) {
      return {
        outcome,
        passed: false,
        actualValue: null,
        details: 'No response generated',
      };
    }

    const mediaIndicators = [
      'attached',
      'here is',
      'sending',
      'image',
      'document',
      'video',
    ];
    const responseText = lastResponse.response.toLowerCase();
    const mentionsMedia = mediaIndicators.some((i) => responseText.includes(i));

    return {
      outcome,
      passed: mentionsMedia === (outcome.value as boolean),
      actualValue: mentionsMedia,
      details: mentionsMedia
        ? 'Response mentions media attachment'
        : 'Response does not mention media',
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private async validateWorkflow(workflowId: string): Promise<any | null> {
    return db.query.workflows.findFirst({
      where: and(
        eq(workflows.id, workflowId),
        sql`${workflows.deletedAt} IS NULL`,
      ),
      with: { nodes: true, connections: true },
    });
  }

  private async createSimulatedChatContext(
    scenario: WorkflowAITestScenario,
    config: WorkflowTestConfig,
    workflow: any,
  ): Promise<SimulatedChatContext> {
    const chatId = `test-${uuidv4()}`;

    // Create workflow chat state
    await db.insert(workflowChatState).values({
      chatId,
      activeWorkflowId: scenario.workflowId,
      currentNodeId: scenario.startingNodeId || null,
      enteredWorkflowAt: new Date(),
    });

    // Get initial workflow context
    const workflowState = await this.contextProvider
      .getAIContext(chatId, config.userId)
      .then((r) => r.context)
      .catch(() => null);

    return {
      chatId,
      messageHistory: [],
      workflowState,
      currentNodeId: scenario.startingNodeId || null,
    };
  }

  private async cleanupSimulatedChat(chatId: string): Promise<void> {
    if (chatId.startsWith('test-')) {
      await db
        .delete(workflowChatState)
        .where(eq(workflowChatState.chatId, chatId));
    }
  }

  private async classifyTestMessage(
    message: TestMessage,
    userId: number,
  ): Promise<ClassificationResult> {
    try {
      return await this.llmService.classifyMessage(
        message.content,
        {},
        { userId },
      );
    } catch {
      return {
        category: 'general',
        sentiment: 'neutral',
        sentimentScore: 0,
        keywords: [],
        confidence: 50,
        requiresHandoff: false,
      };
    }
  }

  private async generateTestResponse(
    chatContext: SimulatedChatContext,
    message: TestMessage,
    classification: ClassificationResult,
    userId: number,
    verbose?: boolean,
  ): Promise<WorkflowAwareAIResponse> {
    return this.aiGenerator.generateResponse({
      chatId: chatContext.chatId,
      userId,
      customerMessage: message.content,
      classification,
      debugMode: verbose,
    });
  }

  private updateChatContext(
    context: SimulatedChatContext,
    message: TestMessage,
    response: WorkflowAwareAIResponse,
  ): void {
    context.messageHistory.push(
      { role: 'customer', content: message.content, timestamp: new Date() },
      { role: 'assistant', content: response.content, timestamp: new Date() },
    );

    if (response.debugContext?.workflowContext) {
      context.workflowState = response.debugContext.workflowContext;
    }
  }

  private generateMessageForClassification(classification: string): string {
    const messageMap: Record<string, string> = {
      interested: "I'm very interested in learning more about this",
      support: "I'm having a problem with my order",
      billing: 'I have a question about my invoice',
      complaint: "I'm not happy with the service",
      greeting: 'Hello!',
      farewell: 'Thank you, goodbye',
      pricing: 'How much does this cost?',
      availability: 'Is this available?',
    };

    return (
      messageMap[classification.toLowerCase()] ||
      `I need help with ${classification}`
    );
  }

  private createFailedResult(
    scenarioId: string,
    errors: string[],
    startTime: number,
  ): WorkflowAITestResult {
    return {
      scenarioId,
      passed: false,
      assertions: [],
      actualResponses: [],
      timeline: [],
      durationMs: Date.now() - startTime,
      errors,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
