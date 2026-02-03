/**
 * Workflow Status Service
 * Handles workflow status queries, summaries, and reviewed response operations
 */

import { db } from '@database/db.connection';
import { chatStageAssignments, chats, messages } from '@database/schema';
import { WhatsAppGateway } from '@modules/whatsapp/whatsapp.gateway';
import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { desc, eq } from 'drizzle-orm';
import type { WorkflowStageConfig } from '../../types';
import type {
  AiStatusResult,
  ChatWorkflowStatus,
  ClassificationResultType,
  WorkflowSummary,
} from '../../types/workflow-engine.types';
import { AiConfigurationService } from '../ai-configuration.service';
import { HandoffService } from '../handoff.service';
import { RateLimiterService } from '../rate-limiter.service';
import { StageService } from '../stage.service';
import { AiResponseGenerator } from './ai-response.generator';

// Type-only import to avoid circular dependency at module load time
import type { WhatsAppService } from '@modules/whatsapp/whatsapp.service';

@Injectable()
export class WorkflowStatusService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowStatusService.name);

  // Lazily resolved to break circular dependency
  private whatsappService: WhatsAppService | undefined;

  constructor(
    private readonly stageService: StageService,
    private readonly handoffService: HandoffService,
    private readonly moduleRef: ModuleRef,
    @Optional()
    private readonly aiConfigService?: AiConfigurationService,
    @Optional()
    private readonly rateLimiter?: RateLimiterService,
    @Optional()
    private readonly whatsappGateway?: WhatsAppGateway,
    @Optional()
    private readonly aiResponseGenerator?: AiResponseGenerator,
  ) {}

  async onModuleInit() {
    // Lazily resolve WhatsAppService to break circular dependency
    try {
      // Dynamic import to get the class reference at runtime
      // @ts-ignore - dynamic import
      const { WhatsAppService } =
        await import('../../../whatsapp/whatsapp.service.js');
      this.whatsappService = this.moduleRef.get(WhatsAppService, {
        strict: false,
      });
    } catch (error) {
      this.logger.warn(
        'Failed to resolve WhatsAppService lazily - this is expected in some test environments',
      );
    }
  }

  /**
   * Get workflow summary for a user/sender
   */
  async getWorkflowSummary(
    userId: number,
    senderId?: number,
  ): Promise<WorkflowSummary> {
    // Get all stages
    const stages = await this.stageService.getStages(userId);

    // Get stage assignments count - note: chatStageAssignments doesn't have userId
    // We need to get all assignments and filter by stage
    let allAssignments: any[] = [];
    try {
      allAssignments = await db.select().from(chatStageAssignments);
    } catch (error) {
      this.logger.debug(`Could not query stage assignments: ${error}`);
    }

    // Count by stage (only stages belonging to this user)
    const stageIds = new Set(stages.map((s) => s.id));
    const userAssignments = allAssignments.filter(
      (a) => a.stageId && stageIds.has(a.stageId),
    );

    // Count by stage
    const byStage = stages.map((stage) => ({
      stageId: stage.id,
      stageName: stage.name,
      count: userAssignments.filter((a) => a.stageId === stage.id).length,
      color: stage.color,
    }));

    // Get pending handoffs
    const pendingHandoffs =
      await this.handoffService.getChatsAwaitingHandoff(userId);

    // Get AI paused count
    const aiPausedAssignments = userAssignments.filter(
      (a) => a.aiPaused === true,
    );

    // Get recent transitions (last 24h)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentTransitions = userAssignments.filter(
      (a) => a.updatedAt && new Date(a.updatedAt) > yesterday,
    ).length;

    return {
      totalChats: userAssignments.length,
      byStage,
      pendingHandoffs: pendingHandoffs.length,
      aiPaused: aiPausedAssignments.length,
      recentTransitions,
    };
  }

  /**
   * Get detailed workflow status for a specific chat
   */
  async getChatWorkflowStatus(
    chatId: string,
    userId: number,
  ): Promise<ChatWorkflowStatus> {
    // Get current stage
    const assignment = await this.stageService.getChatStage(chatId);
    let currentStage: WorkflowStageConfig | null = null;

    if (assignment?.stageId) {
      currentStage = await this.stageService.getStageById(assignment.stageId);
    }

    // Get handoff status
    const pendingHandoffs =
      await this.handoffService.getChatsAwaitingHandoff(userId);
    const handoff = pendingHandoffs.find((h) => h.chatId === chatId);

    // Check AI status
    const canAIResult = await this.handoffService.canAISend(chatId);

    // Get last classification from recent message processing
    const [lastMessage] = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.timestamp))
      .limit(1);

    let classification: ClassificationResultType | undefined;
    if (lastMessage?.text && lastMessage.direction === 'inbound') {
      if (this.aiResponseGenerator) {
        const result = await this.aiResponseGenerator.classifyMessage(
          lastMessage.text,
          userId,
        );
        classification = {
          ...result,
          category: result.category,
          sentiment: result.sentiment,
          sentimentScore: result.sentimentScore,
          keywords: result.keywords,
          confidence: result.confidence,
          requiresHandoff: result.requiresHandoff,
          intent: result.intent,
        };
      }
    }

    return {
      chatId,
      currentStage,
      handoffStatus: {
        isPending: !!handoff,
        requestedAt: handoff?.handoffRequestedAt || undefined,
        reason: handoff?.handoffReason || undefined,
      },
      aiEnabled: canAIResult.canSend,
      lastTransition: assignment?.updatedAt
        ? {
            from: 'Previous',
            to: currentStage?.name || 'Unknown',
            reason: 'Stage transition',
            timestamp: new Date(assignment.updatedAt),
          }
        : undefined,
      classification,
    };
  }

  /**
   * Get formatted AI status for a chat
   */
  async getAIStatus(chatId: string): Promise<AiStatusResult> {
    const chat = await db.query.chats.findFirst({
      where: eq(chats.chatId, chatId),
    });

    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    const userId = chat.userId || 1;

    // 1. Check basic AI permission (Handoff service checks config + paused state)
    const canAIResult = await this.handoffService.canAISend(chatId);

    const result: AiStatusResult = {
      chatId,
      aiEnabled: canAIResult.canSend,
      aiConfigEnabled: canAIResult.configEnabled,
      reason: canAIResult.reason,
      isRateLimited: false,
      rateLimitReset: undefined,
      rateLimitCurrentCount: undefined,
      rateLimitMaxCount: undefined,
    };

    // 2. Check Rate Limits
    if (this.rateLimiter) {
      try {
        // We use checkRateLimit for pre-validation without incrementing
        const rateLimitStatus = await this.rateLimiter.checkRateLimit(
          userId,
          chatId,
          { isAiMessage: true },
        );
        if (!rateLimitStatus.allowed) {
          result.isRateLimited = true;
          result.aiEnabled = false; // Override enablement
          result.reason = 'Rate limit exceeded';
          result.rateLimitReset = rateLimitStatus.resetTime;
          // Extract limits for the smallest window (usually minute or hour) that is blocking
          // or just the first one if multiple
          if (rateLimitStatus.limits && rateLimitStatus.limits.length > 0) {
            // Sort by percent used descending to show the most critical limit
            const criticalLimit = rateLimitStatus.limits.sort(
              (a, b) => b.percentUsed - a.percentUsed,
            )[0];
            result.rateLimitCurrentCount = criticalLimit.current;
            result.rateLimitMaxCount = criticalLimit.max;
          }
        }
      } catch (e) {
        this.logger.error(
          `[Status] Error checking rate limit for ${chatId}`,
          e,
        );
      }
    }

    return result;
  }

  /**
   * Send a reviewed AI response (triggered manually after review)
   */
  async sendReviewedAiResponse(
    userId: number,
    chatId: string,
    content: string,
    mediaAttachment?: any,
    interactiveData?: any,
  ): Promise<void> {
    this.logger.log(
      `[AI Response] Sending reviewed response for chat ${chatId}`,
    );

    // Send the message via WhatsApp service
    if (mediaAttachment) {
      // Logic for media sending would go here
      // For now, we'll focus on text + interactive
      // TODO: Implement full media sending logic similar to processMessage
    }

    // Look up the chat to get the correct senderId and participantPhone
    const chat = await db.query.chats.findFirst({
      where: eq(chats.chatId, chatId),
    });

    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    // Send text message (with optional interactive buttons)
    if (
      interactiveData &&
      interactiveData.buttons &&
      interactiveData.buttons.length > 0
    ) {
      // Send interactive message
      // Note: mapping back from simplified DTO to full structure might be needed
      // For this implementation we'll send as text first if interactive structure is complex
      // or implement basic button sending

      // Sending as text for now to ensure reliability until interactive DTO is fully typed
      await this.whatsappService?.sendMessage(
        {
          to: chat.participantPhone,
          body: content,
          senderId: chat.senderId,
        },
        userId,
      );
    } else {
      await this.whatsappService?.sendMessage(
        {
          to: chat.participantPhone,
          body: content,
          senderId: chat.senderId,
        },
        userId,
      );
    }

    // Record usage for rate limiting
    // We attribute this to the AI even though human reviewed it, as it counts towards the limit
    if (this.rateLimiter) {
      await this.rateLimiter.recordMessage(userId, chatId, {
        isAiMessage: true,
      });
    }

    this.whatsappGateway?.emitAITypingStop(chatId);
  }

  /**
   * Regenerate AI response for a chat
   */
  async regenerateResponse(chatId: string): Promise<void> {
    const chat = await db.query.chats.findFirst({
      where: eq(chats.chatId, chatId),
    });

    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    const userId = chat.userId || 1;

    // Check if we can send (rate limits, paused, etc)
    // 1. Check if AI is paused/handed off
    const canAIResult = await this.handoffService.canAISend(chatId);
    if (!canAIResult.canSend) {
      // If simply paused/disabled, just return/log, or maybe emit a generic error?
      // logic below was mainly primarily checking rate limits via shouldProcessMessage which does both.
      // Let's check rate limits specifically to provide correct feedback.
    }

    if (this.rateLimiter) {
      const rateLimitStatus = await this.rateLimiter.checkRateLimit(
        userId,
        chatId,
        { isAiMessage: true },
      );

      if (!rateLimitStatus.allowed) {
        let currentCount = 0;
        let maxCount = 0;

        if (rateLimitStatus.limits && rateLimitStatus.limits.length > 0) {
          // Sort by percent used descending to show the most critical limit
          const criticalLimit = rateLimitStatus.limits.sort(
            (a, b) => b.percentUsed - a.percentUsed,
          )[0];
          currentCount = criticalLimit.current;
          maxCount = criticalLimit.max;
        }

        this.whatsappGateway?.emitAIRateLimitExceeded({
          chatId,
          currentCount,
          maxCount,
          resetTime: rateLimitStatus.resetTime || new Date(Date.now() + 60000),
        });
        return;
      }
    }

    this.whatsappGateway?.emitAITypingStart(chatId);

    try {
      // Fetch last inbound message to re-process context
      const recentMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.chatId, chatId))
        .orderBy(desc(messages.timestamp))
        .limit(20);

      const lastInbound = recentMessages.find((m) => m.direction === 'inbound');

      if (!lastInbound || !lastInbound.text) {
        this.whatsappGateway?.emitAITypingStop(chatId);
        throw new Error('No inbound message found to regenerate response for');
      }

      if (!this.aiResponseGenerator) {
        this.whatsappGateway?.emitAITypingStop(chatId);
        throw new Error('AI Response Generator not available');
      }

      // Re-classify (lightweight)
      const classification = await this.aiResponseGenerator.classifyMessage(
        lastInbound.text,
        userId,
      );

      // Generate response
      // Note: passing undefined for mediaPreCheck for simple regeneration for now
      // to avoid complex orchestration in this fallback method
      const response = await this.aiResponseGenerator.generateAIResponse(
        chatId,
        lastInbound.text,
        classification,
        userId,
        undefined,
      );

      this.whatsappGateway?.emitAITypingStop(chatId);

      // Handle response (Review or Send)
      if (response && this.aiConfigService) {
        // Check config for review
        const aiConfig = await this.aiConfigService.resolveConfiguration(
          userId,
          chatId,
        );

        if (aiConfig.reviewBeforeSend) {
          this.whatsappGateway?.emitAIPendingReview({
            chatId,
            content: response,
          });
        } else {
          // Look up the chat to get the correct senderId
          const chatData = await db.query.chats.findFirst({
            where: eq(chats.chatId, chatId),
          });

          if (!chatData) {
            throw new Error(`Chat ${chatId} not found`);
          }

          await this.whatsappService?.sendMessage(
            {
              to: chatData.participantPhone,
              body: response,
              senderId: chatData.senderId,
            },
            userId,
          );
          this.rateLimiter?.recordMessage(userId, chatId, {
            isAiMessage: true,
          });
        }
      }
    } catch (error) {
      this.whatsappGateway?.emitAITypingStop(chatId);
      this.logger.error(`Failed to regenerate response for ${chatId}`, error);
      throw error;
    }
  }
}
