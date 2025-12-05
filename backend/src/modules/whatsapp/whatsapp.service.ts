import { db } from '@database/db.connection';
import { Chat, chats, Message, messages } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import Twilio from 'twilio';
import { OutboundMessageDto } from './dto/outbound-message.dto';

/**
 * WhatsApp Service
 * Handles all Twilio WhatsApp messaging operations
 * - Sending messages via WhatsApp Business
 * - Receiving and storing messages
 * - Message status tracking
 * - Webhook handling for inbound messages and delivery status
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private twilioClient: ReturnType<typeof Twilio>;
  private readonly twilioPhoneNumber = 'whatsapp:+14155238886'; // Your Twilio WhatsApp Business number
  private readonly businessPhoneDisplay = '+14155238886'; // For database storage

  constructor() {
    // Initialize Twilio client
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      this.logger.error('Missing Twilio credentials in environment variables');
      throw new Error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
    }

    this.twilioClient = Twilio(accountSid, authToken);
    this.logger.log('Twilio client initialized');
  }

  /**
   * Generate a unique chat ID from sender and recipient
   * Removes '+' signs to avoid URL encoding issues in query parameters
   */
  private generateChatId(sender: string, recipient: string): string {
    // Remove '+' signs to avoid URL encoding issues
    const cleanSender = sender.replace(/\+/g, '');
    const cleanRecipient = recipient.replace(/\+/g, '');
    const sorted = [cleanSender, cleanRecipient].sort();
    return `chat_${sorted.join('_')}`;
  }

  /**
   * Send a WhatsApp message
   * @param messageDto - Message data (to, body, mediaUrl, contentSid, contentVariables)
   * @returns Message SID from Twilio
   */
  async sendMessage(messageDto: OutboundMessageDto) {
    try {
      const toPhoneNumber = `whatsapp:${messageDto.to}`;

      const messageData: any = {
        from: this.twilioPhoneNumber,
        to: toPhoneNumber,
      };

      // If contentSid is provided, use template-based message
      if (messageDto.contentSid) {
        messageData.contentSid = messageDto.contentSid;
        messageData.contentVariables = messageDto.contentVariables;
      } else if (messageDto.body) {
        // Otherwise use free-form body message
        messageData.body = messageDto.body;
      } else {
        throw new Error('Either body or contentSid must be provided');
      }

      // Add media URL if provided
      if (messageDto.mediaUrl) {
        messageData.mediaUrl = messageDto.mediaUrl;
      }

      // Send message via Twilio
      const message = await this.twilioClient.messages.create(messageData);

      this.logger.log(
        `Message sent successfully. SID: ${message.sid}, To: ${messageDto.to}`,
      );

      // Generate chat ID
      const chatId = this.generateChatId(
        this.businessPhoneDisplay,
        messageDto.to,
      );

      // Ensure chat exists
      await this.getOrCreateChat(
        chatId,
        this.businessPhoneDisplay,
        messageDto.to,
      );

      // Store message metadata in database
      await this.storeOutboundMessage({
        messageSid: message.sid,
        chatId,
        to: messageDto.to,
        body: messageDto.body,
        mediaUrl: messageDto.mediaUrl,
      });

      return {
        success: true,
        messageSid: message.sid,
        to: messageDto.to,
        status: message.status,
      };
    } catch (error) {
      this.logger.error(`Error sending message: ${error.message}`, error);
      throw new Error(`Failed to send WhatsApp message: ${error.message}`);
    }
  } /**
   * Retrieve message status from Twilio
   * @param messageSid - Twilio message SID
   * @returns Message status
   */
  async getMessageStatus(messageSid: string) {
    try {
      const message = await this.twilioClient.messages(messageSid).fetch();
      return {
        messageSid,
        status: message.status,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
      };
    } catch (error) {
      this.logger.error(
        `Error retrieving message status: ${error.message}`,
        error,
      );
      throw new Error(`Failed to retrieve message status: ${error.message}`);
    }
  }

  /**
   * Handle inbound WhatsApp message webhook
   * @param webhookData - Webhook data from Twilio
   */
  async handleInboundMessage(webhookData: any) {
    try {
      const {
        MessageSid,
        From,
        To,
        Body,
        NumMedia,
        MediaUrl0,
        MediaContentType0,
      } = webhookData;

      this.logger.log(
        `Inbound message received. SID: ${MessageSid}, From: ${From}`,
      );

      // Extract phone numbers without 'whatsapp:' prefix for storage
      const senderPhone = From.replace('whatsapp:', '');
      const recipientPhone = To.replace('whatsapp:', '');

      // Generate chat ID
      const chatId = this.generateChatId(recipientPhone, senderPhone);

      // Ensure chat exists
      await this.getOrCreateChat(chatId, recipientPhone, senderPhone);

      // Determine message type
      const messageType = NumMedia && Number(NumMedia) > 0 ? 'media' : 'text';
      const mediaUrl = MediaContentType0
        ? `${MediaUrl0}?ContentType=${MediaContentType0}`
        : null;

      // Store inbound message
      const messageData = {
        messageSid: MessageSid,
        chatId,
        sender: senderPhone,
        recipient: recipientPhone,
        body: Body,
        type: messageType,
        mediaUrl,
        timestamp: new Date(),
      };

      await this.storeInboundMessage(messageData);

      this.logger.log(
        `Inbound message stored. From: ${senderPhone}, Type: ${messageType}`,
      );

      // Update chat with last message
      await this.updateChatLastMessage(chatId, Body);

      // TODO: Trigger automation rules
      // TODO: Notify frontend via WebSocket

      return { success: true, messageSid: MessageSid };
    } catch (error) {
      this.logger.error(
        `Error handling inbound message: ${error.message}`,
        error,
      );
      // Don't throw, just log - Twilio will retry if we don't respond 200
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle message delivery status webhook
   * @param messageSid - Twilio message SID
   * @param messageStatus - Status from Twilio ('sent', 'delivered', 'failed', etc)
   */
  async handleMessageStatus(
    messageSid: string | undefined,
    messageStatus: string | undefined,
  ) {
    try {
      if (!messageSid || !messageStatus) {
        this.logger.warn(
          `Incomplete status webhook. SID: ${messageSid}, Status: ${messageStatus}`,
        );
        return { success: false };
      }

      this.logger.log(
        `Message status update. SID: ${messageSid}, Status: ${messageStatus}`,
      );

      // TODO: Update message status in database
      // TODO: Update chat UI with delivery status

      return { success: true, messageSid, status: messageStatus };
    } catch (error) {
      this.logger.error(
        `Error handling message status: ${error.message}`,
        error,
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Store outbound message metadata in database
   * In production, this would use a database connection
   */
  private async storeOutboundMessage(messageData: any) {
    try {
      await db.insert(messages).values({
        messageId: messageData.messageSid,
        chatId: messageData.chatId,
        source: 'whatsapp',
        sender: this.businessPhoneDisplay,
        type: 'text',
        text: messageData.body,
        mediaUrl: messageData.mediaUrl,
        direction: 'outbound',
        status: 'sent',
        timestamp: new Date(),
      });
      this.logger.debug('Outbound message stored', messageData.messageSid);
      return messageData;
    } catch (error) {
      this.logger.error(`Error storing outbound message: ${error.message}`);
      // Don't throw - message already sent to Twilio
    }
  }

  /**
   * Store inbound message metadata in database
   * In production, this would use a database connection
   */
  private async storeInboundMessage(messageData: any) {
    try {
      await db.insert(messages).values({
        messageId: messageData.messageSid,
        chatId: messageData.chatId,
        source: 'whatsapp',
        sender: messageData.sender,
        type: messageData.type,
        text: messageData.body,
        mediaUrl: messageData.mediaUrl,
        direction: 'inbound',
        status: 'delivered',
        timestamp: messageData.timestamp,
      });
      this.logger.debug('Inbound message stored', messageData.messageSid);
      return messageData;
    } catch (error) {
      this.logger.error(`Error storing inbound message: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get or create a chat for two participants
   */
  private async getOrCreateChat(
    chatId: string,
    businessPhone: string,
    participantPhone: string,
  ): Promise<Chat> {
    try {
      let chat = await db.query.chats.findFirst({
        where: eq(chats.chatId, chatId),
      });

      if (!chat) {
        const [newChat] = await db
          .insert(chats)
          .values({
            chatId,
            businessPhone,
            participantPhone,
            participantName: participantPhone, // Initially set to phone number
            isActive: true,
          })
          .returning();
        this.logger.log(`Chat created: ${chatId}`);
        return newChat;
      }

      return chat;
    } catch (error) {
      this.logger.error(`Error getting or creating chat: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update chat with latest message info
   */
  private async updateChatLastMessage(chatId: string, lastMessage: string) {
    try {
      await db
        .update(chats)
        .set({
          lastMessage,
          lastMessageTime: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(chats.chatId, chatId));
    } catch (error) {
      this.logger.error(`Error updating chat last message: ${error.message}`);
      // Don't throw - not critical
    }
  }

  /**
   * Save a note to a message
   * Multiple users can add notes to the same message
   */
  async saveNote(messageId: string, userId: number, note: string) {
    try {
      // TODO: Store note in database
      // INSERT INTO notes (message_id, user_id, note, created_at) VALUES (...)
      this.logger.log(`Note saved for message ${messageId} by user ${userId}`);
      return {
        success: true,
        messageId,
        userId,
        note,
      };
    } catch (error) {
      this.logger.error(`Error saving note: ${error.message}`, error);
      throw new Error(`Failed to save note: ${error.message}`);
    }
  }

  /**
   * Get all notes for a message
   */
  async getMessageNotes(messageId: string) {
    try {
      // TODO: Retrieve notes from database
      // SELECT * FROM notes WHERE message_id = ...
      this.logger.debug(`Retrieving notes for message ${messageId}`);
      return {
        messageId,
        notes: [],
      };
    } catch (error) {
      this.logger.error(`Error retrieving message notes: ${error.message}`);
      throw new Error(`Failed to retrieve notes: ${error.message}`);
    }
  }

  /**
   * Get all messages for a user/team with optional filters
   */
  async getMessages(filters?: {
    sender?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }) {
    try {
      // TODO: Retrieve messages from database with filters
      this.logger.debug('Retrieving messages with filters', filters);
      return {
        messages: [],
        total: 0,
      };
    } catch (error) {
      this.logger.error(`Error retrieving messages: ${error.message}`);
      throw new Error(`Failed to retrieve messages: ${error.message}`);
    }
  }

  /**
   * Get all chats (conversations)
   */
  async getChats(
    skip: number = 0,
    take: number = 20,
    userId: number,
  ): Promise<Chat[]> {
    try {
      // Get user's senders first
      const userSenders = await db.query.senders.findMany({
        where: eq(require('@database/schema').senders.userId, userId),
        columns: {
          phoneNumber: true,
        },
      });

      const phoneNumbers = userSenders.map((s) => s.phoneNumber);

      if (phoneNumbers.length === 0) {
        return [];
      }

      // Get chats only for this user's senders
      const chatsData = await db.query.chats.findMany({
        where: and(
          eq(chats.isActive, true),
          inArray(chats.businessPhone, phoneNumbers),
        ),
        orderBy: desc(chats.lastMessageTime),
        limit: take,
        offset: skip,
      });
      return chatsData;
    } catch (error) {
      this.logger.error(`Error retrieving chats: ${error.message}`);
      throw new Error(`Failed to retrieve chats: ${error.message}`);
    }
  }

  /**
   * Get messages for a specific chat
   */
  async getChatMessages(
    chatId: string,
    skip: number = 0,
    take: number = 50,
  ): Promise<Message[]> {
    try {
      const chatMessages = await db.query.messages.findMany({
        where: eq(messages.chatId, chatId),
        orderBy: desc(messages.timestamp),
        limit: take,
        offset: skip,
      });
      return chatMessages;
    } catch (error) {
      this.logger.error(`Error retrieving chat messages: ${error.message}`);
      throw new Error(`Failed to retrieve chat messages: ${error.message}`);
    }
  }
}
