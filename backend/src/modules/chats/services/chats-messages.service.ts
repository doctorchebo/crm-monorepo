import { db } from '@database/db.connection';
import { messages } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, ilike, lte } from 'drizzle-orm';
import {
  MessageSearchResult,
  SearchMessagesDto,
  SearchMessagesResponse,
} from '../dto/search-messages.dto';
import { ChatsCrudService } from './chats-crud.service';

/**
 * Chats Messages Service
 * Handles message operations within chats
 */
@Injectable()
export class ChatsMessagesService {
  private readonly logger = new Logger(ChatsMessagesService.name);

  constructor(private readonly crudService: ChatsCrudService) {}

  /**
   * Add message to chat
   */
  async addMessage(chatId: string, message: any) {
    try {
      await this.crudService.findOne(chatId);

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
      await this.crudService.findOne(chatId);

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
   */
  async searchMessages(
    chatId: string,
    searchDto: SearchMessagesDto,
  ): Promise<SearchMessagesResponse> {
    try {
      const { query, startDate, endDate, skip = 0, take = 20 } = searchDto;

      await this.crudService.findOne(chatId);

      const conditions: any[] = [
        eq(messages.chatId, chatId),
        eq(messages.isDeleted, false),
        ilike(messages.text, `%${query}%`),
      ];

      if (startDate) {
        conditions.push(gte(messages.timestamp, new Date(startDate)));
      }
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        conditions.push(lte(messages.timestamp, endOfDay));
      }

      const [countResult] = await db
        .select({ count: count() })
        .from(messages)
        .where(and(...conditions));

      const total = countResult?.count || 0;

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
      await this.crudService.findOne(chatId);

      const [countResult] = await db
        .select({ count: count() })
        .from(messages)
        .where(and(eq(messages.chatId, chatId), eq(messages.isDeleted, false)));
      const totalCount = countResult?.count || 0;

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
      await this.crudService.findOne(chatId);

      const [countResult] = await db
        .select({ count: count() })
        .from(messages)
        .where(and(eq(messages.chatId, chatId), eq(messages.isDeleted, false)));
      const totalCount = Number(countResult?.count) || 0;

      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const targetMessage = await db.query.messages.findFirst({
        where: and(
          eq(messages.chatId, chatId),
          eq(messages.isDeleted, false),
          gte(messages.timestamp, startOfDay),
        ),
        orderBy: [asc(messages.timestamp)],
      });

      if (!targetMessage) {
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
}
