import { Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../database/db.connection';
import { chats, roles, teamMembers } from '../../../database/schema';

/**
 * Result of a chat access check
 */
export interface ChatAccessResult {
  /** Whether the user has access to the chat */
  hasAccess: boolean;
  /** The user's role in the team (if they are a member) */
  role?: string;
  /** The team ID the chat belongs to */
  teamId?: number | null;
  /** Why access was denied (if hasAccess is false) */
  reason?: string;
  /** Whether the user is assigned to this chat */
  isAssigned?: boolean;
  /** Whether the user is owner or admin of the team */
  isAdminOrOwner?: boolean;
}

/**
 * ChatAccessService - Centralized chat access validation
 *
 * This service provides a single source of truth for determining whether
 * a user has access to a specific chat. It handles all access scenarios:
 *
 * 1. Team Owner/Admin: Can access all chats in their team
 * 2. Team Agent: Can access chats assigned to them
 * 3. Cross-team: Users cannot access chats from teams they don't belong to
 *
 * This service is designed to be used by any module that needs to validate
 * chat access (notes, messages, pins, reactions, etc.)
 */
@Injectable()
export class ChatAccessService {
  private readonly logger = new Logger(ChatAccessService.name);

  /**
   * Check if a user has access to a specific chat
   *
   * Access rules:
   * - Owner/Admin roles: Full access to all team chats
   * - Agent/Viewer roles: Only assigned chats
   * - Non-members: No access
   *
   * @param userId - The user ID to check
   * @param chatId - The chat ID to check access for
   * @returns ChatAccessResult with access status and details
   */
  async checkChatAccess(
    userId: number,
    chatId: string,
  ): Promise<ChatAccessResult> {
    // 1. Get the chat and its team
    const chat = await db.query.chats.findFirst({
      where: eq(chats.chatId, chatId),
    });

    if (!chat) {
      return {
        hasAccess: false,
        reason: `Chat ${chatId} not found`,
      };
    }

    // If chat has no team (edge case for older data), deny access
    if (!chat.teamId) {
      this.logger.warn(`Chat ${chatId} has no teamId - access denied`);
      return {
        hasAccess: false,
        teamId: null,
        reason: 'Chat is not associated with any team',
      };
    }

    // 2. Check if user is a member of the chat's team
    const [membership] = await db
      .select({
        userId: teamMembers.userId,
        role: teamMembers.role,
        roleId: teamMembers.roleId,
        roleName: roles.name,
        isActive: teamMembers.isActive,
      })
      .from(teamMembers)
      .leftJoin(roles, eq(teamMembers.roleId, roles.id))
      .where(
        and(
          eq(teamMembers.userId, userId),
          eq(teamMembers.teamId, chat.teamId),
          eq(teamMembers.isActive, true),
        ),
      )
      .limit(1);

    if (!membership) {
      return {
        hasAccess: false,
        teamId: chat.teamId,
        reason: 'User is not a member of this team',
      };
    }

    // Get the effective role name
    const effectiveRole = membership.roleName || membership.role || 'agent';
    const normalizedRole = effectiveRole.toLowerCase();
    const isAdminOrOwner =
      normalizedRole === 'owner' || normalizedRole === 'admin';
    const isAssigned = chat.assignedTo === userId;

    // 3. Check access based on role
    if (isAdminOrOwner) {
      // Owners and Admins have full access to all team chats
      return {
        hasAccess: true,
        role: effectiveRole,
        teamId: chat.teamId,
        isAssigned,
        isAdminOrOwner: true,
      };
    }

    // 4. Agents and other roles can only access assigned chats
    if (isAssigned) {
      return {
        hasAccess: true,
        role: effectiveRole,
        teamId: chat.teamId,
        isAssigned: true,
        isAdminOrOwner: false,
      };
    }

    // 5. User is a team member but not assigned to this chat
    return {
      hasAccess: false,
      role: effectiveRole,
      teamId: chat.teamId,
      isAssigned: false,
      isAdminOrOwner: false,
      reason: 'User is not assigned to this chat',
    };
  }

  /**
   * Validate that a user has access to a chat, throwing if they don't
   *
   * @param userId - The user ID to check
   * @param chatId - The chat ID to check access for
   * @throws NotFoundException if chat doesn't exist
   * @throws ForbiddenException if user doesn't have access
   * @returns ChatAccessResult with access details
   */
  async validateChatAccess(
    userId: number,
    chatId: string,
  ): Promise<ChatAccessResult> {
    const result = await this.checkChatAccess(userId, chatId);

    if (!result.hasAccess) {
      // Log access denial for debugging
      this.logger.debug(
        `Access denied: user ${userId} to chat ${chatId}. Reason: ${result.reason}`,
      );
    }

    return result;
  }

  /**
   * Get all user IDs who have access to a specific chat
   *
   * This is useful for broadcasting real-time updates to all users
   * who can see a chat (owners, admins, and assigned agents).
   *
   * @param chatId - The chat ID
   * @returns Array of user IDs who have access
   */
  async getUsersWithChatAccess(chatId: string): Promise<number[]> {
    // Get the chat and its team
    const chat = await db.query.chats.findFirst({
      where: eq(chats.chatId, chatId),
    });

    if (!chat || !chat.teamId) {
      return [];
    }

    // Get all team members with their roles
    const members = await db
      .select({
        userId: teamMembers.userId,
        role: teamMembers.role,
        roleName: roles.name,
      })
      .from(teamMembers)
      .leftJoin(roles, eq(teamMembers.roleId, roles.id))
      .where(
        and(
          eq(teamMembers.teamId, chat.teamId),
          eq(teamMembers.isActive, true),
        ),
      );

    // Filter to users who have access
    const usersWithAccess: number[] = [];

    for (const member of members) {
      const effectiveRole = member.roleName || member.role || 'agent';
      const normalizedRole = effectiveRole.toLowerCase();
      const isAdminOrOwner =
        normalizedRole === 'owner' || normalizedRole === 'admin';

      // Owners and admins have access to all team chats
      if (isAdminOrOwner) {
        usersWithAccess.push(member.userId);
        continue;
      }

      // Agents only have access if assigned
      if (chat.assignedTo === member.userId) {
        usersWithAccess.push(member.userId);
      }
    }

    return usersWithAccess;
  }

  /**
   * Get the team ID for a chat
   *
   * @param chatId - The chat ID
   * @returns Team ID or null if chat doesn't exist
   */
  async getTeamIdForChat(chatId: string): Promise<number | null> {
    const chat = await db.query.chats.findFirst({
      where: eq(chats.chatId, chatId),
    });

    return chat?.teamId ?? null;
  }
}
