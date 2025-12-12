import {
  Body,
  Controller,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshJwtGuard } from './refresh.guard';

@Controller('auth')
export class AuthController {
  private logger = new Logger(AuthController.name);

  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto, @Res() res: Response) {
    this.logger.log('[Auth Controller] Login request received');
    const result = await this.authService.login(loginDto);

    const accessExpiresIn = 60 * 60 * 1000; // 1 hour in ms
    const refreshExpiresIn = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

    // Set access token as HTTP-only cookie
    res.cookie('jwt_token', result.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
      expires: new Date(Date.now() + accessExpiresIn),
    });

    this.logger.log('[Auth Controller] Access token cookie set');

    // Set refresh token as HTTP-only cookie
    res.cookie('jwt_refresh_token', result.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
      expires: new Date(Date.now() + refreshExpiresIn),
    });

    this.logger.log('[Auth Controller] Refresh token cookie set');

    // Log the Set-Cookie headers that will be sent
    const allHeaders = res.getHeaders();
    const setCookieHeaders = allHeaders['set-cookie'];
    this.logger.log(
      '[Auth Controller] Set-Cookie headers before sending response:',
      {
        count: Array.isArray(setCookieHeaders)
          ? setCookieHeaders.length
          : setCookieHeaders
            ? 1
            : 0,
        headers: Array.isArray(setCookieHeaders)
          ? setCookieHeaders
          : setCookieHeaders
            ? [setCookieHeaders]
            : [],
      },
    );

    // CRITICAL: Must use res.json() or res.status().json() to actually send the response
    // and commit the Set-Cookie headers to the response
    return res.status(200).json({
      success: true,
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      user: result.user,
      expiresAt: result.expiresAt,
    });
  }

  /**
   * Refresh access token using refresh token
   * POST /auth/refresh
   * Authorization: Bearer <refresh_token>
   */
  @Post('refresh')
  @UseGuards(RefreshJwtGuard)
  async refresh(@Req() req: any, @Res() res: Response) {
    this.logger.log('[Auth Controller] Refresh token request');
    const result = await this.authService.refreshAccessToken(req.user);

    // Set new access token as HTTP-only cookie
    const accessExpiresIn = 60 * 60 * 1000; // 1 hour in milliseconds

    res.cookie('jwt_token', result.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: accessExpiresIn,
    });

    this.logger.log('[Auth Controller] New access token cookie set');

    return res.status(200).json({
      access_token: result.access_token,
      expiresAt: result.expiresAt,
    });
  }

  /**
   * Logout endpoint
   * POST /auth/logout
   * Clears JWT cookies by setting them with blank value and immediate expiry
   *
   * Note: HTTP-only cookies cannot be deleted directly from the server.
   * Instead, we send a Set-Cookie header with:
   * - Empty string as the value
   * - maxAge: 0 to expire immediately
   * - Same cookie options as when it was set
   *
   * Reference: https://tomdev10.medium.com/exploring-http-only-cookies-54faba1d5d08
   */
  @Post('logout')
  async logout(@Res() res: Response) {
    this.logger.log('[Auth Controller] Logout request');

    // Clear JWT tokens by setting them with empty values and maxAge: 0
    // Must match the exact cookie options from login endpoint
    res.cookie('jwt_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    res.cookie('jwt_refresh_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    this.logger.log(
      '[Auth Controller] JWT cookies cleared via Set-Cookie with maxAge: 0',
    );

    return res.status(200).json({ message: 'Logged out successfully' });
  }
}
