import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db } from '../../database/db.connection';
import { teamMembers, teams, chats } from '../../database/schema';

/**
 * Team member roles in order of privilege level
 */
export type TeamRole = 'owner' | 'admin' | 'agent' | 'viewer';

/**
 * Actions that can be performed in the system
 */
export type PermissionAction =
  | 'invite_members'
  | 'remove_members'
  | 'change_roles'
  | 'assign_chats'
  | 'take_control'
  | 'force_unlock'
  | 'send_messages'
  | 'add_notes'
  | 'move_stage'
  | 'edit_workflow'
  | 'view_chats'
  | 'view_team';

/**
 * Permission matrix defining which roles can perform which actions
 * ⚠️ = restricted (requires additional checks)
 */
const PERMISSION_MATRIX: Record<PermissionAction, TeamRole[]> = {
  invite_members: ['owner', 'admin'],
  remove_members: ['owner', 'admin'],
  change_roles: ['owner', 'admin'],
  assign_chats: ['owner', 'admin', 'agent'], // agent: own only
  take_control: ['owner', 'admin', 'agent'], // agent: assigned only
  force_unlock: ['owner', 'admin'],
  send_messages: ['owner', 'admin', 'agent'],
  add_notes: ['owner', 'admin', 'agent'],
  move_stage: ['owner', 'admin', 'agent'], // agent: assigned only
  edit_workflow: ['owner'],
  view_chats: ['owner', 'admin', 'agent', 'viewer'],
  view_team: ['owner', 'admin', 'agent', 'viewer'],
};

/**
 * Actions that require the user to be assigned to the chat (for agents)
 */
const ASSIGNMENT_REQUIRED_ACTIONS: PermissionAction[] = [
  'assign_chats',
  'take_control',
  'move_stage',
];

export interface PermissionCheckResult {
  allowed: boolean;
  role?: TeamRole;
  reason?: string;
}

/**
 * PermissionService - Role-based access control for team collaboration
 *
 * Enforces the permission matrix defined in the requirements:
 * - Owner: Full control
 * - Admin: Manage members, assign chats, force unlock
 * - Agent: Work on assigned chats only
 * - Viewer: Read-only access
 *
 * All permission checks are server-side. Never trust the client.
 */
@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  /**
   * Get a user's role in a team
   */
  async getRole(userId: number, teamId: number): Promise<TeamRole | null> {
    const [member] = await db
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.userId, userId),
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.isActive, true),
        ),
      )
      .limit(1);

    if (!member) {
      return null;
    }

    return member.role as TeamRole;
  }

  /**
   * Check if a user has permission to perform an action
   */
  async checkPermission(
    userId: number,
    teamId: number,
    action: PermissionAction,
    resourceId?: string,
  ): Promise<PermissionCheckResult> {
    const role = await this.getRole(userId, teamId);

    if (!role) {
      return {
        allowed: false,
        reason: 'User is not a member of this team',
      };
    }

    const allowedRoles = PERMISSION_MATRIX[action];
    if (!allowedRoles) {
      return {
        allowed: false,
        role,
        reason: `Unknown action: ${action}`,
      };
    }

    if (!allowedRoles.includes(role)) {
      return {
        allowed: false,
        role,
        reason: `Role '${role}' is not allowed to perform '${action}'`,
      };
    }

    // For agents, check if assignment is required for this action
    if (
      role === 'agent' &&
      ASSIGNMENT_REQUIRED_ACTIONS.includes(action) &&
      resourceId
    ) {
      const isAssigned = await this.isUserAssignedToChat(userId, resourceId);
      if (!isAssigned) {
        return {
          allowed: false,
          role,
          reason: `Agents can only ${action.replace('_', ' ')} for chats assigned to them`,
        };
      }
    }

    return {
      allowed: true,
      role,
    };
  }

  /**
   * Enforce permission - throws ForbiddenException if not allowed
   */
  async enforcePermission(
    userId: number,
    teamId: number,
    action: PermissionAction,
    resourceId?: string,
  ): Promise<TeamRole> {
    const result = await this.checkPermission(
      userId,
      teamId,
      action,
      resourceId,
    );

    if (!result.allowed) {
      this.logger.warn(
        `Permission denied: user ${userId} attempted '${action}' on team ${teamId}. Reason: ${result.reason}`,
      );
      throw new ForbiddenException(result.reason);
    }

    return result.role!;
  }

  /**
   * Check if a user is assigned to a specific chat
   */
  async isUserAssignedToChat(userId: number, chatId: string): Promise<boolean> {
    const [chat] = await db
      .select({ assignedTo: chats.assignedTo })
      .from(chats)
      .where(eq(chats.chatId, chatId))
      .limit(1);

    return chat?.assignedTo === userId;
  }

  /**
   * Get the team ID for a chat
   */
  async getTeamIdForChat(chatId: string): Promise<number | null> {
    const [chat] = await db
      .select({ teamId: chats.teamId })
      .from(chats)
      .where(eq(chats.chatId, chatId))
      .limit(1);

    return chat?.teamId ?? null;
  }

  /**
   * Check if a user is a member of any team
   */
  async getUserTeams(
    userId: number,
  ): Promise<{ teamId: number; role: TeamRole }[]> {
    const memberships = await db
      .select({
        teamId: teamMembers.teamId,
        role: teamMembers.role,
      })
      .from(teamMembers)
      .where(
        and(eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)),
      );

    return memberships.map((m) => ({
      teamId: m.teamId,
      role: m.role as TeamRole,
    }));
  }

  /**
   * Check if user is owner or admin of the team
   */
  async isAdminOrOwner(userId: number, teamId: number): Promise<boolean> {
    const role = await this.getRole(userId, teamId);
    return role === 'owner' || role === 'admin';
  }

  /**
   * Check if user is the team owner
   */
  async isTeamOwner(userId: number, teamId: number): Promise<boolean> {
    const [team] = await db
      .select({ ownerId: teams.ownerId })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    return team?.ownerId === userId;
  }
}
