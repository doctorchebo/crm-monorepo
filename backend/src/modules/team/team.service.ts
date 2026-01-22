import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db } from '../../database/db.connection';
import { teams, teamMembers, users, chats, roles } from '../../database/schema';
import { CreateTeamDto } from './dto/create-team.dto';
import { RolesService } from './services/roles.service';

export interface TeamWithMembers {
  id: number;
  name: string;
  description: string | null;
  ownerId: number;
  ownerName?: string;
  memberCount: number;
  createdAt: Date | null;
}

export interface TeamMemberInfo {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  role: string;
  roleId?: number | null; // Added roleId support
  joinedAt: Date | null;
  isActive: boolean;
}

/**
 * TeamService - Manages team CRUD operations
 *
 * Teams own chats, not individual users.
 * Each user can belong to multiple teams with different roles.
 */
@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(private readonly rolesService: RolesService) {}

  /**
   * Create a new team
   * The creator automatically becomes the owner
   */
  async create(userId: number, dto: CreateTeamDto): Promise<TeamWithMembers> {
    // Create the team
    const [team] = await db
      .insert(teams)
      .values({
        name: dto.name,
        description: dto.description,
        ownerId: userId,
      })
      .returning();

    // Initialize default roles for this new team
    await this.rolesService.initializeDefaultRoles(team.id);

    // Get Owner Role ID
    const ownerRole = await this.rolesService.getRoleByName(team.id, 'Owner');
    if (!ownerRole) {
      this.logger.error(
        `Failed to retrieve Owner role for new team ${team.id}`,
      );
      // Fallback? Should not happen if initialization works.
    }

    // Add creator as owner member
    await db.insert(teamMembers).values({
      teamId: team.id,
      userId: userId,
      role: 'owner',
      roleId: ownerRole?.id,
    });

    this.logger.log(`Team "${team.name}" created by user ${userId}`);

    return {
      id: team.id,
      name: team.name,
      description: team.description,
      ownerId: team.ownerId,
      memberCount: 1,
      createdAt: team.createdAt,
    };
  }

  /**
   * Get a team by ID
   */
  async findOne(teamId: number): Promise<TeamWithMembers | null> {
    const [team] = await db
      .select()
      .from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.isActive, true)))
      .limit(1);

    if (!team) {
      return null;
    }

    // Get member count
    const members = await db
      .select()
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.isActive, true)),
      );

    // Get owner name
    const [owner] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, team.ownerId))
      .limit(1);

    return {
      id: team.id,
      name: team.name,
      description: team.description,
      ownerId: team.ownerId,
      ownerName: owner?.name,
      memberCount: members.length,
      createdAt: team.createdAt,
    };
  }

  /**
   * Update a team's info
   */
  async update(
    teamId: number,
    dto: Partial<CreateTeamDto>,
  ): Promise<TeamWithMembers | null> {
    const [team] = await db
      .update(teams)
      .set({
        name: dto.name,
        description: dto.description,
        updatedAt: new Date(),
      })
      .where(eq(teams.id, teamId))
      .returning();

    if (!team) {
      return null;
    }

    return this.findOne(teamId);
  }

  /**
   * Soft delete a team (owner only)
   */
  async delete(teamId: number): Promise<boolean> {
    const result = await db
      .update(teams)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(teams.id, teamId))
      .returning();

    return result.length > 0;
  }

  /**
   * Get all teams a user belongs to
   */
  async getUserTeams(userId: number): Promise<TeamWithMembers[]> {
    const memberships = await db
      .select({
        teamId: teamMembers.teamId,
      })
      .from(teamMembers)
      .where(
        and(eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)),
      );

    const result: TeamWithMembers[] = [];

    for (const membership of memberships) {
      const team = await this.findOne(membership.teamId);
      if (team) {
        result.push(team);
      }
    }

    return result;
  }

  /**
   * Add a member to a team
   */
  async addMember(
    teamId: number,
    userId: number,
    roleOrId: string | number, // Accept either Role ID or Legacy Role String
    invitedBy: number,
  ): Promise<TeamMemberInfo> {
    // Check if user exists
    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    // Resolve Role ID and Name
    let roleId: number | undefined;
    let roleName: string;

    if (typeof roleOrId === 'number') {
      roleId = roleOrId;
      const role = await this.rolesService.getRole(roleId, teamId); // Ensure checks teamId
      roleName = role.name; // Use custom role name (may not match 'owner'/'admin' strictly lowercase)
      // Map to legacy 'role' string if possible roughly
      // If exact match to standard roles, keep it. Else 'agent'?
      // Actually, let's keep roleName as is in 'role' column? No, 'role' column has constraints.
      // CHECK CONSTRAINT: CHECK (role IN ('owner', 'admin', 'agent', 'viewer'))
      // If the custom role is "Intern", we can't save "Intern" to `role` column.
      // We must map custom roles to a fallback legacy role (e.g. 'agent')
      // OR rely purely on roleId and ignore `role` column (but DB constraint forces it).
      // Best approach: If new role matches one of the standards (case-insensitive), use it.
      // If custom, default to 'agent' for legacy column.
      const standardRoles = ['owner', 'admin', 'agent', 'viewer'];
      const normalized = role.name.toLowerCase();
      roleName = standardRoles.includes(normalized) ? normalized : 'agent';
    } else {
      roleName = roleOrId;
      // Lookup ID
      // Capitalize first letter strictly? Or just search.
      // Try exact first (e.g. "Agent"), then title case "agent" -> "Agent".
      // Let's rely on RolesService helper.
      // If roleName is "agent", we look for "Agent".
      let dbRole = await this.rolesService.getRoleByName(teamId, roleName);
      if (!dbRole) {
        // Try Capitalized
        const cap = roleName.charAt(0).toUpperCase() + roleName.slice(1);
        dbRole = await this.rolesService.getRoleByName(teamId, cap);
      }

      if (dbRole) {
        roleId = dbRole.id;
      } else {
        // Failed to find role ID? Should we fail?
        // If migration ran, defaults should exist.
        this.logger.warn(
          `Could not find Role ID for '${roleName}' in team ${teamId}. Adding with legacy string only.`,
        );
      }
    }

    // Check if already a member
    const [existing] = await db
      .select()
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
      )
      .limit(1);

    if (existing) {
      if (existing.isActive) {
        throw new ConflictException('User is already a team member');
      }
      // Reactivate the membership
      await db
        .update(teamMembers)
        .set({ isActive: true, role: roleName, roleId: roleId, invitedBy })
        .where(eq(teamMembers.id, existing.id));

      return {
        id: existing.id,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        role: roleName,
        roleId,
        joinedAt: new Date(),
        isActive: true,
      };
    }

    // Create new membership
    const [member] = await db
      .insert(teamMembers)
      .values({
        teamId,
        userId,
        role: roleName,
        roleId,
        invitedBy,
      })
      .returning();

    this.logger.log(
      `User ${userId} added to team ${teamId} as ${roleName} (RoleID: ${roleId})`,
    );

    return {
      id: member.id,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      role: member.role,
      roleId: member.roleId,
      joinedAt: member.joinedAt,
      isActive: member.isActive ?? true,
    };
  }

  /**
   * Remove a member from a team
   */
  async removeMember(teamId: number, userId: number): Promise<boolean> {
    // Cannot remove the team owner
    const [team] = await db
      .select({ ownerId: teams.ownerId })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (team?.ownerId === userId) {
      throw new ForbiddenException('Cannot remove team owner');
    }

    const result = await db
      .update(teamMembers)
      .set({ isActive: false })
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
      )
      .returning();

    return result.length > 0;
  }

  /**
   * Change a member's role
   */
  async changeRole(
    teamId: number,
    userId: number,
    newRoleOrId: string | number,
  ): Promise<TeamMemberInfo | null> {
    // Resolve Role
    let roleId: number | undefined;
    let roleName: string;

    if (typeof newRoleOrId === 'number') {
      roleId = newRoleOrId;
      const role = await this.rolesService.getRole(roleId, teamId);
      const standardRoles = ['owner', 'admin', 'agent', 'viewer'];
      const normalized = role.name.toLowerCase();
      roleName = standardRoles.includes(normalized) ? normalized : 'agent';
    } else {
      roleName = newRoleOrId;
      let dbRole = await this.rolesService.getRoleByName(teamId, roleName);
      if (!dbRole) {
        const cap = roleName.charAt(0).toUpperCase() + roleName.slice(1);
        dbRole = await this.rolesService.getRoleByName(teamId, cap);
      }
      if (dbRole) roleId = dbRole.id;
    }

    // Cannot change owner's role
    const [team] = await db
      .select({ ownerId: teams.ownerId })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (
      team?.ownerId === userId &&
      (roleName !== 'owner' || (roleId && roleName !== 'owner'))
    ) {
      // Logic bit tricky: if current user is owner, they can only be changed TO owner (no-op)
      // Or simpler: Can't demote owner.
      throw new ForbiddenException("Cannot change team owner's role");
    }

    const [member] = await db
      .update(teamMembers)
      .set({ role: roleName, roleId: roleId })
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
      )
      .returning();

    if (!member) {
      return null;
    }

    const [user] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return {
      id: member.id,
      userId: member.userId,
      userName: user?.name ?? '',
      userEmail: user?.email ?? '',
      role: member.role,
      roleId: member.roleId,
      joinedAt: member.joinedAt,
      isActive: member.isActive ?? true,
    };
  }

  /**
   * Get all members of a team
   */
  async getMembers(teamId: number): Promise<TeamMemberInfo[]> {
    const members = await db
      .select({
        id: teamMembers.id,
        userId: teamMembers.userId,
        role: teamMembers.role,
        roleId: teamMembers.roleId,
        joinedAt: teamMembers.joinedAt,
        isActive: teamMembers.isActive,
        userName: users.name,
        userEmail: users.email,
        customRoleName: roles.name, // Join with roles to get custom name
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .leftJoin(roles, eq(teamMembers.roleId, roles.id))
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.isActive, true)),
      );

    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      userName: m.userName,
      userEmail: m.userEmail,
      role: m.customRoleName || m.role, // Return custom role name if available, else legacy
      roleId: m.roleId,
      joinedAt: m.joinedAt,
      isActive: m.isActive ?? true,
    }));
  }

  /**
   * Get team metrics (chat counts per member)
   */
  async getTeamMetrics(teamId: number): Promise<
    {
      userId: number;
      userName: string;
      activeChats: number;
      closedChats: number;
    }[]
  > {
    const members = await this.getMembers(teamId);

    // TODO: Optimize this with a single aggregation query when Drizzle knowledge improves
    // Current approach: Fetch all stats and map (N+1 but safe for small teams)

    // Get all chats for this team
    const teamChats = await db
      .select({
        assignedTo: chats.assignedTo,
        isActive: chats.isActive,
      })
      .from(chats)
      .where(eq(chats.teamId, teamId));

    const metrics = members.map((member) => {
      const memberChats = teamChats.filter(
        (c) => c.assignedTo === member.userId,
      );
      return {
        userId: member.userId,
        userName: member.userName,
        activeChats: memberChats.filter((c) => c.isActive).length,
        closedChats: memberChats.filter((c) => !c.isActive).length,
      };
    });

    return metrics;
  }
}
