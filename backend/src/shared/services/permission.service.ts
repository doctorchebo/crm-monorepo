import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db } from '../../database/db.connection';
import {
  teamMembers,
  teams,
  chats,
  roles,
  permissions as permissionsTable,
  rolePermissions,
} from '../../database/schema';

/**
 * Actions that can be performed in the system
 * Mapped to database permission keys
 */
export type PermissionAction =
  | 'invite_members' // team.member.add
  | 'remove_members' // team.member.remove
  | 'change_roles' // team.member.edit
  | 'assign_chats' // chat.assign
  | 'take_control' // chat.assign
  | 'force_unlock' // chat.assign
  | 'send_messages' // chat.send
  | 'add_notes' // chat.view (or dedicated chat.note?)
  | 'move_stage' // workflow.move
  | 'edit_workflow' // workflow.manage
  | 'view_chats' // chat.view
  | 'view_team'; // team.manage

/**
 * Mapping between legacy action names and DB permission keys
 */
const ACTION_TO_KEY: Record<string, string> = {
  invite_members: 'team.member.add',
  remove_members: 'team.member.remove',
  change_roles: 'team.member.edit',
  assign_chats: 'chat.assign',
  take_control: 'chat.assign',
  force_unlock: 'chat.assign',
  send_messages: 'chat.send',
  add_notes: 'chat.view',
  move_stage: 'workflow.move',
  edit_workflow: 'workflow.manage',
  view_chats: 'chat.view',
  view_team: 'team.manage',
};

export interface PermissionCheckResult {
  allowed: boolean;
  role?: string;
  reason?: string;
}

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  /**
   * Get a user's role name in a team
   */
  async getRole(userId: number, teamId: number): Promise<string | null> {
    const [member] = await db
      .select({
        roleName: roles.name,
      })
      .from(teamMembers)
      .leftJoin(roles, eq(teamMembers.roleId, roles.id))
      .where(
        and(
          eq(teamMembers.userId, userId),
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.isActive, true),
        ),
      )
      .limit(1);

    return member?.roleName ?? null;
  }

  /**
   * Check if a user has permission to perform an action
   */
  async checkPermission(
    userId: number,
    teamId: number,
    action: string,
    _resourceId?: string,
  ): Promise<PermissionCheckResult> {
    // 1. Resolve DB permission key
    const permissionKey = ACTION_TO_KEY[action] || action;

    // 2. Get Member with Role (manual join to avoid TypeORM/Drizzle relation complexity if not perfectly set up)
    const [memberWithRole] = await db
      .select({
        roleId: teamMembers.roleId,
        roleName: roles.name,
        isSystem: roles.isSystem,
      })
      .from(teamMembers)
      .leftJoin(roles, eq(teamMembers.roleId, roles.id))
      .where(
        and(
          eq(teamMembers.userId, userId),
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.isActive, true),
        ),
      )
      .limit(1);

    if (!memberWithRole) {
      return { allowed: false, reason: 'User is not a member of this team' };
    }

    // OWNER OVERRIDE: Owners can do everything
    if (memberWithRole.roleName === 'Owner') {
      return { allowed: true, role: 'Owner' };
    }

    if (!memberWithRole.roleId) {
      return { allowed: false, reason: 'User has no role assigned' };
    }

    // 3. Check if role has the permission
    const [hasPerm] = await db
      .select({ id: rolePermissions.permissionId })
      .from(rolePermissions)
      .innerJoin(
        permissionsTable,
        eq(rolePermissions.permissionId, permissionsTable.id),
      )
      .where(
        and(
          eq(rolePermissions.roleId, memberWithRole.roleId),
          eq(permissionsTable.key, permissionKey),
        ),
      )
      .limit(1);

    if (!hasPerm) {
      return {
        allowed: false,
        role: memberWithRole.roleName ?? undefined,
        reason: `Role '${memberWithRole.roleName}' is missing permission '${permissionKey}'`,
      };
    }

    return {
      allowed: true,
      role: memberWithRole.roleName ?? undefined,
    };
  }

  /**
   * Enforce permission - throws ForbiddenException if not allowed
   */
  async enforcePermission(
    userId: number,
    teamId: number,
    action: string,
    resourceId?: string,
  ): Promise<string> {
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
  ): Promise<{ teamId: number; role: string }[]> {
    const memberships = await db
      .select({
        teamId: teamMembers.teamId,
        roleName: roles.name,
      })
      .from(teamMembers)
      .leftJoin(roles, eq(teamMembers.roleId, roles.id))
      .where(
        and(eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)),
      );

    return memberships.map((m) => ({
      teamId: m.teamId,
      role: m.roleName || 'Unknown',
    }));
  }

  /**
   * Check if user is owner or admin of the team
   * Kept for backward compatibility, checks strictly against role name 'Owner' or 'Admin'
   */
  async isAdminOrOwner(userId: number, teamId: number): Promise<boolean> {
    const role = await this.getRole(userId, teamId);
    return role === 'Owner' || role === 'Admin';
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
