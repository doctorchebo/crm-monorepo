/**
 * Workflow AI Testing Controller
 * REST API endpoints for testing workflow AI behavior
 *
 * Provides capabilities to:
 * - Run test scenarios against workflows
 * - Generate test scenarios from workflows
 * - Debug AI context for specific chats
 * - Simulate AI responses without sending
 */

import { JwtAuthGuard } from '@modules/auth/auth.guard';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '@shared/types';
import { v4 as uuidv4 } from 'uuid';

import { LLMService } from '../services/llm.service';
import { WorkflowAITestingService } from '../services/workflow-ai-testing.service';
import { WorkflowContextProviderService } from '../services/workflow-context-provider.service';
import { WorkflowAwareAIResponseGenerator } from '../services/workflow-engine/workflow-aware-ai-generator.service';

import {
  AIContextResponseDto,
  CreateTestScenarioDto,
  GenerateScenariosDto,
  RunMultipleTestsDto,
  RunTestScenarioDto,
  SimulateMessageDto,
  SimulateResponseDto,
  TestResultDto,
  TestSummaryDto,
} from '../dto/workflow-ai-testing.dto';

import type { WorkflowAITestScenario } from '../types/workflow-ai-context.types';

@UseGuards(JwtAuthGuard)
@Controller('workflow/ai-testing')
export class WorkflowAITestingController {
  constructor(
    private readonly testingService: WorkflowAITestingService,
    private readonly contextProvider: WorkflowContextProviderService,
    private readonly aiGenerator: WorkflowAwareAIResponseGenerator,
    private readonly llmService: LLMService,
  ) {}

  // ==========================================================================
  // Test Scenario Execution
  // ==========================================================================

  /**
   * Run a single test scenario against a workflow
   */
  @Post('run')
  @HttpCode(HttpStatus.OK)
  async runTestScenario(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RunTestScenarioDto,
  ): Promise<TestResultDto> {
    const scenario: WorkflowAITestScenario = {
      id: uuidv4(),
      name: dto.scenario.name,
      description: dto.scenario.description,
      workflowId: dto.scenario.workflowId,
      startingNodeId: dto.scenario.startingNodeId,
      testMessages: dto.scenario.testMessages,
      expectedOutcomes: dto.scenario.expectedOutcomes,
      tags: dto.scenario.tags || [],
    };

    const result = await this.testingService.runScenario(
      scenario,
      {
        workflowId: dto.scenario.workflowId,
        teamId: req.user.teamId ?? 0,
        userId: req.user.userId,
      },
      {
        dryRun: dto.dryRun,
        verbose: dto.verbose,
        messageTimeoutMs: dto.messageTimeoutMs,
      },
    );

    return {
      scenarioId: result.scenarioId,
      passed: result.passed,
      assertions: result.assertions,
      actualResponses: result.actualResponses.map((r) => ({
        sequence: r.sequence,
        response: r.response,
        nodeId: r.nodeId,
      })),
      timeline: result.timeline,
      durationMs: result.durationMs,
      errors: result.errors,
    };
  }

  /**
   * Run multiple test scenarios and get a summary
   */
  @Post('run-multiple')
  @HttpCode(HttpStatus.OK)
  async runMultipleTests(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RunMultipleTestsDto,
  ): Promise<TestSummaryDto> {
    const scenarios: WorkflowAITestScenario[] = dto.scenarios.map((s) => ({
      id: uuidv4(),
      name: s.name,
      description: s.description,
      workflowId: s.workflowId,
      startingNodeId: s.startingNodeId,
      testMessages: s.testMessages,
      expectedOutcomes: s.expectedOutcomes,
      tags: s.tags || [],
    }));

    // Group scenarios by workflow
    const workflowGroups = new Map<string, WorkflowAITestScenario[]>();
    for (const scenario of scenarios) {
      const existing = workflowGroups.get(scenario.workflowId) || [];
      existing.push(scenario);
      workflowGroups.set(scenario.workflowId, existing);
    }

    const allResults: Record<string, TestResultDto> = {};
    let totalDurationMs = 0;

    for (const [workflowId, workflowScenarios] of workflowGroups) {
      const results = await this.testingService.runScenarios(
        workflowScenarios,
        {
          workflowId,
          teamId: req.user.teamId ?? 0,
          userId: req.user.userId,
        },
        {
          dryRun: dto.dryRun,
          verbose: dto.verbose,
        },
      );

      for (const [scenarioId, result] of results) {
        totalDurationMs += result.durationMs;
        allResults[scenarioId] = {
          scenarioId: result.scenarioId,
          passed: result.passed,
          assertions: result.assertions,
          actualResponses: result.actualResponses.map((r) => ({
            sequence: r.sequence,
            response: r.response,
            nodeId: r.nodeId,
          })),
          timeline: result.timeline,
          durationMs: result.durationMs,
          errors: result.errors,
        };
      }
    }

    const total = Object.keys(allResults).length;
    const passed = Object.values(allResults).filter((r) => r.passed).length;
    const failed = total - passed;

    return {
      total,
      passed,
      failed,
      passRate: total > 0 ? (passed / total) * 100 : 0,
      totalDurationMs,
      results: allResults,
    };
  }

  // ==========================================================================
  // Test Scenario Generation
  // ==========================================================================

