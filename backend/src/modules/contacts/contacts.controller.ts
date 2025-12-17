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
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { BulkUpsertAttributesDto, CreateContactAttributeDto, UpdateContactAttributeDto } from './dto/contact-attribute.dto';

@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  private readonly logger = new Logger(ContactsController.name);

  constructor(
    private contactsService: ContactsService,
    private contactAttributesService: ContactAttributesService,
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
   * Get all contacts for current user's registered senders
   * GET /contacts?phoneNumberId=1
   */
  @Get()
  async findAll(
    @Req() req: any,
    @Query('skip') skip: number = 0,
    @Query('take') take: number = 50,
    @Query('phoneNumberId') phoneNumberId?: string,
  ) {
    const userId = req.user?.userId;
    this.logger.log(`Get all contacts for user ${userId}`);
    const phoneNumId = phoneNumberId ? parseInt(phoneNumberId, 10) : undefined;
    return this.contactsService.findAll(userId, skip, take, phoneNumId);
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
  ) {
    this.logger.log(`Update contact: ${contactId}`);
    return this.contactsService.update(contactId, updateContactDto);
  }

  /**
   * Delete a contact
   * DELETE /contacts/:contactId
   */
  @Delete(':contactId')
  async delete(@Param('contactId') contactId: string) {
    this.logger.log(`Delete contact: ${contactId}`);
    await this.contactsService.delete(contactId);
    return { success: true };
  }

  // ==================== Contact Attributes Endpoints ====================

  /**
   * Get all attributes for a contact
   * GET /contacts/:contactId/attributes
   */
  @Get(':contactId/attributes')
  async getAttributes(@Param('contactId') contactId: string) {
    this.logger.log(`Get attributes for contact: ${contactId}`);
    return this.contactAttributesService.getAttributes(contactId);
  }

  /**
   * Get a specific attribute by key
   * GET /contacts/:contactId/attributes/:key
   */
  @Get(':contactId/attributes/:key')
  async getAttribute(
    @Param('contactId') contactId: string,
    @Param('key') key: string,
  ) {
    this.logger.log(`Get attribute '${key}' for contact: ${contactId}`);
    return this.contactAttributesService.getAttribute(contactId, key);
  }

  /**
   * Create or update a single attribute
   * PUT /contacts/:contactId/attributes
   */
  @Post(':contactId/attributes')
  async upsertAttribute(
    @Param('contactId') contactId: string,
    @Body() dto: CreateContactAttributeDto,
  ) {
    this.logger.log(`Upsert attribute '${dto.key}' for contact: ${contactId}`);
    return this.contactAttributesService.upsertAttribute(contactId, dto);
  }

  /**
   * Update an attribute value
   * PATCH /contacts/:contactId/attributes/:key
   */
  @Patch(':contactId/attributes/:key')
  async updateAttribute(
    @Param('contactId') contactId: string,
    @Param('key') key: string,
    @Body() dto: UpdateContactAttributeDto,
  ) {
    this.logger.log(`Update attribute '${key}' for contact: ${contactId}`);
    return this.contactAttributesService.updateAttribute(contactId, key, dto);
  }

  /**
   * Delete an attribute
   * DELETE /contacts/:contactId/attributes/:key
   */
  @Delete(':contactId/attributes/:key')
  async deleteAttribute(
    @Param('contactId') contactId: string,
    @Param('key') key: string,
  ) {
    this.logger.log(`Delete attribute '${key}' for contact: ${contactId}`);
    return this.contactAttributesService.deleteAttribute(contactId, key);
  }

  /**
   * Bulk upsert attributes
   * PUT /contacts/:contactId/attributes/bulk
   */
  @Post(':contactId/attributes/bulk')
  async bulkUpsertAttributes(
    @Param('contactId') contactId: string,
    @Body() dto: BulkUpsertAttributesDto,
  ) {
    this.logger.log(`Bulk upsert attributes for contact: ${contactId}`);
    return this.contactAttributesService.bulkUpsertAttributes(contactId, dto);
  }

  /**
   * Get customer profile (contact + attributes) for template variable resolution
   * GET /contacts/:contactId/profile
   */
  @Get(':contactId/profile')
  async getProfile(@Param('contactId') contactId: string) {
    this.logger.log(`Get profile for contact: ${contactId}`);
    const contact = await this.contactsService.findOne(contactId);
    const attributes =
      await this.contactAttributesService.getAttributes(contactId);

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
