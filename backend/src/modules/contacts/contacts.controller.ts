import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { ContactAttributesService } from './contact-attributes.service';

import { TeamService } from '../team/team.service';
import { ContactsService } from './contacts.service';
import {
  BulkUpsertAttributesDto,
  CreateContactAttributeDto,
  UpdateContactAttributeDto,
} from './dto/contact-attribute.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  private readonly logger = new Logger(ContactsController.name);

  constructor(
    private contactsService: ContactsService,
    private contactAttributesService: ContactAttributesService,
    private teamService: TeamService,
  ) {}

  /**
   * Create a new contact
   * POST /contacts
   */
  @Post()
  async create(@Body() createContactDto: CreateContactDto, @Req() req: any) {
    const userId = req.user?.userId;
    this.logger.log(
      `Create contact: ${createContactDto.firstName} ${createContactDto.lastName}`,
    );
    return this.contactsService.create(userId, createContactDto);
  }

  /**
   * Get all contacts with pagination and search
   * GET /contacts?page=1&limit=20&search=john
   */
  @Get()
  async findAll(
    @Req() req: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('search') search?: string,
  ) {
    const userId = req.user?.userId;
    const teams = await this.teamService.getUserTeams(userId);
    const targetUserId = teams[0]?.ownerId || userId;

    this.logger.log(
      `Get contacts for user ${userId} (target: ${targetUserId}), page=${page}, limit=${limit}, search=${search || 'none'}`,
    );
    return this.contactsService.findAll(targetUserId, page, limit, search);
  }

  /**
   * Get contact by phone number
   * GET /contacts/phone/:phoneNumber
   */
  @Get('phone/:phoneNumber')
  async findByPhone(@Param('phoneNumber') phoneNumber: string) {
    this.logger.log(`Get contact by phone: ${phoneNumber}`);
    return this.contactsService.findByPhoneNumber(phoneNumber);
  }

  /**
   * Get a single contact
   * GET /contacts/:contactId
   */
  @Get(':contactId')
  async findOne(@Param('contactId') contactId: string, @Req() req: any) {
    const userId = req.user?.userId;
    this.logger.log(`Get contact: ${contactId}`);
    return this.contactsService.findOne(contactId);
  }

  /**
   * Update a contact
   * PATCH /contacts/:contactId
   */
  @Patch(':contactId')
  async update(
    @Param('contactId') contactId: string,
    @Body() updateContactDto: UpdateContactDto,
    @Req() req: any,
  ) {
    const userId = req.user?.userId;
    this.logger.log(`Update contact: ${contactId}`);
    return this.contactsService.update(userId, contactId, updateContactDto);
  }

  /**
   * Delete a contact
   * DELETE /contacts/:contactId
   */
  @Delete(':contactId')
  async delete(@Param('contactId') contactId: string, @Req() req: any) {
    const userId = req.user?.userId;
    this.logger.log(`Delete contact: ${contactId}`);
    await this.contactsService.delete(userId, contactId);
    return { success: true };
  }

  /**
   * Bulk delete multiple contacts
   * POST /contacts/bulk-delete
   * Body: { contactIds: string[] }
   */
  @Post('bulk-delete')
  async bulkDelete(@Body() body: { contactIds: string[] }, @Req() req: any) {
    const userId = req.user?.userId;
    const { contactIds } = body;
    this.logger.log(`Bulk delete ${contactIds?.length || 0} contacts`);
    const deletedCount = await this.contactsService.bulkDelete(
      userId,
      contactIds,
    );
    return { success: true, deletedCount };
  }

  // ==================== Contact Attributes Endpoints ====================

  /**
   * Get all attributes for a contact in a specific chat
   * GET /contacts/:contactId/attributes?chatId=xxx
   */
  @Get(':contactId/attributes')
  async getAttributes(
    @Param('contactId') contactId: string,
    @Query('chatId') chatId?: string,
  ) {
    this.logger.log(
      `Get attributes for contact: ${contactId}${chatId ? ` in chat ${chatId}` : ''}`,
    );
    return this.contactAttributesService.getAttributes(contactId, chatId);
  }

  /**
   * Get a specific attribute by key
   * GET /contacts/:contactId/attributes/:key?chatId=xxx
   */
  @Get(':contactId/attributes/:key')
  async getAttribute(
    @Param('contactId') contactId: string,
    @Param('key') key: string,
    @Query('chatId') chatId?: string,
  ) {
    this.logger.log(
      `Get attribute '${key}' for contact: ${contactId}${chatId ? ` in chat ${chatId}` : ''}`,
    );
    return this.contactAttributesService.getAttribute(contactId, key, chatId);
  }

  /**
   * Create or update a single attribute for a specific chat
   * POST /contacts/:contactId/attributes
   * Body: { key, value, valueType?, chatId? }
   */
  @Post(':contactId/attributes')
  async upsertAttribute(
    @Param('contactId') contactId: string,
    @Body() dto: CreateContactAttributeDto,
  ) {
    this.logger.log(
      `Upsert attribute '${dto.key}' for contact: ${contactId}${dto.chatId ? ` in chat ${dto.chatId}` : ''}`,
    );
    return this.contactAttributesService.upsertAttribute(contactId, dto);
  }

  /**
   * Update an attribute value for a specific chat
   * PATCH /contacts/:contactId/attributes/:key
   * Body: { value?, valueType?, chatId? }
   */
  @Patch(':contactId/attributes/:key')
  async updateAttribute(
    @Param('contactId') contactId: string,
    @Param('key') key: string,
    @Body() dto: UpdateContactAttributeDto,
  ) {
    this.logger.log(
      `Update attribute '${key}' for contact: ${contactId}${dto.chatId ? ` in chat ${dto.chatId}` : ''}`,
    );
    return this.contactAttributesService.updateAttribute(contactId, key, dto);
  }

  /**
   * Delete an attribute for a specific chat
   * DELETE /contacts/:contactId/attributes/:key?chatId=xxx
   */
  @Delete(':contactId/attributes/:key')
  async deleteAttribute(
    @Param('contactId') contactId: string,
    @Param('key') key: string,
    @Query('chatId') chatId?: string,
  ) {
    this.logger.log(
      `Delete attribute '${key}' for contact: ${contactId}${chatId ? ` in chat ${chatId}` : ''}`,
    );
    return this.contactAttributesService.deleteAttribute(
      contactId,
      key,
      chatId,
    );
  }

  /**
   * Bulk upsert attributes for a specific chat
   * POST /contacts/:contactId/attributes/bulk
   * Body: { attributes: [...], chatId? }
   */
  @Post(':contactId/attributes/bulk')
  async bulkUpsertAttributes(
    @Param('contactId') contactId: string,
    @Body() dto: BulkUpsertAttributesDto,
  ) {
    this.logger.log(
      `Bulk upsert attributes for contact: ${contactId}${dto.chatId ? ` in chat ${dto.chatId}` : ''}`,
    );
    return this.contactAttributesService.bulkUpsertAttributes(contactId, dto);
  }

  /**
   * Get customer profile (contact + attributes) for template variable resolution
   * GET /contacts/:contactId/profile?chatId=xxx
   */
  @Get(':contactId/profile')
  async getProfile(
    @Param('contactId') contactId: string,
    @Query('chatId') chatId?: string,
  ) {
    this.logger.log(
      `Get profile for contact: ${contactId}${chatId ? ` in chat ${chatId}` : ''}`,
    );
    const contact = await this.contactsService.findOne(contactId);
    const attributes = await this.contactAttributesService.getAttributes(
      contactId,
      chatId,
    );

    return {
      contact,
      attributes,
      // Flatten for easy template access
      customer: {
        first_name: contact.firstName,
        last_name: contact.lastName || '',
        email: contact.email || '',
        phone: contact.phoneNumber,
        full_name: [contact.firstName, contact.lastName]
          .filter(Boolean)
          .join(' '),
      },
      custom: attributes.reduce(
        (map, attr) => {
          map[attr.key] = attr.value;
          return map;
        },
        {} as Record<string, string | null>,
      ),
    };
  }
}
