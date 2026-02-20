/**
 * AI Action Logger Service
 * Comprehensive logging of all AI decisions and actions
 *
 * Features:
 * - Logs all AI-generated messages with full context
 * - Tracks templates used and variables replaced
 * - Records embeddings and classification details
 * - Logs guardrail triggers and blocked actions
 */

import { db } from '@database/db.connection';
import { aiActionLogs } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gte, lte } from 'drizzle-orm';

// ============================================================================
// Types
// ============================================================================

export type ActionType =
  | 'send_message'
  | 'classify'
  | 'transition_stage'
  | 'handoff'
  | 'block'
  | 'rate_limit_check'
  | 'template_send'
  | 'embedding_lookup'
  | 'auto_reply';

export type ActionStatus =
  | 'success'
  | 'blocked'
  | 'failed'
  | 'pending_approval'
  | 'rate_limited'
  | 'session_expired';

export type GuardrailType =
  | 'rate_limit'
  | 'template_unapproved'
  | 'window_expired'
  | 'media_limit'
  | 'content_blocked'
  | 'ban_risk'
  | 'manual_pause';

export interface LogActionRequest {
  userId: number;
  chatId: string;
  messageId?: string;
  senderId?: number;
  // Action details
  actionType: ActionType;
  actionStatus: ActionStatus;
  // Message details
  messageText?: string;
  messageDirection?: 'inbound' | 'outbound';
  // Template details
  templateId?: string;
  templateName?: string;
  templateVariables?: Record<string, unknown>;
  // Classification details
  predictedCategory?: string;
  predictedIntent?: string;
  predictedSentiment?: string;
  confidenceScore?: number;
  // Embedding details
  embeddingModel?: string;
  embeddingDimensions?: number;
  embeddingUsed?: boolean;
  // Guardrail details
  guardrailTriggered?: boolean;
  guardrailType?: GuardrailType;
  guardrailReason?: string;
  // Rate limit context
  messagesInWindow?: number;
  windowStartTime?: Date;
  // Additional metadata
  metadata?: Record<string, unknown>;
}

export interface ActionLogSummary {
  totalActions: number;
  byActionType: Record<string, number>;
  byStatus: Record<string, number>;
  guardrailsTriggered: number;
  successRate: number;
  avgConfidenceScore: number;
}

@Injectable()
export class AiActionLoggerService {
  private readonly logger = new Logger(AiActionLoggerService.name);

  /**
   * Log an AI action
   */
  async logAction(request: LogActionRequest): Promise<string> {
    try {
      const [log] = await db
        .insert(aiActionLogs)
        .values({
          userId: request.userId,
          chatId: request.chatId,
          messageId: request.messageId,
          senderId: request.senderId,
          actionType: request.actionType,
          actionStatus: request.actionStatus,
          messageText: request.messageText,
          messageDirection: request.messageDirection,
          templateId: request.templateId,
          templateName: request.templateName,
          templateVariables: request.templateVariables || {},
          predictedCategory: request.predictedCategory,
          predictedIntent: request.predictedIntent,
          predictedSentiment: request.predictedSentiment,
          confidenceScore: request.confidenceScore,
          embeddingModel: request.embeddingModel,
          embeddingDimensions: request.embeddingDimensions,
          embeddingUsed: request.embeddingUsed || false,
          guardrailTriggered: request.guardrailTriggered || false,
          guardrailType: request.guardrailType,
          guardrailReason: request.guardrailReason,
          messagesInWindow: request.messagesInWindow,
          windowStartTime: request.windowStartTime,
          metadata: request.metadata || {},
        })
        .returning({ id: aiActionLogs.id });

      this.logger.debug(
        `Logged AI action: ${request.actionType} - ${request.actionStatus} for chat ${request.chatId}`,
      );

      return log.id;
    } catch (error) {
      this.logger.error(`Failed to log AI action: ${error.message}`);
      throw error;
    }
  }

