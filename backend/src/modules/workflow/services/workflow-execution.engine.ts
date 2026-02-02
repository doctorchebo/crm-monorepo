/**
 * Workflow Execution Engine Service
 * Executes workflows: evaluates triggers, conditions, runs actions
 *
 * Architecture:
 * ┌────────────────────────────────────────────────────────────────┐
 * │                  WorkflowExecutionEngine                       │
 * ├────────────────────────────────────────────────────────────────┤
 * │  1. Trigger Evaluation                                         │
 * │     - Message received → find matching workflows               │
 * │     - Time trigger → check scheduled executions                │
 * │     - Webhook/Manual/Tag → direct invocation                   │
 * ├────────────────────────────────────────────────────────────────┤
 * │  2. Condition Evaluation                                       │
 * │     - AI classification (intent, sentiment, category)          │
 * │     - Keyword matching                                         │
 * │     - Contact/Chat property checks                             │
 * │     - Time-based conditions                                    │
 * │     - Custom expressions                                       │
 * ├────────────────────────────────────────────────────────────────┤
 * │  3. Action Execution                                           │
 * │     - Move stage, send message, assign agent                   │
 * │     - Add/remove tags, set fields                              │
 * │     - HTTP webhooks, email, internal notes                     │
 * │     - Delay (schedule resume)                                  │
 * │     - Sub-workflow invocation                                  │
 * └────────────────────────────────────────────────────────────────┘
 */

import { db } from '@database/db.connection';
import {
  chats,
  chatStageAssignments,
  chatStageHistory,
  messages,
  senders,
} from '@database/schema';
import {
  Workflow,
  workflowChatState,
  WorkflowConnection,
  workflowExecutionLogs,
  workflowExecutions,
  WorkflowNode,
  workflowNodes,
  workflows,
} from '@database/workflow-builder.schema';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { getDefaultChatStageAssignmentValues } from '@shared/constants/ai-defaults';
import { and, desc, eq, isNotNull, lte, sql } from 'drizzle-orm';

import type {
  ActionAssignAgentConfig,
  ActionDelayConfig,
  ActionHandoffConfig,
  ActionHttpWebhookConfig,
  ActionMoveStageConfig,
  ActionSendMessageConfig,
  ActionTagConfig,
  ConditionAiClassificationConfig,
  ConditionContactFieldConfig,
  ConditionKeywordConfig,
  ConditionTimeConfig,
  ExecutionContext,
  NodeExecutionResult,
  TriggerMessageConfig,
} from '../types/workflow-builder.types';
import { AiConfigurationService } from './ai-configuration.service';
import { HandoffService } from './handoff.service';
import { LLMService } from './llm.service';
import { StageService } from './stage.service';

// Node handler type
type NodeHandler = (
  node: WorkflowNode,
  context: ExecutionContext,
) => Promise<NodeExecutionResult>;

/**
 * Get the effective node type for handler lookup.
 * Nodes may have a generic type (e.g., 'trigger', 'condition', 'action') stored in nodeType,
 * but the specific type (e.g., 'trigger_message', 'condition_ai_classification') is stored
 * in config._originalNodeType. This function resolves the correct type for handler lookup.
 */
function getEffectiveNodeType(node: WorkflowNode): string {
  const config = node.config as Record<string, unknown> | null;
  const originalNodeType = config?._originalNodeType as string | undefined;

  // If we have an _originalNodeType in config, use it
  if (originalNodeType && typeof originalNodeType === 'string') {
    return originalNodeType;
  }

  // Fallback to the stored nodeType
  return node.nodeType;
}

/**
 * Result of workflow execution (internal use)
 */
interface ExecutionResult {
  /** Whether the execution completed without errors */
  completed: boolean;
  /** Whether a non-AI message was sent during execution */
  messageSent: boolean;
  /** Reason for stopping if not completed */
  stopReason?: 'paused' | 'error' | 'max_nodes' | 'completed';
}

/**
 * Result of processing a message through workflows
 * This is the public interface returned to callers
 */
export interface WorkflowProcessingResult {
  /** Whether any workflow was triggered for this message */
  triggered: boolean;
  /** IDs of executions that were started or resumed */
  executionIds: string[];
  /** Whether the workflow completed processing (reached end node or completed all steps) */
  workflowCompleted: boolean;
  /** Whether the workflow sent a static (non-AI) message during execution */
  messageSent: boolean;
}

