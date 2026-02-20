/**
 * Handoff Service
 * Manages human-AI handoff for chats requiring human intervention
 *
 * Features:
 * - Request handoff with reason
 * - Pause AI responses during handoff
 * - Resume AI after human resolves
 * - Override AI replies manually
 *
 * Gracefully handles:
 * - Chat with stage assignment -> uses chat_stage_assignments table
 * - Chat without stage assignment -> uses chat_ai_overrides table
 */

import { db } from '@database/db.connection';
import {
  chatAiOverrides,
  chatStageAssignments,
  chatStageHistory,
  workflowStages,
} from '@database/schema';
import { AuditWriteService } from '@modules/audit/audit-write.service';
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AI_DEFAULTS,
  getDefaultAiOverrideValues,
  getDefaultChatStageAssignmentValues,
} from '@shared/constants/ai-defaults';
import { eq } from 'drizzle-orm';
import { AiConfigurationService } from './ai-configuration.service';
import { AiResumptionContextService } from './ai-resumption-context.service';
import {
  HandoffRequest,
  HandoffStatus,
  ResolveHandoffRequest,
} from './handoff.types';
import { RateLimiterService } from './rate-limiter.service';

@Injectable()
export class HandoffService {
  private readonly logger = new Logger(HandoffService.name);

  constructor(
    private readonly rateLimiter: RateLimiterService,
    private readonly eventEmitter: EventEmitter2,
    private readonly aiConfigService: AiConfigurationService,
    private readonly auditWriteService: AuditWriteService,
    @Optional()
    @Inject(forwardRef(() => AiResumptionContextService))
    private readonly aiContextService?: AiResumptionContextService,
  ) {}

  /**
   * Get or create chat stage assignment
   * Creates a minimal assignment if none exists
   * Uses user's configured defaults for AI behavior, falling back to system defaults
   */
  private async getOrCreateAssignment(chatId: string, userId?: number) {
    try {
      const [existing] = await db
        .select()
        .from(chatStageAssignments)
        .where(eq(chatStageAssignments.chatId, chatId))
        .limit(1);

      if (existing) {
        return existing;
      }

      // Create a new assignment without a stage (stage-less workflow)
      // Fetch user's AI defaults if userId is provided, otherwise use system defaults
      let userDefaults: {
        defaultAiRepliesEnabled: boolean;
        defaultAiPaused: boolean;
      } | null = null;
      if (userId) {
        try {
          userDefaults = await this.aiConfigService.getUserAiDefaults(userId);
        } catch (error) {
          this.logger.debug(
            `Could not fetch user AI defaults for user ${userId}, using system defaults`,
          );
        }
      }

      const defaults = getDefaultChatStageAssignmentValues(userDefaults);
      const [created] = await db
        .insert(chatStageAssignments)
        .values({
          chatId,
          stageId: null as any, // No stage assigned yet
          aiPaused: defaults.aiPaused,
          awaitingHandoff: defaults.awaitingHandoff,
        })
        .returning();

      this.logger.debug(
        `Created stage assignment for chat ${chatId} with aiPaused=${defaults.aiPaused} (using ${userDefaults ? 'user' : 'system'} defaults)`,
      );
      return created;
    } catch (error) {
      // Table might not exist yet, return null to trigger fallback
      this.logger.debug(`chat_stage_assignments table not available: ${error}`);
      return null;
    }
  }

  /**
   * Get AI override for a chat (fallback when stage assignments not available)
   * Uses user's configured defaults for AI behavior, falling back to system defaults
   */
  private async getOrCreateAiOverride(chatId: string, userId: number) {
    const [existing] = await db
      .select()
      .from(chatAiOverrides)
      .where(eq(chatAiOverrides.chatId, chatId))
      .limit(1);

    if (existing) {
      return existing;
    }

    // Fetch user's AI defaults
    let userDefaults: {
      defaultAiRepliesEnabled: boolean;
      defaultAiPaused: boolean;
    } | null = null;
    try {
      userDefaults = await this.aiConfigService.getUserAiDefaults(userId);
    } catch (error) {
      this.logger.debug(
        `Could not fetch user AI defaults for user ${userId}, using system defaults`,
      );
    }

    // Create a new override using user's configured defaults
    const defaults = getDefaultAiOverrideValues(userDefaults);
    const [created] = await db
      .insert(chatAiOverrides)
      .values({
        chatId,
        userId,
        aiEnabled: defaults.aiEnabled,
      })
      .returning();

    this.logger.debug(
      `Created AI override for chat ${chatId} with aiEnabled=${defaults.aiEnabled} (using ${userDefaults ? 'user' : 'system'} defaults)`,
    );
    return created;
  }

