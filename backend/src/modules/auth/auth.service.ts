import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../../database/db.connection';
import { users } from '../../database/schema';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private logger = new Logger(AuthService.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
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

  async validateUser(email: string, password: string) {
    // TODO: Implement user validation logic
    // Fetch user from database and validate password
    return null;
  }
}
