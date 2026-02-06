/**
 * Activity Log Service
 * Provides centralized activity logging for audit trails and history displays
 *
 * Features:
 * - Log stage CRUD operations (workflow_activity_logs table)
 * - Query chat transitions (chat_stage_history table)
 * - Unified API that merges both data sources
 * - Efficient pagination with offset-based pagination
 * - Date range filtering with indexed queries
 * - Team-scoped access control
 */

import { db } from '@database/db.connection';
import {
  chats,
  chatStageHistory,
  teamMembers,
  users,
  WorkflowActivityLog,
  workflowActivityLogs,
  WorkflowActivityType,
  workflowStages,
} from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { and, between, desc, eq, gte, lte, or, SQL } from 'drizzle-orm';

export interface LogActivityParams {
  userId: number;
  userName?: string;
  teamId?: number;
  activityType: WorkflowActivityType;
  entityType: string;
  entityId: string;
  entityName?: string;
  chatId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
}

/**
 * Unified activity entry that combines:
 * - Stage CRUD operations from workflow_activity_logs
 * - Chat transitions from chat_stage_history
 */
export interface UnifiedActivityEntry {
  id: string;
  activityType: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  chatId: string | null;
  // For chat transitions
  participantName: string | null;
  participantPhone: string | null;
  fromStageId: string | null;
  fromStageName: string | null;
  fromStageColor: string | null;
  toStageId: string | null;
  toStageName: string | null;
  toStageColor: string | null;
  triggerType: string | null;
  // User info
  userId: number | null;
  userName: string | null;
  // Details
  description: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  // Timestamp
  createdAt: Date | null;
}

