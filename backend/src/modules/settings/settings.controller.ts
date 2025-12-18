import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { UpdateNotificationSettingsDto } from './dto/settings.dto';
import { SettingsService } from './settings.service';

/**
 * Request interface with authenticated user
 * Matches the payload returned by JwtStrategy.validate()
 */
interface AuthenticatedRequest {
  user: {
    userId: number;
    email: string;
  };
}

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  // =====================================================
  // Notification Settings Endpoints
  // =====================================================

  /**
   * GET /settings/notifications
   * Get the current user's notification settings
   */
  @Get('notifications')
  async getNotificationSettings(@Req() req: AuthenticatedRequest) {
    return this.settingsService.getNotificationSettings(req.user.userId);
  }

  /**
   * PATCH /settings/notifications
   * Update the current user's notification settings
   */
  @Patch('notifications')
  async updateNotificationSettings(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.settingsService.updateNotificationSettings(
      req.user.userId,
      dto,
    );
  }

  // =====================================================
  // Legacy Team Settings Endpoints (placeholder)
  // =====================================================

  @Get('team')
  async getTeamSettings() {
    // TODO: Get teamId from request context
    return this.settingsService.getTeamSettings('teamId');
  }

  @Patch('team')
  async updateTeamSettings(@Body() settings: any) {
    // TODO: Get teamId from request context
    return this.settingsService.updateTeamSettings('teamId', settings);
  }

  @Get('whatsapp')
  async getWhatsAppConfig() {
    // TODO: Get teamId from request context
    return this.settingsService.getWhatsAppConfig('teamId');
  }

  @Patch('whatsapp')
  async updateWhatsAppConfig(@Body() config: any) {
    // TODO: Get teamId from request context
    return this.settingsService.updateWhatsAppConfig('teamId', config);
  }

  @Get('automation')
  async getAutomationSettings() {
    // TODO: Get teamId from request context
    return this.settingsService.getAutomationSettings('teamId');
  }

  @Patch('automation')
  async updateAutomationSettings(@Body() settings: any) {
    // TODO: Get teamId from request context
    return this.settingsService.updateAutomationSettings('teamId', settings);
  }
}
