/**
 * Workflow Action Handler Service
 * Listens for workflow action events and executes the actual operations
 *
 * This service bridges the gap between the WorkflowExecutionEngine (which processes
 * workflow logic) and the actual system operations (sending WhatsApp messages, etc.)
 *
 * Event Flow:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  WorkflowExecutionEngine                                                │
 * │    └── Processes workflow nodes                                         │
 * │    └── Emits: workflow.action.send_message                              │
 * │    └── Emits: workflow.action.send_template                             │
 * │    └── Emits: workflow.action.add_tag, workflow.action.remove_tag       │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  WorkflowActionHandlerService (this service)                            │
 * │    └── Listens for events                                               │
 * │    └── Executes actual operations (send message, add/remove label, etc.)│
 * │    └── Tracks what actions were performed for a given execution         │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import { db } from '@database/db.connection';
import { chats } from '@database/schema';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { eq } from 'drizzle-orm';

// ============================================================================
// Chat Info Interface
// ============================================================================

interface ChatInfo {
  senderId: number;
  participantPhone: string;
  businessPhone: string;
  userId: number | null;
}

// ============================================================================
// Event Payload Types
// ============================================================================

export interface WorkflowSendMessageEvent {
  chatId: string;
  executionId: string;
  config: {
    messageType: 'text' | 'template' | 'ai_generated';
    message?: string;
    templateName?: string;
    templateParams?: Record<string, string>;
  };
  aiInstructions?: string | null;
  aiTone?: string | null;
  aiGoal?: string | null;
  allowedKbTemplates?: string[] | null;
  waitingForAI?: boolean;
}

export interface WorkflowActionResult {
  executionId: string;
  chatId: string;
  actionType:
    | 'send_message'
    | 'send_template'
    | 'add_label'
    | 'remove_label'
    | 'other';
  success: boolean;
  messageSent?: boolean;
  error?: string;
}

/**
 * Event for label (tag) actions from workflows
 */
export interface WorkflowLabelActionEvent {
  chatId: string;
  executionId: string;
  tags?: string[];
  tagName?: string;
  target?: 'chat' | 'contact';
}

// ============================================================================
// Execution Context Tracking
// ============================================================================

interface ExecutionActionTracker {
  executionId: string;
  chatId: string;
  actionsSent: WorkflowActionResult[];
  messageSentDuringExecution: boolean;
  lastActionAt: Date;
}

// WhatsApp service interface to avoid circular import
interface IWhatsAppService {
  sendMessage(
    data: { to: string; body: string; senderId: number },
    userId: number,
  ): Promise<{ messageId?: string } | null>;
}

