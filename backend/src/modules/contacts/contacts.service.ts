import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../database/db.connection';
import { Contact, contacts } from '../../database/schema';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

/**
 * Contacts Service
 * Manages WhatsApp contacts
 */
@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  /**
   * Generate a unique contact ID from phone number
   */
  private generateContactId(countryCode: string, phoneNumber: string): string {
    return `contact_${countryCode.replace('+', '')}_${phoneNumber}`;
  }

  /**
   * Create a new contact
   */
  async create(createContactDto: CreateContactDto): Promise<Contact> {
    try {
      const fullPhoneNumber = `${createContactDto.countryCode}${createContactDto.phoneNumber}`;
      const contactId = this.generateContactId(
        createContactDto.countryCode,
        createContactDto.phoneNumber,
      );

      const [contact] = await db
        .insert(contacts)
        .values({
          contactId,
          firstName: createContactDto.firstName,
          lastName: createContactDto.lastName || null,
          countryCode: createContactDto.countryCode,
          phoneNumber: fullPhoneNumber,
          avatar: createContactDto.avatar || null,
          isActive: true,
        })
        .returning();

      this.logger.log(`Contact created: ${contactId}`);
      return contact;
    } catch (error) {
      this.logger.error(`Error creating contact: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all contacts
   */
  async findAll(skip: number = 0, take: number = 50): Promise<Contact[]> {
    try {
      const result = await db.query.contacts.findMany({
        where: eq(contacts.isActive, true),
        orderBy: desc(contacts.lastMessageTime),
        limit: take,
        offset: skip,
      });
      return result;
    } catch (error) {
      this.logger.error(`Error fetching contacts: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a single contact
   */
  async findOne(contactId: string): Promise<Contact> {
    try {
      const contact = await db.query.contacts.findFirst({
        where: eq(contacts.contactId, contactId),
      });

      if (!contact) {
        throw new NotFoundException(`Contact ${contactId} not found`);
      }

      return contact;
    } catch (error) {
      this.logger.error(`Error fetching contact: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update a contact
   */
  async update(
    contactId: string,
    updateContactDto: UpdateContactDto,
  ): Promise<Contact> {
    try {
      // Verify contact exists
      await this.findOne(contactId);

      const updateData: any = {
        updatedAt: new Date(),
      };

      if (updateContactDto.firstName) {
        updateData.firstName = updateContactDto.firstName;
      }
      if (updateContactDto.lastName !== undefined) {
        updateData.lastName = updateContactDto.lastName || null;
      }
      if (updateContactDto.avatar !== undefined) {
        updateData.avatar = updateContactDto.avatar || null;
      }

      // If phone details changed, update the full phone number
      if (updateContactDto.countryCode || updateContactDto.phoneNumber) {
        const contact = await this.findOne(contactId);
        const newCountryCode =
          updateContactDto.countryCode || contact.countryCode;
        const newPhoneNumber =
          updateContactDto.phoneNumber ||
          contact.phoneNumber.replace(contact.countryCode, '');
        updateData.countryCode = newCountryCode;
        updateData.phoneNumber = `${newCountryCode}${newPhoneNumber}`;
      }

      const [updated] = await db
        .update(contacts)
        .set(updateData)
        .where(eq(contacts.contactId, contactId))
        .returning();

      this.logger.log(`Contact updated: ${contactId}`);
      return updated;
    } catch (error) {
      this.logger.error(`Error updating contact: ${error.message}`);
      throw error;
    }
  }

  /**
   * Soft delete a contact (mark as inactive)
   */
  async delete(contactId: string): Promise<void> {
    try {
      // Verify contact exists
      await this.findOne(contactId);

      await db
        .update(contacts)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(contacts.contactId, contactId));

      this.logger.log(`Contact deleted: ${contactId}`);
    } catch (error) {
      this.logger.error(`Error deleting contact: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get contact by phone number
   */
  async findByPhoneNumber(phoneNumber: string): Promise<Contact | null> {
    try {
      const contact = await db.query.contacts.findFirst({
        where: eq(contacts.phoneNumber, phoneNumber),
      });
      return contact ?? null;
    } catch (error) {
      this.logger.error(`Error finding contact by phone: ${error.message}`);
      return null;
    }
  }

  /**
   * Update contact with last message info
   */
  async updateLastMessage(
    contactId: string,
    messagePreview: string,
    messageType: string = 'text',
  ): Promise<void> {
    try {
      await db
        .update(contacts)
        .set({
          lastMessageTime: new Date(),
          lastMessagePreview: messagePreview,
          lastMessageType: messageType,
          updatedAt: new Date(),
        })
        .where(eq(contacts.contactId, contactId));
    } catch (error) {
      this.logger.error(
        `Error updating contact last message: ${error.message}`,
      );
    }
  }
}