  /**
   * Generate test scenarios from a workflow's structure
   */
  @Post('generate-scenarios')
  @HttpCode(HttpStatus.OK)
  async generateScenarios(
    @Req() req: AuthenticatedRequest,
    @Body() dto: GenerateScenariosDto,
  ): Promise<CreateTestScenarioDto[]> {
    const scenarios = await this.testingService.generateScenariosFromWorkflow(
      dto.workflowId,
    );

    // Filter based on options
    let filtered = scenarios;
    if (!dto.includeEdgeCases) {
      filtered = filtered.filter((s) => !s.tags.includes('edge-case'));
    }
    if (!dto.includeClassificationBranches) {
      filtered = filtered.filter((s) => !s.tags.includes('classification'));
    }

    return filtered.map((s) => ({
      name: s.name,
      description: s.description,
      workflowId: s.workflowId,
      startingNodeId: s.startingNodeId,
      testMessages: s.testMessages,
      expectedOutcomes: s.expectedOutcomes,
      tags: s.tags,
    }));
  }

  // ==========================================================================
  // Debug & Context Inspection
  // ==========================================================================

  /**
   * Get AI context for a specific chat
   */
  @Get('context/:chatId')
  async getAIContext(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: string,
  ): Promise<AIContextResponseDto> {
    const { context, instructions, validation } =
      await this.contextProvider.getAIContext(chatId, req.user.userId);

    return {
      assignment: {
        isAssigned: context.assignment.isAssigned,
        workflowId: context.assignment.workflowId,
        workflowName: context.assignment.workflowName,
        workflowVersion: context.assignment.workflowVersion,
        executionId: context.assignment.executionId,
      },
      nodeInstructions: context.nodeInstructions
        ? {
            nodeId: context.nodeInstructions.nodeId,
            nodeType: context.nodeInstructions.nodeType,
            instructions: context.nodeInstructions.instructions,
            tone: context.nodeInstructions.tone,
            goal: context.nodeInstructions.goal,
            allowedKbTemplates: context.nodeInstructions.allowedKbTemplates,
          }
        : null,
      currentStage: context.currentStage
        ? {
            id: context.currentStage.id,
            name: context.currentStage.name,
            description: context.currentStage.description,
            aiAutoReply: context.currentStage.aiAutoReply,
          }
        : null,
      aiEnabled: context.aiEnabled,
      aiDisabledReason: context.aiDisabledReason,
      validation: {
        canProceed: validation.canProceed,
        errors: validation.errors.map((e) => ({
          code: e.code,
          message: e.message,
        })),
        warnings: validation.warnings.map((w) => ({
          code: w.code,
          message: w.message,
        })),
      },
    };
  }

  /**
   * Simulate AI response without actually sending it
   */
  @Post('simulate')
  @HttpCode(HttpStatus.OK)
  async simulateResponse(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SimulateMessageDto,
  ): Promise<SimulateResponseDto> {
    // Classify the message
    const classification = await this.llmService.classifyMessage(
      dto.message,
      {},
      { userId: req.user.userId },
    );

    // Generate response
    const result = await this.aiGenerator.generateResponse({
      chatId: dto.chatId,
      userId: req.user.userId,
      customerMessage: dto.message,
      classification,
      skipWorkflowContext: dto.skipWorkflowContext,
      debugMode: dto.debug,
    });

    return {
      content: result.content,
      shouldSend: result.shouldSend,
      escalationTriggered: result.escalationTriggered,
      escalationReason: result.escalationReason,
      warnings: result.warnings,
      debugContext: result.debugContext as Record<string, unknown> | undefined,
    };
  }

  /**
   * Get resolved AI instructions for a chat
   */
  @Get('instructions/:chatId')
  async getResolvedInstructions(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: string,
  ) {
    const { instructions } = await this.contextProvider.getAIContext(
      chatId,
      req.user.userId,
    );

    return {
      systemPromptAddition: instructions.systemPromptAddition,
      tone: instructions.tone,
      goal: instructions.goal,
      formalityLevel: instructions.formalityLevel,
      maxResponseLength: instructions.maxResponseLength,
      temperature: instructions.temperature,
      avoidTopics: instructions.avoidTopics,
      allowedKbTemplates: instructions.allowedKbTemplates,
      languagePreference: instructions.languagePreference,
      allowFreeTextReplies: instructions.allowFreeTextReplies,
      useTemplatesOnly: instructions.useTemplatesOnly,
      escalationTriggers: instructions.escalationTriggers,
      sources: instructions.sources,
    };
  }

  // ==========================================================================
  // Workflow Validation
  // ==========================================================================

  /**
   * Validate workflow AI configuration
   */
  @Get('validate/:workflowId')
  async validateWorkflowAI(
    @Req() req: AuthenticatedRequest,
    @Param('workflowId') workflowId: string,
  ) {
    // Generate scenarios to test coverage
    const scenarios =
      await this.testingService.generateScenariosFromWorkflow(workflowId);

    // Count nodes with AI configuration
    const nodesWithConfig = scenarios.filter(
      (s) => s.expectedOutcomes.length > 0,
    ).length;

    return {
      workflowId,
      isValid: scenarios.length > 0,
      scenariosGenerated: scenarios.length,
      nodesWithAIConfig: nodesWithConfig,
      coveragePercentage:
        scenarios.length > 0 ? (nodesWithConfig / scenarios.length) * 100 : 0,
      issues: [],
      recommendations: [
        ...(nodesWithConfig < scenarios.length
          ? ['Consider adding AI instructions to all nodes']
          : []),
        ...(!scenarios.some((s) => s.tags.includes('edge-case'))
          ? ['Add edge case handling']
          : []),
      ],
    };
  }
}
