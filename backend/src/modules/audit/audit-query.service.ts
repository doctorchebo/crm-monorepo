// ============================================================================
// Audit Query Service
// ============================================================================
// Handles all read operations for audit history with role-based access control.
//
// ACCESS RULES:
// - Owners & Admins: can view all team history, filter by any team member
// - Agents & Viewers: can only view their own actions (userId is force-set)
//
// PERFORMANCE:
// - Uses composite indexes (team_id, category, created_at) for filtered queries
// - Parallel COUNT + SELECT for pagination
// - No in-memory merging — single table, single query
// ============================================================================

import { db } from '@database/db.connection';
import { activityLogs, teamMembers, users } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { PermissionService } from '@shared/services/permission.service';
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  SQL,
} from 'drizzle-orm';
import {
  AuditEntry,
  AuditQueryFilters,
  AuditTeamMember,
  PaginatedAuditResult,
} from './audit.types';

@Injectable()
export class AuditQueryService {
  private readonly logger = new Logger(AuditQueryService.name);

  constructor(private readonly permissionService: PermissionService) {}

  // ==========================================================================
  // Main paginated query
  // ==========================================================================

  /**
   * Get paginated audit logs with role-based access control.
   * Admins/owners see all team activity; regular users only see their own.
   */
  async getAuditLogs(
    requestingUserId: number,
    page: number = 1,
    pageSize: number = 25,
    filters: AuditQueryFilters = {},
  ): Promise<PaginatedAuditResult> {
    const teamId =
      await this.permissionService.getUserTeamIdOrNull(requestingUserId);

    // Build WHERE conditions
    const conditions: SQL[] = [];

    // Team scoping: always filter by team
    if (teamId) {
      conditions.push(eq(activityLogs.teamId, teamId));
    }

    // Role-based user filtering
    const isPrivileged = teamId
      ? await this.permissionService.isAdminOrOwner(requestingUserId, teamId)
      : false;

    if (!isPrivileged) {
      // Non-admin users can only see their own actions
      conditions.push(eq(activityLogs.userId, requestingUserId));
    } else if (filters.userId) {
      // Admin filtering by specific member
      conditions.push(eq(activityLogs.userId, filters.userId));
    }

    // Category filter
    if (filters.category) {
      conditions.push(eq(activityLogs.category, filters.category));
    } else if (filters.categories?.length) {
      conditions.push(inArray(activityLogs.category, filters.categories));
    }

    // Entity filters
    if (filters.entityType) {
      conditions.push(eq(activityLogs.entityType, filters.entityType));
    }
    if (filters.entityId) {
      conditions.push(eq(activityLogs.entityId, filters.entityId));
    }

    // Action filters
    if (filters.action) {
      conditions.push(eq(activityLogs.action, filters.action));
    } else if (filters.actions?.length) {
      conditions.push(inArray(activityLogs.action, filters.actions));
    }

    // Date range
    if (filters.startDate) {
      conditions.push(gte(activityLogs.createdAt, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(activityLogs.createdAt, filters.endDate));
    }

    // Chat filter
    if (filters.chatId) {
      conditions.push(eq(activityLogs.chatId, filters.chatId));
    }

    // Text search (across description, entity name, user name)
    if (filters.search) {
      const searchPattern = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(activityLogs.description, searchPattern),
          ilike(activityLogs.entityName, searchPattern),
          ilike(activityLogs.userName, searchPattern),
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Execute count and data queries in parallel
    const offset = (page - 1) * pageSize;
    const [countResult, items] = await Promise.all([
      db.select({ total: count() }).from(activityLogs).where(whereClause),
      db
        .select({
          id: activityLogs.id,
          userId: activityLogs.userId,
          userName: activityLogs.userName,
          teamId: activityLogs.teamId,
          category: activityLogs.category,
          entityType: activityLogs.entityType,
          entityId: activityLogs.entityId,
          entityName: activityLogs.entityName,
          action: activityLogs.action,
          description: activityLogs.description,
          metadata: activityLogs.metadata,
          changes: activityLogs.changes,
          chatId: activityLogs.chatId,
          ipAddress: activityLogs.ipAddress,
          createdAt: activityLogs.createdAt,
        })
        .from(activityLogs)
        .where(whereClause)
        .orderBy(desc(activityLogs.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = countResult[0]?.total ?? 0;
    const totalPages = Math.ceil(total / pageSize);

    return {
      items: items as AuditEntry[],
      total,
      page,
      pageSize,
      totalPages,
      hasMore: page < totalPages,
    };
  }

  // ==========================================================================
  // Entity-specific history
  // ==========================================================================

  /**
   * Get all audit entries for a specific entity.
   * Applies the same role-based access control.
   */
  async getEntityHistory(
    requestingUserId: number,
    entityType: string,
    entityId: string,
  ): Promise<AuditEntry[]> {
    const teamId =
      await this.permissionService.getUserTeamIdOrNull(requestingUserId);

    const conditions: SQL[] = [
      eq(activityLogs.entityType, entityType),
      eq(activityLogs.entityId, entityId),
    ];

    if (teamId) {
      conditions.push(eq(activityLogs.teamId, teamId));
    }

    // Role-based access
    const isPrivileged = teamId
      ? await this.permissionService.isAdminOrOwner(requestingUserId, teamId)
      : false;

    if (!isPrivileged) {
      conditions.push(eq(activityLogs.userId, requestingUserId));
    }

    const items = await db
      .select({
        id: activityLogs.id,
        userId: activityLogs.userId,
        userName: activityLogs.userName,
        teamId: activityLogs.teamId,
        category: activityLogs.category,
        entityType: activityLogs.entityType,
        entityId: activityLogs.entityId,
        entityName: activityLogs.entityName,
        action: activityLogs.action,
        description: activityLogs.description,
        metadata: activityLogs.metadata,
        changes: activityLogs.changes,
        chatId: activityLogs.chatId,
        ipAddress: activityLogs.ipAddress,
        createdAt: activityLogs.createdAt,
      })
      .from(activityLogs)
      .where(and(...conditions))
      .orderBy(desc(activityLogs.createdAt))
      .limit(100);

    return items as AuditEntry[];
  }

  // ==========================================================================
  // Team members for filter dropdown
  // ==========================================================================

  /**
   * Get team members for the member filter dropdown.
   * Only available to admins and owners.
   * Returns null if the user is not privileged.
   */
  async getTeamMembers(
    requestingUserId: number,
  ): Promise<AuditTeamMember[] | null> {
    const teamId =
      await this.permissionService.getUserTeamIdOrNull(requestingUserId);
    if (!teamId) return null;

    const isPrivileged = await this.permissionService.isAdminOrOwner(
      requestingUserId,
      teamId,
    );
    if (!isPrivileged) return null;

    const members = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: teamMembers.role,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.isActive, true)),
      )
      .orderBy(users.name);

    return members;
  }

  // ==========================================================================
  // CSV Export
  // ==========================================================================

  /**
   * Export audit logs as CSV string.
   * Applies the same role-based access control as getAuditLogs.
   * Limited to 5000 rows.
   */
  async exportAsCsv(
    requestingUserId: number,
    filters: AuditQueryFilters = {},
  ): Promise<string> {
    // Reuse the paginated query with a large page size
    const result = await this.getAuditLogs(requestingUserId, 1, 5000, filters);

    // CSV header
    const headers = [
      'Date',
      'User',
      'Category',
      'Action',
      'Entity Type',
      'Entity Name',
      'Entity ID',
      'Description',
      'Changes',
    ];

    // Escape CSV field
    const esc = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Format changes as readable string
    const formatChanges = (
      changes: Record<string, { from: unknown; to: unknown }> | null,
    ): string => {
      if (!changes) return '';
      return Object.entries(changes)
        .map(([field, { from, to }]) => `${field}: ${from} → ${to}`)
        .join('; ');
    };

    const rows = result.items.map((item) =>
      [
        esc(item.createdAt ? new Date(item.createdAt).toISOString() : ''),
        esc(item.userName),
        esc(item.category),
        esc(item.action),
        esc(item.entityType),
        esc(item.entityName),
        esc(item.entityId),
        esc(item.description),
        esc(formatChanges(item.changes)),
      ].join(','),
    );

    // BOM + header + rows
    return '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
  }
}
