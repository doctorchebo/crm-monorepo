import {
  Body,
  Controller,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtPayload } from '@shared/types';
import { JwtAuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
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
  async login(@Body() loginDto: LoginDto, @Res() res: any) {
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
  async refresh(@Req() req: any, @Res() res: any) {
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
   */
  @Post('logout')
  async logout(@Res() res: any) {
    this.logger.log('[Auth Controller] Logout request');

    // Clear JWT tokens by setting them with empty values and maxAge: 0
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

  /**
   * Forgot password endpoint (public)
   * POST /auth/forgot-password
   */
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    this.logger.log('[Auth Controller] Forgot password request');
    return this.authService.forgotPassword(dto);
  }

  /**
   * Reset password endpoint (public, with token)
   * POST /auth/reset-password
   */
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    this.logger.log('[Auth Controller] Reset password request');
    return this.authService.resetPassword(dto);
  }

  /**
   * Change password endpoint (authenticated)
   * POST /auth/change-password
   */
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    const user = req.user as JwtPayload;
    this.logger.log('[Auth Controller] Change password request');
    return this.authService.changePassword(user.userId, dto);
  }

  /**
   * Delete account endpoint (authenticated)
   * POST /auth/delete-account
   */
  @Post('delete-account')
  @UseGuards(JwtAuthGuard)
  async deleteAccount(
    @Req() req: any,
    @Body() dto: DeleteAccountDto,
    @Res() res: any,
  ) {
    const user = req.user as JwtPayload;
    this.logger.log('[Auth Controller] Delete account request');
    const result = await this.authService.deleteAccount(user.userId, dto);

    // Clear JWT cookies after account deletion
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

    return res.status(200).json(result);
  }
}
