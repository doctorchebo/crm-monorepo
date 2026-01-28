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
import { HandoffService } from './handoff.service';
import { LLMService } from './llm.service';
import { StageService } from './stage.service';

// Node handler type
type NodeHandler = (
  node: WorkflowNode,
  context: ExecutionContext,
) => Promise<NodeExecutionResult>;

@Injectable()
export class WorkflowExecutionEngine implements OnModuleInit {
  private readonly logger = new Logger(WorkflowExecutionEngine.name);
  private readonly nodeHandlers = new Map<string, NodeHandler>();

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly llmService: LLMService,
    private readonly handoffService: HandoffService,
    private readonly stageService: StageService,
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
  }

  // ============================================================================
  // Main Entry Points
  // ============================================================================

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
        const triggerNodes = workflow.nodes.filter(
          (n) => n.nodeType === 'trigger_message',
        );

        for (const triggerNode of triggerNodes) {
          const config = triggerNode.config as TriggerMessageConfig;

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
            const executionId = await this.startExecution(
              workflow,
              chatId,
              triggerNode.id,
              'message',
              messageId,
            );

            executionIds.push(executionId);

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

    if (!workflow || workflow.status !== 'active') {
      throw new Error('Workflow not found or not active');
    }

    const triggerNode = workflow.nodes.find(
      (n) => n.nodeType === 'trigger_manual',
    );

    if (!triggerNode) {
      throw new Error('Workflow does not have a manual trigger');
    }

    return this.startExecution(
      workflow,
      chatId,
      triggerNode.id,
      'manual',
      undefined,
      userId,
      variables,
    );
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
      if (triggerNode.workflow.status !== 'active') continue;

      // If chatId provided, use it; otherwise extract from payload
      const targetChatId = chatId ?? (payload.chatId as string);
      if (!targetChatId) continue;

      const executionId = await this.startExecution(
        triggerNode.workflow,
        targetChatId,
        triggerNode.id,
        'webhook',
        undefined,
        undefined,
        payload,
      );

      executionIds.push(executionId);
    }

    return executionIds;
  }

  // ============================================================================
  // Execution Management
  // ============================================================================

  /**
   * Start a new workflow execution
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
  ): Promise<string> {
    // Create execution record
    const [execution] = await db
      .insert(workflowExecutions)
      .values({
        workflowId: workflow.id,
        chatId,
        workflowVersion: workflow.version,
        status: 'running',
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

    // Update chat state
    await this.updateChatState(
      chatId,
      workflow.id,
      execution.id,
      triggerNodeId,
    );

    // Log execution start
    await this.logExecution(execution.id, triggerNodeId, 'entered', 'trigger');

    this.logger.log(
      `Started workflow execution ${execution.id} for chat ${chatId}`,
    );

    // Execute the workflow starting from trigger node
    await this.executeFromNode(execution.id, workflow, triggerNodeId, {
      executionId: execution.id,
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      chatId,
      variables: initialVariables ?? {},
      parentExecutionId,
      parentNodeId,
    });

    return execution.id;
  }

  /**
   * Execute workflow starting from a specific node
   */
  private async executeFromNode(
    executionId: string,
    workflow: Workflow & {
      nodes: WorkflowNode[];
      connections: WorkflowConnection[];
    },
    nodeId: string,
    context: ExecutionContext,
  ): Promise<void> {
    let currentNodeId: string | undefined = nodeId;
    let nodesExecuted = 0;
    const maxNodes = 100; // Prevent infinite loops

    while (currentNodeId && nodesExecuted < maxNodes) {
      // Save current node ID for logging (won't change in this iteration)
      const executingNodeId = currentNodeId;

      const node = workflow.nodes.find((n) => n.id === executingNodeId);
      if (!node) {
        this.logger.error(`Node ${executingNodeId} not found in workflow`);
        break;
      }

      // Get the handler for this node type
      const handler = this.nodeHandlers.get(node.nodeType);
      if (!handler) {
        this.logger.error(`No handler for node type: ${node.nodeType}`);
        break;
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
        node.nodeType,
      );

      const startTime = Date.now();

      try {
        // Execute the node
        const result = await handler(node, context);

        const durationMs = Date.now() - startTime;

        // Log execution result
        await this.logExecution(
          executionId,
          executingNodeId,
          result.success ? 'executed' : 'error',
          node.nodeType,
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
        }

        // Check for delay (pause execution)
        const execution = await db.query.workflowExecutions.findFirst({
          where: eq(workflowExecutions.id, executionId),
        });
        if (execution?.status === 'waiting') {
          this.logger.log(`Execution ${executionId} is waiting for resume`);
          return;
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
          undefined,
          undefined,
          undefined,
          undefined,
          error.message,
          Date.now() - startTime,
        );

        if (node.onErrorNodeId) {
          currentNodeId = node.onErrorNodeId;
        } else if (!node.continueOnError) {
          await this.completeExecution(executionId, 'failed', error.message);
          return;
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
    } else if (nodesExecuted >= maxNodes) {
      await this.completeExecution(executionId, 'failed', 'Max nodes exceeded');
    }
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
   */
  async resumeExecution(
    executionId: string,
    updates?: Partial<ExecutionContext>,
  ): Promise<void> {
    const execution = await db.query.workflowExecutions.findFirst({
      where: eq(workflowExecutions.id, executionId),
    });

    if (!execution || execution.status !== 'waiting') {
      this.logger.warn(
        `Cannot resume execution ${executionId}: not in waiting state`,
      );
      return;
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
      return;
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
    if (!currentNodeId) return;

    const nextNodeId = await this.getNextNode(
      workflow.connections,
      currentNodeId,
      'default',
    );

    if (nextNodeId) {
      await this.executeFromNode(executionId, workflow, nextNodeId, context);
    } else {
      await this.completeExecution(executionId, 'completed');
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

    // Clear chat state if this was the active execution
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
   */
  private async logExecution(
    executionId: string,
    nodeId: string,
    action: string,
    nodeType?: string,
    output?: unknown,
    conditionResult?: boolean,
    conditionDetails?: unknown,
    aiClassification?: unknown,
    errorMessage?: string,
    durationMs?: number,
  ): Promise<void> {
    await db.insert(workflowExecutionLogs).values({
      executionId,
      nodeId,
      action,
      nodeType,
      output: output ?? null,
      conditionResult,
      conditionDetails: conditionDetails ?? null,
      aiClassification: aiClassification ?? null,
      errorMessage,
      durationMs,
    });
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

  private async handleConditionAiClassification(
    node: WorkflowNode,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const config = node.config as ConditionAiClassificationConfig;
    const messageContent = context.message?.content ?? '';

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

      // Update or create stage assignment
      await db
        .insert(chatStageAssignments)
        .values({
          chatId: context.chatId,
          stageId: config.stageId,
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

    this.eventEmitter.emit('workflow.action.send_message', {
      chatId: context.chatId,
      config,
      executionId: context.executionId,
      aiInstructions: node.aiInstructions,
      aiTone: node.aiTone,
      aiGoal: node.aiGoal,
      allowedKbTemplates: node.allowedKbTemplates,
    });

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
}