  /**
   * Request a human handoff for a chat
   */
  async requestHandoff(
    userId: number,
    request: HandoffRequest,
  ): Promise<HandoffStatus> {
    const { chatId, reason, pauseAi = true } = request;

    // Try to use stage assignments first
    const assignment = await this.getOrCreateAssignment(chatId, userId);

    if (assignment) {
      // Update assignment with handoff request
      const [updated] = await db
        .update(chatStageAssignments)
        .set({
          awaitingHandoff: true,
          handoffRequestedAt: new Date(),
          handoffReason: reason,
          aiPaused: pauseAi,
          aiPausedAt: pauseAi ? new Date() : assignment.aiPausedAt,
          aiPausedBy: pauseAi ? userId : assignment.aiPausedBy,
          updatedAt: new Date(),
        })
        .where(eq(chatStageAssignments.chatId, chatId))
        .returning();

      // Log the handoff request in history (if table exists)
      try {
        await db.insert(chatStageHistory).values({
          chatId,
          fromStageId: assignment.stageId,
          toStageId: assignment.stageId,
          triggerType: 'system',
          triggerMessageId: request.messageId,
          reason: `Handoff requested: ${reason}`,
          metadata: { handoffRequested: true, pauseAi },
        });
      } catch (error) {
        this.logger.debug(`Could not log to history: ${error}`);
      }

      this.logger.log(`Handoff requested for chat ${chatId}: ${reason}`);

      // Write to unified audit log (dual-write alongside chatStageHistory)
      await this.auditWriteService.logHandoffRequested({
        userId,
        chatId,
        description: `Handoff requested: ${reason}`,
        metadata: {
          handoffRequested: true,
          pauseAi,
          stageId: assignment.stageId,
          messageId: request.messageId,
        },
      });

      // Get stage info if available
      let stageName = 'No Stage';
      if (updated.stageId) {
        const [stage] = await db
          .select()
          .from(workflowStages)
          .where(eq(workflowStages.id, updated.stageId))
          .limit(1);
        stageName = stage?.name || 'Unknown';
      }

      return {
        chatId,
        awaitingHandoff: true,
        handoffRequestedAt: updated.handoffRequestedAt || undefined,
        handoffReason: updated.handoffReason || undefined,
        aiPaused: updated.aiPaused || false,
        aiPausedAt: updated.aiPausedAt || undefined,
        aiPausedBy: updated.aiPausedBy || undefined,
        currentStageId: updated.stageId,
        currentStageName: stageName,
      };
    }

    // Fallback: use chat_ai_overrides
    await db
      .update(chatAiOverrides)
      .set({
        aiEnabled: !pauseAi,
        customInstructions: reason,
        updatedAt: new Date(),
      })
      .where(eq(chatAiOverrides.chatId, chatId));

    this.logger.log(
      `Handoff requested (via override) for chat ${chatId}: ${reason}`,
    );

    return {
      chatId,
      awaitingHandoff: true,
      handoffReason: reason,
      aiPaused: pauseAi,
      currentStageName: 'No Stage',
    };
  }

