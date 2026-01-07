/**
 * Anti-Ban Safeguard Service
 * Main orchestrator for all anti-ban protections and failure simulations
 *
 * Features:
 * - Pre-send validation with rate limiting
 * - Template approval verification
 * - 24-hour window enforcement
 * - Media limit checking
 * - Comprehensive action logging
 * - Real-time guardrail alerts
 */

import { db } from '@database/db.connection';
import { templateLocales, templates } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  AiActionLoggerService,
  GuardrailType,
} from './ai-action-logger.service';
import { GuardrailAlertService } from './guardrail-alert.service';
import {
  RateLimitCheckResult,
  RateLimiterService,
} from './rate-limiter.service';

// ============================================================================
// Types
// ============================================================================

export interface PreSendValidationRequest {
  userId: number;
  chatId: string;
  senderId?: number;
  messageText?: string;
  isAiGenerated: boolean;
  templateId?: string;
  templateName?: string;
  templateVariables?: Record<string, unknown>;
  mediaSize?: number; // in bytes
  mediaType?: string;
  classification?: {
    category?: string;
    intent?: string;
    sentiment?: string;
    confidence?: number;
  };
  embeddingUsed?: boolean;
  embeddingModel?: string;
}

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
  guardrailType?: GuardrailType;
  warnings: string[];
  rateLimit: RateLimitCheckResult;
  sessionValid: boolean;
  templateApproved: boolean;
  mediaValid: boolean;
}

export interface FailureSimulationResult {
  scenarioName: string;
  triggered: boolean;
  blocked: boolean;
  reason?: string;
  recommendations: string[];
  alertSent: boolean;
}

// Media limits (WhatsApp/Meta restrictions)
export const MEDIA_LIMITS = {
  image: { maxSizeMb: 16, extensions: ['jpg', 'jpeg', 'png'] },
  video: { maxSizeMb: 16, extensions: ['mp4', '3gp'] },
  audio: { maxSizeMb: 16, extensions: ['aac', 'mp4', 'm4a', 'amr', 'ogg'] },
  document: {
    maxSizeMb: 100,
    extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'],
  },
  sticker: { maxSizeMb: 0.5, extensions: ['webp'] },
};

@Injectable()
export class AntiBanSafeguardService {
  private readonly logger = new Logger(AntiBanSafeguardService.name);

  constructor(
    private readonly rateLimiter: RateLimiterService,
    private readonly actionLogger: AiActionLoggerService,
    private readonly alertService: GuardrailAlertService,
  ) {}

