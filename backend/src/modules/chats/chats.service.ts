import { db } from '@database/db.connection';
import { Chat, chats, contacts, messages, senders } from '@database/schema';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { S3Service } from '@shared/services/s3.service';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { AiMemoryService } from '../ai-memory/services/ai-memory.service';
import { CreateChatDto } from './dto/create-chat.dto';
import {
  SearchChatsDto,
  SearchChatsResponse,
  SearchChatsResult,
} from './dto/search-chats.dto';
import {
  MessageSearchResult,
  SearchMessagesDto,
  SearchMessagesResponse,
} from './dto/search-messages.dto';
import { UpdateChatDto } from './dto/update-chat.dto';

// Interface for the gateway to avoid circular dependency
interface IChatUpdateGateway {
  emitChatUpdate(update: {
    chatId: string;
    unreadCount: number;
    lastMessage?: string;
    lastMessageType?: string;
    lastMessageTime?: Date;
  }): void;
  emitChatArchived?(chatId: string, isArchived: boolean): void;
  emitChatDeleted?(chatId: string): void;
}

// Injection token for the gateway
export const CHAT_UPDATE_GATEWAY = 'CHAT_UPDATE_GATEWAY';

/**
 * Chats Service
 * Manages WhatsApp conversations/chats
 */
@Injectable()
export class ChatsService {
  private readonly logger = new Logger(ChatsService.name);

  constructor(
    private readonly s3Service: S3Service,
    private readonly aiMemoryService: AiMemoryService,
    @Optional()
    @Inject(CHAT_UPDATE_GATEWAY)
    private readonly chatUpdateGateway?: IChatUpdateGateway,
  ) {}

