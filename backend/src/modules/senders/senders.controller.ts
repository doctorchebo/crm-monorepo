import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CreateSenderDto } from './dto/create-sender.dto';
import { UpdateSenderDto } from './dto/update-sender.dto';
import { SendersService } from './senders.service';

/**
 * Senders Controller
 * REST API endpoints for WhatsApp business number management
 */
@Controller('senders')
@UseGuards(JwtAuthGuard)
export class SendersController {
  private readonly logger = new Logger(SendersController.name);

  constructor(private readonly sendersService: SendersService) {}

  /**
   * Create a new sender
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
   * GET /senders
   */
  @Get()
  async findAll(@Req() req: any) {
    const userId = req.user?.userId;
    this.logger.log(`Get all senders for user ${userId}`);
    return this.sendersService.findAll(userId);
  }

  /**
   * Get a specific sender
   * GET /senders/:id
   */
  @Get(':id')
  async findOne(@Param('id') senderId: string) {
    this.logger.log(`Get sender: ${senderId}`);
    // TODO: Get userId from auth context
    const userId = 1; // Hardcoded for now
    return this.sendersService.findOne(userId, parseInt(senderId, 10));
  }

  /**
   * Update a sender
   * PATCH /senders/:id
   */
  @Patch(':id')
  async update(
    @Param('id') senderId: string,
    @Body() updateSenderDto: UpdateSenderDto,
  ) {
    this.logger.log(`Update sender: ${senderId}`);
    // TODO: Get userId from auth context
    const userId = 1; // Hardcoded for now
    return this.sendersService.update(
      userId,
      parseInt(senderId, 10),
      updateSenderDto,
    );
  }

  /**
   * Delete (soft delete) a sender
   * DELETE /senders/:id
   */
  @Delete(':id')
  async remove(@Param('id') senderId: string) {
    this.logger.log(`Delete sender: ${senderId}`);
    // TODO: Get userId from auth context
    const userId = 1; // Hardcoded for now
    return this.sendersService.remove(userId, parseInt(senderId, 10));
  }

  /**
   * Get contacts for a sender
   * GET /senders/:id/contacts
   */
  @Get(':id/contacts')
  async getContacts(@Param('id') senderId: string) {
    this.logger.log(`Get contacts for sender: ${senderId}`);
    // TODO: Get userId from auth context
    const userId = 1; // Hardcoded for now
    return this.sendersService.getContacts(userId, parseInt(senderId, 10));
  }

  /**
   * Link a contact to a sender
   * POST /senders/:senderId/contacts/:contactId
   */
  @Post(':senderId/contacts/:contactId')
  async linkContact(
    @Param('senderId') senderId: string,
    @Param('contactId') contactId: string,
    @Body() body?: { isPrimary?: boolean },
  ) {
    this.logger.log(`Link contact to sender: ${contactId} -> ${senderId}`);
    // TODO: Get userId from auth context
    const userId = 1; // Hardcoded for now
    await this.sendersService.linkContact(
      userId,
      parseInt(senderId, 10),
      contactId,
      body?.isPrimary || false,
    );
    return { success: true };
  }

  /**
   * Unlink a contact from a sender
   * DELETE /senders/:senderId/contacts/:contactId
   */
  @Delete(':senderId/contacts/:contactId')
  async unlinkContact(
    @Param('senderId') senderId: string,
    @Param('contactId') contactId: string,
  ) {
    this.logger.log(`Unlink contact from sender: ${contactId} <- ${senderId}`);
    // TODO: Get userId from auth context
    const userId = 1; // Hardcoded for now
    await this.sendersService.unlinkContact(
      userId,
      parseInt(senderId, 10),
      contactId,
    );
    return { success: true };
  }

  /**
   * Verify sender phone number and retrieve phoneNumberId from Meta
   * PATCH /senders/:id/verify
   */
  @Patch(':id/verify')
  async verifySender(@Param('id') senderId: string, @Req() req: any) {
    this.logger.log(`Verify sender: ${senderId}`);
    const userId = req.user?.userId;
    return this.sendersService.verifySender(userId, parseInt(senderId, 10));
  }
}
