import { db } from '@database/db.connection';
import { Chat, chats, contacts, messages, senders } from '@database/schema';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';

/**
 * Chats Service
 * Manages WhatsApp conversations/chats
 */
@Injectable()
export class ChatsService {
  private readonly logger = new Logger(ChatsService.name);

  /**
   * Generate a unique chat ID from business phone and participant phone
   * Uses sorted order to ensure the same ID regardless of direction (inbound vs outbound)
   * Removes '+' signs to avoid URL encoding issues in query parameters
   */
  private generateChatId(
    businessPhone: string,
    participantPhone: string,
  ): string {
    // Remove '+' signs to avoid URL encoding issues
    const cleanBusinessPhone = businessPhone.replace(/\+/g, '');
    const cleanParticipantPhone = participantPhone.replace(/\+/g, '');
    const sorted = [cleanBusinessPhone, cleanParticipantPhone].sort();
    return `chat_${sorted.join('_')}`;
  }

  /**
   * Validate that sender belongs to authenticated user
   */
  private async validateSenderBelongsToUser(
    userId: number,
    senderId: number,
  ): Promise<void> {
    const sender = await db.query.senders.findFirst({
      where: and(eq(senders.id, senderId), eq(senders.userId, userId)),
    });

    if (!sender) {
      throw new BadRequestException(
        'Sender not found or does not belong to this user',
      );
    }
  }