  /**
   * Validate a message before sending (main entry point)
   */
  async validateBeforeSend(
    request: PreSendValidationRequest,
  ): Promise<ValidationResult> {
    const warnings: string[] = [];
    let allowed = true;
    let reason: string | undefined;
    let guardrailType: GuardrailType | undefined;

    // 1. Check rate limits
    const rateLimit = await this.rateLimiter.checkRateLimit(
      request.userId,
      request.chatId,
      {
        isAiMessage: request.isAiGenerated,
        senderId: request.senderId,
      },
    );

    if (!rateLimit.allowed) {
      allowed = false;
      reason = rateLimit.reason;
      guardrailType = 'rate_limit';

      // Log and alert
      const logId = await this.actionLogger.logBlockedAction(
        request.userId,
        request.chatId,
        'rate_limit',
        rateLimit.reason || 'Rate limit exceeded',
        {
          senderId: request.senderId,
          messageText: request.messageText,
          actionType: 'send_message',
        },
      );

      await this.alertService.sendRateLimitBlocked(
        request.userId,
        rateLimit.resetTime || new Date(),
        request.chatId,
        logId,
      );
    } else if (rateLimit.warningLevel === 'approaching') {
      warnings.push(
        `Approaching rate limit: ${rateLimit.remainingMessages} messages remaining`,
      );

      await this.alertService.sendRateLimitWarning(
        request.userId,
        rateLimit.remainingMessages,
        rateLimit.resetTime || new Date(),
        request.chatId,
      );
    }

    // 2. Check 24-hour session window for AI messages
    let sessionValid = true;
    if (request.isAiGenerated && !request.templateId) {
      const sessionCheck = await this.rateLimiter.isSessionWindowValid(
        request.userId,
        request.chatId,
        request.senderId,
      );

      sessionValid = sessionCheck.valid;

      if (!sessionCheck.valid) {
        allowed = false;
        reason =
          reason ||
          'Customer session expired. Use approved template for re-engagement.';
        guardrailType = guardrailType || 'window_expired';

        const logId = await this.actionLogger.logBlockedAction(
          request.userId,
          request.chatId,
          'window_expired',
          'Customer session window expired (24+ hours since last customer message)',
          {
            senderId: request.senderId,
            messageText: request.messageText,
            actionType: 'send_message',
          },
        );

        await this.alertService.sendWindowExpired(
          request.userId,
          request.chatId,
          logId,
        );
      } else if (
        sessionCheck.hoursRemaining &&
        sessionCheck.hoursRemaining < 2
      ) {
        warnings.push(
          `Session window expiring soon: ${sessionCheck.hoursRemaining.toFixed(1)} hours remaining`,
        );
      }
    }

    // 3. Check template approval if using template
    let templateApproved = true;
    if (request.templateId) {
      templateApproved = await this.checkTemplateApproval(
        request.templateId,
        request.userId,
        request.chatId,
        request.templateName,
      );

      if (!templateApproved) {
        allowed = false;
        reason = reason || 'Template not approved by Meta';
        guardrailType = guardrailType || 'template_unapproved';
      }
    }

    // 4. Check media limits
    let mediaValid = true;
    if (request.mediaSize && request.mediaType) {
      mediaValid = await this.checkMediaLimits(
        request.userId,
        request.chatId,
        request.mediaSize,
        request.mediaType,
      );

      if (!mediaValid) {
        allowed = false;
        reason = reason || 'Media exceeds allowed limits';
        guardrailType = guardrailType || 'media_limit';
      }
    }

    // 5. Log the validation result
    if (allowed) {
      // Will be logged when message is actually sent
      this.logger.debug(`Message validated for chat ${request.chatId}`);
    } else {
      this.logger.warn(`Message blocked for chat ${request.chatId}: ${reason}`);
    }

    return {
      allowed,
      reason,
      guardrailType,
      warnings,
      rateLimit,
      sessionValid,
      templateApproved,
      mediaValid,
    };
  }

  /**
   * Record a successful message send
   */
  async recordMessageSent(request: PreSendValidationRequest): Promise<string> {
    // Record in rate limiter
    await this.rateLimiter.recordMessage(request.userId, request.chatId, {
      isAiMessage: request.isAiGenerated,
      isTemplateMessage: !!request.templateId,
      senderId: request.senderId,
    });

    // Log the action
    const logId = await this.actionLogger.logMessageSent(
      request.userId,
      request.chatId,
      request.messageText || '',
      {
        senderId: request.senderId,
        templateId: request.templateId,
        templateName: request.templateName,
        templateVariables: request.templateVariables,
        classification: request.classification,
        embeddingUsed: request.embeddingUsed,
        embeddingModel: request.embeddingModel,
      },
    );

    return logId;
  }

  /**
   * Record an inbound customer message (resets 24h window)
   */
  async recordInboundMessage(
    userId: number,
    chatId: string,
    messageText: string,
    options?: {
      messageId?: string;
      senderId?: number;
      classification?: {
        category: string;
        intent?: string;
        sentiment: string;
        confidence: number;
      };
    },
  ): Promise<void> {
    // Update session window
    await this.rateLimiter.recordCustomerMessage(
      userId,
      chatId,
      options?.senderId,
    );

    // Log classification if provided
    if (options?.classification) {
      await this.actionLogger.logClassification(
        userId,
        chatId,
        messageText,
        options.classification,
        {
          messageId: options.messageId,
          senderId: options.senderId,
        },
      );
    }
  }

  // ==========================================================================
  // Failure Simulations
  // ==========================================================================