  /**
   * Resolve a handoff and optionally resume AI
   */
  async resolveHandoff(request: ResolveHandoffRequest): Promise<HandoffStatus> {
    const {
      chatId,
      userId,
      resumeAi = false,
      newStageId,
      resolution,
    } = request;

    // Try stage assignments first
    try {
      const [assignment] = await db
        .select()
        .from(chatStageAssignments)
        .where(eq(chatStageAssignments.chatId, chatId))
        .limit(1);

      if (assignment) {
        const targetStageId = newStageId || assignment.stageId;

        // Update assignment
        const [updated] = await db
          .update(chatStageAssignments)
          .set({
            stageId: targetStageId,
            awaitingHandoff: false,
            handoffRequestedAt: null,
            handoffReason: null,
            aiPaused: resumeAi ? false : assignment.aiPaused,
            aiPausedAt: resumeAi ? null : assignment.aiPausedAt,
            aiPausedBy: resumeAi ? null : assignment.aiPausedBy,
            updatedAt: new Date(),
          })
          .where(eq(chatStageAssignments.chatId, chatId))
          .returning();

        // Log the resolution (if table exists)
        try {
          await db.insert(chatStageHistory).values({
            chatId,
            fromStageId: assignment.stageId,
            toStageId: targetStageId,
            triggerType: 'human',
            triggeredBy: userId,
            reason: resolution || 'Handoff resolved',
            metadata: {
              handoffResolved: true,
              resumeAi,
              previousHandoffReason: assignment.handoffReason,
            },
          });
        } catch (historyError) {
          this.logger.debug(`Could not log to history: ${historyError}`);
        }

        this.logger.log(
          `Handoff resolved for chat ${chatId} by user ${userId}`,
        );

        // Write to unified audit log (dual-write alongside chatStageHistory)
        await this.auditWriteService.logHandoffResolved({
          userId,
          chatId,
          description: resolution || 'Handoff resolved',
          metadata: {
            handoffResolved: true,
            resumeAi,
            previousHandoffReason: assignment.handoffReason,
            fromStageId: assignment.stageId,
            toStageId: targetStageId,
          },
        });

        // Get stage info
        let stageName = 'No Stage';
        if (updated.stageId) {
          const [stage] = await db
            .select()
            .from(workflowStages)
            .where(eq(workflowStages.id, updated.stageId))
            .limit(1);
          stageName = stage?.name || 'Unknown';
        }

        return {
          chatId,
          awaitingHandoff: false,
          aiPaused: updated.aiPaused || false,
          currentStageId: updated.stageId,
          currentStageName: stageName,
        };
      }
    } catch (error) {
      this.logger.debug(`Stage assignments not available: ${error}`);
    }

    // Fallback: use chat_ai_overrides
    if (resumeAi) {
      await db
        .update(chatAiOverrides)
        .set({
          aiEnabled: true,
          updatedAt: new Date(),
        })
        .where(eq(chatAiOverrides.chatId, chatId));
    }

    this.logger.log(
      `Handoff resolved (via override) for chat ${chatId} by user ${userId}`,
    );

    return {
      chatId,
      awaitingHandoff: false,
      aiPaused: !resumeAi,
      currentStageName: 'No Stage',
    };
  }

  /**
   * Get handoff status for a chat
   */
  async getHandoffStatus(chatId: string): Promise<HandoffStatus | null> {
    // Try stage assignments first
    try {
      const [assignment] = await db
        .select()
        .from(chatStageAssignments)
        .where(eq(chatStageAssignments.chatId, chatId))
        .limit(1);

      if (assignment) {
        let stageName = 'No Stage';
        if (assignment.stageId) {
          const [stage] = await db
            .select()
            .from(workflowStages)
            .where(eq(workflowStages.id, assignment.stageId))
            .limit(1);
          stageName = stage?.name || 'Unknown';
        }

        return {
          chatId,
          awaitingHandoff: assignment.awaitingHandoff || false,
          handoffRequestedAt: assignment.handoffRequestedAt || undefined,
          handoffReason: assignment.handoffReason || undefined,
          aiPaused: assignment.aiPaused || false,
          aiPausedAt: assignment.aiPausedAt || undefined,
          aiPausedBy: assignment.aiPausedBy || undefined,
          currentStageId: assignment.stageId,
          currentStageName: stageName,
        };
      }
    } catch (error) {
      this.logger.debug(`Stage assignments not available: ${error}`);
    }

    // Fallback: check chat_ai_overrides
    const [override] = await db
      .select()
      .from(chatAiOverrides)
      .where(eq(chatAiOverrides.chatId, chatId))
      .limit(1);

    if (override) {
      return {
        chatId,
        awaitingHandoff: false,
        // Derive aiPaused from override.aiEnabled:
        // If aiEnabled=true, user wants AI active -> aiPaused=false
        // If aiEnabled=false, user disabled AI -> aiPaused=true
        aiPaused: !override.aiEnabled,
        currentStageName: 'No Stage',
      };
    }

    return null;
  }

