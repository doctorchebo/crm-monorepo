import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { eq, and, sql, gte } from 'drizzle-orm';
import * as jwt from 'jsonwebtoken';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { db } from '../../database/db.connection';
import {
  invitations,
  teams,
  users,
  invitationRateLimits,
} from '../../database/schema';
import { TeamService } from './team.service';
import { AuditService } from '../../shared/services/audit.service';

// Token expiry in milliseconds (7 days)
const INVITATION_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000;

// Rate limits
const USER_HOURLY_LIMIT = 10; // Max invitations per user per hour
const TEAM_DAILY_LIMIT = 50; // Max invitations per team per day

export interface InvitationInfo {
  id: number;
  teamId: number;
  teamName?: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date | null;
  createdAt: Date | null;
}

export interface TokenPayload {
  invitationId: number;
  teamId: number;
  email: string;
  role: string;
}

export interface InvitationEmailMessage {
  invitationId: number;
  email: string;
  teamName: string;
  inviterName: string;
  token: string;
  expiresAt: string;
  role: string;
}

/**
 * InvitationService - Token-based team invitations with async email delivery
 *
 * Flow:
 * 1. Owner/Admin sends invite (generates signed token)
 * 2. Message enqueued to SQS for email delivery
 * 3. Lambda sends email with invitation link
 * 4. Invitee clicks link:
 *    - If authenticated: accept
 *    - If not: create account, then accept
 * 5. Invitation marked accepted
 * 6. Entry added to team_members
 */
