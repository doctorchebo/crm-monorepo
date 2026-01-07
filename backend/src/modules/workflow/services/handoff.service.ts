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
import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { HandoffRequest, HandoffStatus, ResolveHandoffRequest } from '../types';

@Injectable()
export class HandoffService {
  private readonly logger = new Logger(HandoffService.name);

  /**
   * Get or create chat stage assignment
   * Creates a minimal assignment if none exists
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
      const [created] = await db
        .insert(chatStageAssignments)
        .values({
          chatId,
          stageId: null as any, // No stage assigned yet
          aiPaused: false,
          awaitingHandoff: false,
        })
        .returning();

      this.logger.debug(`Created stage assignment for chat ${chatId}`);
      return created;
    } catch (error) {
      // Table might not exist yet, return null to trigger fallback
      this.logger.debug(`chat_stage_assignments table not available: ${error}`);
      return null;
    }
  }

  /**
   * Get AI override for a chat (fallback when stage assignments not available)
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

    // Create a new override with AI enabled by default
    const [created] = await db
      .insert(chatAiOverrides)
      .values({
        chatId,
        userId,
        aiEnabled: true,
      })
      .returning();

    this.logger.debug(`Created AI override for chat ${chatId}`);
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
        aiPaused: !(override.aiEnabled ?? true),
        currentStageName: 'No Stage',
      };
    }

    return null;
  }

  /**
   * Pause AI for a chat
   */
  async pauseAI(chatId: string, userId: number): Promise<boolean> {
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
   */
  async resumeAI(chatId: string, userId: number): Promise<boolean> {
    // Try stage assignments first
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

      if (result.length > 0) {
        this.logger.log(`AI resumed for chat ${chatId} by user ${userId}`);
        return true;
      }
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
          aiEnabled: true,
          updatedAt: new Date(),
        })
        .where(eq(chatAiOverrides.chatId, chatId));
    } else {
      await db.insert(chatAiOverrides).values({
        chatId,
        userId,
        aiEnabled: true,
      });
    }

    this.logger.log(
      `AI resumed (via override) for chat ${chatId} by user ${userId}`,
    );
    return true;
  }

  /**
   * Check if AI can send messages for a chat
   * Uses chat_stage_assignments if available, falls back to chat_ai_overrides
   */
  async canAISend(chatId: string): Promise<{
    canSend: boolean;
    reason?: string;
  }> {
    this.logger.debug(`[canAISend] Checking AI status for chat ${chatId}`);

    // Try stage assignments first
    try {
      const [assignment] = await db
        .select()
        .from(chatStageAssignments)
        .where(eq(chatStageAssignments.chatId, chatId))
        .limit(1);

      if (assignment) {
        this.logger.debug(
          `[canAISend] Found stage assignment for chat ${chatId}: aiPaused=${assignment.aiPaused}, awaitingHandoff=${assignment.awaitingHandoff}`,
        );

        if (assignment.aiPaused) {
          return {
            canSend: false,
            reason: 'AI is paused for this chat',
          };
        }

        if (assignment.awaitingHandoff) {
          return {
            canSend: false,
            reason: `Awaiting human handoff: ${assignment.handoffReason || 'No reason specified'}`,
          };
        }

        // Check stage settings if assigned
        if (assignment.stageId) {
          const [stage] = await db
            .select()
            .from(workflowStages)
            .where(eq(workflowStages.id, assignment.stageId))
            .limit(1);

          if (stage) {
            if (!stage.aiAutoReply) {
              return {
                canSend: false,
                reason: `AI auto-reply disabled for stage "${stage.name}"`,
              };
            }

            if (stage.aiHandoffRequired && !assignment.awaitingHandoff) {
              return {
                canSend: false,
                reason: `Stage "${stage.name}" requires human handoff`,
              };
            }
          }
        }

        this.logger.debug(
          `[canAISend] Stage assignment allows AI for chat ${chatId}`,
        );
        return { canSend: true };
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
      this.logger.debug(
        `[canAISend] Found chat override for ${chatId}: aiEnabled=${override.aiEnabled}`,
      );

      if (override.aiEnabled === false) {
        return {
          canSend: false,
          reason: 'AI is disabled for this chat',
        };
      }
      // Override exists with aiEnabled = true
      this.logger.log(
        `[canAISend] AI is enabled for chat ${chatId} via override`,
      );
      return { canSend: true };
    }

    // Default: AI is DISABLED for new chats with no configuration
    // Users must explicitly enable AI per chat for safety
    this.logger.debug(
      `[canAISend] No config found for chat ${chatId}, defaulting to disabled`,
    );
    return {
      canSend: false,
      reason: 'AI not configured for this chat - enable in AI Settings',
    };
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