export interface PaginatedActivityResult {
  items: UnifiedActivityEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

export interface ActivityQueryFilters {
  activityTypes?: string[];
  entityType?: string;
  entityId?: string;
  chatId?: string;
  userId?: number;
  startDate?: Date;
  endDate?: Date;
}

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  /**
   * Helper to resolve the team ID for a user
   */
  private async resolveTeamId(userId: number): Promise<number | null> {
    const membership = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.isActive, true),
      ),
    });

    return membership?.teamId ?? null;
  }

  /**
   * Log an activity entry
   */
  async logActivity(params: LogActivityParams): Promise<WorkflowActivityLog> {
    const {
      userId,
      userName,
      teamId,
      activityType,
      entityType,
      entityId,
      entityName,
      chatId,
      description,
      metadata,
      previousState,
      newState,
    } = params;

    // Resolve team ID if not provided
    const resolvedTeamId = teamId ?? (await this.resolveTeamId(userId));

    const [entry] = await db
      .insert(workflowActivityLogs)
      .values({
        userId,
        userName,
        teamId: resolvedTeamId,
        activityType,
        entityType,
        entityId,
        entityName,
        chatId,
        description,
        metadata: metadata ?? {},
        previousState,
        newState,
      })
      .returning();

    this.logger.debug(
      `Logged activity: ${activityType} for ${entityType}:${entityId}`,
    );

    return entry;
  }

  /**
   * Log stage creation
   */
  async logStageCreated(
    userId: number,
    userName: string,
    stageId: string,
    stageName: string,
    stageData: Record<string, unknown>,
    teamId?: number,
  ): Promise<void> {
    await this.logActivity({
      userId,
      userName,
      teamId,
      activityType: 'stage_created',
      entityType: 'stage',
      entityId: stageId,
      entityName: stageName,
      description: `Created stage "${stageName}"`,
      newState: stageData,
    });
  }

  /**
   * Log stage update
   */
  async logStageUpdated(
    userId: number,
    userName: string,
    stageId: string,
    stageName: string,
    previousData: Record<string, unknown>,
    newData: Record<string, unknown>,
    teamId?: number,
  ): Promise<void> {
    // Determine what changed for a cleaner description
    const changes: string[] = [];
    if (previousData.name !== newData.name) {
      changes.push(`renamed from "${previousData.name}" to "${newData.name}"`);
    }
    if (previousData.color !== newData.color) {
      changes.push('color changed');
    }
    if (previousData.isDefault !== newData.isDefault && newData.isDefault) {
      changes.push('set as default');
    }
    if (previousData.sortOrder !== newData.sortOrder) {
      changes.push('reordered');
    }

    const description =
      changes.length > 0
        ? `Updated stage "${stageName}": ${changes.join(', ')}`
        : `Updated stage "${stageName}"`;

    await this.logActivity({
      userId,
      userName,
      teamId,
      activityType: 'stage_updated',
      entityType: 'stage',
      entityId: stageId,
      entityName: stageName,
      description,
      previousState: previousData,
      newState: newData,
    });
  }

  /**
   * Log stage deletion
   */
  async logStageDeleted(
    userId: number,
    userName: string,
    stageId: string,
    stageName: string,
    stageData: Record<string, unknown>,
    movedChatsCount?: number,
    targetStageName?: string,
    teamId?: number,
  ): Promise<void> {
    let description = `Deleted stage "${stageName}"`;
    if (movedChatsCount && movedChatsCount > 0 && targetStageName) {
      description += ` (${movedChatsCount} chats moved to "${targetStageName}")`;
    }

    await this.logActivity({
      userId,
      userName,
      teamId,
      activityType: 'stage_deleted',
      entityType: 'stage',
      entityId: stageId,
      entityName: stageName,
      description,
      previousState: stageData,
      metadata: {
        movedChatsCount,
        targetStageName,
      },
    });
  }

  /**
   * Log stage reorder
   */
  async logStagesReordered(
    userId: number,
    userName: string,
    stageIds: string[],
    teamId?: number,
  ): Promise<void> {
    await this.logActivity({
      userId,
      userName,
      teamId,
      activityType: 'stage_reordered',
      entityType: 'stages',
      entityId: 'batch',
      description: `Reordered ${stageIds.length} stages`,
      metadata: {
        stageIds,
        newOrder: stageIds,
      },
    });
  }

  /**
   * Log default stage change
   */
  async logDefaultStageChanged(
    userId: number,
    userName: string,
    newDefaultStageId: string,
    newDefaultStageName: string,
    previousDefaultStageId?: string,
    previousDefaultStageName?: string,
    teamId?: number,
  ): Promise<void> {
    const description = previousDefaultStageName
      ? `Changed default stage from "${previousDefaultStageName}" to "${newDefaultStageName}"`
      : `Set "${newDefaultStageName}" as the default stage`;

    await this.logActivity({
      userId,
      userName,
      teamId,
      activityType: 'stage_default_changed',
      entityType: 'stage',
      entityId: newDefaultStageId,
      entityName: newDefaultStageName,
      description,
      previousState: previousDefaultStageId
        ? {
            stageId: previousDefaultStageId,
            stageName: previousDefaultStageName,
          }
        : undefined,
      newState: {
        stageId: newDefaultStageId,
        stageName: newDefaultStageName,
      },
    });
  }

  /**
   * Get unified paginated activity logs merging:
   * 1. Stage CRUD operations from workflow_activity_logs
   * 2. Chat stage transitions from chat_stage_history
   *
   * This provides a single API for all activity/history views
   */
  async getActivityLogs(
    userId: number,
    page: number = 1,
    pageSize: number = 20,
    filters: ActivityQueryFilters = {},
  ): Promise<PaginatedActivityResult> {
    const teamId = await this.resolveTeamId(userId);

    // Determine which sources to include based on activity type filter
    const includeStageCrud = this.shouldIncludeStageCrud(filters.activityTypes);
    const includeChatTransitions = this.shouldIncludeChatTransitions(
      filters.activityTypes,
    );

    // Build queries for each source
    const queries: Promise<UnifiedActivityEntry[]>[] = [];

    if (includeStageCrud) {
      queries.push(
        this.getWorkflowActivityLogs(teamId, filters).then((items) =>
          items.map(this.mapWorkflowActivityToUnified),
        ),
      );
    }

    if (includeChatTransitions) {
      queries.push(this.getChatTransitionHistory(teamId, filters));
    }

    // Execute queries in parallel
    const results = await Promise.all(queries);

    // Merge and sort by createdAt descending
    const allItems = results
      .flat()
      .sort(
        (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
      );

    // Get total count and paginate
    const total = allItems.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const offset = (page - 1) * pageSize;
    const items = allItems.slice(offset, offset + pageSize);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
      hasMore: page < totalPages,
    };
  }

  /**
   * Check if stage CRUD activity types should be included
   */
  private shouldIncludeStageCrud(activityTypes?: string[]): boolean {
    if (!activityTypes || activityTypes.length === 0) return true;
    const stageCrudTypes = [
      'stage_created',
      'stage_updated',
      'stage_deleted',
      'stage_reordered',
      'stage_default_changed',
    ];
    return activityTypes.some((t) => stageCrudTypes.includes(t));
  }

  /**
   * Check if chat transition activity types should be included
   */
  private shouldIncludeChatTransitions(activityTypes?: string[]): boolean {
    if (!activityTypes || activityTypes.length === 0) return true;
    const transitionTypes = [
      'chat_transitioned',
      'handoff_requested',
      'handoff_resolved',
      'ai_paused',
      'ai_resumed',
    ];
    return activityTypes.some((t) => transitionTypes.includes(t));
  }

  /**
   * Map WorkflowActivityLog to UnifiedActivityEntry
   */
  private mapWorkflowActivityToUnified(
    item: WorkflowActivityLog,
  ): UnifiedActivityEntry {
    return {
      id: item.id,
      activityType: item.activityType,
      entityType: item.entityType,
      entityId: item.entityId,
      entityName: item.entityName,
      chatId: item.chatId,
      participantName: null,
      participantPhone: null,
      fromStageId: null,
      fromStageName: null,
      fromStageColor: null,
      toStageId: null,
      toStageName: null,
      toStageColor: null,
      triggerType: null,
      userId: item.userId,
      userName: item.userName,
      description: item.description,
      reason: null,
      metadata: item.metadata as Record<string, unknown> | null,
      previousState: item.previousState as Record<string, unknown> | null,
      newState: item.newState as Record<string, unknown> | null,
      createdAt: item.createdAt,
    };
  }

  /**
   * Get workflow activity logs (stage CRUD operations)
   */
  private async getWorkflowActivityLogs(
    teamId: number | null,
    filters: ActivityQueryFilters,
  ): Promise<WorkflowActivityLog[]> {
    const conditions: SQL<unknown>[] = [];

    // Team filter
    if (teamId) {
      conditions.push(eq(workflowActivityLogs.teamId, teamId));
    }

    // Activity type filter (only stage CRUD types)
    if (filters.activityTypes && filters.activityTypes.length > 0) {
      const stageCrudTypes = [
        'stage_created',
        'stage_updated',
        'stage_deleted',
        'stage_reordered',
        'stage_default_changed',
      ];
      const relevantTypes = filters.activityTypes.filter((t) =>
        stageCrudTypes.includes(t),
      ) as WorkflowActivityType[];
      if (relevantTypes.length > 0) {
        const typeCondition = or(
          ...relevantTypes.map((t) => eq(workflowActivityLogs.activityType, t)),
        );
        if (typeCondition) {
          conditions.push(typeCondition);
        }
      }
    }

    // Entity filters
    if (filters.entityType) {
      conditions.push(eq(workflowActivityLogs.entityType, filters.entityType));
    }
    if (filters.entityId) {
      conditions.push(eq(workflowActivityLogs.entityId, filters.entityId));
    }

    // Chat filter - stage CRUD doesn't have chat context, skip if chatId is filtered
    if (filters.chatId) {
      // Return empty - stage CRUD operations are not chat-specific
      return [];
    }

    // User filter
    if (filters.userId) {
      conditions.push(eq(workflowActivityLogs.userId, filters.userId));
    }

    // Date range filter
    if (filters.startDate && filters.endDate) {
      conditions.push(
        between(
          workflowActivityLogs.createdAt,
          filters.startDate,
          filters.endDate,
        ),
      );
    } else if (filters.startDate) {
      conditions.push(gte(workflowActivityLogs.createdAt, filters.startDate));
    } else if (filters.endDate) {
      conditions.push(lte(workflowActivityLogs.createdAt, filters.endDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return db
      .select()
      .from(workflowActivityLogs)
      .where(whereClause)
      .orderBy(desc(workflowActivityLogs.createdAt))
      .limit(500); // Cap for performance before merge
  }

  /**
   * Get chat stage transition history
   */
  private async getChatTransitionHistory(
    teamId: number | null,
    filters: ActivityQueryFilters,
  ): Promise<UnifiedActivityEntry[]> {
    // Alias tables for from/to stage joins
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

    // Build where conditions
    const conditions: SQL<unknown>[] = [];

    // Team filter via chats table
    if (teamId) {
      conditions.push(eq(chats.teamId, teamId));
    }

    // Chat filter
    if (filters.chatId) {
      conditions.push(eq(chatStageHistory.chatId, filters.chatId));
    }

    // User filter (triggeredBy)
    if (filters.userId) {
      conditions.push(eq(chatStageHistory.triggeredBy, filters.userId));
    }

    // Date range filter
    if (filters.startDate && filters.endDate) {
      conditions.push(
        between(chatStageHistory.createdAt, filters.startDate, filters.endDate),
      );
    } else if (filters.startDate) {
      conditions.push(gte(chatStageHistory.createdAt, filters.startDate));
    } else if (filters.endDate) {
      conditions.push(lte(chatStageHistory.createdAt, filters.endDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await db
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
      .where(whereClause)
      .orderBy(desc(chatStageHistory.createdAt))
      .limit(500); // Cap for performance before merge

    // Map to unified format
    return results.map((item) => ({
      id: item.id,
      activityType: 'chat_transitioned' as string,
      entityType: 'chat',
      entityId: item.chatId,
      entityName: item.participantName || item.participantPhone,
      chatId: item.chatId,
      participantName: item.participantName,
      participantPhone: item.participantPhone,
      fromStageId: item.fromStageId,
      fromStageName: item.fromStageName,
      fromStageColor: item.fromStageColor,
      toStageId: item.toStageId,
      toStageName: item.toStageName,
      toStageColor: item.toStageColor,
      triggerType: item.triggerType,
      userId: item.triggeredBy,
      userName: item.triggeredByName,
      description: item.reason,
      reason: item.reason,
      metadata: null,
      previousState: item.fromStageId
        ? { stageId: item.fromStageId, stageName: item.fromStageName }
        : null,
      newState: item.toStageId
        ? { stageId: item.toStageId, stageName: item.toStageName }
        : null,
      createdAt: item.createdAt,
    }));
  }

  /**
   * Get activity for a specific entity
   */
  async getEntityActivity(
    userId: number,
    entityType: string,
    entityId: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<PaginatedActivityResult> {
    return this.getActivityLogs(userId, page, pageSize, {
      entityType,
      entityId,
    });
  }
}