  /**
   * Simulate sending an unapproved template outside 24h window
   */
  async simulateUnapprovedTemplateOutsideWindow(
    userId: number,
    chatId: string,
    templateName: string,
  ): Promise<FailureSimulationResult> {
    // Simulate: template is rejected + window expired
    const logId = await this.actionLogger.logBlockedAction(
      userId,
      chatId,
      'template_unapproved',
      `Simulated: Template "${templateName}" rejected and 24h window expired`,
      {
        actionType: 'template_send',
        metadata: { simulated: true },
      },
    );

    await this.alertService.sendTemplateRejected(
      userId,
      templateName,
      chatId,
      logId,
    );
    await this.alertService.sendWindowExpired(userId, chatId, logId);

    return {
      scenarioName: 'Unapproved Template Outside 24h Window',
      triggered: true,
      blocked: true,
      reason: 'Template not approved by Meta and customer session expired',
      recommendations: [
        'Only use templates with "approved" status',
        'Re-engage customers before 24h window expires',
        'Consider using utility templates for time-sensitive communications',
      ],
      alertSent: true,
    };
  }

  /**
   * Simulate high-frequency messaging leading to account block
   */
  async simulateHighFrequencyBlock(
    userId: number,
    chatId: string,
    messageCount: number,
  ): Promise<FailureSimulationResult> {
    // Simulate rapid message sending
    const simulation = await this.rateLimiter.simulateHighFrequency(
      userId,
      `sim_${chatId}_${Date.now()}`, // Use fake chatId for simulation
      messageCount,
    );

    if (simulation.blocked) {
      const logId = await this.actionLogger.logBlockedAction(
        userId,
        chatId,
        'rate_limit',
        `Simulated: High frequency messaging blocked after ${simulation.triggeredAt} messages`,
        {
          actionType: 'send_message',
          messagesInWindow: simulation.triggeredAt,
          metadata: { simulated: true },
        },
      );

      await this.alertService.sendHighFrequencyAlert(
        userId,
        messageCount,
        1, // 1 minute simulation
        chatId,
        logId,
      );

      // Simulate account block
      await this.alertService.sendBanRiskAlert(
        userId,
        `Simulated account block: ${messageCount} messages in rapid succession`,
        undefined,
        logId,
      );
    }

    return {
      scenarioName: 'High Frequency Messaging Block',
      triggered: simulation.blocked,
      blocked: simulation.blocked,
      reason: simulation.reason || 'Rate limit exceeded during simulation',
      recommendations: [
        'Implement message queuing with delays',
        'Use exponential backoff between messages',
        'Limit AI responses to prevent spam patterns',
        'Monitor real-time rate limit headers from Meta API',
      ],
      alertSent: simulation.blocked,
    };
  }

  /**
   * Simulate media exceeding allowed limits
   */
  async simulateMediaLimitExceeded(
    userId: number,
    chatId: string,
    mediaType: string,
    sizeMb: number,
  ): Promise<FailureSimulationResult> {
    const limits = MEDIA_LIMITS[mediaType as keyof typeof MEDIA_LIMITS];
    const exceeded = limits ? sizeMb > limits.maxSizeMb : true;

    if (exceeded) {
      const logId = await this.actionLogger.logBlockedAction(
        userId,
        chatId,
        'media_limit',
        `Simulated: ${mediaType} file (${sizeMb}MB) exceeds limit (${limits?.maxSizeMb || 'unknown'}MB)`,
        {
          actionType: 'send_message',
          metadata: { simulated: true, mediaType, sizeMb },
        },
      );

      await this.alertService.createAlert({
        userId,
        chatId,
        alertType: 'media_limit',
        severity: 'warning',
        title: 'Media Limit Exceeded',
        message: `${mediaType} file (${sizeMb}MB) exceeds the ${limits?.maxSizeMb || 0}MB limit`,
        actionLogId: logId,
      });
    }

    return {
      scenarioName: 'Media Limit Exceeded',
      triggered: exceeded,
      blocked: exceeded,
      reason: exceeded
        ? `${mediaType} size ${sizeMb}MB exceeds limit of ${limits?.maxSizeMb || 0}MB`
        : undefined,
      recommendations: exceeded
        ? [
            'Compress media before sending',
            `Maximum ${mediaType} size: ${limits?.maxSizeMb || 0}MB`,
            'Consider using lower resolution or bitrate',
            'Use document type for larger files (up to 100MB)',
          ]
        : [],
      alertSent: exceeded,
    };
  }

