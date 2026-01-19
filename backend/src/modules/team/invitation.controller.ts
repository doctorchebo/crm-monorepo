import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InvitationService } from './invitation.service';
import { db } from '../../database/db.connection';
import { users } from '../../database/schema';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';

interface AcceptInvitationDto {
  token: string;
  password?: string; // Required only if user doesn't exist
  name?: string; // Optional name for new user
}

interface InvitationPreviewResponse {
  teamName: string;
  inviterName?: string;
  role: string;
  email: string;
  expiresAt: Date | null;
  status: string;
  userExists: boolean;
}

/**
 * InvitationController - Public endpoints for invitation acceptance
 *
 * These endpoints are public (no auth guard) because:
 * 1. Token-based authentication is used instead
 * 2. New users need to accept before they have accounts
 */
@Controller('invitations')
export class InvitationController {
  private readonly logger = new Logger(InvitationController.name);

  constructor(private readonly invitationService: InvitationService) {}

  /**
   * Preview invitation details before accepting
   * Used to show the user what they're accepting
   */
  @Get('preview')
  async previewInvitation(
    @Query('token') token: string,
  ): Promise<InvitationPreviewResponse> {
    if (!token) {
      throw new BadRequestException('Token is required');
    }

    const invitation = await this.invitationService.getInvitationByToken(token);
    if (!invitation) {
      throw new BadRequestException('Invalid or expired invitation');
    }

    if (invitation.status !== 'pending') {
      throw new BadRequestException(
        `Invitation is already ${invitation.status}`,
      );
    }

    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invitation has expired');
    }

    // Check if user already exists
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, invitation.email))
      .limit(1);

    return {
      teamName: invitation.teamName || 'Unknown Team',
      role: invitation.role,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      status: invitation.status,
      userExists: !!existingUser,
    };
  }

  /**
   * Accept an invitation
   *
   * If user exists: Just need the token
   * If new user: Also need password to create account
   */
  @Post('accept')
  async acceptInvitation(@Body() dto: AcceptInvitationDto) {
    if (!dto.token) {
      throw new BadRequestException('Token is required');
    }

    // Get invitation details first
    const invitation = await this.invitationService.getInvitationByToken(
      dto.token,
    );
    if (!invitation) {
      throw new BadRequestException('Invalid or expired invitation');
    }

    if (invitation.status !== 'pending') {
      throw new BadRequestException(
        `Invitation is already ${invitation.status}`,
      );
    }

    // Check if user exists
    const [existingUser] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.email, invitation.email))
      .limit(1);

    let userId: number;

    if (existingUser) {
      // Existing user - just accept the invitation
      userId = existingUser.id;
    } else {
      // New user - need to create account
      if (!dto.password) {
        throw new BadRequestException('Password is required for new users');
      }

      if (dto.password.length < 8) {
        throw new BadRequestException('Password must be at least 8 characters');
      }

      // Create new user
      const passwordHash = await bcrypt.hash(dto.password, 10);
      const userName = dto.name || invitation.email.split('@')[0];

      const [newUser] = await db
        .insert(users)
        .values({
          email: invitation.email,
          name: userName,
          passwordHash,
        })
        .returning();

      userId = newUser.id;
      this.logger.log(
        `Created new user ${userId} for invitation ${invitation.id}`,
      );
    }

    // Accept the invitation (adds user to team)
    await this.invitationService.acceptInvitation(dto.token, userId);

    this.logger.log(`Invitation ${invitation.id} accepted by user ${userId}`);

    return {
      success: true,
      message: existingUser
        ? 'You have joined the team'
        : 'Account created and you have joined the team',
      userId,
      teamId: invitation.teamId,
      teamName: invitation.teamName,
    };
  }
}
