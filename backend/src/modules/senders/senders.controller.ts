import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CreateSenderDto } from './dto/create-sender.dto';
import { UpdateSenderDto } from './dto/update-sender.dto';
import { SendersService } from './senders.service';
import { TeamService } from '../team/team.service';

/**
 * Senders Controller
 *
 * REST API endpoints for WhatsApp business phone number management.
 * All phone numbers are managed through the system's single WABA.
 *
 * Endpoints:
 * - POST /senders/sync          - Sync phone numbers from WABA
 * - GET  /senders/waba-info     - Get WABA configuration info
 * - POST /senders               - Create sender manually
 * - GET  /senders               - List all senders
 * - GET  /senders/:id           - Get specific sender
 * - PATCH /senders/:id          - Update sender
 * - DELETE /senders/:id         - Soft delete sender
 * - PATCH /senders/:id/verify   - Verify sender with Meta
 * - PATCH /senders/:id/refresh  - Refresh sender metadata from Meta
 */
@Controller('senders')
@UseGuards(JwtAuthGuard)
export class SendersController {
  private readonly logger = new Logger(SendersController.name);

  constructor(
    private readonly sendersService: SendersService,
    private readonly teamService: TeamService,
  ) {}

  private async resolveTargetUserId(userId: number): Promise<number> {
    const teams = await this.teamService.getUserTeams(userId);
    return teams[0]?.ownerId || userId;
  }

  // ==================== SYNC OPERATIONS ====================

  /**
   * Sync phone numbers from WABA
   * Fetches all phone numbers from Meta WABA and creates/updates senders
   *
   * POST /senders/sync
   */
  @Post('sync')
  async syncFromWaba(@Req() req: any) {
    const userId = req.user?.userId;
    this.logger.log(`Sync WABA phone numbers for user ${userId}`);
    return this.sendersService.syncFromWaba(userId);
  }

  /**
   * Get WABA configuration info
   * Returns the WABA ID for display/reference purposes
   *
   * GET /senders/waba-info
   */
  @Get('waba-info')
  getWabaInfo() {
    const wabaId = this.sendersService.getWabaId();
    return {
      wabaId: wabaId || null,
      isConfigured: !!wabaId,
    };
  }

  // ==================== CRUD OPERATIONS ====================

  /**
   * Create a new sender manually
   * Use sync endpoint for automatic creation from WABA
   *
   * POST /senders
   */
  @Post()
  async create(@Body() createSenderDto: CreateSenderDto, @Req() req: any) {
    const userId = req.user?.userId;
    this.logger.log(`Create sender: ${createSenderDto.phoneNumber}`);
    return this.sendersService.create(userId, createSenderDto);
  }

  /**
   * Get all senders for current user
   *
   * GET /senders
   */
  @Get()
  async findAll(@Req() req: any) {
    const userId = req.user?.userId;
    const targetUserId = await this.resolveTargetUserId(userId);
    this.logger.log(
      `Get all senders for user ${userId} (target: ${targetUserId})`,
    );
    return this.sendersService.findAll(targetUserId);
  }

  /**
   * Get only active senders for current user
   *
   * GET /senders/active
   */
  @Get('active')
  async findAllActive(@Req() req: any) {
    const userId = req.user?.userId;
    const targetUserId = await this.resolveTargetUserId(userId);
    this.logger.log(
      `Get active senders for user ${userId} (target: ${targetUserId})`,
    );
    return this.sendersService.findAllActive(targetUserId);
  }

  /**
   * Get a specific sender by ID
   *
   * GET /senders/:id
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) senderId: number, @Req() req: any) {
    const userId = req.user?.userId;
    const targetUserId = await this.resolveTargetUserId(userId);
    this.logger.log(`Get sender: ${senderId} (target: ${targetUserId})`);
    return this.sendersService.findOne(targetUserId, senderId);
  }

  /**
   * Update a sender
   *
   * PATCH /senders/:id
   */
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) senderId: number,
    @Body() updateSenderDto: UpdateSenderDto,
    @Req() req: any,
  ) {
    const userId = req.user?.userId;
    this.logger.log(`Update sender: ${senderId}`);
    return this.sendersService.update(userId, senderId, updateSenderDto);
  }

  /**
   * Soft delete a sender (mark as inactive)
   *
   * DELETE /senders/:id
   */
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) senderId: number, @Req() req: any) {
    const userId = req.user?.userId;
    this.logger.log(`Delete sender: ${senderId}`);
    return this.sendersService.remove(userId, senderId);
  }

  // ==================== VERIFICATION ====================

  /**
   * Verify sender phone number with Meta
   * Retrieves phoneNumberId and metadata from Meta WABA
   *
   * PATCH /senders/:id/verify
   */
  @Patch(':id/verify')
  async verifySender(
    @Param('id', ParseIntPipe) senderId: number,
    @Req() req: any,
  ) {
    const userId = req.user?.userId;
    this.logger.log(`Verify sender: ${senderId}`);
    return this.sendersService.verifySender(userId, senderId);
  }

  /**
   * Refresh sender metadata from Meta
   * Updates quality rating, verification status, etc.
   *
   * PATCH /senders/:id/refresh
   */
  @Patch(':id/refresh')
  async refreshFromMeta(
    @Param('id', ParseIntPipe) senderId: number,
    @Req() req: any,
  ) {
    const userId = req.user?.userId;
    this.logger.log(`Refresh sender from Meta: ${senderId}`);
    return this.sendersService.refreshFromMeta(userId, senderId);
  }
}
