/**
 * Stage Service
 * Manages workflow stages (pipeline stages)
 *
 * Features:
 * - CRUD operations for stages
 * - Default stage initialization
 * - Stage ordering and configuration
 */

import { db } from '@database/db.connection';
import {
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
import { and, asc, desc, eq } from 'drizzle-orm';
import {
  CreateStageRequest,
  DEFAULT_WORKFLOW_STAGES,
  UpdateStageRequest,
  WorkflowStageConfig,
} from '../types';

@Injectable()
export class StageService {
  private readonly logger = new Logger(StageService.name);

  constructor(private readonly chatVisibilityService: ChatVisibilityService) {}

  /**
   * Helper to resolve the correct user ID for stage operations.
   * If the user is an agent in a team, returns the Team Owner's user ID.
   * If the user is an owner or has no team, returns the user's own ID.
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

    // If user is not in a team, return their own ID
    if (!membership) {
      return userId;
    }

    // If user is already the owner, return their own ID
    if (membership.role === 'owner') {
      return userId;
    }

    // If user is an agent/admin, find the team owner
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
   * Get all stages for a user (or their team owner)
   */
  async getStages(userId: number): Promise<WorkflowStageConfig[]> {
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

    return stages.map((stage) => ({
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
    }));
  }

  /**
   * Get a single stage by ID
   */
  async getStage(
    stageId: string,
    userId: number,
  ): Promise<WorkflowStageConfig | null> {
    const ownerId = await this.resolveStageOwnerId(userId);

    const [stage] = await db
      .select()
      .from(workflowStages)
      .where(
        and(eq(workflowStages.id, stageId), eq(workflowStages.userId, ownerId)),
      )
      .limit(1);

    if (!stage) return null;

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

  /**
   * Get the default stage for a user (or team owner)
   */
  async getDefaultStage(userId: number): Promise<WorkflowStageConfig | null> {
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

    if (!stage) {
      // If no default, return first active stage
      const [firstStage] = await db
        .select()
        .from(workflowStages)
        .where(
          and(
            eq(workflowStages.userId, userId),
            eq(workflowStages.isActive, true),
          ),
        )
        .orderBy(asc(workflowStages.sortOrder))
        .limit(1);

      if (!firstStage) return null;

      return {
        id: firstStage.id,
        name: firstStage.name,
        description: firstStage.description || undefined,
        color: firstStage.color || '#3b82f6',
        icon: firstStage.icon || undefined,
        sortOrder: firstStage.sortOrder,
        isDefault: firstStage.isDefault || false,
        isFinal: firstStage.isFinal || false,
        aiAutoReply: firstStage.aiAutoReply ?? true,
        aiHandoffRequired: firstStage.aiHandoffRequired || false,
      };
    }

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

  /**
   * Create a new stage
   */
  async createStage(
    userId: number,
    request: CreateStageRequest,
  ): Promise<WorkflowStageConfig> {
    const ownerId = await this.resolveStageOwnerId(userId);

    // If this is set as default, unset other defaults
    if (request.isDefault) {
      await db
        .update(workflowStages)
        .set({ isDefault: false })
        .where(eq(workflowStages.userId, ownerId));
    }

    // Get next sort order if not specified
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

  /**
   * Update a stage
   */
  async updateStage(
    stageId: string,
    userId: number,
    request: UpdateStageRequest,
  ): Promise<WorkflowStageConfig | null> {
    const ownerId = await this.resolveStageOwnerId(userId);

    // If setting as default, unset other defaults
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

  /**
   * Delete a stage (soft delete)
   */
  async deleteStage(
    stageId: string,
    userId: number,
    moveToStageId?: string,
  ): Promise<boolean> {
    const ownerId = await this.resolveStageOwnerId(userId);

    // Get chats assigned to this stage
    const assignments = await db
      .select()
      .from(chatStageAssignments)
      .where(eq(chatStageAssignments.stageId, stageId));

    if (assignments.length > 0) {
      // Move chats to another stage
      const targetStageId =
        moveToStageId ||
        (await this.getDefaultStage(ownerId).then((s) => s?.id));

      if (!targetStageId) {
        throw new Error(
          'Cannot delete stage: no target stage for existing chats',
        );
      }

      await db
        .update(chatStageAssignments)
        .set({
          stageId: targetStageId,
          updatedAt: new Date(),
        })
        .where(eq(chatStageAssignments.stageId, stageId));
    }

    // Soft delete the stage
    const result = await db
      .update(workflowStages)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(eq(workflowStages.id, stageId), eq(workflowStages.userId, ownerId)),
      )
      .returning({ id: workflowStages.id });

    return result.length > 0;
  }

  /**
   * Reorder stages
   */
  async reorderStages(
    userId: number,
    stageOrder: string[],
  ): Promise<WorkflowStageConfig[]> {
    const ownerId = await this.resolveStageOwnerId(userId);

    // Update sort order for each stage
    for (let i = 0; i < stageOrder.length; i++) {
      await db
        .update(workflowStages)
        .set({
          sortOrder: i,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflowStages.id, stageOrder[i]),
            eq(workflowStages.userId, ownerId),
          ),
        );
    }

    return this.getStages(userId);
  }

  /**
   * Initialize default stages for a user
   */
  async initializeDefaultStages(
    userId: number,
  ): Promise<WorkflowStageConfig[]> {
    // Check if user already has stages
    const existing = await this.getStages(userId);
    if (existing.length > 0) {
      return existing;
    }

    // Create default stages
    for (const stageConfig of DEFAULT_WORKFLOW_STAGES) {
      await this.createStage(userId, stageConfig);
    }

    this.logger.log(`Initialized default stages for user ${userId}`);
    return this.getStages(userId);
  }

  /**
   * Get next available sort order
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
   * Get stage with chat counts
   */
  async getStagesWithCounts(
    userId: number,
  ): Promise<Array<WorkflowStageConfig & { chatCount: number }>> {
    const stages = await this.getStages(userId);

    // Get counts for each stage
    const stagesWithCounts = await Promise.all(
      stages.map(async (stage) => {
        const [result] = await db
          .select({ count: chatStageAssignments.id })
          .from(chatStageAssignments)
          .where(eq(chatStageAssignments.stageId, stage.id));

        return {
          ...stage,
          chatCount: result ? 1 : 0, // Simplified - in production use SQL count
        };
      }),
    );

    return stagesWithCounts;
  }

  /**
   * Get current stage assignment for a chat
   * Returns null if no assignment exists or if the table doesn't exist yet
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
      // Table might not exist yet
      this.logger.debug(`Could not query stage assignment: ${error}`);
      return null;
    }
  }

  /**
   * Get a stage by ID (without userId check - for internal use)
   * Returns null if no stage found or if the table doesn't exist yet
   */
  async getStageById(stageId: string): Promise<WorkflowStageConfig | null> {
    try {
      const [stage] = await db
        .select()
        .from(workflowStages)
        .where(eq(workflowStages.id, stageId))
        .limit(1);

      if (!stage) return null;

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
    } catch (error) {
      this.logger.debug(`Could not query stage: ${error}`);
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
    // Get current assignment
    const currentAssignment = await this.getChatStage(chatId);
    const fromStageId = currentAssignment?.stageId;

    // Log history
    await db.insert(chatStageHistory).values({
      chatId,
      fromStageId: fromStageId || null,
      toStageId,
      triggerType: metadata?.manual ? 'human' : 'system',
      triggeredBy: userId,
      reason: reason,
      metadata: metadata || {},
    });

    // Upsert the assignment
    if (currentAssignment) {
      await db
        .update(chatStageAssignments)
        .set({
          stageId: toStageId,
          updatedAt: new Date(),
        })
        .where(eq(chatStageAssignments.chatId, chatId));
    } else {
      await db.insert(chatStageAssignments).values({
        chatId,
        stageId: toStageId,
      });
    }

    this.logger.log(
      `Chat ${chatId} transitioned from ${fromStageId || 'unassigned'} to ${toStageId}: ${reason}`,
    );
  }

  /**
   * Get stage history for a chat
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
   * Get chats in a specific stage with full chat details
   * Filters by user's team membership for proper multi-tenant access control.
   * Returns enriched data for Kanban cards including:
   * - Participant name/phone
   * - Last message preview
   * - Last activity time
   * - Unread count
   * - AI status
   * - Time entered current stage (assignedAt)
   * - Assignee profile info (name, profile picture)
   *
   * IMPORTANT: Uses ChatVisibilityService for role-based filtering consistency:
   * - Owner/Admin: See all chats in the team
   * - Agent/Member: See ONLY chats explicitly assigned to them (no unassigned chats)
   */
  async getChatsByStage(
    stageId: string,
    userId: number,
    limit: number = 50,
    offset: number = 0,
  ): Promise<
    Array<{
      // Chat stage assignment fields
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
      // Chat details for Kanban card display
      participantPhone: string;
      participantName: string | null;
      lastMessage: string | null;
      lastMessageTime: Date | null;
      lastMessageType: string | null;
      unreadCount: number;
      isActive: boolean | null;
      // Assignee info for avatar display
      assignedToId: number | null;
      assignedToName: string | null;
      assignedToProfilePictureKey: string | null;
    }>
  > {
    // Resolve user's teamId and role from their active team membership
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

    // FAIL-SAFE: If no team membership is found and user is not viewing their own personal stages,
    // default to empty results to prevent "View All" leaks.
    if (!teamId && !userMembership) {
      // Check if user is the stage owner (personal workflow case)
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

    // Build where conditions - start with stage filter
    const whereConditions = [eq(chatStageAssignments.stageId, stageId)];

    // Filter by team if user has a team membership
    if (teamId) {
      whereConditions.push(eq(chats.teamId, teamId));
    }

    // Apply ALL chat visibility conditions using centralized ChatVisibilityService
    // This ensures consistency across Chats page and Kanban page by applying:
    // 1. Base conditions: isActive = true, isArchived = false (no deleted/archived chats)
    // 2. Role-based conditions: Owner/Admin see all, Agent/Member see only assigned
    const allVisibilityConditions = this.chatVisibilityService.getAllConditions(
      role,
      userId,
    );
    if (allVisibilityConditions.length > 0) {
      whereConditions.push(...allVisibilityConditions);
    }

    const results = await db
      .select({
        // Assignment fields
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
        // Chat fields for display
        participantPhone: chats.participantPhone,
        participantName: chats.participantName,
        lastMessage: chats.lastMessage,
        lastMessageTime: chats.lastMessageTime,
        lastMessageType: chats.lastMessageType,
        unreadCount: chats.unreadCount,
        isActive: chats.isActive,
        // AI Override fields
        aiOverrideEnabled: chatAiOverrides.aiEnabled,
        // Assignee info for avatar display
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

    return results;
  }
}