  /**
   * Find contact by phone number and return their name if found
   */
  private async getContactNameByPhone(
    participantPhone: string,
  ): Promise<string | null> {
    try {
      const contact = await db.query.contacts.findFirst({
        where: and(
          eq(contacts.phoneNumber, participantPhone),
          eq(contacts.isActive, true),
        ),
      });

      if (contact) {
        const name = contact.lastName
          ? `${contact.firstName} ${contact.lastName}`
          : contact.firstName;
        return name;
      }

      return null;
    } catch (error) {
      this.logger.warn(
        `Error looking up contact for phone ${participantPhone}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Create or get existing chat with a contact
   * This is used when starting a conversation with a contact
   *
   * @param userId - Authenticated user ID
   * @param businessPhone - The WhatsApp business number to use for this chat
   * @param participantPhone - Customer's phone number
   * @param participantName - Customer's name (optional)
   * @param senderId - The sender ID (optional, for validation)
   */
  async createOrGetChatWithContact(
    userId: number,
    businessPhone: string,
    participantPhone: string,
    participantName?: string,
    senderId?: number,
  ): Promise<Chat> {
    try {
      // If senderId is provided, validate it belongs to the user
      if (senderId) {
        await this.validateSenderBelongsToUser(userId, senderId);
      }

      const chatId = this.generateChatId(businessPhone, participantPhone);

      // Check if chat already exists
      let chat = await db.query.chats.findFirst({
        where: eq(chats.chatId, chatId),
      });

      if (chat) {
        this.logger.log(`Chat already exists: ${chatId}`);

        // If chat exists but has no participantName, update it with the contact name
        if (!chat.participantName && (participantName || !participantName)) {
          let nameToUpdate: string | null | undefined = participantName;
          if (!nameToUpdate) {
            nameToUpdate = await this.getContactNameByPhone(participantPhone);
          }

          if (nameToUpdate) {
            const [updatedChat] = await db
              .update(chats)
              .set({
                participantName: nameToUpdate,
                updatedAt: new Date(),
              })
              .where(eq(chats.chatId, chatId))
              .returning();

            this.logger.log(
              `Chat updated with participantName: ${chatId} -> ${nameToUpdate}`,
            );
            return updatedChat;
          }
        }

        return chat;
      }

      // If no participantName provided, try to look it up from contacts
      let finalParticipantName: string | null | undefined = participantName;
      if (!finalParticipantName) {
        finalParticipantName =
          await this.getContactNameByPhone(participantPhone);
      }

      // Create new chat
      const [newChat] = await db
        .insert(chats)
        .values({
          chatId,
          userId,
          businessPhone,
          participantPhone,
          participantName: finalParticipantName || null,
          isActive: true,
        })
        .returning();

      this.logger.log(`Chat created: ${chatId}`);
      return newChat;
    } catch (error) {
      this.logger.error(
        `Error creating/getting chat with contact: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Create a new chat
   */
  async create(userId: number, teamId: string, createChatDto: CreateChatDto) {
    try {
      const chatId = this.generateChatId(
        createChatDto.businessPhone,
        createChatDto.participantPhone,
      );

      const [chat] = await db
        .insert(chats)
        .values({
          chatId,
          userId,
          businessPhone: createChatDto.businessPhone,
          participantPhone: createChatDto.participantPhone,
          participantName: createChatDto.participantName || null,
          isActive: true,
        })
        .returning();

      this.logger.log(`Chat created: ${chatId}`);
      return chat;
    } catch (error) {
      this.logger.error(`Error creating chat: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a single chat
   */
  async findOne(chatId: string): Promise<Chat> {
    try {
      const chat = await db.query.chats.findFirst({
        where: eq(chats.chatId, chatId),
      });

      if (!chat) {
        throw new NotFoundException(`Chat ${chatId} not found`);
      }

      return chat;
    } catch (error) {
      this.logger.error(`Error fetching chat: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all chats for a team
   */
  async findByTeam(
    userId: number,
    teamId: string,
    skip: number = 0,
    take: number = 20,
  ) {
    try {
      const result = await db.query.chats.findMany({
        where: and(eq(chats.userId, userId), eq(chats.isActive, true)),
        limit: take,
        offset: skip,
      });

      // For chats without participantName, try to look up from contacts
      const enrichedChats = await Promise.all(
        result.map(async (chat) => {
          if (!chat.participantName) {
            const contactName = await this.getContactNameByPhone(
              chat.participantPhone,
            );
            if (contactName) {
              return {
                ...chat,
                participantName: contactName,
              };
            }
          }
          return chat;
        }),
      );

      return enrichedChats;
    } catch (error) {
      this.logger.error(`Error fetching team chats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update a chat
   */
  async update(chatId: string, updateChatDto: UpdateChatDto) {
    try {
      // Verify chat exists
      await this.findOne(chatId);

      const updateData: any = {
        updatedAt: new Date(),
      };

      if (updateChatDto.participantName !== undefined) {
        updateData.participantName = updateChatDto.participantName;
      }
      if (updateChatDto.lastMessage !== undefined) {
        updateData.lastMessage = updateChatDto.lastMessage;
      }

      const [updated] = await db
        .update(chats)
        .set(updateData)
        .where(eq(chats.chatId, chatId))
        .returning();

      return updated;
    } catch (error) {
      this.logger.error(`Error updating chat: ${error.message}`);
      throw error;
    }
  }

  /**
   * Close a chat
   */
  async close(chatId: string) {
    try {
      await this.findOne(chatId);

      const [updated] = await db
        .update(chats)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(chats.chatId, chatId))
        .returning();

      return updated;
    } catch (error) {
      this.logger.error(`Error closing chat: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add message to chat
   */
  async addMessage(chatId: string, message: any) {
    try {
      await this.findOne(chatId);

      const [newMessage] = await db
        .insert(messages)
        .values({
          messageId: `msg_${Date.now()}`,
          chatId,
          source: message.source || 'whatsapp',
          sender: message.sender,
          type: message.type || 'text',
          text: message.text,
          direction: message.direction,
          status: message.status || 'sent',
          timestamp: message.timestamp || new Date(),
        })
        .returning();

      return newMessage;
    } catch (error) {
      this.logger.error(`Error adding message: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get messages for a chat
   */
  async getMessages(chatId: string, skip: number = 0, take: number = 50) {
    try {
      await this.findOne(chatId);

      const result = await db.query.messages.findMany({
        where: eq(messages.chatId, chatId),
        limit: take,
        offset: skip,
      });

      return result;
    } catch (error) {
      this.logger.error(`Error fetching messages: ${error.message}`);
      throw error;
    }
  }
}
