/**
 * Stage Service
 * Manages pipeline stages (Kanban board stages)
 *
 * Decoupled from the workflow module — this is a standalone service
 * for pipeline stage CRUD, chat transitions, and stage history.
 *
 * Features:
 * - CRUD operations for stages
 * - Default stage initialization
 * - Stage ordering and configuration
 * - Chat-to-stage assignments
 * - Stage transition history / audit trail
 */

import { db } from '@database/db.connection';
import {
  aiConfigurations,
  chatAiOverrides,
  chatStageAssignments,
  chatStageHistory,
  chats,
  teamMembers,
  users,
  workflowStages,
} from '@database/schema';
import { ChatVisibilityService } from '@modules/chats/services/chat-visibility.service';
import { Injectable, Logger } from '@nestjs/common';
import { getDefaultChatStageAssignmentValues } from '@shared/constants/ai-defaults';
import { and, asc, desc, eq } from 'drizzle-orm';
import { AuditWriteService } from '../../audit/audit-write.service';
import {
  CreateStageRequest,
  DEFAULT_PIPELINE_STAGES,
  StageConfig,
  UpdateStageRequest,
} from '../types/stages.types';

@Injectable()
export class StageService {
  private readonly logger = new Logger(StageService.name);

  constructor(
    private readonly chatVisibilityService: ChatVisibilityService,
    private readonly auditWriteService: AuditWriteService,
  ) {}

  // ==========================================================================
  // Internal Helpers
  // ==========================================================================

