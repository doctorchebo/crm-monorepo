import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '../../database/db.connection';
import {
  chats,
  passwordResetTokens,
  teamMembers,
  users,
} from '../../database/schema';
import { AuditWriteService } from '../audit/audit-write.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  private logger = new Logger(AuthService.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditWriteService,
  ) {}

  async register(registerDto: RegisterDto) {
    // TODO: Implement user registration with hashed password
    // This would typically involve saving to database and returning user without password
    return {
      message: 'User registered successfully',
      user: { email: registerDto.email, name: registerDto.name },
    };
  }

  async login(loginDto: LoginDto) {
    // Validate credentials against database
    const user = await db.query.users.findFirst({
      where: eq(users.email, loginDto.email),
      columns: {
        id: true,
        email: true,
        passwordHash: true,
        name: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Compare provided password with hashed password
    const isPasswordValid = await compare(loginDto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Create JWT payload with real user ID
    this.logger.log('[Auth Service] User found:', {
      id: user.id,
      email: user.email,
      hasId: !!user.id,
    });

    // Ensure payload has sub (userId) - this is critical for JWT validation
    const payload = {
      email: user.email,
      sub: user.id,
    };

    // Double-check payload contains sub before signing
    if (!payload.sub) {
      this.logger.error('[Auth Service] CRITICAL: Payload missing sub claim!', {
        userId: user.id,
        payload,
      });
      throw new UnauthorizedException('Failed to create authentication token');
    }

    this.logger.log('[Auth Service] JWT payload before signing:', {
      payload,
      payloadKeys: Object.keys(payload),
      sub: payload.sub,
      subType: typeof payload.sub,
    });

    // Token expiration durations (in seconds)
    // IMPORTANT: Must convert to number explicitly, not just type-hint
    const accessExpiresInRaw = this.configService.get<string>('JWT_EXPIRATION');
    const refreshExpiresInRaw = this.configService.get<string>(
      'JWT_REFRESH_EXPIRATION',
    );

    const accessExpiresIn = parseInt(accessExpiresInRaw || '3600', 10); // Default: 1 hour
    const refreshExpiresIn = parseInt(refreshExpiresInRaw || '604800', 10); // Default: 7 days

    this.logger.log('[Auth Service] Token expiration config loaded', {
      accessExpiresIn,
      accessExpiresInType: typeof accessExpiresIn,
      refreshExpiresIn,
      refreshExpiresInType: typeof refreshExpiresIn,
      accessExpiresInMinutes: accessExpiresIn / 60,
      refreshExpiresInDays: refreshExpiresIn / 86400,
    });

    // Issue access token (short-lived: 1 hour by default)
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: accessExpiresIn,
    });

    this.logger.log('[Auth Service] JWT access token signed successfully', {
      accessToken: accessToken.substring(0, 50) + '...',
      expiresIn: accessExpiresIn,
    });

    // Issue refresh token (long-lived: 7 days)
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: refreshExpiresIn,
    });

    this.logger.log('[Auth Service] JWT refresh token signed successfully', {
      refreshToken: refreshToken.substring(0, 50) + '...',
    });

    // Calculate expiration times for client-side tracking
    const accessExpiresAt = new Date(Date.now() + accessExpiresIn * 1000);
    const refreshExpiresAt = new Date(Date.now() + refreshExpiresIn * 1000);

    await this.auditService.logAuthAction({
      userId: user.id,
      action: 'sign_in',
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      expiresAt: {
        access: accessExpiresAt.toISOString(),
        refresh: refreshExpiresAt.toISOString(),
      },
    };
  }

  /**
   * Refresh access token using refresh token
   * Validates refresh token and issues a new access token
   */
  async refreshAccessToken(payload: any) {
    // Payload is already validated by RefreshJwtStrategy
    // RefreshJwtStrategy returns { userId, email }, NOT { sub, email }
    // IMPORTANT: Must convert to number explicitly, not just type-hint
    const expiresInRaw = this.configService.get<string>('JWT_EXPIRATION');
    const expiresIn = parseInt(expiresInRaw || '3600', 10); // Default: 1 hour

    this.logger.log('[Auth Service] Refreshing access token', {
      expiresIn,
      expiresInType: typeof expiresIn,
      expiresInMinutes: expiresIn / 60,
      payloadKeys: Object.keys(payload),
      userId: payload.userId,
      sub: payload.sub,
    });

    // Use userId from payload (set by RefreshJwtStrategy.validate)
    // Create new token with sub claim containing the user ID
    const accessToken = this.jwtService.sign(
      { email: payload.email, sub: payload.userId },
      {
        expiresIn,
      },
    );

    this.logger.log('[Auth Service] Access token refreshed successfully', {
      accessToken: accessToken.substring(0, 50) + '...',
      sub: payload.userId,
    });

    // Calculate expiration time for client-side token tracking
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return {
      access_token: accessToken,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Request password reset - generates token and logs reset link (email via SQS in production)
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const { email } = dto;

    // Find user by email
    const user = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
      columns: { id: true, email: true, name: true },
    });

    // Always return success to prevent email enumeration attacks
    // But only actually create a token if the user exists
    if (user) {
      // Generate a secure random token
      const token = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(token).digest('hex');

      // Token expires in 1 hour
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      // Delete any existing tokens for this user
      await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, user.id));

      // Create new reset token
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt,
      });

      // Log the reset link (in production, this would send via SQS)
      const baseUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        'http://localhost:3000';
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;

      this.logger.log(
        `[Password Reset] Development mode - Reset link for ${user.email}: ${resetUrl}`,
      );

      await this.auditService.logAuthAction({
        userId: user.id,
        action: 'password_reset_requested',
      });
    }

    return {
      success: true,
      message:
        'If an account exists with this email, a reset link has been sent.',
    };
  }

  /**
   * Reset password using token
   */
  async resetPassword(dto: ResetPasswordDto) {
    const { token, password, confirmPassword } = dto;

    if (password !== confirmPassword) {
      throw new BadRequestException("Passwords don't match");
    }

    // Hash the token to look it up
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // Find the reset token
    const resetToken = await db.query.passwordResetTokens.findFirst({
      where: and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        gt(passwordResetTokens.expiresAt, new Date()),
        isNull(passwordResetTokens.usedAt),
      ),
    });

    if (!resetToken) {
      throw new BadRequestException(
        'This reset link is invalid or has expired',
      );
    }

    // Hash the new password
    const passwordHash = await hash(password, 10);

    // Update the user's password
    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, resetToken.userId));

    // Mark the token as used
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, resetToken.id));

    this.logger.log(
      `[Password Reset] Password reset successfully for user ID: ${resetToken.userId}`,
    );

    await this.auditService.logAuthAction({
      userId: resetToken.userId,
      action: 'password_reset_completed',
    });

    return {
      success: true,
      message: 'Password has been reset successfully',
    };
  }

  /**
   * Change password for authenticated user
   */
  async changePassword(userId: number, dto: ChangePasswordDto) {
    const { currentPassword, newPassword, confirmPassword } = dto;

    // Get user with password hash
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Verify current password
    const isPasswordValid = await compare(currentPassword, user.passwordHash);
    if (!isPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Check new password is different
    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    // Check passwords match
    if (newPassword !== confirmPassword) {
      throw new BadRequestException(
        'New password and confirmation password do not match',
      );
    }

    // Hash and update password
    const passwordHash = await hash(newPassword, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, userId));

    this.logger.log(`[Auth Service] Password changed for user ID: ${userId}`);

    await this.auditService.logAuthAction({
      userId,
      action: 'password_changed',
    });

    return {
      success: true,
      message: 'Password updated successfully',
    };
  }

  /**
   * Delete user account (soft delete)
   */
  async deleteAccount(userId: number, dto: DeleteAccountDto) {
    const { password } = dto;

    // Get user with password hash
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true, email: true, passwordHash: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Verify password
    const isPasswordValid = await compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new BadRequestException(
        'Incorrect password. Account deletion failed.',
      );
    }

    // Get user's team membership
    const teamMember = await db.query.teamMembers.findFirst({
      where: eq(teamMembers.userId, userId),
      columns: { teamId: true },
    });

    // Soft delete user
    await db
      .update(users)
      .set({
        deletedAt: sql`CURRENT_TIMESTAMP`,
        email: sql`CONCAT(${user.email}::text, '-', ${userId}::text, '-deleted')`,
      })
      .where(eq(users.id, userId));

    // Handle team chats reassignment if user was part of a team
    if (teamMember) {
      // Find team owner to reassign chats
      const teamOwner = await db.query.teamMembers.findFirst({
        where: and(
          eq(teamMembers.teamId, teamMember.teamId),
          eq(teamMembers.role, 'owner'),
        ),
        columns: { userId: true },
      });

      // Reassign chats to owner if exists and not the same user
      if (teamOwner && teamOwner.userId !== userId) {
        await db
          .update(chats)
          .set({
            assignedTo: teamOwner.userId,
            assignedBy: null,
            assignedAt: new Date(),
          })
          .where(
            and(
              eq(chats.teamId, teamMember.teamId),
              eq(chats.assignedTo, userId),
            ),
          );
      }

      // Remove from team
      await db
        .delete(teamMembers)
        .where(
          and(
            eq(teamMembers.userId, userId),
            eq(teamMembers.teamId, teamMember.teamId),
          ),
        );
    }

    this.logger.log(`[Auth Service] Account deleted for user ID: ${userId}`);

    await this.auditService.logAuthAction({
      userId,
      action: 'account_deleted',
    });

    return {
      success: true,
      message: 'Account deleted successfully',
    };
  }

  /**
   * Logout: decode the JWT (even if expired) to identify the user and log the sign-out.
   * Returns the userId if successfully identified, or null.
   */
  async logout(token: string): Promise<number | null> {
    try {
      // decode() does NOT verify expiration — works for expired access tokens too
      const decoded = this.jwtService.decode(token) as { sub?: number } | null;
      const userId = decoded?.sub;

      if (userId) {
        await this.auditService.logAuthAction({
          userId,
          action: 'sign_out',
        });
        this.logger.log(
          `[Auth Service] Sign-out audit logged for user ID: ${userId}`,
        );
        return userId;
      }
    } catch (error) {
      this.logger.warn(
        '[Auth Service] Could not decode JWT for sign-out audit:',
        error,
      );
    }
    return null;
  }

  async validateUser(email: string, password: string) {
    // TODO: Implement user validation logic
    // Fetch user from database and validate password
    return null;
  }
}
