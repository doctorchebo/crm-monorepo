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
} from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@Controller('contacts')
export class ContactsController {
  private readonly logger = new Logger(ContactsController.name);

  constructor(private contactsService: ContactsService) {}

  /**
   * Create a new contact
   * POST /contacts
   */
  @Post()
  async create(@Body() createContactDto: CreateContactDto) {
    this.logger.log(
      `Create contact: ${createContactDto.firstName} ${createContactDto.lastName}`,
    );
    return this.contactsService.create(createContactDto);
  }

  /**
   * Get all contacts
   * GET /contacts
   */
  @Get()
  async findAll(
    @Query('skip') skip: number = 0,
    @Query('take') take: number = 50,
  ) {
    this.logger.log('Get all contacts');
    return this.contactsService.findAll(skip, take);
  }

  /**
   * Get a single contact
   * GET /contacts/:contactId
   */
  @Get(':contactId')
  async findOne(@Param('contactId') contactId: string) {
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

  /**
   * Get contact by phone number
   * GET /contacts/phone/:phoneNumber
   */
  @Get('phone/:phoneNumber')
  async findByPhone(@Param('phoneNumber') phoneNumber: string) {
    this.logger.log(`Get contact by phone: ${phoneNumber}`);
    return this.contactsService.findByPhoneNumber(phoneNumber);
  }
}