  /**
   * Emit chat update if gateway is available
   */
  private emitChatUpdate(update: {
    chatId: string;
    unreadCount: number;
    lastMessage?: string;
    lastMessageType?: string;
    lastMessageTime?: Date;
  }): void {
    if (this.chatUpdateGateway) {
      try {
        this.chatUpdateGateway.emitChatUpdate(update);
      } catch (error) {
        this.logger.warn(`Failed to emit chat update: ${error.message}`);
      }
    }
  }

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
   * Handles phone number normalization (with or without + prefix)
   */
  private async getContactNameByPhone(
    participantPhone: string,
  ): Promise<string | null> {
    try {
      // Normalize phone number - try both with and without + prefix
      const normalizedPhone = participantPhone.replace(/^\+/, '');
      const phoneWithPlus = `+${normalizedPhone}`;

      const contact = await db.query.contacts.findFirst({
        where: and(
          or(
            eq(contacts.phoneNumber, participantPhone),
            eq(contacts.phoneNumber, normalizedPhone),
            eq(contacts.phoneNumber, phoneWithPlus),
          ),
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
      let finalSenderId = senderId;
      if (finalSenderId) {
        await this.validateSenderBelongsToUser(userId, finalSenderId);
      } else {
        // If no senderId provided, get the first sender for the user
        const userSenders = await db.query.senders.findFirst({
          where: eq(senders.userId, userId),
        });

        if (!userSenders) {
          throw new Error('No senders configured for this user');
        }
        finalSenderId = userSenders.id;
        this.logger.log(
          `No senderId provided, using default sender: ${finalSenderId}`,
        );
      }

      // Type guard: ensure finalSenderId is defined
      if (!finalSenderId) {
        throw new Error('Unable to determine sender ID for chat');
      }

      const chatId = this.generateChatId(businessPhone, participantPhone);

      // Check if chat already exists for this sender
      let chat = await db.query.chats.findFirst({
        where: and(eq(chats.chatId, chatId), eq(chats.senderId, finalSenderId)),
      });

      if (chat) {
        this.logger.log(
          `Chat already exists: ${chatId} for sender ${finalSenderId}`,
        );

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
              .where(
                and(
                  eq(chats.chatId, chatId),
                  eq(chats.senderId, finalSenderId),
                ),
              )
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
          senderId: finalSenderId,
          businessPhone,
          participantPhone,
          participantName: finalParticipantName || null,
          isActive: true,
        })
        .returning();

      this.logger.log(`Chat created: ${chatId} for sender ${finalSenderId}`);
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

      // If senderId provided, validate it belongs to user
      let finalSenderId = createChatDto.senderId;
      if (finalSenderId) {
        await this.validateSenderBelongsToUser(userId, finalSenderId);
      } else {
        // If no senderId, get the first sender for the user
        const userSenders = await db.query.senders.findFirst({
          where: eq(senders.userId, userId),
        });

        if (!userSenders) {
          throw new Error('No senders configured for this user');
        }
        finalSenderId = userSenders.id;
      }

      // Type guard: ensure finalSenderId is defined
      if (!finalSenderId) {
        throw new Error('Unable to determine sender ID for chat');
      }

      const [chat] = await db
        .insert(chats)
        .values({
          chatId,
          userId,
          senderId: finalSenderId,
          businessPhone: createChatDto.businessPhone,
          participantPhone: createChatDto.participantPhone,
          participantName: createChatDto.participantName || null,
          isActive: true,
        })
        .returning();

      this.logger.log(`Chat created: ${chatId} for sender ${finalSenderId}`);
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
   * Get all chats for a team (excludes archived chats)
   */
  async findByTeam(
    userId: number,
    teamId: string,
    skip: number = 0,
    take: number = 20,
  ) {
    try {
      const result = await db.query.chats.findMany({
        where: and(
          eq(chats.userId, userId),
          eq(chats.isActive, true),
          eq(chats.isArchived, false),
        ),
        orderBy: [
          desc(sql`${chats.lastMessageTime} IS NULL`),
          desc(chats.lastMessageTime),
        ],
        limit: take,
        offset: skip,
      });

      // For chats without participantName or where participantName is just the phone number,
      // try to look up from contacts to show actual contact names
      const enrichedChats = await Promise.all(
        result.map(async (chat) => {
          // Check if participantName is missing or is just the phone number
          const needsNameLookup =
            !chat.participantName ||
            chat.participantName === chat.participantPhone ||
            chat.participantName === `+${chat.participantPhone}` ||
            `+${chat.participantName}` === chat.participantPhone;

          if (needsNameLookup) {
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
   * Archive a chat
   * Moves the chat to archived state without deleting any data
   *
   * @param chatId - The chat ID to archive
   * @returns Updated chat with isArchived=true
   */
  async archiveChat(chatId: string): Promise<Chat> {
    try {
      await this.findOne(chatId);

      const [updated] = await db
        .update(chats)
        .set({
          isArchived: true,
          archivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(chats.chatId, chatId))
        .returning();

      this.logger.log(`Chat ${chatId} archived`);

      // Emit archive event via WebSocket
      if (this.chatUpdateGateway?.emitChatArchived) {
        this.chatUpdateGateway.emitChatArchived(chatId, true);
      }

      return updated;
    } catch (error) {
      this.logger.error(`Error archiving chat ${chatId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Unarchive a chat
   * Restores the chat from archived state to active chats list
   *
   * @param chatId - The chat ID to unarchive
   * @returns Updated chat with isArchived=false
   */
  async unarchiveChat(chatId: string): Promise<Chat> {
    try {
      await this.findOne(chatId);

      const [updated] = await db
        .update(chats)
        .set({
          isArchived: false,
          archivedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(chats.chatId, chatId))
        .returning();

      this.logger.log(`Chat ${chatId} unarchived`);

      // Emit unarchive event via WebSocket
      if (this.chatUpdateGateway?.emitChatArchived) {
        this.chatUpdateGateway.emitChatArchived(chatId, false);
      }

      return updated;
    } catch (error) {
      this.logger.error(`Error unarchiving chat ${chatId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all archived chats for a user
   *
   * @param userId - The user ID
   * @param skip - Pagination offset
   * @param take - Number of chats to fetch
   * @returns Array of archived chats
   */
  async getArchivedChats(
    userId: number,
    skip: number = 0,
    take: number = 20,
  ): Promise<{ chats: Chat[]; total: number }> {
    try {
      // Get total count of archived chats
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(chats)
        .where(and(eq(chats.userId, userId), eq(chats.isArchived, true)));
      const total = countResult[0]?.count || 0;

      const result = await db.query.chats.findMany({
        where: and(eq(chats.userId, userId), eq(chats.isArchived, true)),
        orderBy: [desc(chats.archivedAt)],
        limit: take,
        offset: skip,
      });

      // Enrich with contact names
      const enrichedChats = await this.enrichChatsWithContactNames(result);
      return { chats: enrichedChats, total };
    } catch (error) {
      this.logger.error(
        `Error fetching archived chats for user ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Delete a chat and all associated data
   * This permanently deletes:
   * - The chat record
   * - All messages in the chat
   * - All media files in S3 associated with the chat
   * - All AI memory data (embeddings, uploaded content)
   *
   * @param chatId - The chat ID to delete
   * @param userId - The user ID (for authorization)
   */
  async deleteChat(chatId: string, userId: number): Promise<void> {
    try {
      // Verify chat exists and belongs to user
      const chat = await this.findOne(chatId);
      if (chat.userId !== userId) {
        throw new BadRequestException('Chat does not belong to this user');
      }

      this.logger.log(`Starting deletion of chat ${chatId}`);

      // Get the sender info for outbound media path
      const sender = await db.query.senders.findFirst({
        where: eq(senders.id, chat.senderId),
      });

      // Delete S3 media files using prefix-based deletion
      // This ensures ALL files are deleted, including thumbnails and any orphaned files
      const s3Prefixes: string[] = [];

      // 1. Inbound media: inbound/{chatId}/
      s3Prefixes.push(`inbound/${chatId}/`);

      // 2. Outbound media: {senderPhoneNumber}/{chatId}/
      // The sender phone number is used as the folder for outbound messages
      if (sender?.phoneNumber) {
        s3Prefixes.push(`${sender.phoneNumber}/${chatId}/`);
      }

      this.logger.log(
        `Deleting S3 media with prefixes: ${s3Prefixes.join(', ')}`,
      );

      // Delete all files for each prefix
      let totalDeleted = 0;
      const allErrors: string[] = [];

      for (const prefix of s3Prefixes) {
        const result = await this.s3Service.deleteByPrefix(prefix);
        totalDeleted += result.deletedCount;
        allErrors.push(...result.errors);
      }

      this.logger.log(
        `S3 cleanup complete for chat ${chatId}: ${totalDeleted} files deleted, ${allErrors.length} errors`,
      );

      if (allErrors.length > 0) {
        this.logger.warn(`S3 deletion errors: ${allErrors.join('; ')}`);
      }

      // Delete AI memory data (embeddings, uploaded content)
      // This ensures AI starts fresh if customer initiates a new conversation
      try {
        await this.aiMemoryService.deleteMemoriesForChat(userId, chatId);
        this.logger.log(`Deleted AI memory data for chat ${chatId}`);
      } catch (error) {
        // Log but don't fail the deletion if AI memory cleanup fails
        this.logger.warn(
          `Failed to delete AI memory data for chat ${chatId}: ${error.message}`,
        );
      }

      // Delete all messages for the chat
      await db.delete(messages).where(eq(messages.chatId, chatId));
      this.logger.log(`Deleted messages for chat ${chatId}`);

      // Delete the chat
      await db.delete(chats).where(eq(chats.chatId, chatId));
      this.logger.log(`Deleted chat ${chatId}`);

      // Emit delete event via WebSocket
      if (this.chatUpdateGateway?.emitChatDeleted) {
        this.chatUpdateGateway.emitChatDeleted(chatId);
      }
    } catch (error) {
      this.logger.error(`Error deleting chat ${chatId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Auto-unarchive a chat when a new message is sent or received
   * Called automatically when processing incoming or outgoing messages
   *
   * @param chatId - The chat ID to check and potentially unarchive
   */
  async autoUnarchiveOnMessage(chatId: string): Promise<void> {
    try {
      const chat = await db.query.chats.findFirst({
        where: eq(chats.chatId, chatId),
      });

      if (chat && chat.isArchived) {
        await this.unarchiveChat(chatId);
        this.logger.log(`Chat ${chatId} auto-unarchived due to new message`);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to auto-unarchive chat ${chatId}: ${error.message}`,
      );
      // Don't throw - this is a non-critical operation
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

  /**
   * Search messages within a chat
   * Performs efficient full-text search with optional date filtering
   *
   * @param chatId - The chat ID to search within
   * @param searchDto - Search parameters including query, date range, and pagination
   * @returns Search results with matched text highlighting info
   */
  async searchMessages(
    chatId: string,
    searchDto: SearchMessagesDto,
  ): Promise<SearchMessagesResponse> {
    try {
      const { query, startDate, endDate, skip = 0, take = 20 } = searchDto;

      // Validate chat exists
      await this.findOne(chatId);

      // Build query conditions
      const conditions: any[] = [
        eq(messages.chatId, chatId),
        eq(messages.isDeleted, false),
        ilike(messages.text, `%${query}%`),
      ];

      // Add date filters if provided
      if (startDate) {
        conditions.push(gte(messages.timestamp, new Date(startDate)));
      }
      if (endDate) {
        // Include the entire end date day
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        conditions.push(lte(messages.timestamp, endOfDay));
      }

      // Get total count for pagination
      const [countResult] = await db
        .select({ count: count() })
        .from(messages)
        .where(and(...conditions));

      const total = countResult?.count || 0;

      // Fetch matching messages with pagination
      // Order by timestamp ascending to show oldest matches first (chronological)
      const matchingMessages = await db
        .select({
          messageId: messages.messageId,
          chatId: messages.chatId,
          text: messages.text,
          type: messages.type,
          direction: messages.direction,
          status: messages.status,
          timestamp: messages.timestamp,
          sender: messages.sender,
          sentAt: messages.sentAt,
          deliveredAt: messages.deliveredAt,
          readAt: messages.readAt,
          attachments: messages.attachments,
        })
        .from(messages)
        .where(and(...conditions))
        .orderBy(desc(messages.timestamp))
        .limit(take)
        .offset(skip);

      // Process results to add highlighting information
      const results: MessageSearchResult[] = matchingMessages.map((msg) => {
        const text = msg.text || '';
        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const matchStartIndex = lowerText.indexOf(lowerQuery);
        const matchEndIndex =
          matchStartIndex !== -1 ? matchStartIndex + query.length : -1;

        return {
          messageId: msg.messageId,
          chatId: msg.chatId,
          text: text,
          type: msg.type,
          direction: msg.direction as 'inbound' | 'outbound',
          status: msg.status || 'sent',
          timestamp: msg.timestamp,
          sender: msg.sender,
          sentAt: msg.sentAt,
          deliveredAt: msg.deliveredAt,
          readAt: msg.readAt,
          attachments: msg.attachments as any[],
          matchedText: matchStartIndex !== -1 ? query : undefined,
          matchStartIndex: matchStartIndex !== -1 ? matchStartIndex : undefined,
          matchEndIndex: matchEndIndex !== -1 ? matchEndIndex : undefined,
        };
      });

      this.logger.log(
        `Search in chat ${chatId} for "${query}": found ${total} results`,
      );

      return {
        results,
        total,
        hasMore: skip + take < total,
        query,
      };
    } catch (error) {
      this.logger.error(
        `Error searching messages in chat ${chatId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Find a specific message by ID within a chat
   * Used for scroll-to-message functionality
   *
   * @param chatId - The chat ID
   * @param messageId - The message ID to find
   * @returns The message position info including surrounding context
   */
  async getMessagePosition(
    chatId: string,
    messageId: string,
  ): Promise<{
    found: boolean;
    position: number;
    message: any;
    surroundingMessages: any[];
    totalCount: number;
  }> {
    try {
      await this.findOne(chatId);

      // Get total message count
      const [countResult] = await db
        .select({ count: count() })
        .from(messages)
        .where(and(eq(messages.chatId, chatId), eq(messages.isDeleted, false)));
      const totalCount = countResult?.count || 0;

      // Find the target message
      const targetMessage = await db.query.messages.findFirst({
        where: and(
          eq(messages.chatId, chatId),
          eq(messages.messageId, messageId),
        ),
      });

      if (!targetMessage) {
        return {
          found: false,
          position: -1,
          message: null,
          surroundingMessages: [],
          totalCount,
        };
      }

      // Get the position of the message (how many messages are older)
      const [positionResult] = await db
        .select({ count: count() })
        .from(messages)
        .where(
          and(
            eq(messages.chatId, chatId),
            eq(messages.isDeleted, false),
            lte(messages.timestamp, targetMessage.timestamp),
          ),
        );
      const position = positionResult?.count || 0;

      // Fetch surrounding messages (20 before and 20 after)
      const surroundingMessages = await db.query.messages.findMany({
        where: and(eq(messages.chatId, chatId), eq(messages.isDeleted, false)),
        orderBy: [asc(messages.timestamp)],
        limit: 41,
        offset: Math.max(0, position - 21),
      });

      return {
        found: true,
        position,
        message: targetMessage,
        surroundingMessages,
        totalCount,
      };
    } catch (error) {
      this.logger.error(
        `Error getting message position in chat ${chatId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Find the first message on or after a specific date
   * Used for "jump to date" functionality in the message search panel
   *
   * @param chatId - The chat ID
   * @param targetDate - The date to jump to (start of day)
   * @returns The first message on or after that date, with position info
   */
  async findMessageByDate(
    chatId: string,
    targetDate: Date,
  ): Promise<{
    found: boolean;
    messageId: string | null;
    message: any | null;
    position: number;
    totalCount: number;
  }> {
    try {
      await this.findOne(chatId);

      // Get total message count
      const [countResult] = await db
        .select({ count: count() })
        .from(messages)
        .where(and(eq(messages.chatId, chatId), eq(messages.isDeleted, false)));
      const totalCount = Number(countResult?.count) || 0;

      // Normalize to start of day
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      // Find the first message on or after the target date
      const targetMessage = await db.query.messages.findFirst({
        where: and(
          eq(messages.chatId, chatId),
          eq(messages.isDeleted, false),
          gte(messages.timestamp, startOfDay),
        ),
        orderBy: [asc(messages.timestamp)],
      });

      if (!targetMessage) {
        // No message found on or after the date
        // Return the last message instead
        const lastMessage = await db.query.messages.findFirst({
          where: and(
            eq(messages.chatId, chatId),
            eq(messages.isDeleted, false),
          ),
          orderBy: [desc(messages.timestamp)],
        });

        if (!lastMessage) {
          return {
            found: false,
            messageId: null,
            message: null,
            position: 0,
            totalCount,
          };
        }

        return {
          found: true,
          messageId: lastMessage.messageId,
          message: lastMessage,
          position: totalCount,
          totalCount,
        };
      }

      // Get the position of this message (how many messages are before it)
      const [positionResult] = await db
        .select({ count: count() })
        .from(messages)
        .where(
          and(
            eq(messages.chatId, chatId),
            eq(messages.isDeleted, false),
            lte(messages.timestamp, targetMessage.timestamp),
          ),
        );
      const position = Number(positionResult?.count) || 0;

      this.logger.log(
        `Found message by date in chat ${chatId}: ${targetMessage.messageId} at position ${position}`,
      );

      return {
        found: true,
        messageId: targetMessage.messageId,
        message: targetMessage,
        position,
        totalCount,
      };
    } catch (error) {
      this.logger.error(
        `Error finding message by date in chat ${chatId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Increment unread count for a chat
   * Called when a new inbound message arrives
   * Also auto-unarchives the chat if it was archived
   *
   * @param chatId - The chat ID to increment
   * @returns Updated chat with new unread count
   */
  async incrementUnreadCount(chatId: string): Promise<Chat> {
    try {
      // Auto-unarchive if needed (doesn't throw on failure)
      await this.autoUnarchiveOnMessage(chatId);

      const [updated] = await db
        .update(chats)
        .set({
          unreadCount: sql`${chats.unreadCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(chats.chatId, chatId))
        .returning();

      if (!updated) {
        throw new NotFoundException(`Chat ${chatId} not found`);
      }

      this.logger.log(
        `Incremented unread count for chat ${chatId} to ${updated.unreadCount}`,
      );

      // Emit chat update via WebSocket for real-time UI updates
      this.emitChatUpdate({
        chatId,
        unreadCount: updated.unreadCount,
        lastMessage: updated.lastMessage || undefined,
        lastMessageTime: updated.lastMessageTime || undefined,
      });

      return updated;
    } catch (error) {
      this.logger.error(
        `Error incrementing unread count for chat ${chatId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Reset unread count for a chat to zero
   * Called when user opens/reads a chat
   *
   * @param chatId - The chat ID to reset
   * @returns Updated chat with zero unread count
   */
  async resetUnreadCount(chatId: string): Promise<Chat> {
    try {
      const [updated] = await db
        .update(chats)
        .set({
          unreadCount: 0,
          updatedAt: new Date(),
        })
        .where(eq(chats.chatId, chatId))
        .returning();

      if (!updated) {
        throw new NotFoundException(`Chat ${chatId} not found`);
      }

      this.logger.log(`Reset unread count for chat ${chatId}`);

      // Emit chat update via WebSocket for real-time UI updates
      this.emitChatUpdate({
        chatId,
        unreadCount: 0,
        lastMessage: updated.lastMessage || undefined,
        lastMessageTime: updated.lastMessageTime || undefined,
      });

      return updated;
    } catch (error) {
      this.logger.error(
        `Error resetting unread count for chat ${chatId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get total unread count across all chats for a user
   *
   * @param userId - The user ID
   * @returns Total unread count
   */
  async getTotalUnreadCount(userId: number): Promise<number> {
    try {
      const result = await db
        .select({
          total: sql<number>`COALESCE(SUM(${chats.unreadCount}), 0)`,
        })
        .from(chats)
        .where(and(eq(chats.userId, userId), eq(chats.isActive, true)));

      return Number(result[0]?.total) || 0;
    } catch (error) {
      this.logger.error(
        `Error getting total unread count for user ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Search chats by participant name or phone number
   * Uses PostgreSQL ILIKE for case-insensitive partial matching
   * Optimized with indexes on participantName and participantPhone
   *
   * @param userId - The user ID
   * @param searchDto - Search parameters
   * @returns Paginated search results
   */
  async searchChats(
    userId: number,
    searchDto: SearchChatsDto,
  ): Promise<SearchChatsResponse> {
    try {
      const { query, skip = 0, take = 50 } = searchDto;

      // Base conditions: user's active, non-archived chats
      const baseConditions = [
        eq(chats.userId, userId),
        eq(chats.isActive, true),
        eq(chats.isArchived, false),
      ];

      // If no query, return all chats with pagination
      if (!query || query.trim().length === 0) {
        const [countResult] = await db
          .select({ count: count() })
          .from(chats)
          .where(and(...baseConditions));

        const total = Number(countResult?.count) || 0;

        const results = await db.query.chats.findMany({
          where: and(...baseConditions),
          orderBy: [
            desc(sql`${chats.lastMessageTime} IS NULL`),
            desc(chats.lastMessageTime),
          ],
          limit: take,
          offset: skip,
        });

        // Enrich with contact names
        const enrichedResults = await this.enrichChatsWithContactNames(results);

        return {
          results: enrichedResults.map((chat) => ({
            chatId: chat.chatId,
            senderId: chat.senderId,
            businessPhone: chat.businessPhone || undefined,
            participantPhone: chat.participantPhone,
            participantName: chat.participantName || undefined,
            lastMessage: chat.lastMessage || undefined,
            lastMessageType: chat.lastMessageType || undefined,
            lastMessageTime: chat.lastMessageTime || undefined,
            unreadCount: chat.unreadCount || 0,
          })),
          total,
          hasMore: skip + take < total,
        };
      }

      // Normalize query for search
      const searchPattern = `%${query.trim()}%`;

      // Build search conditions: match name OR phone
      const searchConditions = [
        ...baseConditions,
        or(
          ilike(chats.participantName, searchPattern),
          ilike(chats.participantPhone, searchPattern),
        ),
      ];

      // Get total count for pagination
      const [countResult] = await db
        .select({ count: count() })
        .from(chats)
        .where(and(...searchConditions));

      const total = Number(countResult?.count) || 0;

      // Get matching chats with pagination
      // Order: exact name matches first, then partial matches, then by last message time
      const results = await db
        .select()
        .from(chats)
        .where(and(...searchConditions))
        .orderBy(
          // Prioritize exact name matches
          desc(
            sql`CASE WHEN LOWER(${chats.participantName}) = LOWER(${query.trim()}) THEN 1 ELSE 0 END`,
          ),
          // Then name starts with query
          desc(
            sql`CASE WHEN LOWER(${chats.participantName}) LIKE LOWER(${query.trim() + '%'}) THEN 1 ELSE 0 END`,
          ),
          // Then exact phone matches
          desc(
            sql`CASE WHEN ${chats.participantPhone} = ${query.trim()} THEN 1 ELSE 0 END`,
          ),
          // Finally by last message time
          desc(sql`${chats.lastMessageTime} IS NULL`),
          desc(chats.lastMessageTime),
        )
        .limit(take)
        .offset(skip);

      // Enrich with contact names and determine match field
      const enrichedResults = await this.enrichChatsWithContactNames(results);

      const searchResults: SearchChatsResult[] = enrichedResults.map((chat) => {
        // Determine which field matched
        const nameLower = (chat.participantName || '').toLowerCase();
        const phoneLower = chat.participantPhone.toLowerCase();
        const queryLower = query.trim().toLowerCase();

        let matchedField: 'name' | 'phone' = 'phone';
        if (nameLower.includes(queryLower)) {
          matchedField = 'name';
        }

        return {
          chatId: chat.chatId,
          senderId: chat.senderId,
          businessPhone: chat.businessPhone || undefined,
          participantPhone: chat.participantPhone,
          participantName: chat.participantName || undefined,
          lastMessage: chat.lastMessage || undefined,
          lastMessageType: chat.lastMessageType || undefined,
          lastMessageTime: chat.lastMessageTime || undefined,
          unreadCount: chat.unreadCount || 0,
          matchedField,
        };
      });

      this.logger.log(
        `Search chats for user ${userId}: query="${query}", found ${total} results`,
      );

      return {
        results: searchResults,
        total,
        hasMore: skip + take < total,
        query,
      };
    } catch (error) {
      this.logger.error(
        `Error searching chats for user ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Helper method to enrich chats with contact names from the contacts table
   * Handles cases where participantName is missing or is just the phone number
   */
  private async enrichChatsWithContactNames(chatList: Chat[]): Promise<Chat[]> {
    return Promise.all(
      chatList.map(async (chat) => {
        // Check if participantName is missing or is just the phone number
        const needsNameLookup =
          !chat.participantName ||
          chat.participantName === chat.participantPhone ||
          chat.participantName === `+${chat.participantPhone}` ||
          `+${chat.participantName}` === chat.participantPhone;

        if (needsNameLookup) {
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
  }
}