  /**
   * Resolve the correct user ID for stage operations.
   * If the user is an agent in a team, returns the Team Owner's user ID.
   */
  private async resolveStageOwnerId(userId: number): Promise<number> {
    const membership = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.isActive, true),
      ),
      with: {
        team: true,
      },
    });

    if (!membership) return userId;
    if (membership.role === 'owner') return userId;

    const ownerMembership = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.teamId, membership.teamId),
        eq(teamMembers.role, 'owner'),
        eq(teamMembers.isActive, true),
      ),
    });

    return ownerMembership ? ownerMembership.userId : userId;
  }

  /**
   * Get user info for activity logging
   */
  private async getUserInfo(
    userId: number,
  ): Promise<{ name: string | null; teamId: number | null }> {
    const membership = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.isActive, true),
      ),
      with: {
        user: {
          columns: { name: true },
        },
      },
    });

    return {
      name: membership?.user?.name ?? null,
      teamId: membership?.teamId ?? null,
    };
  }

  /**
   * Get next available sort order for a user's stages
   */
  private async getNextSortOrder(userId: number): Promise<number> {
    const stages = await db
      .select({ sortOrder: workflowStages.sortOrder })
      .from(workflowStages)
      .where(eq(workflowStages.userId, userId))
      .orderBy(asc(workflowStages.sortOrder));

    if (stages.length === 0) return 0;
    return Math.max(...stages.map((s) => s.sortOrder)) + 1;
  }

  /**
   * Get user's AI defaults for new chat stage assignments.
   * Inlined from AiConfigurationService to avoid cross-module dependency.
   */
  private async getUserAiDefaults(
    userId: number,
  ): Promise<{ defaultAiRepliesEnabled: boolean; defaultAiPaused: boolean }> {
    try {
      const [config] = await db
        .select({
          defaultAiRepliesEnabled: aiConfigurations.defaultAiRepliesEnabled,
          defaultAiPaused: aiConfigurations.defaultAiPaused,
        })
        .from(aiConfigurations)
        .where(eq(aiConfigurations.userId, userId))
        .limit(1);

      if (!config) {
        return { defaultAiRepliesEnabled: false, defaultAiPaused: true };
      }

      return {
        defaultAiRepliesEnabled: config.defaultAiRepliesEnabled ?? false,
        defaultAiPaused: config.defaultAiPaused ?? true,
      };
    } catch {
      return { defaultAiRepliesEnabled: false, defaultAiPaused: true };
    }
  }

  /**
   * Map a raw DB stage row to a StageConfig
   */
  private mapStageConfig(
    stage: typeof workflowStages.$inferSelect,
  ): StageConfig {
    return {
      id: stage.id,
      name: stage.name,
      description: stage.description || undefined,
      color: stage.color || '#3b82f6',
      icon: stage.icon || undefined,
      sortOrder: stage.sortOrder,
      isDefault: stage.isDefault || false,
      isFinal: stage.isFinal || false,
      aiAutoReply: stage.aiAutoReply ?? true,
      aiHandoffRequired: stage.aiHandoffRequired || false,
    };
  }

  // ==========================================================================
  // Stage CRUD
  // ==========================================================================

  /**
   * Get all stages for a user (or their team owner)
   */
  async getStages(userId: number): Promise<StageConfig[]> {
    const ownerId = await this.resolveStageOwnerId(userId);

    const stages = await db
      .select()
      .from(workflowStages)
      .where(
        and(
          eq(workflowStages.userId, ownerId),
          eq(workflowStages.isActive, true),
        ),
      )
      .orderBy(asc(workflowStages.sortOrder));

    return stages.map((s) => this.mapStageConfig(s));
  }

  /**
   * Get a single stage by ID with ownership check
   */
  async getStage(stageId: string, userId: number): Promise<StageConfig | null> {
    const ownerId = await this.resolveStageOwnerId(userId);

    const [stage] = await db
      .select()
      .from(workflowStages)
      .where(
        and(eq(workflowStages.id, stageId), eq(workflowStages.userId, ownerId)),
      )
      .limit(1);

    if (!stage) return null;
    return this.mapStageConfig(stage);
  }

  /**
   * Get a stage by ID (without userId check — for internal use)
   */
  async getStageById(stageId: string): Promise<StageConfig | null> {
    try {
      const [stage] = await db
        .select()
        .from(workflowStages)
        .where(eq(workflowStages.id, stageId))
        .limit(1);

      if (!stage) return null;
      return this.mapStageConfig(stage);
    } catch (error) {
      this.logger.debug(`Could not query stage: ${error}`);
      return null;
    }
  }

  /**
   * Get the default stage for a user (or team owner)
   */
  async getDefaultStage(userId: number): Promise<StageConfig | null> {
    const ownerId = await this.resolveStageOwnerId(userId);

    const [stage] = await db
      .select()
      .from(workflowStages)
      .where(
        and(
          eq(workflowStages.userId, ownerId),
          eq(workflowStages.isDefault, true),
          eq(workflowStages.isActive, true),
        ),
      )
      .limit(1);

    if (stage) return this.mapStageConfig(stage);

    // Fallback: first active stage
    const [firstStage] = await db
      .select()
      .from(workflowStages)
      .where(
        and(
          eq(workflowStages.userId, ownerId),
          eq(workflowStages.isActive, true),
        ),
      )
      .orderBy(asc(workflowStages.sortOrder))
      .limit(1);

    if (!firstStage) return null;
    return this.mapStageConfig(firstStage);
  }

  /**
   * Create a new stage
   */
  async createStage(
    userId: number,
    request: CreateStageRequest,
  ): Promise<StageConfig> {
    const ownerId = await this.resolveStageOwnerId(userId);
    const userInfo = await this.getUserInfo(userId);

    // If this is set as default, unset other defaults
    if (request.isDefault) {
      await db
        .update(workflowStages)
        .set({ isDefault: false })
        .where(eq(workflowStages.userId, ownerId));
    }

    const sortOrder =
      request.sortOrder ?? (await this.getNextSortOrder(ownerId));

    const [stage] = await db
      .insert(workflowStages)
      .values({
        userId: ownerId,
        name: request.name,
        description: request.description,
        color: request.color || '#3b82f6',
        icon: request.icon,
        sortOrder,
        isDefault: request.isDefault || false,
        isFinal: request.isFinal || false,
        aiAutoReply: request.aiAutoReply ?? true,
        aiHandoffRequired: request.aiHandoffRequired || false,
        isActive: true,
      })
      .returning();

    this.logger.log(`Created stage "${request.name}" for user ${userId}`);

    await this.auditWriteService.logStageCreated({
      userId,
      userName: userInfo.name || 'Unknown User',
      teamId: userInfo.teamId ?? undefined,
      entityId: stage.id,
      entityName: stage.name,
      metadata: {
        name: stage.name,
        description: stage.description,
        color: stage.color,
        sortOrder: stage.sortOrder,
        isDefault: stage.isDefault,
        isFinal: stage.isFinal,
        aiAutoReply: stage.aiAutoReply,
        aiHandoffRequired: stage.aiHandoffRequired,
      },
    });

    return this.mapStageConfig(stage);
  }

  /**
   * Update a stage
   */
  async updateStage(
    stageId: string,
    userId: number,
    request: UpdateStageRequest,
  ): Promise<StageConfig | null> {
    const ownerId = await this.resolveStageOwnerId(userId);
    const userInfo = await this.getUserInfo(userId);

    const [previousStage] = await db
      .select()
      .from(workflowStages)
      .where(
        and(eq(workflowStages.id, stageId), eq(workflowStages.userId, ownerId)),
      )
      .limit(1);

    if (!previousStage) return null;

    const previousState = {
      name: previousStage.name,
      description: previousStage.description,
      color: previousStage.color,
      sortOrder: previousStage.sortOrder,
      isDefault: previousStage.isDefault,
      isFinal: previousStage.isFinal,
      aiAutoReply: previousStage.aiAutoReply,
      aiHandoffRequired: previousStage.aiHandoffRequired,
    };

    if (request.isDefault) {
      await db
        .update(workflowStages)
        .set({ isDefault: false })
        .where(eq(workflowStages.userId, ownerId));
    }

    const [stage] = await db
      .update(workflowStages)
      .set({
        ...request,
        updatedAt: new Date(),
      })
      .where(
        and(eq(workflowStages.id, stageId), eq(workflowStages.userId, ownerId)),
      )
      .returning();

    if (!stage) return null;

    this.logger.log(`Updated stage ${stageId} for user ${userId}`);

    const newState = {
      name: stage.name,
      description: stage.description,
      color: stage.color,
      sortOrder: stage.sortOrder,
      isDefault: stage.isDefault,
      isFinal: stage.isFinal,
      aiAutoReply: stage.aiAutoReply,
      aiHandoffRequired: stage.aiHandoffRequired,
    };

    await this.auditWriteService.logStageUpdated({
      userId,
      userName: userInfo.name || 'Unknown User',
      teamId: userInfo.teamId ?? undefined,
      entityId: stage.id,
      entityName: stage.name,
      changes: this.auditWriteService.buildChanges(previousState, newState),
      metadata: { previousState, newState },
    });

    return this.mapStageConfig(stage);
  }

  /**
   * Delete a stage (soft delete)
   */
  async deleteStage(
    stageId: string,
    userId: number,
    moveToStageId?: string,
  ): Promise<boolean> {
    const ownerId = await this.resolveStageOwnerId(userId);
    const userInfo = await this.getUserInfo(userId);

    const [stageToDelete] = await db
      .select()
      .from(workflowStages)
      .where(
        and(eq(workflowStages.id, stageId), eq(workflowStages.userId, ownerId)),
      )
      .limit(1);

    if (!stageToDelete) return false;

    const assignments = await db
      .select()
      .from(chatStageAssignments)
      .where(eq(chatStageAssignments.stageId, stageId));

    let targetStageName: string | undefined;
    if (assignments.length > 0) {
      const targetStageId =
        moveToStageId ||
        (await this.getDefaultStage(ownerId).then((s) => s?.id));

      if (!targetStageId) {
        throw new Error(
          'Cannot delete stage: no target stage for existing chats',
        );
      }

      const [targetStage] = await db
        .select({ name: workflowStages.name })
        .from(workflowStages)
        .where(eq(workflowStages.id, targetStageId))
        .limit(1);
      targetStageName = targetStage?.name;

      await db
        .update(chatStageAssignments)
        .set({ stageId: targetStageId, updatedAt: new Date() })
        .where(eq(chatStageAssignments.stageId, stageId));
    }

    const result = await db
      .update(workflowStages)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(eq(workflowStages.id, stageId), eq(workflowStages.userId, ownerId)),
      )
      .returning({ id: workflowStages.id });

    if (result.length > 0) {
      await this.auditWriteService.logStageDeleted({
        userId,
        userName: userInfo.name || 'Unknown User',
        teamId: userInfo.teamId ?? undefined,
        entityId: stageId,
        entityName: stageToDelete.name,
        metadata: {
          name: stageToDelete.name,
          description: stageToDelete.description,
          color: stageToDelete.color,
          sortOrder: stageToDelete.sortOrder,
          isDefault: stageToDelete.isDefault,
          isFinal: stageToDelete.isFinal,
          movedChatsCount: assignments.length,
          targetStageName,
        },
      });
    }

    return result.length > 0;
  }

  /**
   * Reorder stages
   */
  async reorderStages(
    userId: number,
    stageOrder: string[],
  ): Promise<StageConfig[]> {
    const ownerId = await this.resolveStageOwnerId(userId);
    const userInfo = await this.getUserInfo(userId);

    for (let i = 0; i < stageOrder.length; i++) {
      await db
        .update(workflowStages)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(
          and(
            eq(workflowStages.id, stageOrder[i]),
            eq(workflowStages.userId, ownerId),
          ),
        );
    }

    await this.auditWriteService.logStageReordered({
      userId,
      userName: userInfo.name || 'Unknown User',
      teamId: userInfo.teamId ?? undefined,
      entityId: 'batch',
      metadata: { stageIds: stageOrder, newOrder: stageOrder },
    });

    return this.getStages(userId);
  }

  /**
   * Initialize default stages for a user
   */
  async initializeDefaultStages(userId: number): Promise<StageConfig[]> {
    const existing = await this.getStages(userId);
    if (existing.length > 0) {
      return existing;
    }

    for (const stageConfig of DEFAULT_PIPELINE_STAGES) {
      await this.createStage(userId, stageConfig);
    }

    this.logger.log(`Initialized default stages for user ${userId}`);
    return this.getStages(userId);
  }

  // ==========================================================================
  // Chat Stage Assignments
  // ==========================================================================

  /**
   * Get current stage assignment for a chat
   */
  async getChatStage(
    chatId: string,
  ): Promise<typeof chatStageAssignments.$inferSelect | null> {
    try {
      const [assignment] = await db
        .select()
        .from(chatStageAssignments)
        .where(eq(chatStageAssignments.chatId, chatId))
        .limit(1);

      return assignment || null;
    } catch (error) {
      this.logger.debug(`Could not query stage assignment: ${error}`);
      return null;
    }
  }

  /**
   * Transition a chat to a new stage
   */
  async transitionChat(
    chatId: string,
    userId: number,
    toStageId: string,
    reason: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const currentAssignment = await this.getChatStage(chatId);
    const fromStageId = currentAssignment?.stageId;

    // Log history
    await db.insert(chatStageHistory).values({
      chatId,
      fromStageId: fromStageId || null,
      toStageId,
      triggerType: metadata?.manual ? 'human' : 'system',
      triggeredBy: userId,
      reason,
      metadata: metadata || {},
    });

    // Upsert assignment
    if (currentAssignment) {
      await db
        .update(chatStageAssignments)
        .set({ stageId: toStageId, updatedAt: new Date() })
        .where(eq(chatStageAssignments.chatId, chatId));
    } else {
      const userDefaults = await this.getUserAiDefaults(userId);
      const defaults = getDefaultChatStageAssignmentValues(userDefaults);
      await db.insert(chatStageAssignments).values({
        chatId,
        stageId: toStageId,
        aiPaused: defaults.aiPaused,
        awaitingHandoff: defaults.awaitingHandoff,
      });
    }

    this.logger.log(
      `Chat ${chatId} transitioned from ${fromStageId || 'unassigned'} to ${toStageId}: ${reason}`,
    );

    // Write to unified audit log
    const userInfo = await this.getUserInfo(userId);
    const toStage = await this.getStageById(toStageId);
    const fromStage = fromStageId ? await this.getStageById(fromStageId) : null;

    await this.auditWriteService.logChatTransitioned({
      userId,
      userName: userInfo.name || undefined,
      teamId: userInfo.teamId ?? undefined,
      chatId,
      description: reason,
      metadata: {
        fromStageId: fromStageId || null,
        fromStageName: fromStage?.name || null,
        toStageId,
        toStageName: toStage?.name || null,
        triggerType: metadata?.manual ? 'human' : 'system',
        ...(metadata || {}),
      },
    });
  }

  // ==========================================================================
  // Stage History
  // ==========================================================================

  /**
   * Get stage history for a chat (raw data)
   */
  async getStageHistory(
    chatId: string,
  ): Promise<Array<typeof chatStageHistory.$inferSelect>> {
    return db
      .select()
      .from(chatStageHistory)
      .where(eq(chatStageHistory.chatId, chatId))
      .orderBy(desc(chatStageHistory.createdAt));
  }

  /**
   * Get enriched stage history with stage names and user info
   */
  async getEnrichedStageHistory(
    chatId: string,
    limit: number = 50,
  ): Promise<
    Array<{
      id: string;
      chatId: string;
      fromStageId: string | null;
      toStageId: string | null;
      fromStageName: string | null;
      fromStageColor: string | null;
      toStageName: string | null;
      toStageColor: string | null;
      triggerType: string;
      triggeredBy: number | null;
      triggeredByName: string | null;
      reason: string | null;
      metadata: unknown;
      createdAt: Date | null;
    }>
  > {
    const fromStageAlias = db
      .select({
        id: workflowStages.id,
        name: workflowStages.name,
        color: workflowStages.color,
      })
      .from(workflowStages)
      .as('from_stage');

    const toStageAlias = db
      .select({
        id: workflowStages.id,
        name: workflowStages.name,
        color: workflowStages.color,
      })
      .from(workflowStages)
      .as('to_stage');

    return db
      .select({
        id: chatStageHistory.id,
        chatId: chatStageHistory.chatId,
        fromStageId: chatStageHistory.fromStageId,
        toStageId: chatStageHistory.toStageId,
        fromStageName: fromStageAlias.name,
        fromStageColor: fromStageAlias.color,
        toStageName: toStageAlias.name,
        toStageColor: toStageAlias.color,
        triggerType: chatStageHistory.triggerType,
        triggeredBy: chatStageHistory.triggeredBy,
        triggeredByName: users.name,
        reason: chatStageHistory.reason,
        metadata: chatStageHistory.metadata,
        createdAt: chatStageHistory.createdAt,
      })
      .from(chatStageHistory)
      .leftJoin(
        fromStageAlias,
        eq(chatStageHistory.fromStageId, fromStageAlias.id),
      )
      .leftJoin(toStageAlias, eq(chatStageHistory.toStageId, toStageAlias.id))
      .leftJoin(users, eq(chatStageHistory.triggeredBy, users.id))
      .where(eq(chatStageHistory.chatId, chatId))
      .orderBy(desc(chatStageHistory.createdAt))
      .limit(limit);
  }

  /**
   * Get global stage history (all chats visible to user)
   */
  async getGlobalStageHistory(
    userId: number,
    limit: number = 50,
  ): Promise<
    Array<{
      id: string;
      chatId: string;
      participantName: string | null;
      participantPhone: string | null;
      fromStageId: string | null;
      toStageId: string | null;
      fromStageName: string | null;
      fromStageColor: string | null;
      toStageName: string | null;
      toStageColor: string | null;
      triggerType: string;
      triggeredBy: number | null;
      triggeredByName: string | null;
      reason: string | null;
      createdAt: Date | null;
    }>
  > {
    const userMembership = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.isActive, true),
      ),
    });

    const teamId = userMembership?.teamId;

    const fromStageAlias = db
      .select({
        id: workflowStages.id,
        name: workflowStages.name,
        color: workflowStages.color,
      })
      .from(workflowStages)
      .as('from_stage');

    const toStageAlias = db
      .select({
        id: workflowStages.id,
        name: workflowStages.name,
        color: workflowStages.color,
      })
      .from(workflowStages)
      .as('to_stage');

    const whereConditions: ReturnType<typeof eq>[] = [];
    if (teamId) {
      whereConditions.push(eq(chats.teamId, teamId));
    }

    return db
      .select({
        id: chatStageHistory.id,
        chatId: chatStageHistory.chatId,
        participantName: chats.participantName,
        participantPhone: chats.participantPhone,
        fromStageId: chatStageHistory.fromStageId,
        toStageId: chatStageHistory.toStageId,
        fromStageName: fromStageAlias.name,
        fromStageColor: fromStageAlias.color,
        toStageName: toStageAlias.name,
        toStageColor: toStageAlias.color,
        triggerType: chatStageHistory.triggerType,
        triggeredBy: chatStageHistory.triggeredBy,
        triggeredByName: users.name,
        reason: chatStageHistory.reason,
        createdAt: chatStageHistory.createdAt,
      })
      .from(chatStageHistory)
      .innerJoin(chats, eq(chatStageHistory.chatId, chats.chatId))
      .leftJoin(
        fromStageAlias,
        eq(chatStageHistory.fromStageId, fromStageAlias.id),
      )
      .leftJoin(toStageAlias, eq(chatStageHistory.toStageId, toStageAlias.id))
      .leftJoin(users, eq(chatStageHistory.triggeredBy, users.id))
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(desc(chatStageHistory.createdAt))
      .limit(limit);
  }

  // ==========================================================================
  // Kanban Board Queries
  // ==========================================================================

  /**
   * Get chats in a specific stage with full details for Kanban cards.
   * Uses ChatVisibilityService for role-based filtering:
   * - Owner/Admin: See all team chats
   * - Agent/Member: See only chats assigned to them
   */
  async getChatsByStage(
    stageId: string,
    userId: number,
    limit: number = 50,
    offset: number = 0,
  ): Promise<
    Array<{
      id: string;
      chatId: string;
      stageId: string | null;
      awaitingHandoff: boolean | null;
      handoffRequestedAt: Date | null;
      handoffReason: string | null;
      aiPaused: boolean | null;
      aiPausedAt: Date | null;
      aiPausedBy: number | null;
      aiPauseReason: string | null;
      assignedAt: Date | null;
      updatedAt: Date | null;
      participantPhone: string;
      participantName: string | null;
      lastMessage: string | null;
      lastMessageTime: Date | null;
      lastMessageType: string | null;
      unreadCount: number;
      isActive: boolean | null;
      assignedToId: number | null;
      assignedToName: string | null;
      assignedToProfilePictureKey: string | null;
    }>
  > {
    const userMembership = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.isActive, true),
      ),
    });

    const teamId = userMembership?.teamId;
    const role = userMembership?.role?.toLowerCase() || 'agent';

    this.logger.debug(
      `[StageService] getChatsByStage - StageId: ${stageId}, UserId: ${userId}, Role: ${role}, TeamId: ${teamId}`,
    );

    if (!teamId && !userMembership) {
      const stage = await db.query.workflowStages.findFirst({
        where: eq(workflowStages.id, stageId),
      });
      if (stage && stage.userId !== userId) {
        this.logger.warn(
          `User ${userId} attempted to access stage ${stageId} without membership`,
        );
        return [];
      }
    }

    const whereConditions = [eq(chatStageAssignments.stageId, stageId)];

    if (teamId) {
      whereConditions.push(eq(chats.teamId, teamId));
    }

    const allVisibilityConditions = this.chatVisibilityService.getAllConditions(
      role,
      userId,
    );
    if (allVisibilityConditions.length > 0) {
      whereConditions.push(...allVisibilityConditions);
    }

    return db
      .select({
        id: chatStageAssignments.id,
        chatId: chatStageAssignments.chatId,
        stageId: chatStageAssignments.stageId,
        awaitingHandoff: chatStageAssignments.awaitingHandoff,
        handoffRequestedAt: chatStageAssignments.handoffRequestedAt,
        handoffReason: chatStageAssignments.handoffReason,
        aiPaused: chatStageAssignments.aiPaused,
        aiPausedAt: chatStageAssignments.aiPausedAt,
        aiPausedBy: chatStageAssignments.aiPausedBy,
        aiPauseReason: chatStageAssignments.aiPauseReason,
        assignedAt: chatStageAssignments.assignedAt,
        updatedAt: chatStageAssignments.updatedAt,
        participantPhone: chats.participantPhone,
        participantName: chats.participantName,
        lastMessage: chats.lastMessage,
        lastMessageTime: chats.lastMessageTime,
        lastMessageType: chats.lastMessageType,
        unreadCount: chats.unreadCount,
        isActive: chats.isActive,
        aiOverrideEnabled: chatAiOverrides.aiEnabled,
        assignedToId: chats.assignedTo,
        assignedToName: users.name,
        assignedToProfilePictureKey: users.profilePictureThumbnailKey,
      })
      .from(chatStageAssignments)
      .innerJoin(chats, eq(chatStageAssignments.chatId, chats.chatId))
      .leftJoin(users, eq(chats.assignedTo, users.id))
      .leftJoin(
        chatAiOverrides,
        eq(chatStageAssignments.chatId, chatAiOverrides.chatId),
      )
      .where(and(...whereConditions))
      .orderBy(desc(chats.lastMessageTime))
      .limit(limit)
      .offset(offset);
  }
}
