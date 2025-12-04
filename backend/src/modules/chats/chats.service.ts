import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { db } from '../../database/db.connection';
import { Chat, chats, messages, senders } from '../../database/schema';
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
   */
  private generateChatId(
    businessPhone: string,
    participantPhone: string,
  ): string {
    return `chat_${businessPhone.replace('+', '')}_${participantPhone.replace('+', '')}`;
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
        return chat;
      }

      // Create new chat
      const [newChat] = await db
        .insert(chats)
        .values({
          chatId,
          userId,
          businessPhone,
          participantPhone,
          participantName: participantName || null,
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
      return result;
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
