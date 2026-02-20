/**
 * Guardrail Alert Service
 * Manages alerts sent to CRM users when guardrails are triggered
 *
 * Features:
 * - Creates and stores guardrail alerts
 * - Sends real-time notifications via WebSocket
 * - Tracks alert acknowledgment
 */

import { db } from '@database/db.connection';
import { guardrailAlerts } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, desc, eq, gte } from 'drizzle-orm';

// ============================================================================
// Types
// ============================================================================

export type AlertType =
  | 'rate_limit_warning'
  | 'rate_limit_blocked'
  | 'template_rejected'
  | 'window_expired'
  | 'ban_risk'
  | 'media_limit'
  | 'content_blocked'
  | 'quality_rating_drop'
  | 'high_frequency_detected'
  | 'session_expired';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface CreateAlertRequest {
  userId: number;
  chatId?: string;
  senderId?: number;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  actionLogId?: string;
}

export interface GuardrailAlertPayload {
  id: string;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  chatId?: string;
  senderId?: number;
  createdAt: Date;
}

// Alert type configurations with default severity and messages
export const ALERT_CONFIGS: Record<
  AlertType,
  {
    defaultSeverity: AlertSeverity;
    titleTemplate: string;
    messageTemplate: string;
  }
> = {
  rate_limit_warning: {
    defaultSeverity: 'warning',
    titleTemplate: 'Rate Limit Warning',
    messageTemplate:
      'You are approaching the message rate limit. {{remaining}} messages remaining in this window.',
  },
  rate_limit_blocked: {
    defaultSeverity: 'critical',
    titleTemplate: 'Rate Limit Exceeded',
    messageTemplate:
      'Message blocked: Rate limit exceeded. Next message allowed at {{resetTime}}.',
  },
  template_rejected: {
    defaultSeverity: 'critical',
    titleTemplate: 'Template Rejected',
    messageTemplate:
      'Cannot send message: Template "{{templateName}}" was rejected by Meta.',
  },
  window_expired: {
    defaultSeverity: 'warning',
    titleTemplate: '24-Hour Window Expired',
    messageTemplate:
      'Customer session expired. Use an approved template to re-engage with {{chatId}}.',
  },
  ban_risk: {
    defaultSeverity: 'critical',
    titleTemplate: 'Ban Risk Detected',
    messageTemplate:
      'High ban risk detected: {{reason}}. Immediate action required.',
  },
  media_limit: {
    defaultSeverity: 'warning',
    titleTemplate: 'Media Limit Exceeded',
    messageTemplate:
      'Media file exceeds allowed limits. Maximum size: {{maxSize}}MB.',
  },
  content_blocked: {
    defaultSeverity: 'warning',
    titleTemplate: 'Content Blocked',
    messageTemplate: 'Message blocked: {{reason}}',
  },
  quality_rating_drop: {
    defaultSeverity: 'critical',
    titleTemplate: 'Quality Rating Dropped',
    messageTemplate:
      'Your WhatsApp quality rating dropped to {{rating}}. Review recent messages.',
  },
  high_frequency_detected: {
    defaultSeverity: 'warning',
    titleTemplate: 'High Message Frequency',
    messageTemplate:
      'Unusual message frequency detected: {{count}} messages in {{duration}}.',
  },
  session_expired: {
    defaultSeverity: 'info',
    titleTemplate: 'Session Window Expired',
    messageTemplate:
      'No customer reply in 24 hours. Template message required for re-engagement.',
  },
};