@Injectable()
export class WorkflowExecutionEngine implements OnModuleInit {
  private readonly logger = new Logger(WorkflowExecutionEngine.name);
  private readonly nodeHandlers = new Map<string, NodeHandler>();

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly llmService: LLMService,
    private readonly handoffService: HandoffService,
    private readonly stageService: StageService,
    private readonly aiConfigService: AiConfigurationService,
  ) {}

  onModuleInit(): void {
    this.registerNodeHandlers();
    this.logger.log('Workflow Execution Engine initialized');
  }

  /**
   * Register handlers for each node type
   */
  private registerNodeHandlers(): void {
    // Trigger nodes (these are entry points, return success to continue)
    this.nodeHandlers.set(
      'trigger_message',
      this.handleTriggerMessage.bind(this),
    );
    this.nodeHandlers.set('trigger_time', this.handleTriggerTime.bind(this));
    this.nodeHandlers.set(
      'trigger_webhook',
      this.handleTriggerWebhook.bind(this),
    );
    this.nodeHandlers.set(
      'trigger_manual',
      this.handleTriggerManual.bind(this),
    );
    this.nodeHandlers.set('trigger_tag', this.handleTriggerTag.bind(this));
    this.nodeHandlers.set(
      'trigger_stage_enter',
      this.handleTriggerStageEnter.bind(this),
    );

    // Condition nodes (return branch based on evaluation)
    this.nodeHandlers.set(
      'condition_ai_classification',
      this.handleConditionAiClassification.bind(this),
    );
    this.nodeHandlers.set(
      'condition_keyword',
      this.handleConditionKeyword.bind(this),
    );
    this.nodeHandlers.set(
      'condition_contact_field',
      this.handleConditionContactField.bind(this),
    );
    this.nodeHandlers.set(
      'condition_time',
      this.handleConditionTime.bind(this),
    );
    this.nodeHandlers.set(
      'condition_chat_property',
      this.handleConditionChatProperty.bind(this),
    );
    this.nodeHandlers.set(
      'condition_expression',
      this.handleConditionExpression.bind(this),
    );

    // Action nodes
    this.nodeHandlers.set(
      'action_move_stage',
      this.handleActionMoveStage.bind(this),
    );
    this.nodeHandlers.set(
      'action_send_template',
      this.handleActionSendTemplate.bind(this),
    );
    this.nodeHandlers.set(
      'action_send_message',
      this.handleActionSendMessage.bind(this),
    );
    this.nodeHandlers.set(
      'action_assign_agent',
      this.handleActionAssignAgent.bind(this),
    );
    this.nodeHandlers.set('action_add_tag', this.handleActionAddTag.bind(this));
    this.nodeHandlers.set(
      'action_remove_tag',
      this.handleActionRemoveTag.bind(this),
    );
    this.nodeHandlers.set(
      'action_set_field',
      this.handleActionSetField.bind(this),
    );
    this.nodeHandlers.set(
      'action_http_webhook',
      this.handleActionHttpWebhook.bind(this),
    );
    this.nodeHandlers.set('action_delay', this.handleActionDelay.bind(this));
    this.nodeHandlers.set(
      'action_pause_ai',
      this.handleActionPauseAi.bind(this),
    );
    this.nodeHandlers.set(
      'action_resume_ai',
      this.handleActionResumeAi.bind(this),
    );
    this.nodeHandlers.set(
      'action_request_handoff',
      this.handleActionRequestHandoff.bind(this),
    );
    this.nodeHandlers.set(
      'action_send_email',
      this.handleActionSendEmail.bind(this),
    );
    this.nodeHandlers.set(
      'action_internal_note',
      this.handleActionInternalNote.bind(this),
    );

    // Sub-workflow
    this.nodeHandlers.set('sub_workflow', this.handleSubWorkflow.bind(this));

    // End node - marks successful completion of a workflow branch
    this.nodeHandlers.set('end', this.handleEndNode.bind(this));

    // =========================================================================
    // Generic type handlers (delegate to specific handlers based on config)
    // These handle nodes stored with generic types like 'trigger', 'condition',
    // 'action' by looking up the specific type from config._originalNodeType
    // =========================================================================
    this.nodeHandlers.set('trigger', this.handleGenericTrigger.bind(this));
    this.nodeHandlers.set('condition', this.handleGenericCondition.bind(this));
    this.nodeHandlers.set('action', this.handleGenericAction.bind(this));
    this.nodeHandlers.set('delay', this.handleActionDelay.bind(this));
    this.nodeHandlers.set('branch', this.handleGenericCondition.bind(this));
  }

  // ============================================================================
  // Generic Node Handlers (delegate to specific handlers based on config)
  // ============================================================================

  /**
   * Handle generic 'trigger' nodes by delegating to the appropriate specific handler
   */
  private async handleGenericTrigger(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const config = node.config as Record<string, unknown>;
    const originalType = config?._originalNodeType as string;
    const triggerType = config?.triggerType as string;

    // Try to find a specific handler
    const specificType =
      originalType || (triggerType ? `trigger_${triggerType}` : null);
    if (specificType && specificType !== 'trigger') {
      const handler = this.nodeHandlers.get(specificType);
      if (handler) {
        return handler(node, context);
      }
    }

    // Default trigger behavior: pass through
    return { success: true, branch: 'default' };
  }

  /**
   * Handle generic 'condition' nodes by delegating to the appropriate specific handler
   */
  private async handleGenericCondition(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const config = node.config as Record<string, unknown>;
    const originalType = config?._originalNodeType as string;
    const conditionType = config?.conditionType as string;

    // Try to find a specific handler
    const specificType =
      originalType || (conditionType ? `condition_${conditionType}` : null);
    if (specificType && specificType !== 'condition') {
      const handler = this.nodeHandlers.get(specificType);
      if (handler) {
        return handler(node, context);
      }
    }

    // Default: pass through on 'default' branch
    this.logger.warn(
      `Generic condition node ${node.id} has no specific handler (type: ${originalType || conditionType})`,
    );
    return { success: true, branch: 'default' };
  }

  /**
   * Handle generic 'action' nodes by delegating to the appropriate specific handler
   */
  private async handleGenericAction(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const config = node.config as Record<string, unknown>;
    const originalType = config?._originalNodeType as string;
    const actionType = config?.actionType as string;

    // Try to find a specific handler
    const specificType =
      originalType || (actionType ? `action_${actionType}` : null);
    if (specificType && specificType !== 'action') {
      const handler = this.nodeHandlers.get(specificType);
      if (handler) {
        return handler(node, context);
      }
    }

    // Default: emit generic action event and continue
    this.logger.warn(
      `Generic action node ${node.id} has no specific handler (type: ${originalType || actionType})`,
    );
    this.eventEmitter.emit('workflow.action.generic', {
      chatId: context.chatId,
      config: node.config,
      executionId: context.executionId,
    });
    return { success: true, branch: 'default' };
  }

  /**
   * Handle 'end' nodes - marks the end of a workflow branch
   */
  private async handleEndNode(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const config = node.config as Record<string, unknown>;
    const exitType = (config?.exitType as string) ?? 'success';

    this.logger.log(
      `[Workflow Execution] Reached end node ${node.id} with exitType: ${exitType}`,
    );

    // End nodes signal the end of this branch - return null nextNodeId
    return {
      success: true,
      branch: 'end', // Special branch that signals no more nodes to execute
      output: { exitType, nodeName: node.label },
    };
  }

  // ============================================================================
  // Main Entry Points
  // ============================================================================

  /**
   * Process an incoming message for a chat's assigned workflow.
   * This is the primary entry point when a chat has a workflow manually assigned.
   *
   * Unlike processMessage() which searches all workflows by team,
   * this method specifically handles the assigned workflow for a chat.
   *
   * @returns WorkflowProcessingResult with triggered, executionIds, workflowCompleted, and messageSent flags
   */
  async processMessageForAssignedWorkflow(
    chatId: string,
    messageId: string,
    messageContent: string,
    messageType: string,
    userId: number,
  ): Promise<WorkflowProcessingResult> {
    const executionIds: string[] = [];
    let workflowCompleted = false;
    let messageSent = false;

    this.logger.log(
      `[Workflow Execution] Processing message for chat ${chatId}, messageType: ${messageType}`,
    );

    try {
      // Check if chat has an assigned workflow
      const chatState = await db.query.workflowChatState.findFirst({
        where: eq(workflowChatState.chatId, chatId),
      });

      this.logger.debug(
        `[Workflow Execution] Chat state: ${JSON.stringify({
          hasState: !!chatState,
          activeWorkflowId: chatState?.activeWorkflowId,
          activeExecutionId: chatState?.activeExecutionId,
          currentNodeId: chatState?.currentNodeId,
        })}`,
      );

      // No workflow assigned to this chat
      if (!chatState?.activeWorkflowId) {
        this.logger.debug(
          `[Workflow Execution] No workflow assigned to chat ${chatId}`,
        );
        return {
          triggered: false,
          executionIds: [],
          workflowCompleted: false,
          messageSent: false,
        };
      }

      // If there's an active execution in 'waiting' status, resume it
      if (chatState.activeExecutionId) {
        const execution = await db.query.workflowExecutions.findFirst({
          where: eq(workflowExecutions.id, chatState.activeExecutionId),
        });

        if (execution && execution.status === 'waiting') {
          // Resume the waiting execution with the new message
          this.logger.log(
            `[Workflow Execution] Resuming waiting execution ${execution.id}`,
          );
          const resumeResult = await this.resumeExecution(execution.id, {
            message: {
              id: messageId,
              content: messageContent,
              type: messageType,
              direction: 'inbound',
              timestamp: new Date(),
            },
          });
          return {
            triggered: true,
            executionIds: [execution.id],
            workflowCompleted: resumeResult.completed,
            messageSent: resumeResult.messageSent,
          };
        }

        // If execution is running but has executed nodes and is at a trigger node,
        // treat it as waiting for a new message (this handles the initial trigger case)
        if (execution?.status === 'running') {
          const currentNode = chatState.currentNodeId;

          // Check if the execution is stuck at the trigger node (nodesExecuted = 0 or 1)
          // This happens when the trigger node executed but workflow is waiting for the
          // actual message to process through conditions
          if (currentNode && (execution.nodesExecuted ?? 0) <= 1) {
            // Get workflow to check current node type
            const workflow = await db.query.workflows.findFirst({
              where: eq(workflows.id, chatState.activeWorkflowId!),
              with: { nodes: true, connections: true },
            });

            if (workflow) {
              const node = workflow.nodes.find((n) => n.id === currentNode);
              const isTriggerNode =
                node &&
                (node.nodeType === 'trigger' ||
                  node.nodeType.startsWith('trigger_'));

              if (isTriggerNode) {
                this.logger.log(
                  `[Workflow Execution] Execution ${execution.id} is at trigger node, continuing with new message`,
                );

                // Continue execution from the trigger node with the new message context
                const messageContext = {
                  id: messageId,
                  content: messageContent,
                  type: messageType,
                  direction: 'inbound' as const,
                  timestamp: new Date(),
                };

                // Get next node from the trigger
                const nextNodeId = await this.getNextNode(
                  workflow.connections,
                  currentNode,
                  'default',
                );

                if (nextNodeId) {
                  const execResult = await this.executeFromNode(
                    execution.id,
                    workflow as Workflow & {
                      nodes: WorkflowNode[];
                      connections: WorkflowConnection[];
                    },
                    nextNodeId,
                    {
                      executionId: execution.id,
                      workflowId: workflow.id,
                      workflowVersion: execution.workflowVersion,
                      chatId,
                      variables:
                        (execution.variables as Record<string, unknown>) ?? {},
                      message: messageContext,
                    },
                  );
                  return {
                    triggered: true,
                    executionIds: [execution.id],
                    workflowCompleted: execResult.completed,
                    messageSent: execResult.messageSent,
                  };
                }
              }
            }
          }

          // Workflow is still running on a non-trigger node, don't interrupt
          this.logger.debug(
            `[Workflow Execution] Execution ${execution.id} is running, not interrupting`,
          );
          return {
            triggered: false,
            executionIds: [],
            workflowCompleted: false,
            messageSent: false,
          };
        }
      }

      // Get the assigned workflow with nodes and connections
      const workflow = await db.query.workflows.findFirst({
        where: and(
          eq(workflows.id, chatState.activeWorkflowId),
          sql`${workflows.deletedAt} IS NULL`,
        ),
        with: {
          nodes: true,
          connections: true,
        },
      });

      if (
        !workflow ||
        (workflow.status !== 'active' && workflow.status !== 'published')
      ) {
        this.logger.debug(
          `Assigned workflow ${chatState.activeWorkflowId} is not active/published or not found (status: ${workflow?.status})`,
        );
        return {
          triggered: false,
          executionIds: [],
          workflowCompleted: false,
          messageSent: false,
        };
      }

      // Find message trigger nodes (handles both 'trigger' and 'trigger_message' types)
      const triggerNodes = workflow.nodes.filter((n) =>
        this.isMessageTriggerNode(n.nodeType),
      );

      this.logger.debug(
        `[Workflow Execution] Found ${triggerNodes.length} trigger nodes in workflow ${workflow.id}`,
      );

      if (triggerNodes.length === 0) {
        this.logger.debug(
          `Workflow ${workflow.id} has no message triggers. Node types: ${workflow.nodes.map((n) => n.nodeType).join(', ')}`,
        );
        return {
          triggered: false,
          executionIds: [],
          workflowCompleted: false,
          messageSent: false,
        };
      }

      // Check each trigger node for a match
      for (const triggerNode of triggerNodes) {
        const config = (triggerNode.config || {}) as TriggerMessageConfig;

        this.logger.debug(
          `[Workflow Execution] Checking trigger node ${triggerNode.id} with config: ${JSON.stringify(config)}`,
        );

        // Check if this trigger matches the incoming message
        if (this.messageTriggerMatches(config, messageContent, messageType)) {
          this.logger.log(
            `[Workflow Execution] Trigger matched for node ${triggerNode.id}`,
          );

          // Check max executions per chat
          if (workflow.maxExecutionsPerChat) {
            const executionCount = await db
              .select({ count: sql<number>`count(*)` })
              .from(workflowExecutions)
              .where(
                and(
                  eq(workflowExecutions.workflowId, workflow.id),
                  eq(workflowExecutions.chatId, chatId),
                ),
              );

            if (
              Number(executionCount[0]?.count ?? 0) >=
              workflow.maxExecutionsPerChat
            ) {
              this.logger.debug(
                `Max executions reached for workflow ${workflow.id} on chat ${chatId}`,
              );
              continue;
            }
          }

          // Start execution - pass message content for AI classification
          const startResult = await this.startExecution(
            workflow,
            chatId,
            triggerNode.id,
            'message',
            messageId,
            userId,
            {
              _triggerMessage: {
                id: messageId,
                content: messageContent,
                type: messageType,
              },
            },
          );

          executionIds.push(startResult.executionId);
          messageSent = startResult.messageSent;

          // Check if execution completed immediately (no pause)
          const executionStatus = await db.query.workflowExecutions.findFirst({
            where: eq(workflowExecutions.id, startResult.executionId),
          });
          workflowCompleted = executionStatus?.status === 'completed';

          // Only trigger one execution per message for assigned workflows
          break;
        }
      }

      return {
        triggered: executionIds.length > 0,
        executionIds,
        workflowCompleted,
        messageSent,
      };
    } catch (error) {
      this.logger.error(
        `Error processing message for assigned workflow: ${error.message}`,
        error.stack,
      );
      return {
        triggered: false,
        executionIds: [],
        workflowCompleted: false,
        messageSent: false,
      };
    }
  }

  /**
   * Process an incoming message - find and trigger matching workflows
   */
  async processMessage(
    chatId: string,
    messageId: string,
    messageContent: string,
    messageType: string,
    teamId: number,
  ): Promise<{ triggered: boolean; executionIds: string[] }> {
    const executionIds: string[] = [];

    try {
      // Check if chat is already in a workflow
      const chatState = await db.query.workflowChatState.findFirst({
        where: eq(workflowChatState.chatId, chatId),
      });

      // If chat is in an active workflow and it's exclusive, continue that execution
      if (chatState?.activeExecutionId && chatState?.activeWorkflowId) {
        const execution = await db.query.workflowExecutions.findFirst({
          where: eq(workflowExecutions.id, chatState.activeExecutionId),
        });

        if (execution && execution.status === 'waiting') {
          // Resume the waiting execution
          await this.resumeExecution(execution.id, {
            message: {
              id: messageId,
              content: messageContent,
              type: messageType,
              direction: 'inbound',
              timestamp: new Date(),
            },
          });
          return { triggered: true, executionIds: [execution.id] };
        }
      }

      // Find active workflows for this team (exclude soft-deleted)
      const activeWorkflows = await db.query.workflows.findMany({
        where: and(
          eq(workflows.teamId, teamId),
          eq(workflows.status, 'active'),
          sql`${workflows.deletedAt} IS NULL`,
        ),
        orderBy: [desc(workflows.priority)],
        with: {
          nodes: true,
          connections: true,
        },
      });

      // Find workflows with message triggers that match
      for (const workflow of activeWorkflows) {
        const triggerNodes = workflow.nodes.filter((n) =>
          this.isMessageTriggerNode(n.nodeType),
        );

        for (const triggerNode of triggerNodes) {
          const config = (triggerNode.config || {}) as TriggerMessageConfig;

          // Check if trigger matches
          if (this.messageTriggerMatches(config, messageContent, messageType)) {
            // Check exclusivity
            if (workflow.isExclusive && chatState?.activeWorkflowId) {
              // Skip if another exclusive workflow is running
              continue;
            }

            // Check max executions
            if (workflow.maxExecutionsPerChat) {
              const executionCount = await db
                .select({ count: sql<number>`count(*)` })
                .from(workflowExecutions)
                .where(
                  and(
                    eq(workflowExecutions.workflowId, workflow.id),
                    eq(workflowExecutions.chatId, chatId),
                  ),
                );

              if (
                Number(executionCount[0]?.count ?? 0) >=
                workflow.maxExecutionsPerChat
              ) {
                continue;
              }
            }

            // Start execution
            const startResult = await this.startExecution(
              workflow,
              chatId,
              triggerNode.id,
              'message',
              messageId,
            );

            executionIds.push(startResult.executionId);

            // If exclusive, stop after first match
            if (workflow.isExclusive) {
              break;
            }
          }
        }
      }

      return {
        triggered: executionIds.length > 0,
        executionIds,
      };
    } catch (error) {
      this.logger.error(
        `Error processing message for workflows: ${error.message}`,
        error.stack,
      );
      return { triggered: false, executionIds: [] };
    }
  }

  /**
   * Check if a node type represents a message trigger
   * Handles both generic 'trigger' type and specific 'trigger_message' type
   */
  private isMessageTriggerNode(nodeType: string): boolean {
    return nodeType === 'trigger' || nodeType === 'trigger_message';
  }

  /**
   * Check if a node type represents any trigger (for manual, webhook, etc)
   */
  private isTriggerNode(nodeType: string): boolean {
    return (
      nodeType === 'trigger' ||
      nodeType.startsWith('trigger_') ||
      nodeType === 'trigger_message' ||
      nodeType === 'trigger_manual' ||
      nodeType === 'trigger_webhook' ||
      nodeType === 'trigger_time' ||
      nodeType === 'trigger_tag' ||
      nodeType === 'trigger_stage_enter'
    );
  }

  /**
   * Check if a message trigger config matches the incoming message
   */
  private messageTriggerMatches(
    config: TriggerMessageConfig,
    content: string,
    type: string,
  ): boolean {
    // Check message type filter
    if (config.messageTypes?.length) {
      if (!config.messageTypes.includes(type as any)) {
        return false;
      }
    }

    // Check content filter
    if (config.contentFilter) {
      const { keywords, keywordMatchMode, regex, minLength, maxLength } =
        config.contentFilter;

      if (minLength && content.length < minLength) return false;
      if (maxLength && content.length > maxLength) return false;

      if (keywords?.length) {
        const lowerContent = content.toLowerCase();
        const matched = keywords.filter((k) =>
          lowerContent.includes(k.toLowerCase()),
        );

        if (keywordMatchMode === 'all' && matched.length !== keywords.length) {
          return false;
        }
        if (keywordMatchMode === 'any' && matched.length === 0) {
          return false;
        }
      }

      if (regex) {
        try {
          const re = new RegExp(regex, 'i');
          if (!re.test(content)) return false;
        } catch {
          // Invalid regex, skip
        }
      }
    }

    return true;
  }

  /**
   * Manually trigger a workflow for a chat
   */
  async triggerManually(
    workflowId: string,
    chatId: string,
    userId: number,
    variables?: Record<string, unknown>,
  ): Promise<string> {
    const workflow = await db.query.workflows.findFirst({
      where: and(
        eq(workflows.id, workflowId),
        sql`${workflows.deletedAt} IS NULL`,
      ),
      with: { nodes: true, connections: true },
    });

    if (
      !workflow ||
      (workflow.status !== 'active' && workflow.status !== 'published')
    ) {
      throw new Error('Workflow not found or not active/published');
    }

    const triggerNode = workflow.nodes.find(
      (n) => n.nodeType === 'trigger_manual',
    );

    if (!triggerNode) {
      throw new Error('Workflow does not have a manual trigger');
    }

    const result = await this.startExecution(
      workflow,
      chatId,
      triggerNode.id,
      'manual',
      undefined,
      userId,
      variables,
    );
    return result.executionId;
  }

  /**
   * Handle webhook trigger
   */
  async triggerByWebhook(
    webhookId: string,
    payload: Record<string, unknown>,
    chatId?: string,
  ): Promise<string[]> {
    const executionIds: string[] = [];

    // Find workflows with this webhook trigger
    const triggeredWorkflows = await db.query.workflowNodes.findMany({
      where: and(
        eq(workflowNodes.nodeType, 'trigger_webhook'),
        sql`${workflowNodes.config}->>'webhookId' = ${webhookId}`,
      ),
      with: {
        workflow: {
          with: { nodes: true, connections: true },
        },
      },
    });

    for (const triggerNode of triggeredWorkflows) {
      if (
        triggerNode.workflow.status !== 'active' &&
        triggerNode.workflow.status !== 'published'
      )
        continue;

      // If chatId provided, use it; otherwise extract from payload
      const targetChatId = chatId ?? (payload.chatId as string);
      if (!targetChatId) continue;

      const startResult = await this.startExecution(
        triggerNode.workflow,
        targetChatId,
        triggerNode.id,
        'webhook',
        undefined,
        undefined,
        payload,
      );

      executionIds.push(startResult.executionId);
    }

    return executionIds;
  }

  // ============================================================================
  // Execution Management
  // ============================================================================

  // =========================================================================
  // AI-DEPENDENT NODE TYPES: Nodes that require AI to be enabled to execute
  // =========================================================================
  private readonly AI_DEPENDENT_NODE_TYPES = [
    'condition_ai_classification', // Uses LLM for intent/sentiment classification
    // Note: 'condition_keyword' is NOT AI-dependent - it's simple string matching
    // Note: 'action_send_message' is NOT AI-dependent - it sends predefined messages
  ];

  /**
   * Check if a workflow contains any AI-dependent nodes
   */
  private workflowContainsAIDependentNodes(
    workflow: Workflow & { nodes: WorkflowNode[] },
  ): boolean {
    return workflow.nodes.some((node) => {
      // Check direct node type
      if (this.AI_DEPENDENT_NODE_TYPES.includes(node.nodeType)) {
        return true;
      }

      // Check original node type in config (for generic nodes)
      const config = node.config as Record<string, unknown>;
      const originalType = config?._originalNodeType as string;
      if (originalType && this.AI_DEPENDENT_NODE_TYPES.includes(originalType)) {
        return true;
      }

      // Check condition type in config
      const conditionType = config?.conditionType as string;
      if (
        conditionType &&
        this.AI_DEPENDENT_NODE_TYPES.includes(`condition_${conditionType}`)
      ) {
        return true;
      }

      return false;
    });
  }

  /**
   * Start a new workflow execution
   * @returns Object with executionId and whether a message was sent
   */
  private async startExecution(
    workflow: Workflow & {
      nodes: WorkflowNode[];
      connections: WorkflowConnection[];
    },
    chatId: string,
    triggerNodeId: string,
    triggerType:
      | 'message'
      | 'time'
      | 'webhook'
      | 'manual'
      | 'tag'
      | 'stage_change'
      | 'sub_workflow',
    messageId?: string,
    userId?: number,
    initialVariables?: Record<string, unknown>,
    parentExecutionId?: string,
    parentNodeId?: string,
  ): Promise<{ executionId: string; messageSent: boolean }> {
    // Get the trigger node for its name
    const triggerNode = workflow.nodes.find((n) => n.id === triggerNodeId);

    // =========================================================================
    // AI-DEPENDENT WORKFLOW CHECK: If workflow contains AI nodes, check if AI is enabled
    // This prevents workflows from triggering when AI is disabled for the chat
    // =========================================================================
    const hasAIDependentNodes = this.workflowContainsAIDependentNodes(workflow);
    let shouldStartPaused = false;
    let pauseReason: string | undefined;

    if (hasAIDependentNodes) {
      const aiStatus = await this.handoffService.canAISend(chatId);
      if (!aiStatus.canSend) {
        shouldStartPaused = true;
        pauseReason = aiStatus.reason || 'AI is disabled for this chat';
        this.logger.log(
          `[Workflow Execution] ⏸️ Workflow ${workflow.id} contains AI-dependent nodes but AI is disabled for chat ${chatId}. Starting execution in PAUSED state. Reason: ${pauseReason}`,
        );
      }
    }

    // Create execution record - start as 'waiting' if AI is disabled and workflow needs AI
    const [execution] = await db
      .insert(workflowExecutions)
      .values({
        workflowId: workflow.id,
        chatId,
        workflowVersion: workflow.version,
        status: shouldStartPaused ? 'waiting' : 'running',
        currentNodeId: triggerNodeId,
        triggerType,
        triggerNodeId,
        triggerMessageId: messageId,
        triggeredBy: userId,
        parentExecutionId,
        parentNodeId,
        variables: initialVariables ?? {},
        startedAt: new Date(),
        nodesExecuted: 0,
      })
      .returning();

    // Update chat state - include pause info if starting paused
    await this.updateChatState(
      chatId,
      workflow.id,
      execution.id,
      triggerNodeId,
    );

    // If starting paused, update the chat state with pause information
    if (shouldStartPaused) {
      await db
        .update(workflowChatState)
        .set({
          isPaused: true,
          pausedAt: new Date(),
          pausedBy: null, // System pause, not by a user
          pauseReason: 'ai_disabled',
        })
        .where(eq(workflowChatState.chatId, chatId));

      // Log the pause
      await this.logExecution(
        execution.id,
        triggerNodeId,
        'paused',
        triggerNode?.nodeType || 'trigger',
        triggerNode?.label || 'Trigger',
        undefined,
        undefined,
        undefined,
        undefined,
        `Workflow paused at start - ${pauseReason}`,
      );

      // Emit event for UI notification
      this.eventEmitter.emit('workflow.paused', {
        chatId,
        reason: 'ai_disabled',
        pausedAtNodeId: triggerNodeId,
        executionId: execution.id,
      });

      this.logger.log(
        `Workflow execution ${execution.id} started in PAUSED state for chat ${chatId}. Will resume when AI is enabled.`,
      );

      return { executionId: execution.id, messageSent: false };
    }

    // Log execution start with node name
    await this.logExecution(
      execution.id,
      triggerNodeId,
      'entered',
      triggerNode?.nodeType || 'trigger',
      triggerNode?.label || 'Trigger',
    );

    this.logger.log(
      `Started workflow execution ${execution.id} for chat ${chatId}`,
    );

    // Build message context from initial variables if this is a message trigger
    const messageContext =
      triggerType === 'message' && initialVariables?._triggerMessage
        ? {
            id: (initialVariables._triggerMessage as Record<string, string>).id,
            content: (
              initialVariables._triggerMessage as Record<string, string>
            ).content,
            type: (initialVariables._triggerMessage as Record<string, string>)
              .type,
            direction: 'inbound' as const,
            timestamp: new Date(),
          }
        : undefined;

    // Execute the workflow starting from trigger node
    const executionResult = await this.executeFromNode(
      execution.id,
      workflow,
      triggerNodeId,
      {
        executionId: execution.id,
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        chatId,
        variables: initialVariables ?? {},
        message: messageContext,
        parentExecutionId,
        parentNodeId,
      },
    );

    return {
      executionId: execution.id,
      messageSent: executionResult.messageSent,
    };
  }

  /**
   * Execute workflow starting from a specific node
   * @returns Execution result including whether messages were sent
   */
  private async executeFromNode(
    executionId: string,
    workflow: Workflow & {
      nodes: WorkflowNode[];
      connections: WorkflowConnection[];
    },
    nodeId: string,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    let currentNodeId: string | undefined = nodeId;
    let nodesExecuted = 0;
    const maxNodes = 100; // Prevent infinite loops
    let messageSentDuringExecution = false; // Track if we sent a non-AI message

    this.logger.debug(
      `[Workflow Execution] executeFromNode starting - executionId: ${executionId}, startNodeId: ${nodeId}, hasMessage: ${!!context.message}`,
    );

    while (currentNodeId && nodesExecuted < maxNodes) {
      // Save current node ID for logging (won't change in this iteration)
      const executingNodeId = currentNodeId;

      const node = workflow.nodes.find((n) => n.id === executingNodeId);
      if (!node) {
        this.logger.error(`Node ${executingNodeId} not found in workflow`);
        break;
      }

      // Get the effective node type (handles _originalNodeType in config)
      const effectiveNodeType = getEffectiveNodeType(node);

      this.logger.debug(
        `[Workflow Execution] Processing node ${executingNodeId} (${node.label || 'Unnamed'}) [type: ${effectiveNodeType}]`,
      );

      // =========================================================================
      // AI-DEPENDENT NODE CHECK: Pause workflow if AI is disabled
      // This applies to nodes that require AI processing like classification
      // Uses the class constant AI_DEPENDENT_NODE_TYPES for consistency
      // =========================================================================
      if (this.AI_DEPENDENT_NODE_TYPES.includes(effectiveNodeType)) {
        // Check if AI is enabled for this chat
        const aiStatus = await this.handoffService.canAISend(context.chatId);

        if (!aiStatus.canSend) {
          this.logger.log(
            `[Workflow Execution] ⏸️ PAUSING workflow before AI-dependent node ${executingNodeId} (${effectiveNodeType}) - AI is disabled: ${aiStatus.reason}`,
          );

          // Update chat state to track where we paused
          await this.updateChatState(
            context.chatId,
            context.workflowId,
            executionId,
            executingNodeId, // Pause AT this node, not after
          );

          // Mark workflow as paused with reason
          // Note: pausedBy is a userId, so we set it to null for system pauses
          await db
            .update(workflowChatState)
            .set({
              isPaused: true,
              pausedAt: new Date(),
              pausedBy: null, // System pause, not by a user
              pauseReason: 'ai_disabled',
            })
            .where(eq(workflowChatState.chatId, context.chatId));

          // Set execution to waiting
          await db
            .update(workflowExecutions)
            .set({ status: 'waiting' })
            .where(eq(workflowExecutions.id, executionId));

          // Emit event for UI notification
          this.eventEmitter.emit('workflow.paused', {
            chatId: context.chatId,
            reason: 'ai_disabled',
            pausedAtNodeId: executingNodeId,
            executionId: executionId,
          });

          return {
            completed: false,
            messageSent: messageSentDuringExecution,
            stopReason: 'paused',
          }; // Exit execution loop - will resume when AI is re-enabled
        }
      }

      // Get the handler for this node type - try effective type first, then fallback to stored type
      let handler = this.nodeHandlers.get(effectiveNodeType);
      if (!handler && effectiveNodeType !== node.nodeType) {
        handler = this.nodeHandlers.get(node.nodeType);
      }

      if (!handler) {
        this.logger.error(
          `No handler for node type: ${effectiveNodeType} (stored: ${node.nodeType})`,
        );
        await this.logExecution(
          executionId,
          executingNodeId,
          'error',
          effectiveNodeType,
          node.label || 'Unnamed Node',
          undefined,
          undefined,
          undefined,
          undefined,
          `No handler for node type: ${effectiveNodeType}`,
        );
        await this.completeExecution(
          executionId,
          'failed',
          `No handler for node type: ${effectiveNodeType}`,
        );
        return {
          completed: false,
          messageSent: messageSentDuringExecution,
          stopReason: 'error',
        };
      }

      // Update current node
      await db
        .update(workflowExecutions)
        .set({
          currentNodeId: executingNodeId,
          nodesExecuted: sql`${workflowExecutions.nodesExecuted} + 1`,
        })
        .where(eq(workflowExecutions.id, executionId));

      // Log node entry
      await this.logExecution(
        executionId,
        executingNodeId,
        'entered',
        effectiveNodeType,
        node.label || 'Unnamed Node',
      );

      const startTime = Date.now();

      try {
        // Execute the node
        const result = await handler(node, context);

        // Track if this node sends a non-AI message
        // This is used to prevent duplicate AI responses
        if (effectiveNodeType === 'action_send_message') {
          const sendConfig = node.config as ActionSendMessageConfig;
          if (
            sendConfig.messageType &&
            sendConfig.messageType !== 'ai_generated'
          ) {
            messageSentDuringExecution = true;
            this.logger.debug(
              `[Workflow Execution] Node ${executingNodeId} sent static message (type: ${sendConfig.messageType})`,
            );
          }
        }

        const durationMs = Date.now() - startTime;

        // Log execution result
        await this.logExecution(
          executionId,
          executingNodeId,
          result.success ? 'executed' : 'error',
          effectiveNodeType,
          node.label || 'Unnamed Node',
          result.output,
          result.conditionResult,
          result.conditionDetails,
          result.aiClassification,
          result.error?.message,
          durationMs,
        );

        // Update context variables
        if (result.variableUpdates) {
          context.variables = {
            ...context.variables,
            ...result.variableUpdates,
          };
          await db
            .update(workflowExecutions)
            .set({ variables: context.variables })
            .where(eq(workflowExecutions.id, executionId));
        }

        // Handle execution status
        if (!result.success) {
          if (node.onErrorNodeId) {
            currentNodeId = node.onErrorNodeId;
          } else if (!node.continueOnError) {
            // Mark execution as failed
            await this.completeExecution(
              executionId,
              'failed',
              result.error?.message,
            );
            return;
          } else {
            // Continue to next node despite error
            currentNodeId = await this.getNextNode(
              workflow.connections,
              executingNodeId,
              'default',
            );
          }
        } else if (result.nextNodeId) {
          // Explicit next node (e.g., from sub-workflow or manual routing)
          currentNodeId = result.nextNodeId;
        } else {
          // Find next node based on branch
          currentNodeId = await this.getNextNode(
            workflow.connections,
            executingNodeId,
            result.branch ?? 'default',
          );

          this.logger.debug(
            `[Workflow Execution] Node ${executingNodeId} returned branch: ${result.branch}, next node: ${currentNodeId || 'none'}`,
          );

          // Auto-pause: If current node is action_send_message and next node is a classification,
          // pause execution to wait for user's response before classifying
          if (currentNodeId) {
            this.logger.log(
              `[Workflow Execution] Checking auto-pause: currentNodeType=${effectiveNodeType}, nextNodeId=${currentNodeId}`,
            );

            const nextNode = workflow.nodes.find((n) => n.id === currentNodeId);
            const nextEffectiveType = nextNode
              ? getEffectiveNodeType(nextNode)
              : null;

            this.logger.log(
              `[Workflow Execution] Next node: type=${nextNode?.nodeType}, effectiveType=${nextEffectiveType}`,
            );

            // Check if this is a send action followed by classification
            if (
              effectiveNodeType === 'action_send_message' ||
              effectiveNodeType === 'action_send_template'
            ) {
              if (
                nextEffectiveType === 'condition_ai_classification' ||
                nextEffectiveType === 'condition_keyword_match'
              ) {
                this.logger.log(
                  `[Workflow Execution] ✅ AUTO-PAUSING after ${effectiveNodeType} node ${executingNodeId} - next node ${currentNodeId} is ${nextEffectiveType} which needs user input`,
                );

                // Update chat state so we know where to resume
                await this.updateChatState(
                  context.chatId,
                  context.workflowId,
                  executionId,
                  executingNodeId, // Keep at current send node, will advance on resume
                );

                // Set execution to waiting
                await db
                  .update(workflowExecutions)
                  .set({ status: 'waiting' })
                  .where(eq(workflowExecutions.id, executionId));

                return {
                  completed: false,
                  messageSent: messageSentDuringExecution,
                  stopReason: 'paused',
                }; // Exit execution loop
              } else {
                this.logger.log(
                  `[Workflow Execution] ❌ NOT auto-pausing: nextEffectiveType=${nextEffectiveType} is not a classification node`,
                );
              }
            }
          }
        }

        // Check for delay (pause execution)
        const execution = await db.query.workflowExecutions.findFirst({
          where: eq(workflowExecutions.id, executionId),
        });
        if (execution?.status === 'waiting') {
          this.logger.log(`Execution ${executionId} is waiting for resume`);
          return {
            completed: false,
            messageSent: messageSentDuringExecution,
            stopReason: 'paused',
          };
        }

        nodesExecuted++;
      } catch (error) {
        this.logger.error(
          `Error executing node ${executingNodeId}: ${error.message}`,
          error.stack,
        );

        await this.logExecution(
          executionId,
          executingNodeId,
          'error',
          node.nodeType,
          node.label || 'Unnamed Node',
          undefined, // output
          undefined, // conditionResult
          undefined, // conditionDetails
          undefined, // aiClassification
          error.message,
          Date.now() - startTime,
        );

        if (node.onErrorNodeId) {
          currentNodeId = node.onErrorNodeId;
        } else if (!node.continueOnError) {
          await this.completeExecution(executionId, 'failed', error.message);
          return {
            completed: false,
            messageSent: messageSentDuringExecution,
            stopReason: 'error',
          };
        } else {
          currentNodeId = await this.getNextNode(
            workflow.connections,
            executingNodeId,
            'error',
          );
        }
      }
    }

    // Workflow completed successfully
    if (!currentNodeId) {
      await this.completeExecution(executionId, 'completed');
      return {
        completed: true,
        messageSent: messageSentDuringExecution,
        stopReason: 'completed',
      };
    } else if (nodesExecuted >= maxNodes) {
      await this.completeExecution(executionId, 'failed', 'Max nodes exceeded');
      return {
        completed: false,
        messageSent: messageSentDuringExecution,
        stopReason: 'max_nodes',
      };
    }

    // Default return (shouldn't reach here normally)
    return {
      completed: false,
      messageSent: messageSentDuringExecution,
      stopReason: 'paused',
    };
  }

  /**
   * Get next node ID based on current node and branch
   */
  private async getNextNode(
    connections: WorkflowConnection[],
    fromNodeId: string,
    branch: string,
  ): Promise<string | undefined> {
    // First try to find connection with exact branch match
    let connection = connections.find(
      (c) => c.fromNodeId === fromNodeId && c.branch === branch,
    );

    // Fall back to default if branch not found
    if (!connection && branch !== 'default') {
      connection = connections.find(
        (c) => c.fromNodeId === fromNodeId && c.branch === 'default',
      );
    }

    return connection?.toNodeId;
  }

  /**
   * Resume a paused execution (e.g., after delay or waiting for message)
   * @returns Execution result with completion and message status
   */
  async resumeExecution(
    executionId: string,
    updates?: Partial<ExecutionContext>,
  ): Promise<ExecutionResult> {
    const execution = await db.query.workflowExecutions.findFirst({
      where: eq(workflowExecutions.id, executionId),
    });

    if (!execution || execution.status !== 'waiting') {
      this.logger.warn(
        `Cannot resume execution ${executionId}: not in waiting state`,
      );
      return { completed: false, messageSent: false, stopReason: 'error' };
    }

    // Get workflow (exclude soft-deleted)
    const workflow = await db.query.workflows.findFirst({
      where: and(
        eq(workflows.id, execution.workflowId),
        sql`${workflows.deletedAt} IS NULL`,
      ),
      with: { nodes: true, connections: true },
    });

    if (!workflow) {
      this.logger.error(`Workflow not found for execution ${executionId}`);
      return { completed: false, messageSent: false, stopReason: 'error' };
    }

    // Update execution status
    await db
      .update(workflowExecutions)
      .set({ status: 'running', scheduledResumeAt: null })
      .where(eq(workflowExecutions.id, executionId));

    // Merge context updates
    const context: ExecutionContext = {
      executionId,
      workflowId: workflow.id,
      workflowVersion: execution.workflowVersion,
      chatId: execution.chatId,
      variables: {
        ...(execution.variables as Record<string, unknown>),
        ...updates?.variables,
      },
      message: updates?.message,
      parentExecutionId: execution.parentExecutionId ?? undefined,
      parentNodeId: execution.parentNodeId ?? undefined,
    };

    // Get next node from current position
    const currentNodeId = execution.currentNodeId;
    if (!currentNodeId) {
      return { completed: false, messageSent: false, stopReason: 'error' };
    }

    const nextNodeId = await this.getNextNode(
      workflow.connections,
      currentNodeId,
      'default',
    );

    if (nextNodeId) {
      return await this.executeFromNode(
        executionId,
        workflow,
        nextNodeId,
        context,
      );
    } else {
      await this.completeExecution(executionId, 'completed');
      return { completed: true, messageSent: false, stopReason: 'completed' };
    }
  }

  /**
   * Complete an execution
   */
  private async completeExecution(
    executionId: string,
    status: 'completed' | 'failed' | 'cancelled' | 'timeout',
    errorMessage?: string,
  ): Promise<void> {
    const execution = await db.query.workflowExecutions.findFirst({
      where: eq(workflowExecutions.id, executionId),
    });

    if (!execution) return;

    const totalDurationMs =
      Date.now() - new Date(execution.startedAt!).getTime();

    await db
      .update(workflowExecutions)
      .set({
        status,
        completedAt: new Date(),
        totalDurationMs,
        errorMessage,
        errorNodeId: status === 'failed' ? execution.currentNodeId : null,
      })
      .where(eq(workflowExecutions.id, executionId));

    // Clear execution-related fields but PRESERVE workflow assignment and AI instructions
    // The workflow is still assigned to the chat, only the execution has completed
    // AI instructions are kept so the response generator can use them for this message
    await db
      .update(workflowChatState)
      .set({
        // Keep activeWorkflowId - the workflow is still assigned to this chat
        // Keep currentAiInstructions, currentAiTone, currentAiGoal - needed for AI response
        // Keep allowedKbTemplates - needed for knowledge base retrieval
        activeExecutionId: null,
        currentNodeId: null,
        updatedAt: new Date(),
      })
      .where(eq(workflowChatState.activeExecutionId, executionId));

    this.logger.log(
      `Execution ${executionId} completed with status: ${status}`,
    );

    // Emit event
    this.eventEmitter.emit('workflow.execution.completed', {
      executionId,
      workflowId: execution.workflowId,
      chatId: execution.chatId,
      status,
      totalDurationMs,
    });
  }

  /**
   * Cancel a running execution
   */
  async cancelExecution(
    executionId: string,
    reason?: string,
  ): Promise<{ success: boolean }> {
    const execution = await db.query.workflowExecutions.findFirst({
      where: eq(workflowExecutions.id, executionId),
    });

    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (execution.status !== 'running' && execution.status !== 'waiting') {
      return { success: false };
    }

    await this.completeExecution(
      executionId,
      'cancelled',
      reason ?? 'Cancelled by user',
    );

    this.logger.log(`Cancelled execution ${executionId}: ${reason}`);

    return { success: true };
  }

  /**
   * Update chat workflow state
   */
  private async updateChatState(
    chatId: string,
    workflowId: string,
    executionId: string,
    currentNodeId: string,
  ): Promise<void> {
    const node = await db.query.workflowNodes.findFirst({
      where: eq(workflowNodes.id, currentNodeId),
    });

    const upsertData = {
      chatId,
      activeWorkflowId: workflowId,
      activeExecutionId: executionId,
      currentNodeId,
      currentAiInstructions: node?.aiInstructions,
      currentAiTone: node?.aiTone,
      currentAiGoal: node?.aiGoal,
      allowedKbTemplates: node?.allowedKbTemplates,
      enteredWorkflowAt: new Date(),
      lastNodeChangeAt: new Date(),
      updatedAt: new Date(),
    };

    // Upsert chat state
    await db
      .insert(workflowChatState)
      .values(upsertData)
      .onConflictDoUpdate({
        target: workflowChatState.chatId,
        set: {
          activeWorkflowId: workflowId,
          activeExecutionId: executionId,
          currentNodeId,
          currentAiInstructions: node?.aiInstructions,
          currentAiTone: node?.aiTone,
          currentAiGoal: node?.aiGoal,
          allowedKbTemplates: node?.allowedKbTemplates,
          lastNodeChangeAt: new Date(),
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Log execution step
   *
   * @param executionId - The execution ID
   * @param nodeId - The node being executed
   * @param action - The action type ('entered', 'executed', 'error', 'skipped')
   * @param nodeType - The type of node
   * @param nodeName - The display name of the node
   * @param output - Any output from the node execution
   * @param conditionResult - Result of condition evaluation (for condition nodes)
   * @param conditionDetails - Details about condition evaluation
   * @param aiClassification - AI classification data (if applicable)
   * @param errorMessage - Error message (if action = 'error')
   * @param durationMs - Duration of execution in milliseconds
   */
  private async logExecution(
    executionId: string,
    nodeId: string,
    action: string,
    nodeType?: string,
    nodeName?: string,
    output?: unknown,
    conditionResult?: boolean,
    conditionDetails?: unknown,
    aiClassification?: unknown,
    errorMessage?: string,
    durationMs?: number,
  ): Promise<void> {
    // Derive status from action
    let status: string;
    switch (action) {
      case 'executed':
        status = 'success';
        break;
      case 'error':
        status = 'error';
        break;
      case 'skipped':
        status = 'skipped';
        break;
      case 'entered':
      case 'waiting':
      default:
        status = 'pending';
        break;
    }

    try {
      await db.insert(workflowExecutionLogs).values({
        executionId,
        nodeId,
        nodeName: nodeName ?? null,
        nodeType: nodeType ?? null,
        action,
        status,
        output: output ?? null,
        conditionResult: conditionResult ?? null,
        conditionDetails: conditionDetails ?? null,
        aiClassification: aiClassification ?? null,
        errorMessage: errorMessage ?? null,
        durationMs: durationMs ?? null,
        executedAt: new Date(),
      });
    } catch (error) {
      this.logger.error(
        `[Workflow Execution] Failed to log execution step: ${error.message}`,
        error.stack,
      );
      // Don't throw - logging failure shouldn't stop execution
    }
  }

  // ============================================================================
  // Scheduled Jobs
  // ============================================================================

  /**
   * Process scheduled execution resumes (delays)
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledResumes(): Promise<void> {
    const now = new Date();

    const pendingExecutions = await db.query.workflowExecutions.findMany({
      where: and(
        eq(workflowExecutions.status, 'waiting'),
        isNotNull(workflowExecutions.scheduledResumeAt),
        lte(workflowExecutions.scheduledResumeAt, now),
      ),
      limit: 50,
    });

    for (const execution of pendingExecutions) {
      try {
        await this.resumeExecution(execution.id);
      } catch (error) {
        this.logger.error(
          `Error resuming execution ${execution.id}: ${error.message}`,
        );
      }
    }
  }

  // ============================================================================
  // Node Handlers - Triggers
  // ============================================================================

  private async handleTriggerMessage(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    // Trigger nodes just pass through
    return { success: true, branch: 'default' };
  }

  private async handleTriggerTime(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    return { success: true, branch: 'default' };
  }

  private async handleTriggerWebhook(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    return { success: true, branch: 'default' };
  }

  private async handleTriggerManual(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    return { success: true, branch: 'default' };
  }

  private async handleTriggerTag(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    return { success: true, branch: 'default' };
  }

  private async handleTriggerStageEnter(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    return { success: true, branch: 'default' };
  }

  // ============================================================================
  // Node Handlers - Conditions
  // ============================================================================

  /**
   * Handle AI classification condition nodes.
   * Supports two modes:
   * 1. Legacy mode: Uses classifyType + expectedValues for simple true/false branching
   * 2. Categories mode: Uses aiClassification.categories for multi-branch classification
   */
  private async handleConditionAiClassification(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const config = node.config as Record<string, unknown>;
    const messageContent = context.message?.content ?? '';

    // Check for categories-based classification (new workflow UI format)
    const aiClassification = config.aiClassification as
      | {
          prompt?: string;
          categories?: Array<{ name: string; description: string }>;
          fallbackCategory?: string;
        }
      | undefined;

    if (
      aiClassification?.categories &&
      aiClassification.categories.length > 0
    ) {
      return this.handleCategoriesBasedClassification(
        node,
        context,
        messageContent,
        {
          prompt: aiClassification.prompt,
          categories: aiClassification.categories,
          fallbackCategory: aiClassification.fallbackCategory,
        },
      );
    }

    // Legacy mode: simple true/false branching based on classifyType
    return this.handleLegacyAiClassification(
      node,
      context,
      messageContent,
      config as unknown as ConditionAiClassificationConfig,
    );
  }

  /**
   * Handle categories-based AI classification.
   * Uses LLM to classify the message into one of the defined categories.
   * Returns the category name as the branch (e.g., 'interested', 'support').
   */
  private async handleCategoriesBasedClassification(
    node: WorkflowNode,
    context: ExecutionContext,
    messageContent: string,
    config: {
      prompt?: string;
      categories: Array<{ name: string; description: string }>;
      fallbackCategory?: string;
    },
  ): Promise<NodeExecutionResult> {
    try {
      // Build the classification prompt
      const categoryDescriptions = config.categories
        .map((c) => `- ${c.name}: ${c.description}`)
        .join('\n');

      const systemPrompt = `You are a message classifier. Analyze the following message and classify it into ONE of these categories:

${categoryDescriptions}

${config.prompt || ''}

IMPORTANT: Respond with ONLY the category name (one of: ${config.categories.map((c) => c.name).join(', ')}). Nothing else.`;

      // Use LLM to classify
      const classification = await this.llmService.classifyWithCategories(
        messageContent,
        config.categories.map((c) => c.name),
        systemPrompt,
      );

      const matchedCategory = classification.category?.toLowerCase() ?? '';
      const validCategories = config.categories.map((c) =>
        c.name.toLowerCase(),
      );
      const isValidCategory = validCategories.includes(matchedCategory);

      // Use matched category or fallback
      const finalBranch = isValidCategory
        ? matchedCategory
        : (config.fallbackCategory?.toLowerCase() ?? 'default');

      this.logger.log(
        `[AI Classification] Message classified as: ${finalBranch} (confidence: ${classification.confidence})`,
      );

      return {
        success: true,
        branch: finalBranch,
        conditionResult: isValidCategory,
        conditionDetails: {
          categories: config.categories,
          matchedCategory,
          finalBranch,
          confidence: classification.confidence,
        },
        aiClassification: classification,
        variableUpdates: {
          _lastAiClassification: classification,
          _classifiedCategory: finalBranch,
        },
      };
    } catch (error) {
      this.logger.error(
        `[AI Classification] Error: ${error.message}`,
        error.stack,
      );

      // On error, use fallback category or 'default'
      const fallbackBranch =
        config.fallbackCategory?.toLowerCase() ?? 'default';

      return {
        success: true, // Don't fail the workflow, use fallback
        branch: fallbackBranch,
        conditionResult: false,
        conditionDetails: {
          error: error.message,
          fallbackUsed: true,
          finalBranch: fallbackBranch,
        },
        variableUpdates: {
          _classificationError: error.message,
          _classifiedCategory: fallbackBranch,
        },
      };
    }
  }

  /**
   * Handle legacy AI classification (simple true/false branching)
   */
  private async handleLegacyAiClassification(
    node: WorkflowNode,
    context: ExecutionContext,
    messageContent: string,
    config: ConditionAiClassificationConfig,
  ): Promise<NodeExecutionResult> {
    try {
      // Use LLM service to classify
      const classification =
        await this.llmService.classifyMessage(messageContent);

      let matches = false;

      if (config.classifyType === 'intent' && config.expectedValues) {
        matches = config.expectedValues.some((v) =>
          classification.intent?.toLowerCase().includes(v.toLowerCase()),
        );
      } else if (config.classifyType === 'sentiment' && config.expectedValues) {
        matches = config.expectedValues.includes(classification.sentiment);
      } else if (config.classifyType === 'category' && config.expectedValues) {
        matches = config.expectedValues.some((v) =>
          classification.category?.toLowerCase().includes(v.toLowerCase()),
        );
      }

      // Check confidence threshold
      if (
        config.minConfidence &&
        classification.confidence < config.minConfidence
      ) {
        matches = false;
      }

      return {
        success: true,
        branch: matches ? 'true' : 'false',
        conditionResult: matches,
        conditionDetails: { config, classification },
        aiClassification: classification,
        variableUpdates: {
          _lastAiClassification: classification,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: { code: 'AI_CLASSIFICATION_ERROR', message: error.message },
      };
    }
  }

  private async handleConditionKeyword(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const config = node.config as ConditionKeywordConfig;
    const source =
      config.source === 'last_message' ? (context.message?.content ?? '') : ''; // TODO: Support other sources

    const text = config.caseSensitive ? source : source.toLowerCase();
    const keywords = config.keywords.map((k) =>
      config.caseSensitive ? k : k.toLowerCase(),
    );

    let matches = false;

    switch (config.matchMode) {
      case 'any':
        matches = keywords.some((k) => text.includes(k));
        break;
      case 'all':
        matches = keywords.every((k) => text.includes(k));
        break;
      case 'exact':
        matches = keywords.some((k) => text === k);
        break;
      case 'regex':
        try {
          const flags = config.caseSensitive ? '' : 'i';
          matches = keywords.some((k) => new RegExp(k, flags).test(source));
        } catch {
          matches = false;
        }
        break;
    }

    return {
      success: true,
      branch: matches ? 'true' : 'false',
      conditionResult: matches,
      conditionDetails: {
        keywords,
        matchMode: config.matchMode,
        source: config.source,
      },
    };
  }

  private async handleConditionContactField(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const config = node.config as ConditionContactFieldConfig;
    const fieldValue = context.contact?.customFields?.[config.fieldName];

    let matches = false;

    switch (config.operator) {
      case 'equals':
        matches = fieldValue === config.value;
        break;
      case 'not_equals':
        matches = fieldValue !== config.value;
        break;
      case 'contains':
        matches = String(fieldValue ?? '').includes(String(config.value ?? ''));
        break;
      case 'not_contains':
        matches = !String(fieldValue ?? '').includes(
          String(config.value ?? ''),
        );
        break;
      case 'greater_than':
        matches = Number(fieldValue) > Number(config.value);
        break;
      case 'less_than':
        matches = Number(fieldValue) < Number(config.value);
        break;
      case 'is_empty':
        matches =
          fieldValue === null || fieldValue === undefined || fieldValue === '';
        break;
      case 'is_not_empty':
        matches =
          fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
        break;
      case 'in_list':
        matches = (config.values ?? []).includes(fieldValue);
        break;
      case 'not_in_list':
        matches = !(config.values ?? []).includes(fieldValue);
        break;
    }

    return {
      success: true,
      branch: matches ? 'true' : 'false',
      conditionResult: matches,
      conditionDetails: {
        field: config.fieldName,
        operator: config.operator,
        fieldValue,
      },
    };
  }

  private async handleConditionTime(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const config = node.config as ConditionTimeConfig;
    const now = new Date();
    let matches = false;

    switch (config.type) {
      case 'time_of_day':
        if (config.timeRange) {
          const currentTime = now.toTimeString().slice(0, 5);
          matches =
            currentTime >= config.timeRange.start &&
            currentTime <= config.timeRange.end;
        }
        break;
      case 'day_of_week':
        if (config.days) {
          matches = config.days.includes(now.getDay());
        }
        break;
      case 'business_hours':
        const day = now.getDay();
        const businessHours = config.businessHours?.[day];
        if (businessHours) {
          const currentTime = now.toTimeString().slice(0, 5);
          matches = businessHours.some(
            (range) => currentTime >= range.start && currentTime <= range.end,
          );
        }
        break;
    }

    return {
      success: true,
      branch: matches ? 'true' : 'false',
      conditionResult: matches,
      conditionDetails: { type: config.type, now: now.toISOString() },
    };
  }

  private async handleConditionChatProperty(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    // TODO: Implement chat property checks
    return { success: true, branch: 'default' };
  }

  private async handleConditionExpression(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    // TODO: Implement safe expression evaluation
    return { success: true, branch: 'default' };
  }

  // ============================================================================
  // Node Handlers - Actions
  // ============================================================================

  private async handleActionMoveStage(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const config = node.config as ActionMoveStageConfig;

    try {
      // Get chat to find userId
      const chat = await db.query.chats.findFirst({
        where: eq(chats.chatId, context.chatId),
      });

      if (!chat) {
        return {
          success: false,
          error: { code: 'CHAT_NOT_FOUND', message: 'Chat not found' },
        };
      }

      // Fetch user's AI defaults for new assignments
      let userDefaults = null;
      if (chat.userId) {
        try {
          userDefaults = await this.aiConfigService.getUserAiDefaults(
            chat.userId,
          );
        } catch (error) {
          this.logger.debug(
            `Could not fetch user AI defaults for user ${chat.userId}, using system defaults`,
          );
        }
      }
      const defaults = getDefaultChatStageAssignmentValues(userDefaults);

      // Update or create stage assignment
      await db
        .insert(chatStageAssignments)
        .values({
          chatId: context.chatId,
          stageId: config.stageId,
          aiPaused: defaults.aiPaused,
          awaitingHandoff: defaults.awaitingHandoff,
          assignedAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: chatStageAssignments.chatId,
          set: {
            stageId: config.stageId,
            updatedAt: new Date(),
          },
        });

      // Log stage history
      await db.insert(chatStageHistory).values({
        chatId: context.chatId,
        toStageId: config.stageId,
        triggerType: 'rule',
        reason: config.reason ?? 'Moved by workflow',
      });

      return { success: true, branch: 'default' };
    } catch (error) {
      return {
        success: false,
        error: { code: 'MOVE_STAGE_ERROR', message: error.message },
      };
    }
  }

  private async handleActionSendTemplate(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    // TODO: Integrate with WhatsApp template sending
    this.eventEmitter.emit('workflow.action.send_template', {
      chatId: context.chatId,
      config: node.config,
      executionId: context.executionId,
    });

    return { success: true, branch: 'default' };
  }

  private async handleActionSendMessage(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const config = node.config as ActionSendMessageConfig;

    // Check if this node should wait for a response before continuing
    // This is needed when the next node is a classification that needs user input
    const waitForResponse = (node.config as unknown as Record<string, unknown>)
      ?.waitForResponse as boolean;

    // For AI-generated messages, we need to:
    // 1. Update chat state with AI instructions so the response generator can use them
    // 2. Set execution to 'waiting' status - the response will be generated by the inbound message handler
    // 3. The workflow will resume after the message is sent
    if (config.messageType === 'ai_generated') {
      this.logger.log(
        `[Workflow Execution] Send Message node ${node.id} requires AI generation - updating chat state and pausing`,
      );

      // Update chat state with this node's AI instructions
      await this.updateChatState(
        context.chatId,
        context.workflowId,
        context.executionId,
        node.id,
      );

      // Set execution to waiting - the AI response will be generated by WorkflowEngineService
      // using the instructions from this node
      await db
        .update(workflowExecutions)
        .set({
          status: 'waiting',
          // Don't set scheduledResumeAt - this will resume when the message is sent
        })
        .where(eq(workflowExecutions.id, context.executionId));

      // Emit event for the message handler to know we're waiting for AI
      this.eventEmitter.emit('workflow.action.send_message', {
        chatId: context.chatId,
        config,
        executionId: context.executionId,
        aiInstructions: node.aiInstructions,
        aiTone: node.aiTone,
        aiGoal: node.aiGoal,
        allowedKbTemplates: node.allowedKbTemplates,
        waitingForAI: true,
      });

      // Return success - execution will be resumed after AI response is sent
      return { success: true, branch: 'default' };
    }

    // For static or variable messages, emit the event
    this.eventEmitter.emit('workflow.action.send_message', {
      chatId: context.chatId,
      config,
      executionId: context.executionId,
      aiInstructions: node.aiInstructions,
      aiTone: node.aiTone,
      aiGoal: node.aiGoal,
      allowedKbTemplates: node.allowedKbTemplates,
    });

    // If waitForResponse is enabled, pause execution until the user responds
    // This is useful for nodes that ask questions and need classification of the response
    if (waitForResponse) {
      this.logger.log(
        `[Workflow Execution] Send Message node ${node.id} has waitForResponse=true - pausing for user response`,
      );

      // Update chat state so we know where to resume
      await this.updateChatState(
        context.chatId,
        context.workflowId,
        context.executionId,
        node.id,
      );

      // Set execution to waiting
      await db
        .update(workflowExecutions)
        .set({
          status: 'waiting',
        })
        .where(eq(workflowExecutions.id, context.executionId));

      // Return success - execution will resume when next message arrives
      return { success: true, branch: 'default' };
    }

    return { success: true, branch: 'default' };
  }

  private async handleActionAssignAgent(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const config = node.config as ActionAssignAgentConfig;

    try {
      let agentId: number | null = null;

      if (config.assignmentType === 'specific' && config.agentUserId) {
        agentId = config.agentUserId;
      }
      // TODO: Implement round_robin, least_busy, by_tag, by_skill

      if (agentId) {
        await db
          .update(chats)
          .set({ assignedTo: agentId, updatedAt: new Date() })
          .where(eq(chats.chatId, context.chatId));

        if (config.notifyAgent) {
          this.eventEmitter.emit('workflow.agent.assigned', {
            chatId: context.chatId,
            agentId,
            executionId: context.executionId,
          });
        }
      }

      return {
        success: true,
        branch: 'default',
        variableUpdates: { _assignedAgent: agentId },
      };
    } catch (error) {
      return {
        success: false,
        error: { code: 'ASSIGN_AGENT_ERROR', message: error.message },
      };
    }
  }

  private async handleActionAddTag(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const config = node.config as ActionTagConfig;

    this.eventEmitter.emit('workflow.action.add_tag', {
      chatId: context.chatId,
      tags: config.tags,
      target: config.target,
      executionId: context.executionId,
    });

    return { success: true, branch: 'default' };
  }

  private async handleActionRemoveTag(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const config = node.config as ActionTagConfig;

    this.eventEmitter.emit('workflow.action.remove_tag', {
      chatId: context.chatId,
      tags: config.tags,
      target: config.target,
      executionId: context.executionId,
    });

    return { success: true, branch: 'default' };
  }

  private async handleActionSetField(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    // TODO: Implement contact field setting
    return { success: true, branch: 'default' };
  }

  private async handleActionHttpWebhook(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const config = node.config as ActionHttpWebhookConfig;

    try {
      const body = config.bodyTemplate
        ? this.interpolateVariables(config.bodyTemplate, context.variables)
        : config.body;

      const response = await fetch(config.url, {
        method: config.method,
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(config.timeoutMs ?? 30000),
      });

      const responseData = await response.json().catch(() => null);

      if (config.expectedStatusCodes?.length) {
        if (!config.expectedStatusCodes.includes(response.status)) {
          return {
            success: false,
            error: {
              code: 'UNEXPECTED_STATUS',
              message: `Unexpected status: ${response.status}`,
            },
          };
        }
      }

      const variableUpdates: Record<string, unknown> = {};
      if (config.saveResponseTo) {
        variableUpdates[config.saveResponseTo] = responseData;
      }

      return {
        success: true,
        branch: 'default',
        output: { status: response.status, data: responseData },
        variableUpdates,
      };
    } catch (error) {
      return {
        success: false,
        error: { code: 'HTTP_WEBHOOK_ERROR', message: error.message },
      };
    }
  }

  private async handleActionDelay(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const config = node.config as ActionDelayConfig;

    let delayMs = config.duration;
    switch (config.unit) {
      case 'minutes':
        delayMs *= 60 * 1000;
        break;
      case 'hours':
        delayMs *= 60 * 60 * 1000;
        break;
      case 'days':
        delayMs *= 24 * 60 * 60 * 1000;
        break;
      default:
        delayMs *= 1000; // seconds
    }

    const resumeAt = new Date(Date.now() + delayMs);

    // Update execution to waiting state
    await db
      .update(workflowExecutions)
      .set({
        status: 'waiting',
        scheduledResumeAt: resumeAt,
      })
      .where(eq(workflowExecutions.id, context.executionId));

    return {
      success: true,
      branch: 'default',
      output: { delayMs, resumeAt: resumeAt.toISOString() },
    };
  }

  private async handleActionPauseAi(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    await db
      .update(chatStageAssignments)
      .set({
        aiPaused: true,
        aiPausedAt: new Date(),
        aiPauseReason: (node.config as any).reason ?? 'Paused by workflow',
        updatedAt: new Date(),
      })
      .where(eq(chatStageAssignments.chatId, context.chatId));

    return { success: true, branch: 'default' };
  }

  private async handleActionResumeAi(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    await db
      .update(chatStageAssignments)
      .set({
        aiPaused: false,
        aiPausedAt: null,
        aiPausedBy: null,
        aiPauseReason: null,
        updatedAt: new Date(),
      })
      .where(eq(chatStageAssignments.chatId, context.chatId));

    return { success: true, branch: 'default' };
  }

  private async handleActionRequestHandoff(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const config = node.config as ActionHandoffConfig;

    try {
      // Get chat and then sender
      const chat = await db.query.chats.findFirst({
        where: eq(chats.chatId, context.chatId),
      });

      if (chat?.senderId) {
        // Get sender to find the owner user
        const sender = await db.query.senders.findFirst({
          where: eq(senders.id, chat.senderId),
        });

        if (sender?.userId) {
          await this.handoffService.requestHandoff(sender.userId, {
            chatId: context.chatId,
            reason: config.reason ?? 'Requested by workflow',
          });
        }
      }

      return { success: true, branch: 'default' };
    } catch (error) {
      return {
        success: false,
        error: { code: 'HANDOFF_ERROR', message: error.message },
      };
    }
  }

  private async handleActionSendEmail(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    // Emit event for Lambda to process
    this.eventEmitter.emit('workflow.action.send_email', {
      chatId: context.chatId,
      config: node.config,
      executionId: context.executionId,
      variables: context.variables,
    });

    return { success: true, branch: 'default' };
  }

  private async handleActionInternalNote(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    // TODO: Create internal note
    return { success: true, branch: 'default' };
  }

  // ============================================================================
  // Node Handlers - Sub-workflow
  // ============================================================================

  private async handleSubWorkflow(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    // TODO: Implement sub-workflow execution
    // This would start a new execution with parent reference
    return { success: true, branch: 'default' };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Simple variable interpolation for templates
   */
  private interpolateVariables(
    template: string,
    variables: Record<string, unknown>,
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return String(variables[key] ?? match);
    });
  }

  /**
   * Get workflow AI context for a chat
   */
  async getWorkflowAiContext(chatId: string): Promise<{
    aiInstructions?: string;
    aiTone?: string;
    aiGoal?: string;
    allowedKbTemplates?: string[];
  } | null> {
    const state = await db.query.workflowChatState.findFirst({
      where: eq(workflowChatState.chatId, chatId),
    });

    if (!state || !state.activeWorkflowId) {
      return null;
    }

    return {
      aiInstructions: state.currentAiInstructions ?? undefined,
      aiTone: state.currentAiTone ?? undefined,
      aiGoal: state.currentAiGoal ?? undefined,
      allowedKbTemplates: (state.allowedKbTemplates as string[]) ?? undefined,
    };
  }

  /**
   * Get the workflow state for a chat
   * Used by the frontend to show the node selector modal when AI is re-enabled
   */
  async getChatWorkflowState(chatId: string): Promise<{
    workflowId: string | null;
    workflowName: string | null;
    isPaused: boolean;
    pauseReason: string | null;
    currentNodeId: string | null;
    currentNodeLabel: string | null;
    nodes: Array<{
      id: string;
      nodeType: string;
      label: string | null;
      positionX: number;
      positionY: number;
    }>;
    connections: Array<{
      id: string;
      fromNodeId: string;
      toNodeId: string;
      label: string | null;
    }>;
  } | null> {
    const state = await db.query.workflowChatState.findFirst({
      where: eq(workflowChatState.chatId, chatId),
    });

    if (!state || !state.activeWorkflowId) {
      return null;
    }

    // Get the workflow with nodes and connections
    const workflow = await db.query.workflows.findFirst({
      where: eq(workflows.id, state.activeWorkflowId),
      with: {
        nodes: true,
        connections: true,
      },
    });

    if (!workflow) {
      return null;
    }

    // Find current node label
    const currentNode = state.currentNodeId
      ? workflow.nodes.find((n) => n.id === state.currentNodeId)
      : null;

    return {
      workflowId: workflow.id,
      workflowName: workflow.name,
      isPaused: state.isPaused ?? false,
      pauseReason: state.pauseReason ?? null,
      currentNodeId: state.currentNodeId ?? null,
      currentNodeLabel: currentNode?.label ?? null,
      nodes: workflow.nodes.map((n) => ({
        id: n.id,
        nodeType: n.nodeType,
        label: n.label ?? null,
        positionX: n.positionX,
        positionY: n.positionY,
      })),
      connections: workflow.connections.map((c) => ({
        id: c.id,
        fromNodeId: c.fromNodeId,
        toNodeId: c.toNodeId,
        label: c.label ?? null,
      })),
    };
  }

  /**
   * Resume a workflow from a selected node
   * Called when the user re-enables AI and selects where to continue the workflow
   *
   * @param chatId - The chat ID
   * @param nodeId - The node ID to resume from (or null for restart/cancel)
   * @param action - 'resume' to continue from nodeId, 'restart' to start from beginning, 'cancel' to cancel workflow
   * @param userId - The user ID performing the action
   * @returns Result with success status, message, and whether a static message was sent
   */
  async resumeWorkflowFromNode(
    chatId: string,
    nodeId: string | null,
    action: 'resume' | 'restart' | 'cancel',
    userId: number,
  ): Promise<{
    success: boolean;
    message: string;
    sentStaticMessage?: boolean;
  }> {
    this.logger.log(
      `[Workflow Resume] Action: ${action}, Chat: ${chatId}, Node: ${nodeId}`,
    );

    // Get current workflow state
    const state = await db.query.workflowChatState.findFirst({
      where: eq(workflowChatState.chatId, chatId),
    });

    if (!state || !state.activeWorkflowId) {
      return { success: false, message: 'No active workflow for this chat' };
    }

    if (!state.isPaused) {
      return { success: false, message: 'Workflow is not paused' };
    }

    // Get the workflow
    const workflow = await db.query.workflows.findFirst({
      where: eq(workflows.id, state.activeWorkflowId),
      with: { nodes: true, connections: true },
    });

    if (!workflow) {
      return { success: false, message: 'Workflow not found' };
    }

    if (action === 'cancel') {
      // Cancel the workflow - clear the state
      await db
        .update(workflowChatState)
        .set({
          activeWorkflowId: null,
          activeExecutionId: null,
          currentNodeId: null,
          isPaused: false,
          pausedAt: null,
          pausedBy: null,
          pauseReason: null,
          currentAiInstructions: null,
          currentAiTone: null,
          currentAiGoal: null,
          allowedKbTemplates: null,
          updatedAt: new Date(),
        })
        .where(eq(workflowChatState.chatId, chatId));

      this.logger.log(
        `[Workflow Resume] Workflow cancelled for chat ${chatId}`,
      );
      return {
        success: true,
        message: 'Workflow cancelled',
        sentStaticMessage: false,
      };
    }

    // For resume/restart, we need to start or continue execution
    let targetNodeId: string;
    let targetNode: WorkflowNode | undefined;

    if (action === 'restart') {
      // Find the trigger node to restart from
      const triggerNode = workflow.nodes.find(
        (n) => n.nodeType === 'trigger' || n.nodeType.startsWith('trigger_'),
      );
      if (!triggerNode) {
        return { success: false, message: 'No trigger node found in workflow' };
      }
      targetNodeId = triggerNode.id;
      targetNode = triggerNode;
    } else {
      // Resume from selected node
      if (!nodeId) {
        return {
          success: false,
          message: 'Node ID required for resume action',
        };
      }
      targetNode = workflow.nodes.find((n) => n.id === nodeId);
      if (!targetNode) {
        return {
          success: false,
          message: 'Selected node not found in workflow',
        };
      }
      targetNodeId = nodeId;
    }

    // Log the target node - actual message tracking happens during execution
    this.logger.log(
      `[Workflow Resume] Target node ${targetNodeId} (${targetNode.nodeType})`,
    );

    // Unpause the workflow
    await db
      .update(workflowChatState)
      .set({
        isPaused: false,
        pausedAt: null,
        pausedBy: null,
        pauseReason: null,
        currentNodeId: targetNodeId,
        updatedAt: new Date(),
      })
      .where(eq(workflowChatState.chatId, chatId));

    // CRITICAL: Also unpause AI at the chat level
    // When user resumes workflow from UI, they expect AI to be enabled
    // This ensures canAISend() returns true when workflow executes
    await db
      .update(chatStageAssignments)
      .set({
        aiPaused: false,
        aiPausedAt: null,
        aiPausedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(chatStageAssignments.chatId, chatId));

    this.logger.log(
      `[Workflow Resume] Unpaused both workflow and chat AI for chat ${chatId}`,
    );

    // Fetch the last inbound message for this chat - needed for classification nodes
    const lastInboundMessage = await db.query.messages.findFirst({
      where: and(
        eq(messages.chatId, chatId),
        eq(messages.direction, 'inbound'),
      ),
      orderBy: desc(messages.timestamp),
    });

    // Build message context if we have a message
    const messageContext = lastInboundMessage
      ? {
          id: lastInboundMessage.messageId,
          content: lastInboundMessage.text || '',
          type: lastInboundMessage.type || 'text',
          sender: lastInboundMessage.sender,
          timestamp: lastInboundMessage.timestamp,
        }
      : undefined;

    this.logger.debug(
      `[Workflow Resume] Last inbound message: ${lastInboundMessage ? lastInboundMessage.messageId : 'none'}`,
    );

    // If there's an existing execution that's waiting, resume it
    if (state.activeExecutionId) {
      const execution = await db.query.workflowExecutions.findFirst({
        where: eq(workflowExecutions.id, state.activeExecutionId),
      });

      if (execution && execution.status === 'waiting') {
        // Update execution state and resume
        await db
          .update(workflowExecutions)
          .set({
            status: 'running',
            currentNodeId: targetNodeId,
          })
          .where(eq(workflowExecutions.id, state.activeExecutionId));

        // Execute from the target node with message context
        const executionResult = await this.executeFromNode(
          state.activeExecutionId,
          workflow as any,
          targetNodeId,
          {
            executionId: state.activeExecutionId,
            workflowId: workflow.id,
            workflowVersion: execution.workflowVersion,
            chatId,
            variables: (execution.variables as Record<string, unknown>) ?? {},
            message: messageContext, // Include last message for classification
          },
        );

        this.logger.log(
          `[Workflow Resume] Resumed execution ${state.activeExecutionId} from node ${targetNodeId} - messageSent: ${executionResult.messageSent}`,
        );
        return {
          success: true,
          message: `Workflow resumed from ${action === 'restart' ? 'beginning' : 'selected node'}`,
          sentStaticMessage: executionResult.messageSent,
        };
      }
    }

    // No waiting execution - start a new one
    this.logger.log(
      `[Workflow Resume] Starting new execution for workflow ${workflow.id} from node ${targetNodeId}`,
    );

    // Find the trigger node ID (required for startExecution)
    const triggerNode = workflow.nodes.find(
      (n) => n.nodeType === 'trigger' || n.nodeType.startsWith('trigger_'),
    );

    if (!triggerNode) {
      return { success: false, message: 'No trigger node found in workflow' };
    }

    // Build initial variables with message context for classification
    const initialVariables = lastInboundMessage
      ? {
          _triggerMessage: {
            id: lastInboundMessage.messageId,
            content: lastInboundMessage.text || '',
            type: lastInboundMessage.type || 'text',
          },
        }
      : undefined;

    // Start new execution - it will start from trigger but we set currentNodeId for context
    const startResult = await this.startExecution(
      workflow as any,
      chatId,
      triggerNode.id,
      'manual',
      lastInboundMessage?.messageId,
      userId,
      initialVariables,
    );

    return {
      success: true,
      message: `Workflow ${action === 'restart' ? 'restarted' : 'resumed'} (execution: ${startResult.executionId})`,
      sentStaticMessage: startResult.messageSent,
    };
  }
}
