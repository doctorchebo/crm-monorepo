import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/auth.guard';
import {
  PermissionsGuard,
  RequirePermission,
} from '../../auth/guards/permissions.guard';
import { UpdateCalendarAiSettingsDto } from '../dto';
import { CalendarAiService } from '../services';

@Controller('calendar/ai-settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiSettingsController {
  constructor(private readonly calendarAiService: CalendarAiService) {}

  /**
   * Get AI settings for the authenticated user
   * GET /calendar/ai-settings
   */
  @Get()
  @RequirePermission('calendar.ai.manage')
  async getSettings(@Req() req: any) {
    const userId = Number(req.user.userId);
    return this.calendarAiService.getOrCreateSettings(userId);
  }

  /**
   * Update AI settings for the authenticated user
   * PATCH /calendar/ai-settings
   */
  @Patch()
  @RequirePermission('calendar.ai.manage')
  async updateSettings(
    @Req() req: any,
    @Body() dto: UpdateCalendarAiSettingsDto,
  ) {
    const userId = Number(req.user.userId);
    return this.calendarAiService.updateSettings(userId, dto);
  }
}