@Injectable()
export class GuardrailAlertService {
  private readonly logger = new Logger(GuardrailAlertService.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Create and send a guardrail alert
   */
  async createAlert(request: CreateAlertRequest): Promise<string> {
    try {
      const [alert] = await db
        .insert(guardrailAlerts)
        .values({
          userId: request.userId,
          chatId: request.chatId,
          senderId: request.senderId,
          alertType: request.alertType,
          severity: request.severity,
          title: request.title,
          message: request.message,
          actionLogId: request.actionLogId,
          deliveredVia: 'websocket',
          deliveredAt: new Date(),
        })
        .returning({ id: guardrailAlerts.id });

      // Emit event for WebSocket delivery
      const payload: GuardrailAlertPayload = {
        id: alert.id,
        alertType: request.alertType,
        severity: request.severity,
        title: request.title,
        message: request.message,
        chatId: request.chatId,
        senderId: request.senderId,
        createdAt: new Date(),
      };

      this.eventEmitter.emit('guardrail.alert', {
        userId: request.userId,
        payload,
      });

      this.logger.log(
        `Created guardrail alert: ${request.alertType} (${request.severity}) for user ${request.userId}`,
      );

      return alert.id;
    } catch (error) {
      this.logger.error(`Failed to create guardrail alert: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send a rate limit warning alert
   */
  async sendRateLimitWarning(
    userId: number,
    remaining: number,
    resetTime: Date,
    chatId?: string,
    actionLogId?: string,
  ): Promise<string> {
    const config = ALERT_CONFIGS.rate_limit_warning;
    return this.createAlert({
      userId,
      chatId,
      alertType: 'rate_limit_warning',
      severity: config.defaultSeverity,
      title: config.titleTemplate,
      message: config.messageTemplate
        .replace('{{remaining}}', remaining.toString())
        .replace('{{resetTime}}', resetTime.toISOString()),
      actionLogId,
    });
  }

  /**
   * Send a rate limit blocked alert
   */
  async sendRateLimitBlocked(
    userId: number,
    resetTime: Date,
    chatId?: string,
    actionLogId?: string,
  ): Promise<string> {
    const config = ALERT_CONFIGS.rate_limit_blocked;
    return this.createAlert({
      userId,
      chatId,
      alertType: 'rate_limit_blocked',
      severity: config.defaultSeverity,
      title: config.titleTemplate,
      message: config.messageTemplate.replace(
        '{{resetTime}}',
        resetTime.toLocaleString(),
      ),
      actionLogId,
    });
  }

  /**
   * Send a template rejected alert
   */
  async sendTemplateRejected(
    userId: number,
    templateName: string,
    chatId?: string,
    actionLogId?: string,
  ): Promise<string> {
    const config = ALERT_CONFIGS.template_rejected;
    return this.createAlert({
      userId,
      chatId,
      alertType: 'template_rejected',
      severity: config.defaultSeverity,
      title: config.titleTemplate,
      message: config.messageTemplate.replace('{{templateName}}', templateName),
      actionLogId,
    });
  }

  /**
   * Send a window expired alert
   */
  async sendWindowExpired(
    userId: number,
    chatId: string,
    actionLogId?: string,
  ): Promise<string> {
    const config = ALERT_CONFIGS.window_expired;
    return this.createAlert({
      userId,
      chatId,
      alertType: 'window_expired',
      severity: config.defaultSeverity,
      title: config.titleTemplate,
      message: config.messageTemplate.replace('{{chatId}}', chatId),
      actionLogId,
    });
  }

  /**
   * Send a ban risk alert
   */
  async sendBanRiskAlert(
    userId: number,
    reason: string,
    senderId?: number,
    actionLogId?: string,
  ): Promise<string> {
    const config = ALERT_CONFIGS.ban_risk;
    return this.createAlert({
      userId,
      senderId,
      alertType: 'ban_risk',
      severity: config.defaultSeverity,
      title: config.titleTemplate,
      message: config.messageTemplate.replace('{{reason}}', reason),
      actionLogId,
    });
  }

  /**
   * Send a high frequency alert
   */
  async sendHighFrequencyAlert(
    userId: number,
    count: number,
    durationMinutes: number,
    chatId?: string,
    actionLogId?: string,
  ): Promise<string> {
    const config = ALERT_CONFIGS.high_frequency_detected;
    return this.createAlert({
      userId,
      chatId,
      alertType: 'high_frequency_detected',
      severity: config.defaultSeverity,
      title: config.titleTemplate,
      message: config.messageTemplate
        .replace('{{count}}', count.toString())
        .replace('{{duration}}', `${durationMinutes} minutes`),
      actionLogId,
    });
  }

  /**
   * Get alerts for a user
   */
  async getAlertsForUser(
    userId: number,
    options?: {
      limit?: number;
      unreadOnly?: boolean;
      severity?: AlertSeverity;
      startDate?: Date;
    },
  ): Promise<Array<typeof guardrailAlerts.$inferSelect>> {
    const { limit = 50, unreadOnly, severity, startDate } = options || {};

    const conditions = [eq(guardrailAlerts.userId, userId)];

    if (unreadOnly) {
      conditions.push(eq(guardrailAlerts.isRead, false));
    }
    if (severity) {
      conditions.push(eq(guardrailAlerts.severity, severity));
    }
    if (startDate) {
      conditions.push(gte(guardrailAlerts.createdAt, startDate));
    }

    return db
      .select()
      .from(guardrailAlerts)
      .where(and(...conditions))
      .orderBy(desc(guardrailAlerts.createdAt))
      .limit(limit);
  }

  /**
   * Get alerts with filtering (alias for controller)
   */
  async getAlerts(
    userId: number,
    options?: {
      unreadOnly?: boolean;
      alertType?: AlertType;
      limit?: number;
    },
  ): Promise<Array<typeof guardrailAlerts.$inferSelect>> {
    const { limit = 50, unreadOnly, alertType } = options || {};

    const conditions = [eq(guardrailAlerts.userId, userId)];

    if (unreadOnly) {
      conditions.push(eq(guardrailAlerts.isRead, false));
    }
    if (alertType) {
      conditions.push(eq(guardrailAlerts.alertType, alertType));
    }

    return db
      .select()
      .from(guardrailAlerts)
      .where(and(...conditions))
      .orderBy(desc(guardrailAlerts.createdAt))
      .limit(limit);
  }

  /**
   * Get unread alert count for a user
   */
  async getUnreadCount(userId: number): Promise<number> {
    const alerts = await this.getAlertsForUser(userId, {
      unreadOnly: true,
      limit: 1000,
    });
    return alerts.length;
  }

  /**
   * Mark an alert as read
   */
  async markAsRead(alertId: string, userId: number): Promise<boolean> {
    const result = await db
      .update(guardrailAlerts)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(
        and(
          eq(guardrailAlerts.id, alertId),
          eq(guardrailAlerts.userId, userId),
        ),
      )
      .returning({ id: guardrailAlerts.id });

    return result.length > 0;
  }

  /**
   * Mark all alerts as read for a user
   */
  async markAllAsRead(userId: number): Promise<number> {
    const result = await db
      .update(guardrailAlerts)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(
        and(
          eq(guardrailAlerts.userId, userId),
          eq(guardrailAlerts.isRead, false),
        ),
      )
      .returning({ id: guardrailAlerts.id });

    return result.length;
  }

  /**
   * Dismiss an alert
   */
  async dismissAlert(alertId: string, userId: number): Promise<boolean> {
    const result = await db
      .update(guardrailAlerts)
      .set({
        isDismissed: true,
        dismissedAt: new Date(),
        isRead: true,
        readAt: new Date(),
      })
      .where(
        and(
          eq(guardrailAlerts.id, alertId),
          eq(guardrailAlerts.userId, userId),
        ),
      )
      .returning({ id: guardrailAlerts.id });

    return result.length > 0;
  }
}
