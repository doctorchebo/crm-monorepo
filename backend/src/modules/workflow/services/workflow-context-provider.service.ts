/**
 * Workflow Context Provider Service
 * Provides workflow context for AI response generation and handles workflow change events
 *
 * Responsibilities:
 * 1. Build complete AI context from workflow state
 * 2. Detect and handle workflow changes (assignment, unassignment, change)
 * 3. Update cached node instructions when workflow state changes
 * 4. Emit events for workflow changes
 * 5. Provide fallback behavior when workflows are invalid
 */

import { db } from '@database/db.connection';
import {
  WorkflowChatState,
  workflowChatState,
  workflowNodes,
  workflows,
} from '@database/workflow-builder.schema';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq } from 'drizzle-orm';

import type {
  ResolvedWorkflowAIInstructions,
  WorkflowAIContext,
  WorkflowChangeEvent,
  WorkflowChangeType,
  WorkflowStateValidation,
} from '../types/workflow-ai-context.types';
import { StageService } from './stage.service';
import { WorkflowAIInstructionResolver } from './workflow-ai-instruction-resolver.service';

// ============================================================================
// Event Names
// ============================================================================

export const WORKFLOW_EVENTS = {
  WORKFLOW_ASSIGNED: 'workflow.assigned',
  WORKFLOW_UNASSIGNED: 'workflow.unassigned',
  WORKFLOW_CHANGED: 'workflow.changed',
  WORKFLOW_NODE_CHANGED: 'workflow.node.changed',
  WORKFLOW_PAUSED: 'workflow.paused',
  WORKFLOW_RESUMED: 'workflow.resumed',
  AI_CONTEXT_RESOLVED: 'workflow.ai.context.resolved',
  AI_INSTRUCTIONS_INVALID: 'workflow.ai.instructions.invalid',
} as const;

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class WorkflowContextProviderService {
  private readonly logger = new Logger(WorkflowContextProviderService.name);

  constructor(
    private readonly instructionResolver: WorkflowAIInstructionResolver,
    private readonly stageService: StageService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ==========================================================================
  // Main Context Resolution
  // ==========================================================================

  /**
   * Get complete AI context for a chat
   * This is the main entry point for AI response generation
   */
  async getAIContext(
    chatId: string,
    userId: number,
  ): Promise<{
    context: WorkflowAIContext;
    instructions: ResolvedWorkflowAIInstructions;
    validation: WorkflowStateValidation;
  }> {
    // Get workflow context
    const context = await this.instructionResolver.getWorkflowContext(chatId);

    // Validate workflow state
    const validation = await this.instructionResolver.validateWorkflowState(
      chatId,
      context,
    );

    // Log warnings
    for (const warning of validation.warnings) {
      this.logger.warn(
        `[Workflow Context] Chat ${chatId}: ${warning.code} - ${warning.message}`,
      );
    }

    // If validation fails with non-fallback errors, handle gracefully
    if (!validation.canProceed) {
      const criticalErrors = validation.errors.filter(
        (e) => !e.fallbackAllowed,
      );
      if (criticalErrors.length > 0) {
        this.logger.error(
          `[Workflow Context] Chat ${chatId} has critical errors: ${criticalErrors.map((e) => e.message).join(', ')}`,
        );

        // Emit event for monitoring
        this.eventEmitter.emit(WORKFLOW_EVENTS.AI_INSTRUCTIONS_INVALID, {
          chatId,
          errors: criticalErrors,
          timestamp: new Date(),
        });
      }
    }

    // Resolve instructions (handles fallback internally)
    const instructions = await this.resolveInstructionsWithFallback(
      userId,
      chatId,
      context,
      validation,
    );

    // Emit context resolved event
    this.eventEmitter.emit(WORKFLOW_EVENTS.AI_CONTEXT_RESOLVED, {
      chatId,
      workflowId: context.assignment.workflowId,
      nodeId: context.nodeInstructions?.nodeId,
      timestamp: new Date(),
    });

    return { context, instructions, validation };
  }

  /**
   * Build the final system prompt incorporating workflow instructions
   */
  buildSystemPromptWithWorkflow(
    basePrompt: string,
    context: WorkflowAIContext,
    instructions: ResolvedWorkflowAIInstructions,
  ): string {
    const parts: string[] = [];

    // Add base prompt
    parts.push(basePrompt);

    // Add workflow context section
    if (context.assignment.isAssigned) {
      parts.push(`
==========================================================================
WORKFLOW CONTEXT
==========================================================================

You are operating within the "${context.assignment.workflowName || 'Active'}" workflow.
${context.currentStage ? `Current Stage: "${context.currentStage.name}"` : ''}
${instructions.goal ? `Your Goal: ${instructions.goal}` : ''}
`);
    }

    // Add node-specific instructions
    if (instructions.systemPromptAddition) {
      parts.push(`
==========================================================================
SPECIFIC INSTRUCTIONS FOR THIS CONVERSATION
==========================================================================

${instructions.systemPromptAddition}
`);
    }

    // Add tone and style guidance
    parts.push(`
==========================================================================
COMMUNICATION STYLE
==========================================================================

Tone: ${instructions.tone}
Formality: ${instructions.formalityLevel}
Max Response Length: ${instructions.maxResponseLength} characters
${instructions.languagePreference ? `Language: ${instructions.languagePreference}` : ''}
${instructions.avoidTopics.length > 0 ? `Topics to Avoid: ${instructions.avoidTopics.join(', ')}` : ''}
`);

    // Add escalation triggers if defined
    if (instructions.escalationTriggers.length > 0) {
      parts.push(`
==========================================================================
ESCALATION TRIGGERS
==========================================================================

If the customer mentions any of the following, request a handoff to a human:
${instructions.escalationTriggers.map((t) => `- ${t}`).join('\n')}
`);
    }

    return parts.join('\n');
  }

  // ==========================================================================
  // Workflow Change Handling
  // ==========================================================================

  /**
   * Handle workflow assignment to a chat
   */
  async handleWorkflowAssigned(
    chatId: string,
    workflowId: string,
    source: 'auto' | 'manual' | 'trigger',
    userId?: number,
  ): Promise<void> {
    // Get previous state
    const previousState = await this.getChatWorkflowState(chatId);
    const previousWorkflowId = previousState?.activeWorkflowId;

    // Determine change type
    let changeType: WorkflowChangeType;
    if (!previousWorkflowId) {
      changeType = 'workflow_assigned';
    } else if (previousWorkflowId !== workflowId) {
      changeType = 'workflow_changed';
    } else {
      // Same workflow re-assigned, might be a version update
      changeType = 'workflow_version_updated';
    }

    // Emit change event
    const event: WorkflowChangeEvent = {
      changeType,
      chatId,
      previousWorkflowId: previousWorkflowId ?? null,
      newWorkflowId: workflowId,
      previousNodeId: previousState?.currentNodeId || null,
      newNodeId: null, // Will be set when execution starts
      timestamp: new Date(),
      triggeredBy: source === 'manual' ? 'user' : 'system',
      userId,
    };

    this.eventEmitter.emit(
      changeType === 'workflow_assigned'
        ? WORKFLOW_EVENTS.WORKFLOW_ASSIGNED
        : WORKFLOW_EVENTS.WORKFLOW_CHANGED,
      event,
    );

    this.logger.log(
      `[Workflow Change] ${changeType} for chat ${chatId}: ${previousWorkflowId || 'none'} → ${workflowId}`,
    );
  }

  /**
   * Handle workflow unassignment from a chat
   */
  async handleWorkflowUnassigned(
    chatId: string,
    reason: string,
    userId?: number,
  ): Promise<void> {
    const previousState = await this.getChatWorkflowState(chatId);

    if (!previousState?.activeWorkflowId) {
      return; // No workflow to unassign
    }

    const event: WorkflowChangeEvent = {
      changeType: 'workflow_unassigned',
      chatId,
      previousWorkflowId: previousState.activeWorkflowId,
      newWorkflowId: null,
      previousNodeId: previousState.currentNodeId || null,
      newNodeId: null,
      timestamp: new Date(),
      triggeredBy: userId ? 'user' : 'system',
      userId,
      metadata: { reason },
    };

    this.eventEmitter.emit(WORKFLOW_EVENTS.WORKFLOW_UNASSIGNED, event);

    this.logger.log(
      `[Workflow Change] workflow_unassigned for chat ${chatId}: ${previousState.activeWorkflowId} (reason: ${reason})`,
    );
  }

  /**
   * Handle node change within a workflow
   */
  async handleNodeChanged(
    chatId: string,
    previousNodeId: string | null,
    newNodeId: string,
    workflowId: string,
  ): Promise<void> {
    // Update cached AI instructions from the new node
    await this.updateCachedInstructions(chatId, newNodeId);

    const event: WorkflowChangeEvent = {
      changeType: 'node_changed',
      chatId,
      previousWorkflowId: workflowId,
      newWorkflowId: workflowId,
      previousNodeId,
      newNodeId,
      timestamp: new Date(),
      triggeredBy: 'system',
    };

    this.eventEmitter.emit(WORKFLOW_EVENTS.WORKFLOW_NODE_CHANGED, event);

    this.logger.debug(
      `[Workflow Change] node_changed for chat ${chatId}: ${previousNodeId || 'start'} → ${newNodeId}`,
    );
  }

  /**
   * Handle workflow pause
   */
  async handleWorkflowPaused(
    chatId: string,
    reason: string,
    userId?: number,
  ): Promise<void> {
    const state = await this.getChatWorkflowState(chatId);

    const event: WorkflowChangeEvent = {
      changeType: 'workflow_paused',
      chatId,
      previousWorkflowId: state?.activeWorkflowId || null,
      newWorkflowId: state?.activeWorkflowId || null,
      previousNodeId: state?.currentNodeId || null,
      newNodeId: state?.currentNodeId || null,
      timestamp: new Date(),
      triggeredBy: userId ? 'user' : 'system',
      userId,
      metadata: { reason },
    };

    this.eventEmitter.emit(WORKFLOW_EVENTS.WORKFLOW_PAUSED, event);
  }

  /**
   * Handle workflow resume
   */
  async handleWorkflowResumed(chatId: string, userId?: number): Promise<void> {
    const state = await this.getChatWorkflowState(chatId);

    const event: WorkflowChangeEvent = {
      changeType: 'workflow_resumed',
      chatId,
      previousWorkflowId: state?.activeWorkflowId || null,
      newWorkflowId: state?.activeWorkflowId || null,
      previousNodeId: state?.currentNodeId || null,
      newNodeId: state?.currentNodeId || null,
      timestamp: new Date(),
      triggeredBy: userId ? 'user' : 'system',
      userId,
    };

    this.eventEmitter.emit(WORKFLOW_EVENTS.WORKFLOW_RESUMED, event);
  }

  // ==========================================================================
  // Cached Instructions Management
  // ==========================================================================

  /**
   * Update cached AI instructions when node changes
   * This denormalizes node instructions to workflow_chat_state for performance
   */
  async updateCachedInstructions(
    chatId: string,
    nodeId: string,
  ): Promise<void> {
    const node = await db.query.workflowNodes.findFirst({
      where: eq(workflowNodes.id, nodeId),
    });

    if (!node) {
      this.logger.warn(
        `[Cached Instructions] Node ${nodeId} not found for chat ${chatId}`,
      );
      return;
    }

    await db
      .update(workflowChatState)
      .set({
        currentNodeId: nodeId,
        currentAiInstructions: node.aiInstructions,
        currentAiTone: node.aiTone,
        currentAiGoal: node.aiGoal,
        allowedKbTemplates: node.allowedKbTemplates,
        lastNodeChangeAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workflowChatState.chatId, chatId));

    this.logger.debug(
      `[Cached Instructions] Updated cached instructions for chat ${chatId} from node ${nodeId}`,
    );
  }

  /**
   * Clear cached instructions (on workflow unassignment)
   */
  async clearCachedInstructions(chatId: string): Promise<void> {
    await db
      .update(workflowChatState)
      .set({
        activeWorkflowId: null,
        activeExecutionId: null,
        currentNodeId: null,
        currentAiInstructions: null,
        currentAiTone: null,
        currentAiGoal: null,
        allowedKbTemplates: null,
        isPaused: false,
        pausedAt: null,
        pausedBy: null,
        pauseReason: null,
        updatedAt: new Date(),
      })
      .where(eq(workflowChatState.chatId, chatId));

    this.logger.debug(
      `[Cached Instructions] Cleared cached instructions for chat ${chatId}`,
    );
  }

  // ==========================================================================
  // Edge Case Handling
  // ==========================================================================

  /**
   * Handle case where assigned workflow no longer exists
   */
  async handleMissingWorkflow(chatId: string): Promise<void> {
    this.logger.warn(
      `[Edge Case] Chat ${chatId} references missing workflow, cleaning up`,
    );

    // Clear the invalid assignment
    await this.clearCachedInstructions(chatId);

    // Emit unassignment event
    await this.handleWorkflowUnassigned(
      chatId,
      'Referenced workflow no longer exists',
    );
  }

  /**
   * Handle case where workflow version has changed
   */
  async handleVersionMismatch(
    chatId: string,
    executionVersion: number,
    currentVersion: number,
  ): Promise<'continue' | 'restart' | 'abort'> {
    this.logger.warn(
      `[Edge Case] Chat ${chatId} execution version (${executionVersion}) differs from current (${currentVersion})`,
    );

    // For now, continue with existing execution
    // Could be enhanced to support migration or restart
    return 'continue';
  }

  /**
   * Handle case where current node no longer exists in workflow
   */
  async handleMissingNode(
    chatId: string,
    nodeId: string,
    workflowId: string,
  ): Promise<void> {
    this.logger.warn(
      `[Edge Case] Chat ${chatId} references missing node ${nodeId}, attempting recovery`,
    );

    // Try to find the workflow's entry point
    const workflow = await db.query.workflows.findFirst({
      where: eq(workflows.id, workflowId),
      with: { nodes: true },
    });

    if (!workflow) {
      await this.handleMissingWorkflow(chatId);
      return;
    }

    // Find a trigger node to restart from
    const triggerNode = workflow.nodes.find((n) =>
      n.nodeType.startsWith('trigger_'),
    );

    if (triggerNode) {
      await this.updateCachedInstructions(chatId, triggerNode.id);
      this.logger.log(
        `[Edge Case] Recovered chat ${chatId} by resetting to trigger node ${triggerNode.id}`,
      );
    } else {
      // No valid node found, unassign workflow
      await this.handleWorkflowUnassigned(
        chatId,
        'No valid nodes found in workflow',
      );
    }
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  private async getChatWorkflowState(
    chatId: string,
  ): Promise<WorkflowChatState | null> {
    const result = await db.query.workflowChatState.findFirst({
      where: eq(workflowChatState.chatId, chatId),
    });
    return result ?? null;
  }

  private async resolveInstructionsWithFallback(
    userId: number,
    chatId: string,
    context: WorkflowAIContext,
    validation: WorkflowStateValidation,
  ): Promise<ResolvedWorkflowAIInstructions> {
    try {
      return await this.instructionResolver.resolveInstructions(userId, chatId);
    } catch (error) {
      this.logger.error(
        `[Instruction Resolution] Failed for chat ${chatId}: ${error.message}`,
      );

      // Return safe defaults
      return this.getDefaultInstructions();
    }
  }

  private getDefaultInstructions(): ResolvedWorkflowAIInstructions {
    return {
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
      sources: {
        systemPromptAddition: {
          type: 'system',
          priority: 0,
          sourceId: null,
          description: 'Fallback defaults',
        },
        tone: {
          type: 'system',
          priority: 0,
          sourceId: null,
          description: 'Fallback defaults',
        },
        goal: null,
        formalityLevel: {
          type: 'system',
          priority: 0,
          sourceId: null,
          description: 'Fallback defaults',
        },
        maxResponseLength: {
          type: 'system',
          priority: 0,
          sourceId: null,
          description: 'Fallback defaults',
        },
        temperature: {
          type: 'system',
          priority: 0,
          sourceId: null,
          description: 'Fallback defaults',
        },
        allowedKbTemplates: {
          type: 'system',
          priority: 0,
          sourceId: null,
          description: 'Fallback defaults',
        },
      },
    };
  }
}