// Labels service interface to avoid circular import
interface ILabelsService {
  applyLabelByName(
    chatId: string,
    labelName: string,
    teamId: number,
    workflowId?: string,
  ): Promise<void>;
  removeLabelByName(
    chatId: string,
    labelName: string,
    teamId: number,
  ): Promise<void>;
}

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class WorkflowActionHandlerService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowActionHandlerService.name);

  // Track actions per execution to avoid duplicate AI responses
  private readonly executionTrackers = new Map<
    string,
    ExecutionActionTracker
  >();

  // Lazily resolved to avoid circular dependency
  private whatsappService: IWhatsAppService | null = null;
  private labelsService: ILabelsService | null = null;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    // Lazily resolve WhatsAppService to avoid circular dependency
    try {
      // @ts-ignore - dynamic import
      const { WhatsAppService } =
        await import('../../whatsapp/whatsapp.service.js');
      this.whatsappService = this.moduleRef.get(WhatsAppService, {
        strict: false,
      });
      this.logger.log(
        `[WorkflowActionHandler] WhatsAppService: ${this.whatsappService ? 'AVAILABLE' : 'NOT FOUND'}`,
      );
    } catch (error) {
      this.logger.warn(
        `[WorkflowActionHandler] WhatsAppService not available: ${(error as Error).message}`,
      );
    }

    // Lazily resolve LabelsService to avoid circular dependency
    try {
      // @ts-ignore - dynamic import
      const { LabelsService } = await import('../../labels/labels.service.js');
      this.labelsService = this.moduleRef.get(LabelsService, {
        strict: false,
      });
      this.logger.log(
        `[WorkflowActionHandler] LabelsService: ${this.labelsService ? 'AVAILABLE' : 'NOT FOUND'}`,
      );
    } catch (error) {
      this.logger.warn(
        `[WorkflowActionHandler] LabelsService not available: ${(error as Error).message}`,
      );
    }

    this.logger.log('WorkflowActionHandlerService initialized');
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  /**
   * Handle workflow send message events (static or template messages)
   */
  @OnEvent('workflow.action.send_message', { async: true })
  async handleSendMessageEvent(event: WorkflowSendMessageEvent): Promise<void> {
    this.logger.log(
      `[WorkflowAction] Received send_message event for chat ${event.chatId}, execution ${event.executionId}`,
    );

    // Skip if waiting for AI - the AI generator will handle this
    if (event.waitingForAI) {
      this.logger.debug(
        `[WorkflowAction] Skipping send_message - waiting for AI generation`,
      );
      return;
    }

    // For AI-generated messages, skip - these are handled by the AI response flow
    if (event.config.messageType === 'ai_generated') {
      this.logger.debug(
        `[WorkflowAction] Skipping ai_generated message type - handled by AI flow`,
      );
      return;
    }

    // Send the static message
    if (event.config.messageType === 'text' && event.config.message) {
      await this.sendStaticMessage(
        event.chatId,
        event.executionId,
        event.config.message,
      );
    } else if (event.config.messageType === 'template') {
      this.logger.warn(
        `[WorkflowAction] Template messages not yet implemented for workflow actions`,
      );
    }
  }

  /**
   * Handle workflow send template events
   */
  @OnEvent('workflow.action.send_template', { async: true })
  async handleSendTemplateEvent(event: {
    chatId: string;
    executionId: string;
    config: {
      templateName?: string;
      templateParams?: Record<string, string>;
    };
  }): Promise<void> {
    this.logger.log(
      `[WorkflowAction] Received send_template event for chat ${event.chatId}`,
    );

    // Track this action
    this.trackAction(event.executionId, event.chatId, {
      executionId: event.executionId,
      chatId: event.chatId,
      actionType: 'send_template',
      success: false, // Templates not yet implemented
      messageSent: false,
      error: 'Template messages not yet implemented',
    });
  }

  /**
   * Handle workflow add label (tag) events
   */
  @OnEvent('workflow.action.add_tag', { async: true })
  async handleAddLabelEvent(event: WorkflowLabelActionEvent): Promise<void> {
    this.logger.log(
      `[WorkflowAction] Received add_tag event for chat ${event.chatId}`,
    );

    if (!this.labelsService) {
      this.logger.error(
        `[WorkflowAction] Cannot add label - LabelsService not available`,
      );
      this.trackAction(event.executionId, event.chatId, {
        executionId: event.executionId,
        chatId: event.chatId,
        actionType: 'add_label',
        success: false,
        error: 'LabelsService not available',
      });
      return;
    }

    try {
      // Get chat info to find team ID
      const chatInfo = await this.getChatInfo(event.chatId);
      if (!chatInfo) {
        throw new Error(`Could not find chat info for chatId: ${event.chatId}`);
      }

      // Get team ID from chat's sender
      const teamId = await this.getTeamIdFromChat(event.chatId);
      if (!teamId) {
        throw new Error(
          `Could not determine team ID for chat: ${event.chatId}`,
        );
      }

      // Handle both single tagName and array of tags
      const labelNames = event.tags || (event.tagName ? [event.tagName] : []);

      for (const labelName of labelNames) {
        await this.labelsService.applyLabelByName(
          event.chatId,
          labelName,
          teamId,
          event.executionId,
        );
      }

      this.logger.log(
        `[WorkflowAction] Applied labels [${labelNames.join(', ')}] to chat ${event.chatId}`,
      );

      this.trackAction(event.executionId, event.chatId, {
        executionId: event.executionId,
        chatId: event.chatId,
        actionType: 'add_label',
        success: true,
      });
    } catch (error) {
      this.logger.error(
        `[WorkflowAction] Failed to add label to chat ${event.chatId}: ${(error as Error).message}`,
        (error as Error).stack,
      );

      this.trackAction(event.executionId, event.chatId, {
        executionId: event.executionId,
        chatId: event.chatId,
        actionType: 'add_label',
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Handle workflow remove label (tag) events
   */
  @OnEvent('workflow.action.remove_tag', { async: true })
  async handleRemoveLabelEvent(event: WorkflowLabelActionEvent): Promise<void> {
    this.logger.log(
      `[WorkflowAction] Received remove_tag event for chat ${event.chatId}`,
    );

    if (!this.labelsService) {
      this.logger.error(
        `[WorkflowAction] Cannot remove label - LabelsService not available`,
      );
      this.trackAction(event.executionId, event.chatId, {
        executionId: event.executionId,
        chatId: event.chatId,
        actionType: 'remove_label',
        success: false,
        error: 'LabelsService not available',
      });
      return;
    }

    try {
      // Get team ID from chat
      const teamId = await this.getTeamIdFromChat(event.chatId);
      if (!teamId) {
        throw new Error(
          `Could not determine team ID for chat: ${event.chatId}`,
        );
      }

      // Handle both single tagName and array of tags
      const labelNames = event.tags || (event.tagName ? [event.tagName] : []);

      for (const labelName of labelNames) {
        await this.labelsService.removeLabelByName(
          event.chatId,
          labelName,
          teamId,
        );
      }

      this.logger.log(
        `[WorkflowAction] Removed labels [${labelNames.join(', ')}] from chat ${event.chatId}`,
      );

      this.trackAction(event.executionId, event.chatId, {
        executionId: event.executionId,
        chatId: event.chatId,
        actionType: 'remove_label',
        success: true,
      });
    } catch (error) {
      this.logger.error(
        `[WorkflowAction] Failed to remove label from chat ${event.chatId}: ${(error as Error).message}`,
        (error as Error).stack,
      );

      this.trackAction(event.executionId, event.chatId, {
        executionId: event.executionId,
        chatId: event.chatId,
        actionType: 'remove_label',
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Handle workflow execution completed events
   */
  @OnEvent('workflow.execution.completed', { async: true })
  async handleExecutionCompleted(event: {
    executionId: string;
    workflowId: string;
    chatId: string;
    status: string;
  }): Promise<void> {
    this.logger.log(
      `[WorkflowAction] Execution ${event.executionId} completed with status ${event.status}`,
    );

    // Log how many messages were sent during this execution
    const tracker = this.executionTrackers.get(event.executionId);
    if (tracker?.messageSentDuringExecution) {
      this.logger.log(
        `[WorkflowAction] Execution ${event.executionId} sent ${tracker.actionsSent.filter((a) => a.messageSent).length} workflow messages`,
      );
    }

    // Clean up tracker after a delay to allow for any late events
    setTimeout(() => {
      this.executionTrackers.delete(event.executionId);
    }, 30000);
  }

  // ==========================================================================
  // Public Query Methods
  // ==========================================================================

  /**
   * Check if a workflow execution has sent a message
   * Used by WorkflowEngineService to determine if AI should also respond
   */
  hasExecutionSentMessage(executionId: string): boolean {
    const tracker = this.executionTrackers.get(executionId);
    return tracker?.messageSentDuringExecution ?? false;
  }

  /**
   * Check if the workflow for a chat has recently completed and sent a message
   * This is used when no specific execution ID is available
   */
  async hasWorkflowRecentlySentMessage(chatId: string): Promise<boolean> {
    // Check all active trackers for this chat
    for (const tracker of this.executionTrackers.values()) {
      if (tracker.chatId === chatId && tracker.messageSentDuringExecution) {
        // Check if action was within the last 30 seconds
        const timeSinceAction = Date.now() - tracker.lastActionAt.getTime();
        if (timeSinceAction < 30000) {
          this.logger.debug(
            `[WorkflowAction] Found recent workflow message for chat ${chatId} ` +
              `(sent ${timeSinceAction}ms ago by execution ${tracker.executionId})`,
          );
          return true;
        }
      }
    }

    return false;
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Send a static message via WhatsApp
   */
  private async sendStaticMessage(
    chatId: string,
    executionId: string,
    message: string,
  ): Promise<void> {
    if (!this.whatsappService) {
      this.logger.error(
        `[WorkflowAction] Cannot send message - WhatsAppService not available`,
      );
      this.trackAction(executionId, chatId, {
        executionId,
        chatId,
        actionType: 'send_message',
        success: false,
        messageSent: false,
        error: 'WhatsAppService not available',
      });
      return;
    }

    try {
      // Get chat info from database (the reliable source)
      const chatInfo = await this.getChatInfo(chatId);
      if (!chatInfo) {
        throw new Error(`Could not find chat info for chatId: ${chatId}`);
      }

      const { senderId, participantPhone, userId } = chatInfo;

      this.logger.log(
        `[WorkflowAction] Sending workflow message to ${participantPhone} (senderId: ${senderId}): "${message.substring(0, 50)}..."`,
      );

      // Send the message using WhatsAppService.sendMessage
      // Use userId if available, otherwise use senderId for tracking
      const trackingUserId = userId ?? senderId;
      const result = await this.whatsappService.sendMessage(
        {
          to: participantPhone,
          body: message,
          senderId,
        },
        trackingUserId,
      );

      this.logger.log(
        `[WorkflowAction] Message sent successfully. WhatsApp ID: ${result?.messageId || 'unknown'}`,
      );

      // Track successful action
      this.trackAction(executionId, chatId, {
        executionId,
        chatId,
        actionType: 'send_message',
        success: true,
        messageSent: true,
      });

      // Emit event for other services to know a workflow message was sent
      this.eventEmitter.emit('workflow.message.sent', {
        chatId,
        executionId,
        messageId: result?.messageId,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error(
        `[WorkflowAction] Failed to send message to chat ${chatId}: ${(error as Error).message}`,
        (error as Error).stack,
      );

      // Track failed action
      this.trackAction(executionId, chatId, {
        executionId,
        chatId,
        actionType: 'send_message',
        success: false,
        messageSent: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get chat information from the database
   * This is the reliable way to get senderId and participantPhone
   */
  private async getChatInfo(chatId: string): Promise<ChatInfo | null> {
    try {
      const chat = await db.query.chats.findFirst({
        where: eq(chats.chatId, chatId),
      });

      if (!chat) {
        this.logger.warn(`[WorkflowAction] Chat not found: ${chatId}`);
        return null;
      }

      return {
        senderId: chat.senderId,
        participantPhone: chat.participantPhone,
        businessPhone: chat.businessPhone,
        userId: chat.userId,
      };
    } catch (error) {
      this.logger.error(
        `[WorkflowAction] Error fetching chat info for ${chatId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Get team ID from a chat
   * Looks up the chat's team association
   */
  private async getTeamIdFromChat(chatId: string): Promise<number | null> {
    try {
      const chat = await db.query.chats.findFirst({
        where: eq(chats.chatId, chatId),
      });

      if (!chat) {
        this.logger.warn(`[WorkflowAction] Chat not found: ${chatId}`);
        return null;
      }

      // Return team ID if available
      if (chat.teamId) {
        return chat.teamId;
      }

      // Fallback: try to get team from user
      // This would require additional lookups - for now just return null
      this.logger.warn(
        `[WorkflowAction] Chat ${chatId} has no team ID assigned`,
      );
      return null;
    } catch (error) {
      this.logger.error(
        `[WorkflowAction] Error fetching team ID for chat ${chatId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Track an action result for an execution
   */
  private trackAction(
    executionId: string,
    chatId: string,
    result: WorkflowActionResult,
  ): void {
    let tracker = this.executionTrackers.get(executionId);

    if (!tracker) {
      tracker = {
        executionId,
        chatId,
        actionsSent: [],
        messageSentDuringExecution: false,
        lastActionAt: new Date(),
      };
      this.executionTrackers.set(executionId, tracker);
    }

    tracker.actionsSent.push(result);
    tracker.lastActionAt = new Date();

    if (result.messageSent) {
      tracker.messageSentDuringExecution = true;
    }
  }
}
