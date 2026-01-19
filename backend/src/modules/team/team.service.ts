import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db } from '../../database/db.connection';
import { teams, teamMembers, users } from '../../database/schema';
import { CreateTeamDto } from './dto/create-team.dto';

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

    // Add creator as owner member
    await db.insert(teamMembers).values({
      teamId: team.id,
      userId: userId,
      role: 'owner',
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
        role: teamMembers.role,
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
    role: string,
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
        .set({ isActive: true, role, invitedBy })
        .where(eq(teamMembers.id, existing.id));

      return {
        id: existing.id,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        role,
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
        role,
        invitedBy,
      })
      .returning();

    this.logger.log(`User ${userId} added to team ${teamId} as ${role}`);

    return {
      id: member.id,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      role: member.role,
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
    newRole: string,
  ): Promise<TeamMemberInfo | null> {
    // Cannot change owner's role
    const [team] = await db
      .select({ ownerId: teams.ownerId })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (team?.ownerId === userId && newRole !== 'owner') {
      throw new ForbiddenException("Cannot change team owner's role");
    }

    const [member] = await db
      .update(teamMembers)
      .set({ role: newRole })
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
        joinedAt: teamMembers.joinedAt,
        isActive: teamMembers.isActive,
        userName: users.name,
        userEmail: users.email,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.isActive, true)),
      );

    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      userName: m.userName,
      userEmail: m.userEmail,
      role: m.role,
      joinedAt: m.joinedAt,
      isActive: m.isActive ?? true,
    }));
  }
}