  /**
   * Pause AI for a chat
   * Also captures conversation context for future AI resumption
   */
  async pauseAI(chatId: string, userId: number): Promise<boolean> {
    // Capture context in the background (don't block pause operation)
    if (this.aiContextService) {
      this.aiContextService
        .captureContextOnPause(chatId, userId)
        .catch((err) => {
          this.logger.warn(
            `[Context] Failed to capture context on pause: ${err.message}`,
          );
        });
    }

    // Try stage assignments first
    try {
      const result = await db
        .update(chatStageAssignments)
        .set({
          aiPaused: true,
          aiPausedAt: new Date(),
          aiPausedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(chatStageAssignments.chatId, chatId))
        .returning({ id: chatStageAssignments.id });

      if (result.length > 0) {
        this.logger.log(`AI paused for chat ${chatId} by user ${userId}`);

        return true;
      }

      // No existing assignment, create one
      await db.insert(chatStageAssignments).values({
        chatId,
        stageId: null as any,
        aiPaused: true,
        aiPausedAt: new Date(),
        aiPausedBy: userId,
      });

      this.logger.log(
        `AI paused for chat ${chatId} by user ${userId} (new assignment)`,
      );

      return true;
    } catch (error) {
      this.logger.debug(
        `Stage assignments not available, using override: ${error}`,
      );
    }

    // Fallback: use chat_ai_overrides
    const [existing] = await db
      .select()
      .from(chatAiOverrides)
      .where(eq(chatAiOverrides.chatId, chatId))
      .limit(1);

    if (existing) {
      await db
        .update(chatAiOverrides)
        .set({
          aiEnabled: false,
          updatedAt: new Date(),
        })
        .where(eq(chatAiOverrides.chatId, chatId));
    } else {
      await db.insert(chatAiOverrides).values({
        chatId,
        userId,
        aiEnabled: false,
      });
    }

    this.logger.log(
      `AI paused (via override) for chat ${chatId} by user ${userId}`,
    );
    return true;
  }

  /**
   * Resume AI for a chat
   * Sets BOTH assignment.aiPaused=false AND override.aiEnabled=true
   * (canAISend requires both configEnabled AND !aiPaused)
   * Also stores the selected goal type for context-aware responses
   */
  async resumeAI(
    chatId: string,
    userId: number,
    goalType?: string,
    goalDescription?: string,
  ): Promise<{ success: boolean }> {
    // 1. First, ensure override has aiEnabled=true (sets configEnabled in canAISend)
    const [existingOverride] = await db
      .select()
      .from(chatAiOverrides)
      .where(eq(chatAiOverrides.chatId, chatId))
      .limit(1);

    if (existingOverride) {
      await db
        .update(chatAiOverrides)
        .set({
          aiEnabled: true,
          goalType: goalType || existingOverride.goalType,
          goalDescription: goalDescription || existingOverride.goalDescription,
          updatedAt: new Date(),
        })
        .where(eq(chatAiOverrides.chatId, chatId));
    } else {
      await db.insert(chatAiOverrides).values({
        chatId,
        userId,
        aiEnabled: true,
        goalType: goalType || null,
        goalDescription: goalDescription || null,
      });
    }

    // 2. Then, ensure assignment has aiPaused=false
    try {
      const result = await db
        .update(chatStageAssignments)
        .set({
          aiPaused: false,
          aiPausedAt: null,
          aiPausedBy: null,
          updatedAt: new Date(),
        })
        .where(eq(chatStageAssignments.chatId, chatId))
        .returning({ id: chatStageAssignments.id });

      if (result.length === 0) {
        // No existing assignment, create one with AI unpaused
        await db.insert(chatStageAssignments).values({
          chatId,
          stageId: null as any,
          aiPaused: false,
          aiPausedAt: null,
          aiPausedBy: null,
        });

        this.logger.log(
          `AI resumed for chat ${chatId} by user ${userId} (new assignment + override)`,
        );
      } else {
        this.logger.log(
          `AI resumed for chat ${chatId} by user ${userId} (updated assignment + override)`,
        );
      }
    } catch (error) {
      // Assignment table operation failed, but override is set - AI will still be enabled
      this.logger.debug(
        `Stage assignment update failed, but override is set: ${error}`,
      );
    }

    return { success: true };
  }

  /**
   * Check if AI can send messages for a chat
   * Uses chat_stage_assignments if available, falls back to chat_ai_overrides
   */
  /**
   * Check if AI can send messages for a chat
   * explicit checks: Override Disabled -> Assignment Paused/Handoff -> Stage Rules
   */
  async canAISend(chatId: string): Promise<{
    canSend: boolean;
    configEnabled: boolean; // Added: Master config switch state
    reason?: string;
    isRateLimited?: boolean;
    rateLimitReset?: Date;
    rateLimitCurrentCount?: number;
    rateLimitMaxCount?: number;
  }> {
    this.logger.log(`[canAISend] Checking AI status for chat ${chatId}`);

    // 1. Check Chat Override FIRST (highest priority for Disabling)
    const [override] = await db
      .select()
      .from(chatAiOverrides)
      .where(eq(chatAiOverrides.chatId, chatId))
      .limit(1);

    // Default to AI_DEFAULTS.AI_ENABLED if no override exists (AI capability is enabled by default)
    // The actual AI response is controlled by aiPaused in stage assignments
    const configEnabled = override?.aiEnabled ?? AI_DEFAULTS.AI_ENABLED;

    this.logger.log(
      `[canAISend] Override: ${JSON.stringify(override)}, configEnabled: ${configEnabled}`,
    );

    if (override && override.aiEnabled === false) {
      this.logger.log(`[canAISend] BLOCKED: override.aiEnabled is false`);
      return {
        canSend: false,
        configEnabled: false,
        reason: 'AI is disabled for this chat (User Setting)',
      };
    }

    // 2. Check Stage Assignments (Paused, Handoff)
    let hasAssignment = false;
    let isExplicitlyUnpaused = false;

    try {
      const [assignment] = await db
        .select()
        .from(chatStageAssignments)
        .where(eq(chatStageAssignments.chatId, chatId))
        .limit(1);

      this.logger.log(`[canAISend] Assignment: ${JSON.stringify(assignment)}`);

      if (assignment) {
        hasAssignment = true;
        // Handoff always takes precedence
        if (assignment.awaitingHandoff) {
          this.logger.log(`[canAISend] BLOCKED: awaitingHandoff`);
          return {
            canSend: false,
            configEnabled,
            reason: `Awaiting human handoff: ${assignment.handoffReason || 'No reason specified'}`,
          };
        }

        // Check if AI is paused
        if (assignment.aiPaused) {
          this.logger.log(`[canAISend] BLOCKED: aiPaused is true`);
          return {
            canSend: false,
            configEnabled,
            reason: 'AI is paused for this chat',
          };
        }

        // AI is explicitly unpaused (aiPaused is false)
        isExplicitlyUnpaused = assignment.aiPaused === false;
      }
    } catch (error) {
      this.logger.error(`Error checking stage assignments: ${error}`);
      // FAIL CLOSED: If we can't verify the assignment status, assume we shouldn't send.
      return {
        canSend: false,
        configEnabled, // We know this from Step 1
        reason: 'Error verifying chat status',
      };
    }

    this.logger.log(
      `[canAISend] hasAssignment: ${hasAssignment}, isExplicitlyUnpaused: ${isExplicitlyUnpaused}`,
    );

    // If AI is enabled in config but no assignment exists,
    // default to paused - user must explicitly unpause AI via the toggle switch
    // This implements the "AI Reply ON, AI Paused TRUE" default behavior
    if (configEnabled && !hasAssignment) {
      this.logger.log(`[canAISend] BLOCKED: no assignment exists`);
      return {
        canSend: false,
        configEnabled,
        reason: 'AI is paused for this chat (default state - toggle to enable)',
      };
    }

    // 3. Check Rate Limits (Pre-send check)
    // We assume userId is needed for rate limiter, but canAISend is often called by system
    // We'll try to get the userId from the override or assignment if possible, or fallback
    const userId = override?.userId || 1; // Fallback to 1 if unknown (robustness needed here ideally)

    // Note: We're checking potential AIReply, so isAiMessage=true
    const rateLimit = await this.rateLimiter.checkRateLimit(userId, chatId, {
      isAiMessage: true,
    });

    if (!rateLimit.allowed) {
      // Extract hourly limit info for frontend banner
      const hourLimit = rateLimit.limits.find((l) => l.type === 'hour');
      return {
        canSend: false,
        configEnabled,
        reason: rateLimit.reason,
        isRateLimited: true,
        rateLimitReset: rateLimit.resetTime,
        rateLimitCurrentCount: hourLimit?.current ?? 0,
        rateLimitMaxCount: hourLimit?.max ?? 0,
      };
    }

    // 4. Check Assignment/Stage Details again for other blocks
    try {
      const [assignment] = await db
        .select()
        .from(chatStageAssignments)
        .where(eq(chatStageAssignments.chatId, chatId))
        .limit(1);

      if (assignment && assignment.stageId) {
        const [stage] = await db
          .select()
          .from(workflowStages)
          .where(eq(workflowStages.id, assignment.stageId))
          .limit(1);

        if (stage) {
          // Stage auto-reply (unless explicitly enabled via override)
          if (!stage.aiAutoReply && override?.aiEnabled !== true) {
            return {
              canSend: false,
              configEnabled,
              reason: `AI auto-reply disabled for stage "${stage.name}"`,
            };
          }

          // Stage requires handoff (unless user explicitly enabled AI via toggle)
          if (
            stage.aiHandoffRequired &&
            !assignment.awaitingHandoff &&
            override?.aiEnabled !== true
          ) {
            return {
              canSend: false,
              configEnabled,
              reason: `Stage "${stage.name}" requires human handoff`,
            };
          }
        }
      }
    } catch (error) {
      // Ignore
    }

    // 5. Final Decision: AI can send if:
    //    - Config is enabled (aiEnabled = true, default for new chats)
    //    - Assignment exists with aiPaused = false (user explicitly unpaused)
    // Note: We reach here only if all other checks passed
    const canSend = configEnabled && hasAssignment && isExplicitlyUnpaused;

    const finalResult = {
      canSend,
      configEnabled,
      reason: canSend
        ? undefined
        : !configEnabled
          ? 'AI is disabled for this chat - enable in AI Settings'
          : !hasAssignment
            ? 'AI is paused for this chat (default state - toggle to enable)'
            : 'AI is paused for this chat',
    };

    if (finalResult.canSend) {
      this.logger.debug(
        `[canAISend] Allowed - configEnabled: ${configEnabled}, hasAssignment: ${hasAssignment}, isExplicitlyUnpaused: ${isExplicitlyUnpaused}`,
      );
    } else {
      this.logger.debug(`[canAISend] Blocked. Reason: ${finalResult.reason}`);
    }

    return finalResult;
  }

  /**
   * Get all chats awaiting handoff for a user
   */
  async getChatsAwaitingHandoff(userId: number): Promise<
    Array<{
      chatId: string;
      stageId: string | null;
      stageName: string;
      handoffRequestedAt: Date | null;
      handoffReason: string | null;
    }>
  > {
    try {
      const results = await db
        .select({
          chatId: chatStageAssignments.chatId,
          stageId: chatStageAssignments.stageId,
          stageName: workflowStages.name,
          handoffRequestedAt: chatStageAssignments.handoffRequestedAt,
          handoffReason: chatStageAssignments.handoffReason,
        })
        .from(chatStageAssignments)
        .leftJoin(
          workflowStages,
          eq(chatStageAssignments.stageId, workflowStages.id),
        )
        .where(eq(chatStageAssignments.awaitingHandoff, true));

      return results.map((r) => ({
        ...r,
        stageName: r.stageName || 'No Stage',
      }));
    } catch (error) {
      this.logger.debug(`Could not query awaiting handoffs: ${error}`);
      return [];
    }
  }
}
