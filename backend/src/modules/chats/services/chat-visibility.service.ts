import { chats } from '@database/schema';
import { Injectable } from '@nestjs/common';
import { eq, SQL } from 'drizzle-orm';

/**
 * Options for retrieving chat visibility conditions
 */
export interface ChatVisibilityOptions {
  /**
   * Include archived chats in results. Default: false
   * Set to true when viewing archived chats drawer
   */
  includeArchived?: boolean;

  /**
   * Include inactive (soft-deleted) chats in results. Default: false
   * Should rarely be true - only for admin diagnostic purposes
   */
  includeInactive?: boolean;
}

@Injectable()
export class ChatVisibilityService {
  /**
   * Get the base SQL conditions that should ALWAYS be applied when querying chats.
   * These conditions ensure we only show active, non-deleted chats by default.
   *
   * This is the single source of truth for chat filtering - use this in ALL queries
   * that display chats to users (chat list, kanban, search results, etc.)
   *
   * Filters applied by default:
   * - isActive = true (excludes soft-deleted chats)
   * - isArchived = false (excludes archived chats, unless includeArchived = true)
   *
   * @param options - Configuration options for visibility filtering
   * @returns Array of SQL conditions to be combined with AND
   */
  getBaseConditions(options: ChatVisibilityOptions = {}): SQL[] {
    const { includeArchived = false, includeInactive = false } = options;

    const conditions: SQL[] = [];

    // Always filter out soft-deleted chats unless explicitly requested
    if (!includeInactive) {
      conditions.push(eq(chats.isActive, true));
    }

    // Filter out archived chats unless explicitly requested
    if (!includeArchived) {
      conditions.push(eq(chats.isArchived, false));
    }

    return conditions;
  }

  /**
   * Get the SQL conditions for chat visibility based on user role.
   * These are ROLE-BASED conditions that should be combined with getBaseConditions().
   *
   * Rules:
   * - Owner/Admin: Can see all chats in the team (no additional filter)
   * - Agent/Member: Can ONLY see chats explicitly assigned to them
   *
   * Note: Unassigned chats are only visible to owners/admins who can then assign them.
   * This ensures proper multitenant access control where agents work only on their assigned chats.
   *
   * @param role - User's role in the team (owner, admin, agent, member, viewer)
   * @param userId - User's ID for assignment-based filtering
   * @returns Array of SQL conditions to be combined with AND
   */
  getVisibilityConditions(role: string, userId: number): SQL[] {
    const normalizedRole = role.toLowerCase();

    // Owners and Admins can see all chats in their team
    if (normalizedRole === 'owner' || normalizedRole === 'admin') {
      return [];
    }

    // Agents and Members can ONLY see chats assigned to them
    // This is a strict filter - no access to unassigned chats
    if (normalizedRole === 'agent' || normalizedRole === 'member') {
      return [eq(chats.assignedTo, userId)];
    }

    // Unknown roles (e.g., 'viewer') get strict visibility - only their assigned chats
    // This is a security-first approach for any unrecognized role
    return [eq(chats.assignedTo, userId)];
  }

  /**
   * Get ALL conditions needed for chat queries - combines base + role conditions.
   * This is the recommended method for most use cases as it ensures complete filtering.
   *
   * Usage:
   * ```typescript
   * const conditions = this.chatVisibilityService.getAllConditions(role, userId);
   * whereConditions.push(...conditions);
   * ```
   *
   * @param role - User's role in the team
   * @param userId - User's ID for assignment-based filtering
   * @param options - Additional visibility options (include archived, etc.)
   * @returns Complete array of SQL conditions combining base + role filtering
   */
  getAllConditions(
    role: string,
    userId: number,
    options: ChatVisibilityOptions = {},
  ): SQL[] {
    return [
      ...this.getBaseConditions(options),
      ...this.getVisibilityConditions(role, userId),
    ];
  }
}
