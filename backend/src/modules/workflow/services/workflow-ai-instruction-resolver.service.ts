/**
 * Workflow AI Instruction Resolver
 * Resolves and merges AI instructions from multiple sources with priority handling
 *
 * Priority Order (highest to lowest):
 * 1. Chat-level overrides
 * 2. Current workflow node instructions
 * 3. Stage-specific settings
 * 4. Workflow defaults
 * 5. User configuration
 * 6. System defaults
 *
 * This ensures workflow-specific AI behavior while allowing granular overrides.
 */

import { db } from '@database/db.connection';
import {
  workflowChatState,
  workflowNodes,
  workflows,
} from '@database/workflow-builder.schema';
import { Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import type { WorkflowStageConfig } from '../types/workflow.types';
import {
  AiConfigurationService,
  ResolvedAiConfig,
} from './ai-configuration.service';
import { StageService } from './stage.service';

import type {
  InstructionPriority,
  InstructionSource,
  ResolvedWorkflowAIInstructions,
  WorkflowAIContext,
  WorkflowAssignmentState,
  WorkflowNodeAIInstructions,
  WorkflowStateValidation,
  WorkflowTriggerContext,
  WorkflowValidationError,
  WorkflowValidationWarning,
} from '../types/workflow-ai-context.types';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_INSTRUCTIONS: Omit<ResolvedWorkflowAIInstructions, 'sources'> = {
  systemPromptAddition: '',
  tone: 'friendly',
  goal: null,
  formalityLevel: 'balanced',
  maxResponseLength: 500,
  temperature: 70,
  avoidTopics: [],
  allowedKbTemplates: [],
  languagePreference: null,
  allowFreeTextReplies: true,
  useTemplatesOnly: false,
  escalationTriggers: [],
};

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class WorkflowAIInstructionResolver {
  private readonly logger = new Logger(WorkflowAIInstructionResolver.name);

  constructor(
    private readonly aiConfigService: AiConfigurationService,
    private readonly stageService: StageService,
  ) {}

  // ==========================================================================
  // Main Resolution Method
  // ==========================================================================

  /**
   * Resolve AI instructions for a chat considering all sources
   * Returns merged instructions with provenance tracking
   */
  async resolveInstructions(
    userId: number,
    chatId: string,
  ): Promise<ResolvedWorkflowAIInstructions> {
    const sources: ResolvedWorkflowAIInstructions['sources'] = {
      systemPromptAddition: this.createSource(
        'system',
        0,
        null,
        'System default',
      ),
      tone: this.createSource('system', 0, null, 'System default'),
      goal: null,
      formalityLevel: this.createSource('system', 0, null, 'System default'),
      maxResponseLength: this.createSource('system', 0, null, 'System default'),
      temperature: this.createSource('system', 0, null, 'System default'),
      allowedKbTemplates: this.createSource(
        'system',
        0,
        null,
        'System default',
      ),
    };

    // Start with defaults
    let result: Omit<ResolvedWorkflowAIInstructions, 'sources'> = {
      ...DEFAULT_INSTRUCTIONS,
    };

    // Layer 1: User configuration
    try {
      const userConfig = await this.aiConfigService.resolveConfiguration(
        userId,
        chatId,
      );
      result = this.mergeUserConfig(result, userConfig, sources);
    } catch (error) {
      this.logger.warn(
        `Failed to load user config for user ${userId}: ${error.message}`,
      );
    }

    // Layer 2: Workflow context
    const workflowContext = await this.getWorkflowContext(chatId);
    if (
      workflowContext.assignment.isAssigned &&
      workflowContext.nodeInstructions
    ) {
      result = this.mergeWorkflowInstructions(result, workflowContext, sources);
    }

    // Layer 3: Stage settings (if chat is in a stage)
    if (workflowContext.currentStage?.id) {
      const stageSettings = await this.aiConfigService.getStageSettings(
        workflowContext.currentStage.id,
      );
      if (stageSettings) {
        result = this.mergeStageSettings(result, stageSettings, sources);
      }
    }

    // Layer 4: Chat overrides (highest priority)
    const chatOverride = await this.aiConfigService.getChatOverride(chatId);
    if (chatOverride) {
      result = this.mergeChatOverride(result, chatOverride, sources);
    }

    return { ...result, sources };
  }

  // ==========================================================================
  // Workflow Context Resolution
  // ==========================================================================

  /**
   * Get complete workflow context for a chat
   */
  async getWorkflowContext(chatId: string): Promise<WorkflowAIContext> {
    // Get workflow chat state
    const chatState = await db.query.workflowChatState.findFirst({
      where: eq(workflowChatState.chatId, chatId),
    });

    // Build assignment state
    const assignment = await this.buildAssignmentState(chatState);

    // Get node instructions if in a workflow
    let nodeInstructions: WorkflowNodeAIInstructions | null = null;
    if (chatState?.currentNodeId) {
      nodeInstructions = await this.getNodeInstructions(
        chatState.currentNodeId,
      );
    } else if (chatState?.activeWorkflowId) {
      // If we have a workflow but no current node, try to get instructions from cached state
      nodeInstructions = this.buildNodeInstructionsFromCache(chatState);
    }

    // Get current stage
    let currentStage: WorkflowStageConfig | null = null;
    try {
      const stageAssignment = await this.stageService.getChatStage(chatId);
      if (stageAssignment?.stageId) {
        currentStage = await this.stageService.getStageById(
          stageAssignment.stageId,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to get stage for chat ${chatId}: ${(error as Error).message}`,
      );
    }

    // Build trigger context from execution
    const triggerContext = await this.getTriggerContext(
      chatState?.activeExecutionId,
    );

    // Determine if AI should be enabled
    const { aiEnabled, aiDisabledReason } = this.determineAIEnabled(
      chatState,
      assignment,
      currentStage,
    );

    return {
      assignment,
      nodeInstructions,
      triggerContext,
      currentStage,
      workflowVariables: {},
      aiEnabled,
      aiDisabledReason,
    };
  }

  /**
   * Validate workflow state before AI response
   */
  async validateWorkflowState(
    chatId: string,
    workflowContext: WorkflowAIContext,
  ): Promise<WorkflowStateValidation> {
    const errors: WorkflowValidationError[] = [];
    const warnings: WorkflowValidationWarning[] = [];
    const recommendations: string[] = [];

    // Check if workflow is assigned
    if (workflowContext.assignment.isAssigned) {
      // Validate workflow exists and is active
      if (workflowContext.assignment.workflowId) {
        const workflow = await db.query.workflows.findFirst({
          where: and(
            eq(workflows.id, workflowContext.assignment.workflowId),
            sql`${workflows.deletedAt} IS NULL`,
          ),
        });

        if (!workflow) {
          errors.push({
            code: 'WORKFLOW_NOT_FOUND',
            message: `Assigned workflow ${workflowContext.assignment.workflowId} not found`,
            fallbackAllowed: true,
          });
          recommendations.push('Unassign the missing workflow from this chat');
        } else if (
          workflow.status !== 'active' &&
          workflow.status !== 'published'
        ) {
          warnings.push({
            code: 'WORKFLOW_NOT_ACTIVE',
            message: `Workflow "${workflow.name}" is ${workflow.status}`,
          });
          recommendations.push(
            'Consider activating the workflow or assigning an active one',
          );
        }
      }

      // Validate current node if specified
      if (workflowContext.nodeInstructions?.nodeId) {
        const node = await db.query.workflowNodes.findFirst({
          where: eq(workflowNodes.id, workflowContext.nodeInstructions.nodeId),
        });

        if (!node) {
          warnings.push({
            code: 'NODE_NOT_FOUND',
            message: `Current node ${workflowContext.nodeInstructions.nodeId} not found`,
          });
        }
      }
    }

    // Check if AI is disabled
    if (!workflowContext.aiEnabled) {
      if (workflowContext.aiDisabledReason?.includes('workflow')) {
        errors.push({
          code: 'AI_DISABLED_BY_WORKFLOW',
          message: workflowContext.aiDisabledReason,
          fallbackAllowed: false,
        });
      }
    }

    // Check for paused state
    const chatState = await db.query.workflowChatState.findFirst({
      where: eq(workflowChatState.chatId, chatId),
    });

    if (chatState?.isPaused) {
      warnings.push({
        code: 'WORKFLOW_PAUSED',
        message: `Workflow is paused: ${chatState.pauseReason || 'No reason specified'}`,
      });
    }

    return {
      canProceed: errors.filter((e) => !e.fallbackAllowed).length === 0,
      errors,
      warnings,
      recommendations,
    };
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  private async buildAssignmentState(
    chatState: typeof workflowChatState.$inferSelect | undefined,
  ): Promise<WorkflowAssignmentState> {
    if (!chatState?.activeWorkflowId) {
      return {
        isAssigned: false,
        workflowId: null,
        workflowName: null,
        workflowVersion: null,
        executionId: null,
        assignedAt: null,
        assignmentSource: null,
      };
    }

    // Get workflow details
    const workflow = await db.query.workflows.findFirst({
      where: eq(workflows.id, chatState.activeWorkflowId),
    });

    return {
      isAssigned: true,
      workflowId: chatState.activeWorkflowId,
      workflowName: workflow?.name ?? null,
      workflowVersion: workflow?.version ?? null,
      executionId: chatState.activeExecutionId,
      assignedAt: chatState.enteredWorkflowAt,
      assignmentSource: 'auto', // Could be enhanced to track actual source
    };
  }

  private async getNodeInstructions(
    nodeId: string,
  ): Promise<WorkflowNodeAIInstructions | null> {
    const node = await db.query.workflowNodes.findFirst({
      where: eq(workflowNodes.id, nodeId),
    });

    if (!node) {
      return null;
    }

    return {
      nodeId: node.id,
      nodeType: node.nodeType,
      instructions: node.aiInstructions,
      tone: node.aiTone,
      goal: node.aiGoal,
      allowedKbTemplates: Array.isArray(node.allowedKbTemplates)
        ? (node.allowedKbTemplates as string[])
        : [],
    };
  }

  private buildNodeInstructionsFromCache(
    chatState: typeof workflowChatState.$inferSelect,
  ): WorkflowNodeAIInstructions | null {
    // Use cached instructions from chat state
    if (
      !chatState.currentAiInstructions &&
      !chatState.currentAiTone &&
      !chatState.currentAiGoal
    ) {
      return null;
    }

    return {
      nodeId: chatState.currentNodeId || 'cached',
      nodeType: 'unknown',
      instructions: chatState.currentAiInstructions,
      tone: chatState.currentAiTone,
      goal: chatState.currentAiGoal,
      allowedKbTemplates: Array.isArray(chatState.allowedKbTemplates)
        ? (chatState.allowedKbTemplates as string[])
        : [],
    };
  }

  private async getTriggerContext(
    executionId: string | null | undefined,
  ): Promise<WorkflowTriggerContext | null> {
    if (!executionId) {
      return null;
    }

    const execution = await db.query.workflowExecutions.findFirst({
      where: eq(workflowExecutions.id, executionId),
    });

    if (!execution) {
      return null;
    }

    return {
      triggerType:
        execution.triggerType as WorkflowTriggerContext['triggerType'],
      triggerMessageId: execution.triggerMessageId,
      matchedKeywords: [],
      aiClassification: null,
    };
  }

  private determineAIEnabled(
    chatState: typeof workflowChatState.$inferSelect | undefined,
    assignment: WorkflowAssignmentState,
    currentStage: any,
  ): { aiEnabled: boolean; aiDisabledReason: string | null } {
    // Check if workflow is paused
    if (chatState?.isPaused) {
      return {
        aiEnabled: false,
        aiDisabledReason: `Workflow paused: ${chatState.pauseReason || 'Manual pause'}`,
      };
    }

    // Check stage settings
    if (currentStage && currentStage.aiAutoReply === false) {
      return {
        aiEnabled: false,
        aiDisabledReason: `AI disabled for stage: ${currentStage.name}`,
      };
    }

    // Default: AI enabled
    return { aiEnabled: true, aiDisabledReason: null };
  }

  private createSource(
    type: InstructionSource['type'],
    priority: InstructionPriority,
    sourceId: string | null,
    description: string,
  ): InstructionSource {
    return { type, priority, sourceId, description };
  }

  private mergeUserConfig(
    current: Omit<ResolvedWorkflowAIInstructions, 'sources'>,
    userConfig: ResolvedAiConfig,
    sources: ResolvedWorkflowAIInstructions['sources'],
  ): Omit<ResolvedWorkflowAIInstructions, 'sources'> {
    sources.tone = this.createSource(
      'user_config',
      10,
      null,
      'User AI configuration',
    );
    sources.formalityLevel = this.createSource(
      'user_config',
      10,
      null,
      'User AI configuration',
    );
    sources.maxResponseLength = this.createSource(
      'user_config',
      10,
      null,
      'User AI configuration',
    );
    sources.temperature = this.createSource(
      'user_config',
      10,
      null,
      'User AI configuration',
    );

    return {
      ...current,
      tone: userConfig.tone || current.tone,
      formalityLevel: userConfig.formalityLevel || current.formalityLevel,
      maxResponseLength:
        userConfig.maxResponseLength || current.maxResponseLength,
      temperature: userConfig.temperature || current.temperature,
      avoidTopics: userConfig.avoidTopics || current.avoidTopics,
      languagePreference:
        userConfig.languagePreference || current.languagePreference,
      allowFreeTextReplies:
        userConfig.allowFreeTextReplies ?? current.allowFreeTextReplies,
      useTemplatesOnly: userConfig.useTemplatesOnly ?? current.useTemplatesOnly,
      systemPromptAddition:
        userConfig.systemPromptAddition || current.systemPromptAddition,
      goal: userConfig.goalDescription || current.goal,
    };
  }

  private mergeWorkflowInstructions(
    current: Omit<ResolvedWorkflowAIInstructions, 'sources'>,
    workflowContext: WorkflowAIContext,
    sources: ResolvedWorkflowAIInstructions['sources'],
  ): Omit<ResolvedWorkflowAIInstructions, 'sources'> {
    const nodeInstructions = workflowContext.nodeInstructions;
    if (!nodeInstructions) {
      return current;
    }

    const workflowId = workflowContext.assignment.workflowId;
    const nodeId = nodeInstructions.nodeId;

    // Update sources
    if (nodeInstructions.instructions) {
      sources.systemPromptAddition = this.createSource(
        'node',
        40,
        nodeId,
        `Node: ${nodeInstructions.nodeType}`,
      );
    }
    if (nodeInstructions.tone) {
      sources.tone = this.createSource(
        'node',
        40,
        nodeId,
        `Node: ${nodeInstructions.nodeType}`,
      );
    }
    if (nodeInstructions.goal) {
      sources.goal = this.createSource(
        'node',
        40,
        nodeId,
        `Node: ${nodeInstructions.nodeType}`,
      );
    }
    if (nodeInstructions.allowedKbTemplates.length > 0) {
      sources.allowedKbTemplates = this.createSource(
        'node',
        40,
        nodeId,
        `Node: ${nodeInstructions.nodeType}`,
      );
    }

    return {
      ...current,
      systemPromptAddition:
        nodeInstructions.instructions || current.systemPromptAddition,
      tone: nodeInstructions.tone || current.tone,
      goal: nodeInstructions.goal || current.goal,
      allowedKbTemplates:
        nodeInstructions.allowedKbTemplates.length > 0
          ? nodeInstructions.allowedKbTemplates
          : current.allowedKbTemplates,
    };
  }

  private mergeStageSettings(
    current: Omit<ResolvedWorkflowAIInstructions, 'sources'>,
    stageSettings: any,
    sources: ResolvedWorkflowAIInstructions['sources'],
  ): Omit<ResolvedWorkflowAIInstructions, 'sources'> {
    if (stageSettings.tone) {
      sources.tone = this.createSource(
        'stage',
        30,
        stageSettings.stageId,
        'Stage settings',
      );
    }

    return {
      ...current,
      tone: stageSettings.tone || current.tone,
      formalityLevel: stageSettings.formalityLevel || current.formalityLevel,
      maxResponseLength:
        stageSettings.maxResponseLength || current.maxResponseLength,
      systemPromptAddition:
        stageSettings.systemPromptAddition || current.systemPromptAddition,
      goal: stageSettings.goalDescription || current.goal,
      languagePreference:
        stageSettings.languagePreference || current.languagePreference,
      allowFreeTextReplies:
        stageSettings.allowFreeTextReplies ?? current.allowFreeTextReplies,
      useTemplatesOnly:
        stageSettings.useTemplatesOnly ?? current.useTemplatesOnly,
      escalationTriggers:
        stageSettings.escalationTriggers || current.escalationTriggers,
    };
  }

  private mergeChatOverride(
    current: Omit<ResolvedWorkflowAIInstructions, 'sources'>,
    chatOverride: any,
    sources: ResolvedWorkflowAIInstructions['sources'],
  ): Omit<ResolvedWorkflowAIInstructions, 'sources'> {
    if (chatOverride.tone) {
      sources.tone = this.createSource(
        'chat_override',
        50,
        chatOverride.chatId,
        'Chat override',
      );
    }
    if (chatOverride.maxResponseLength) {
      sources.maxResponseLength = this.createSource(
        'chat_override',
        50,
        chatOverride.chatId,
        'Chat override',
      );
    }

    return {
      ...current,
      tone: chatOverride.tone || current.tone,
      formalityLevel: chatOverride.formalityLevel || current.formalityLevel,
      maxResponseLength:
        chatOverride.maxResponseLength || current.maxResponseLength,
      languagePreference:
        chatOverride.languagePreference || current.languagePreference,
      allowFreeTextReplies:
        chatOverride.allowFreeTextReplies ?? current.allowFreeTextReplies,
      useTemplatesOnly:
        chatOverride.useTemplatesOnly ?? current.useTemplatesOnly,
      systemPromptAddition:
        chatOverride.customInstructions || current.systemPromptAddition,
      avoidTopics: chatOverride.avoidTopics || current.avoidTopics,
    };
  }
}

// Need to import workflowExecutions
import { workflowExecutions } from '@database/workflow-builder.schema';
