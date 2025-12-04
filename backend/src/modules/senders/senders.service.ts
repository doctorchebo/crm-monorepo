import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';
import { db } from '../../database/db.connection';
import { contactSenders, Sender, senders } from '../../database/schema';
import { CreateSenderDto } from './dto/create-sender.dto';
import { UpdateSenderDto } from './dto/update-sender.dto';

/**
 * Senders Service
 * Manages WhatsApp business phone numbers (senders) for users
 */
@Injectable()
export class SendersService {
  private readonly logger = new Logger(SendersService.name);

  /**
   * Create a new sender (WhatsApp business number)
   */
  async create(
    userId: number,
    createSenderDto: CreateSenderDto,
  ): Promise<Sender> {
    try {
      // Check if phone number already exists for this user
      const existingSender = await db.query.senders.findFirst({
        where: and(
          eq(senders.userId, userId),
          eq(senders.phoneNumber, createSenderDto.phoneNumber),
        ),
      });

      if (existingSender) {
        throw new ConflictException(
          'You already have a sender with this phone number',
        );
      }

      const [sender] = await db
        .insert(senders)
        .values({
          userId,
          phoneNumber: createSenderDto.phoneNumber,
          displayName: createSenderDto.displayName || null,
          twilioPhoneNumberSid: createSenderDto.twilioPhoneNumberSid || null,
          twilioMessagingServiceSid:
            createSenderDto.twilioMessagingServiceSid || null,
          twilioAccountSid: createSenderDto.twilioAccountSid || null,
          isActive: true,
          isVerified: false,
          contactCount: 0,
        })
        .returning();

      this.logger.log(`Sender created: ${createSenderDto.phoneNumber}`);
      return sender;
    } catch (error) {
      this.logger.error(`Error creating sender: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all senders for a user
   */
  async findAll(userId: number): Promise<Sender[]> {
    try {
      const result = await db.query.senders.findMany({
        where: eq(senders.userId, userId),
        orderBy: (senders, { desc }) => desc(senders.createdAt),
      });
      return result;
    } catch (error) {
      this.logger.error(`Error fetching senders: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a specific sender by ID
   */
  async findOne(userId: number, senderId: number): Promise<Sender> {
    try {
      const sender = await db.query.senders.findFirst({
        where: and(eq(senders.userId, userId), eq(senders.id, senderId)),
      });

      if (!sender) {
        throw new NotFoundException('Sender not found');
      }

      return sender;
    } catch (error) {
      this.logger.error(`Error fetching sender: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update a sender
   */
  async update(
    userId: number,
    senderId: number,
    updateSenderDto: UpdateSenderDto,
  ): Promise<Sender> {
    try {
      // Verify sender belongs to user
      const sender = await this.findOne(userId, senderId);

      // If updating phone number, check for conflicts
      if (
        updateSenderDto.phoneNumber &&
        updateSenderDto.phoneNumber !== sender.phoneNumber
      ) {
        const existingSender = await db.query.senders.findFirst({
          where: and(
            eq(senders.userId, userId),
            eq(senders.phoneNumber, updateSenderDto.phoneNumber),
          ),
        });

        if (existingSender) {
          throw new ConflictException(
            'You already have a sender with this phone number',
          );
        }
      }

      const [updated] = await db
        .update(senders)
        .set({
          phoneNumber: updateSenderDto.phoneNumber || sender.phoneNumber,
          displayName: updateSenderDto.displayName ?? sender.displayName,
          twilioPhoneNumberSid:
            updateSenderDto.twilioPhoneNumberSid ?? sender.twilioPhoneNumberSid,
          twilioMessagingServiceSid:
            updateSenderDto.twilioMessagingServiceSid ??
            sender.twilioMessagingServiceSid,
          twilioAccountSid:
            updateSenderDto.twilioAccountSid ?? sender.twilioAccountSid,
          updatedAt: new Date(),
        })
        .where(eq(senders.id, senderId))
        .returning();

      this.logger.log(`Sender updated: ${senderId}`);
      return updated;
    } catch (error) {
      this.logger.error(`Error updating sender: ${error.message}`);
      throw error;
    }
  }

  /**
   * Soft delete a sender (mark as inactive)
   * Note: This doesn't delete contacts, just unlinks this sender
   */
  async remove(userId: number, senderId: number): Promise<Sender> {
    try {
      // Verify sender belongs to user
      await this.findOne(userId, senderId);

      // Soft delete: mark as inactive
      const [deleted] = await db
        .update(senders)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(senders.id, senderId))
        .returning();

      // Remove all contact associations
      await db
        .delete(contactSenders)
        .where(eq(contactSenders.senderId, senderId));

      this.logger.log(`Sender soft deleted: ${senderId}`);
      return deleted;
    } catch (error) {
      this.logger.error(`Error deleting sender: ${error.message}`);
      throw error;
    }
  }

  /**
   * Link a contact to a sender
   */
  async linkContact(
    userId: number,
    senderId: number,
    contactId: string,
    isPrimary = false,
  ): Promise<void> {
    try {
      // Verify sender belongs to user
      await this.findOne(userId, senderId);

      // Check if already linked
      const existing = await db.query.contactSenders.findFirst({
        where: and(
          eq(contactSenders.senderId, senderId),
          eq(contactSenders.contactId, contactId as any),
        ),
      });

      if (existing) {
        throw new ConflictException('Contact is already linked to this sender');
      }

      // If setting as primary, unset others first
      if (isPrimary) {
        await db
          .update(contactSenders)
          .set({ isPrimary: false })
          .where(eq(contactSenders.contactId, contactId as any));
      }

      // Link contact
      await db.insert(contactSenders).values({
        contactId: contactId as any,
        senderId,
        isPrimary,
      });

      // Update contact count
      await this.updateContactCount(senderId);

      this.logger.log(`Contact linked to sender: ${contactId} -> ${senderId}`);
    } catch (error) {
      this.logger.error(`Error linking contact: ${error.message}`);
      throw error;
    }
  }

  /**
   * Unlink a contact from a sender
   */
  async unlinkContact(
    userId: number,
    senderId: number,
    contactId: string,
  ): Promise<void> {
    try {
      // Verify sender belongs to user
      await this.findOne(userId, senderId);

      await db
        .delete(contactSenders)
        .where(
          and(
            eq(contactSenders.senderId, senderId),
            eq(contactSenders.contactId, contactId as any),
          ),
        );

      // Update contact count
      await this.updateContactCount(senderId);

      this.logger.log(
        `Contact unlinked from sender: ${contactId} <- ${senderId}`,
      );
    } catch (error) {
      this.logger.error(`Error unlinking contact: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get contacts for a sender
   */
  async getContacts(userId: number, senderId: number) {
    try {
      // Verify sender belongs to user
      await this.findOne(userId, senderId);

      const result = await db.query.contactSenders.findMany({
        where: eq(contactSenders.senderId, senderId),
      });

      return result;
    } catch (error) {
      this.logger.error(`Error fetching sender contacts: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update contact count for a sender (internal helper)
   */
  private async updateContactCount(senderId: number): Promise<void> {
    const result = await db
      .select({
        count: count(),
      })
      .from(contactSenders)
      .where(eq(contactSenders.senderId, senderId));

    const contactCount = result[0]?.count || 0;

    await db
      .update(senders)
      .set({
        contactCount: contactCount,
        updatedAt: new Date(),
      })
      .where(eq(senders.id, senderId));
  }
}