  /**
   * Log a successful message send
   */
  async logMessageSent(
    userId: number,
    chatId: string,
    messageText: string,
    options?: {
      messageId?: string;
      senderId?: number;
      templateId?: string;
      templateName?: string;
      templateVariables?: Record<string, unknown>;
      classification?: {
        category?: string;
        intent?: string;
        sentiment?: string;
        confidence?: number;
      };
      embeddingUsed?: boolean;
      embeddingModel?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<string> {
    return this.logAction({
      userId,
      chatId,
      messageId: options?.messageId,
      senderId: options?.senderId,
      actionType: options?.templateId ? 'template_send' : 'send_message',
      actionStatus: 'success',
      messageText,
      messageDirection: 'outbound',
      templateId: options?.templateId,
      templateName: options?.templateName,
      templateVariables: options?.templateVariables,
      predictedCategory: options?.classification?.category,
      predictedIntent: options?.classification?.intent,
      predictedSentiment: options?.classification?.sentiment,
      confidenceScore: options?.classification?.confidence,
      embeddingUsed: options?.embeddingUsed,
      embeddingModel: options?.embeddingModel,
      metadata: options?.metadata,
    });
  }

  /**
   * Log a blocked action (guardrail triggered)
   */
  async logBlockedAction(
    userId: number,
    chatId: string,
    guardrailType: GuardrailType,
    guardrailReason: string,
    options?: {
      messageId?: string;
      senderId?: number;
      messageText?: string;
      actionType?: ActionType;
      messagesInWindow?: number;
      windowStartTime?: Date;
      metadata?: Record<string, unknown>;
    },
  ): Promise<string> {
    return this.logAction({
      userId,
      chatId,
      messageId: options?.messageId,
      senderId: options?.senderId,
      actionType: options?.actionType || 'block',
      actionStatus:
        guardrailType === 'rate_limit'
          ? 'rate_limited'
          : guardrailType === 'window_expired'
            ? 'session_expired'
            : 'blocked',
      messageText: options?.messageText,
      messageDirection: 'outbound',
      guardrailTriggered: true,
      guardrailType,
      guardrailReason,
      messagesInWindow: options?.messagesInWindow,
      windowStartTime: options?.windowStartTime,
      metadata: options?.metadata,
    });
  }

  /**
   * Log a classification action
   */
  async logClassification(
    userId: number,
    chatId: string,
    messageText: string,
    classification: {
      category: string;
      intent?: string;
      sentiment: string;
      confidence: number;
    },
    options?: {
      messageId?: string;
      senderId?: number;
      embeddingModel?: string;
      embeddingDimensions?: number;
      metadata?: Record<string, unknown>;
    },
  ): Promise<string> {
    return this.logAction({
      userId,
      chatId,
      messageId: options?.messageId,
      senderId: options?.senderId,
      actionType: 'classify',
      actionStatus: 'success',
      messageText,
      messageDirection: 'inbound',
      predictedCategory: classification.category,
      predictedIntent: classification.intent,
      predictedSentiment: classification.sentiment,
      confidenceScore: classification.confidence,
      embeddingModel: options?.embeddingModel,
      embeddingDimensions: options?.embeddingDimensions,
      embeddingUsed: !!options?.embeddingModel,
      metadata: options?.metadata,
    });
  }

  /**
   * Get action logs for a chat
   */
  async getLogsForChat(
    chatId: string,
    options?: {
      limit?: number;
      actionType?: ActionType;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<Array<typeof aiActionLogs.$inferSelect>> {
    const { limit = 50, actionType, startDate, endDate } = options || {};

    const conditions = [eq(aiActionLogs.chatId, chatId)];

    if (actionType) {
      conditions.push(eq(aiActionLogs.actionType, actionType));
    }
    if (startDate) {
      conditions.push(gte(aiActionLogs.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(aiActionLogs.createdAt, endDate));
    }

    return db
      .select()
      .from(aiActionLogs)
      .where(and(...conditions))
      .orderBy(desc(aiActionLogs.createdAt))
      .limit(limit);
  }

  /**
   * Get actions with flexible filtering (used by controller)
   */
  async getActions(
    userId: number,
    options?: {
      chatId?: string;
      senderId?: number;
      actionType?: ActionType;
      guardrailTriggeredOnly?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<Array<typeof aiActionLogs.$inferSelect>> {
    const {
      chatId,
      senderId,
      actionType,
      guardrailTriggeredOnly,
      limit = 100,
      offset = 0,
    } = options || {};

    const conditions = [eq(aiActionLogs.userId, userId)];

    if (chatId) {
      conditions.push(eq(aiActionLogs.chatId, chatId));
    }
    if (senderId) {
      conditions.push(eq(aiActionLogs.senderId, senderId));
    }
    if (actionType) {
      conditions.push(eq(aiActionLogs.actionType, actionType));
    }
    if (guardrailTriggeredOnly) {
      conditions.push(eq(aiActionLogs.guardrailTriggered, true));
    }

    return db
      .select()
      .from(aiActionLogs)
      .where(and(...conditions))
      .orderBy(desc(aiActionLogs.createdAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Get action logs for a user
   */
  async getLogsForUser(
    userId: number,
    options?: {
      limit?: number;
      actionType?: ActionType;
      guardrailsOnly?: boolean;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<Array<typeof aiActionLogs.$inferSelect>> {
    const {
      limit = 100,
      actionType,
      guardrailsOnly,
      startDate,
      endDate,
    } = options || {};

    const conditions = [eq(aiActionLogs.userId, userId)];

    if (actionType) {
      conditions.push(eq(aiActionLogs.actionType, actionType));
    }
    if (guardrailsOnly) {
      conditions.push(eq(aiActionLogs.guardrailTriggered, true));
    }
    if (startDate) {
      conditions.push(gte(aiActionLogs.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(aiActionLogs.createdAt, endDate));
    }

    return db
      .select()
      .from(aiActionLogs)
      .where(and(...conditions))
      .orderBy(desc(aiActionLogs.createdAt))
      .limit(limit);
  }

  /**
   * Get summary statistics for a user
   */
  async getActionSummary(
    userId: number,
    options?: {
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<ActionLogSummary> {
    const logs = await this.getLogsForUser(userId, {
      limit: 10000,
      startDate: options?.startDate,
      endDate: options?.endDate,
    });

    const summary: ActionLogSummary = {
      totalActions: logs.length,
      byActionType: {},
      byStatus: {},
      guardrailsTriggered: 0,
      successRate: 0,
      avgConfidenceScore: 0,
    };

    let successCount = 0;
    let confidenceSum = 0;
    let confidenceCount = 0;

    for (const log of logs) {
      // By action type
      summary.byActionType[log.actionType] =
        (summary.byActionType[log.actionType] || 0) + 1;

      // By status
      summary.byStatus[log.actionStatus] =
        (summary.byStatus[log.actionStatus] || 0) + 1;

      // Guardrails
      if (log.guardrailTriggered) {
        summary.guardrailsTriggered++;
      }

      // Success rate
      if (log.actionStatus === 'success') {
        successCount++;
      }

      // Confidence average
      if (log.confidenceScore !== null) {
        confidenceSum += log.confidenceScore;
        confidenceCount++;
      }
    }

    summary.successRate =
      logs.length > 0 ? (successCount / logs.length) * 100 : 0;
    summary.avgConfidenceScore =
      confidenceCount > 0 ? confidenceSum / confidenceCount : 0;

    return summary;
  }

  /**
   * Get recent guardrail triggers
   */
  async getRecentGuardrailTriggers(
    userId: number,
    limit = 20,
  ): Promise<Array<typeof aiActionLogs.$inferSelect>> {
    return this.getLogsForUser(userId, {
      limit,
      guardrailsOnly: true,
    });
  }
}