  /**
   * Run all failure simulations
   */
  async runAllSimulations(
    userId: number,
    chatId: string,
  ): Promise<FailureSimulationResult[]> {
    const results: FailureSimulationResult[] = [];

    // Simulation 1: Unapproved template
    results.push(
      await this.simulateUnapprovedTemplateOutsideWindow(
        userId,
        chatId,
        'test_template',
      ),
    );

    // Simulation 2: High frequency
    results.push(await this.simulateHighFrequencyBlock(userId, chatId, 50));

    // Simulation 3: Media limit
    results.push(
      await this.simulateMediaLimitExceeded(userId, chatId, 'video', 25),
    );

    return results;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private async checkTemplateApproval(
    templateId: string,
    userId: number,
    chatId: string,
    templateName?: string,
  ): Promise<boolean> {
    // Check if template locale is approved
    const [locale] = await db
      .select()
      .from(templateLocales)
      .where(eq(templateLocales.id, templateId))
      .limit(1);

    if (!locale) {
      // Template locale not found, check by template ID in templates table
      const [template] = await db
        .select()
        .from(templates)
        .where(eq(templates.id, templateId))
        .limit(1);

      if (!template) {
        // Log rejection
        const logId = await this.actionLogger.logBlockedAction(
          userId,
          chatId,
          'template_unapproved',
          `Template "${templateName || templateId}" not found`,
          { actionType: 'template_send' },
        );

        await this.alertService.sendTemplateRejected(
          userId,
          templateName || templateId,
          chatId,
          logId,
        );

        return false;
      }

      // Template exists but no locale - check if any locale is approved
      const approvedLocales = await db
        .select()
        .from(templateLocales)
        .where(
          and(
            eq(templateLocales.templateId, templateId),
            eq(templateLocales.approvalStatus, 'approved'),
          ),
        )
        .limit(1);

      return approvedLocales.length > 0;
    }

    if (locale.approvalStatus !== 'approved') {
      const logId = await this.actionLogger.logBlockedAction(
        userId,
        chatId,
        'template_unapproved',
        `Template "${templateName || templateId}" status: ${locale.approvalStatus}`,
        { actionType: 'template_send' },
      );

      await this.alertService.sendTemplateRejected(
        userId,
        templateName || templateId,
        chatId,
        logId,
      );

      return false;
    }

    return true;
  }

  private async checkMediaLimits(
    userId: number,
    chatId: string,
    sizeBytes: number,
    mediaType: string,
  ): Promise<boolean> {
    const sizeMb = sizeBytes / (1024 * 1024);
    const limits = MEDIA_LIMITS[mediaType as keyof typeof MEDIA_LIMITS];

    if (!limits) {
      this.logger.warn(`Unknown media type: ${mediaType}`);
      return true; // Allow unknown types
    }

    if (sizeMb > limits.maxSizeMb) {
      const logId = await this.actionLogger.logBlockedAction(
        userId,
        chatId,
        'media_limit',
        `Media ${mediaType} (${sizeMb.toFixed(2)}MB) exceeds limit (${limits.maxSizeMb}MB)`,
        { actionType: 'send_message' },
      );

      await this.alertService.createAlert({
        userId,
        chatId,
        alertType: 'media_limit',
        severity: 'warning',
        title: 'Media Too Large',
        message: `${mediaType} file (${sizeMb.toFixed(2)}MB) exceeds the ${limits.maxSizeMb}MB limit`,
        actionLogId: logId,
      });

      return false;
    }

    return true;
  }
}
