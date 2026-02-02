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
 * │    └── Emits: workflow.action.add_tag, etc.                             │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  WorkflowActionHandlerService (this service)                            │
 * │    └── Listens for events                                               │
 * │    └── Executes actual operations (send message, add tag, etc.)         │
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
    | 'add_tag'
    | 'remove_tag'
    | 'other';
  success: boolean;
  messageSent?: boolean;
  error?: string;
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

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    // Lazily resolve WhatsAppService to avoid circular dependency
    try {
      const { WhatsAppService } =
        await import('@modules/whatsapp/whatsapp.service');
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
