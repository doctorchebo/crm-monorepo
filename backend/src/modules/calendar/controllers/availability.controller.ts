import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/auth.guard';
import {
  PermissionsGuard,
  RequirePermission,
} from '../../auth/guards/permissions.guard';
import {
  AvailabilityQueryDto,
  BulkAvailabilityDto,
  CreateAvailabilityOverrideDto,
  CreateAvailabilityRuleDto,
  UpdateAvailabilityOverrideDto,
  UpdateAvailabilityRuleDto,
} from '../dto';
import { AvailabilityService } from '../services';

@Controller('calendar/availability')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  // ============================================================
  // Availability Rules
  // ============================================================

  /**
   * Create an availability rule
   * POST /calendar/availability/rules
   */
  @Post('rules')
  @RequirePermission('calendar.booking.manage')
  async createRule(@Req() req: any, @Body() dto: CreateAvailabilityRuleDto) {
    const userId = req.user.userId;
    return this.availabilityService.createRule(userId, dto);
  }

  /**
   * Get availability rules
   * GET /calendar/availability/rules
   */
  @Get('rules')
  @RequirePermission('calendar.view')
  async getRules(
    @Req() req: any,
    @Query('bookingLinkId') bookingLinkId?: string,
  ) {
    const userId = req.user.userId;
    return this.availabilityService.getRules(userId, bookingLinkId);
  }

  /**
   * Update an availability rule
   * PATCH /calendar/availability/rules/:id
   */
  @Patch('rules/:id')
  @RequirePermission('calendar.booking.manage')
  async updateRule(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateAvailabilityRuleDto,
  ) {
    const userId = req.user.userId;
    return this.availabilityService.updateRule(id, userId, dto);
  }

  /**
   * Delete an availability rule
   * DELETE /calendar/availability/rules/:id
   */
  @Delete('rules/:id')
  @RequirePermission('calendar.booking.manage')
  async deleteRule(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.userId;
    await this.availabilityService.deleteRule(id, userId);
    return { success: true };
  }

  /**
   * Set bulk weekly availability
   * PUT /calendar/availability/weekly
   */
  @Post('weekly')
  @RequirePermission('calendar.booking.manage')
  async setWeeklyAvailability(
    @Req() req: any,
    @Body() dto: BulkAvailabilityDto,
  ) {
    const userId = req.user.userId;
    return this.availabilityService.setBulkAvailability(userId, dto);
  }

  // ============================================================
  // Availability Overrides
  // ============================================================

  /**
   * Create an availability override
   * POST /calendar/availability/overrides
   */
  @Post('overrides')
  @RequirePermission('calendar.booking.manage')
  async createOverride(
    @Req() req: any,
    @Body() dto: CreateAvailabilityOverrideDto,
  ) {
    const userId = req.user.userId;
    return this.availabilityService.createOverride(userId, dto);
  }

  /**
   * Get availability overrides
   * GET /calendar/availability/overrides
   */
  @Get('overrides')
  @RequirePermission('calendar.view')
  async getOverrides(@Req() req: any, @Query() query: AvailabilityQueryDto) {
    const userId = req.user.userId;

    const startDate = query.startDate ? new Date(query.startDate) : new Date();
    const endDate = query.endDate
      ? new Date(query.endDate)
      : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // Default 90 days

    return this.availabilityService.getOverrides(
      userId,
      startDate,
      endDate,
      query.bookingLinkId,
    );
  }

  /**
   * Update an availability override
   * PATCH /calendar/availability/overrides/:id
   */
  @Patch('overrides/:id')
  @RequirePermission('calendar.booking.manage')
  async updateOverride(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateAvailabilityOverrideDto,
  ) {
    const userId = req.user.userId;
    return this.availabilityService.updateOverride(id, userId, dto);
  }

  /**
   * Delete an availability override
   * DELETE /calendar/availability/overrides/:id
   */
  @Delete('overrides/:id')
  @RequirePermission('calendar.booking.manage')
  async deleteOverride(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.userId;
    await this.availabilityService.deleteOverride(id, userId);
    return { success: true };
  }

  // ============================================================
  // Utility Endpoints
  // ============================================================

  /**
   * Check if a time slot is available
   * GET /calendar/availability/check
   */
  @Get('check')
  @RequirePermission('calendar.view')
  async checkAvailability(
    @Req() req: any,
    @Query('bookingLinkId') bookingLinkId: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
  ) {
    const isAvailable = await this.availabilityService.isSlotAvailable(
      bookingLinkId,
      new Date(startTime),
      new Date(endTime),
    );

    return { available: isAvailable };
  }
}