@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);
  private readonly jwtSecret: string;
  private readonly sqsClient: SQSClient;
  private readonly queueUrl: string;

  constructor(
    private teamService: TeamService,
    private auditService: AuditService,
  ) {
    // Use JWT secret from environment or generate a default for dev
    this.jwtSecret = process.env.JWT_SECRET || 'invitation-secret-key';

    // SQS client for async email delivery
    this.queueUrl = process.env.INVITATION_EMAIL_QUEUE_URL || '';
    this.sqsClient = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }

  /**
   * Generate a signed invitation token
   */
  private generateToken(payload: TokenPayload): string {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: '7d',
    });
  }

  /**
   * Validate and decode an invitation token
   */
  validateToken(token: string): TokenPayload | null {
    try {
      return jwt.verify(token, this.jwtSecret) as TokenPayload;
    } catch {
      return null;
    }
  }

  /**
   * Check rate limits for user and team
   */
  private async checkRateLimits(userId: number, teamId: number): Promise<void> {
    const now = new Date();
    const hourStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
    );
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Check user hourly limit
    const [userLimit] = await db
      .select({ count: invitationRateLimits.count })
      .from(invitationRateLimits)
      .where(
        and(
          eq(invitationRateLimits.userId, userId),
          eq(invitationRateLimits.periodType, 'hourly'),
          gte(invitationRateLimits.periodStart, hourStart),
        ),
      )
      .limit(1);

    if (userLimit && (userLimit.count ?? 0) >= USER_HOURLY_LIMIT) {
      throw new BadRequestException(
        `Rate limit exceeded: Maximum ${USER_HOURLY_LIMIT} invitations per hour`,
      );
    }

    // Check team daily limit
    const [teamLimit] = await db
      .select({ count: invitationRateLimits.count })
      .from(invitationRateLimits)
      .where(
        and(
          eq(invitationRateLimits.teamId, teamId),
          eq(invitationRateLimits.periodType, 'daily'),
          gte(invitationRateLimits.periodStart, dayStart),
        ),
      )
      .limit(1);

    if (teamLimit && (teamLimit.count ?? 0) >= TEAM_DAILY_LIMIT) {
      throw new BadRequestException(
        `Rate limit exceeded: Maximum ${TEAM_DAILY_LIMIT} invitations per team per day`,
      );
    }
  }

  /**
   * Increment rate limit counters
   */
  private async incrementRateLimits(
    userId: number,
    teamId: number,
  ): Promise<void> {
    const now = new Date();
    const hourStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
    );
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Upsert user hourly limit
    await db.execute(sql`
      INSERT INTO invitation_rate_limits (user_id, period_type, period_start, count)
      VALUES (${userId}, 'hourly', ${hourStart}, 1)
      ON CONFLICT (user_id, period_type, period_start) 
      WHERE user_id IS NOT NULL
      DO UPDATE SET count = invitation_rate_limits.count + 1, updated_at = NOW()
    `);

    // Upsert team daily limit
    await db.execute(sql`
      INSERT INTO invitation_rate_limits (team_id, period_type, period_start, count)
      VALUES (${teamId}, 'daily', ${dayStart}, 1)
      ON CONFLICT (team_id, period_type, period_start) 
      WHERE team_id IS NOT NULL
      DO UPDATE SET count = invitation_rate_limits.count + 1, updated_at = NOW()
    `);
  }

  /**
   * Enqueue invitation email for async delivery
   */
  private async enqueueEmailDelivery(
    message: InvitationEmailMessage,
  ): Promise<void> {
    if (!this.queueUrl) {
      this.logger.warn(
        'INVITATION_EMAIL_QUEUE_URL not configured, skipping email enqueue',
      );
      return;
    }

    try {
      await this.sqsClient.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify(message),
          MessageAttributes: {
            invitationId: {
              DataType: 'Number',
              StringValue: message.invitationId.toString(),
            },
          },
        }),
      );
      this.logger.log(
        `Enqueued invitation email for ${message.email} (invitation ${message.invitationId})`,
      );
    } catch (error) {
      this.logger.error(`Failed to enqueue invitation email: ${error}`);
      // Don't throw - invitation is created, email delivery is best-effort
      // DLQ will catch failed messages on the Lambda side
    }
  }

  /**
   * Send an invitation to join a team
   */
  async sendInvitation(
    teamId: number,
    email: string,
    role: string,
    invitedBy: number,
  ): Promise<InvitationInfo> {
    // Verify team exists
    const team = await this.teamService.findOne(teamId);
    if (!team) {
      throw new NotFoundException(`Team ${teamId} not found`);
    }

    // Check rate limits before proceeding
    await this.checkRateLimits(invitedBy, teamId);

    // Check if user is already a member
    const [existingUser] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      const members = await this.teamService.getMembers(teamId);
      if (members.some((m) => m.userId === existingUser.id)) {
        throw new BadRequestException('User is already a team member');
      }
    }

    // Check for pending invitation
    const [existing] = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.teamId, teamId),
          eq(invitations.email, email),
          eq(invitations.status, 'pending'),
        ),
      )
      .limit(1);

    if (existing) {
      throw new BadRequestException('Pending invitation already exists');
    }

    // Get inviter info for email
    const [inviter] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, invitedBy))
      .limit(1);

    const expiresAt = new Date(Date.now() + INVITATION_TOKEN_EXPIRY);

    // Create invitation record first to get ID
    const [invitation] = await db
      .insert(invitations)
      .values({
        teamId,
        email,
        role,
        invitedBy,
        status: 'pending',
        expiresAt,
        deliveryStatus: 'PENDING',
      })
      .returning();

    // Generate token with invitation ID
    const token = this.generateToken({
      invitationId: invitation.id,
      teamId,
      email,
      role,
    });

    // Update with token
    await db
      .update(invitations)
      .set({ token })
      .where(eq(invitations.id, invitation.id));

    // Increment rate limit counters
    await this.incrementRateLimits(invitedBy, teamId);

    // Enqueue email for async delivery
    await this.enqueueEmailDelivery({
      invitationId: invitation.id,
      email,
      teamName: team.name,
      inviterName: inviter?.name || 'A team member',
      token,
      expiresAt: expiresAt.toISOString(),
      role,
    });

    // Log the action
    await this.auditService.logInvitationSent(
      invitedBy,
      teamId,
      invitation.id.toString(),
      email,
      role,
    );

    this.logger.log(
      `Invitation sent to ${email} for team ${teamId} by user ${invitedBy}`,
    );

    return {
      id: invitation.id,
      teamId: invitation.teamId,
      teamName: team.name,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };
  }

  /**
   * Accept an invitation using a token
   */
  async acceptInvitation(token: string, userId: number): Promise<void> {
    const payload = this.validateToken(token);
    if (!payload) {
      throw new BadRequestException('Invalid or expired invitation token');
    }

    // Find the invitation
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.id, payload.invitationId),
          eq(invitations.status, 'pending'),
        ),
      )
      .limit(1);

    if (!invitation) {
      throw new NotFoundException('Invitation not found or already used');
    }

    // Check expiration
    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      await db
        .update(invitations)
        .set({ status: 'expired' })
        .where(eq(invitations.id, invitation.id));
      throw new BadRequestException('Invitation has expired');
    }

    // Verify email matches the user
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new BadRequestException(
        'Invitation was sent to a different email address',
      );
    }

    // Add user to team
    await this.teamService.addMember(
      invitation.teamId,
      userId,
      invitation.role,
      invitation.invitedBy,
    );

    // Mark invitation as accepted
    await db
      .update(invitations)
      .set({
        status: 'accepted',
        acceptedAt: new Date(),
      })
      .where(eq(invitations.id, invitation.id));

    // Log the action
    await this.auditService.logInvitationAccepted(
      userId,
      invitation.teamId,
      invitation.id.toString(),
    );

    this.logger.log(`Invitation ${invitation.id} accepted by user ${userId}`);
  }

  /**
   * Revoke a pending invitation
   */
  async revokeInvitation(
    invitationId: number,
    revokedBy: number,
  ): Promise<boolean> {
    const result = await db
      .update(invitations)
      .set({ status: 'revoked' })
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.status, 'pending'),
        ),
      )
      .returning();

    if (result.length > 0) {
      this.logger.log(
        `Invitation ${invitationId} revoked by user ${revokedBy}`,
      );
    }

    return result.length > 0;
  }

  /**
   * Get pending invitations for a team
   */
  async getTeamInvitations(teamId: number): Promise<InvitationInfo[]> {
    const result = await db
      .select({
        id: invitations.id,
        teamId: invitations.teamId,
        email: invitations.email,
        role: invitations.role,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
      })
      .from(invitations)
      .where(
        and(eq(invitations.teamId, teamId), eq(invitations.status, 'pending')),
      );

    return result;
  }

  /**
   * Get invitation by token (for preview before accepting)
   */
  async getInvitationByToken(token: string): Promise<InvitationInfo | null> {
    const payload = this.validateToken(token);
    if (!payload) {
      return null;
    }

    const [invitation] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.id, payload.invitationId))
      .limit(1);

    if (!invitation) {
      return null;
    }

    // Get team name
    const [team] = await db
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.id, invitation.teamId))
      .limit(1);

    return {
      id: invitation.id,
      teamId: invitation.teamId,
      teamName: team?.name,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };
  }
}
