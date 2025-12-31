import { db } from '@database/db.connection';
import {
  chats,
  customerReactions,
  messageReactions,
  messages,
  users,
} from '@database/schema';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { ConversationWindowService } from '../whatsapp/services/conversation-window.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import {
  CreateReactionDto,
  CustomerReactionResponseDto,
  MessageReactionsDto,
  ReactionResponseDto,
} from './dto/reaction.dto';
import { reactionsGatewayInstance } from './reactions.gateway';

/**
 * Message details needed for WhatsApp reaction sending
 */
interface MessageDetails {
  messageId: string;
  chatId: string;
  direction: string;
}

/**
 * Chat details needed for WhatsApp reaction sending
 */
interface ChatDetails {
  senderId: number;
  participantPhone: string;
}

/**
 * Reactions Service
 * Handles CRUD operations for message reactions
 *
 * TWO TYPES OF REACTIONS:
 * 1. CRM User Reactions (message_reactions table)
 *    - Added by CRM users (agents/admins) in the dashboard
 *    - Only allowed on INBOUND messages (WhatsApp API limitation)
 *    - Sent to WhatsApp so customers see them
 *
 * 2. Customer Reactions (customer_reactions table)
 *    - Received via WhatsApp webhook when customers react
 *    - Can be on ANY message (inbound or outbound)
 *    - Stored for display in CRM dashboard
 *
 * BUSINESS RULES:
 * 1. CRM user reactions are only allowed on INBOUND messages (from customers)
 *    - This is a WhatsApp Cloud API limitation: reactions can only be sent to
 *      messages received from users, not messages sent by the business
 *    - Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/reaction-messages
 *
 * 2. 24-hour conversation window rule is enforced
 *    - CRM reactions are only allowed within the conversation window
 *
 * WHATSAPP INTEGRATION:
 * - CRM user reactions → sent to WhatsApp Cloud API → customer sees them
 * - Customer reactions → received via webhook → stored in customer_reactions
 */
@Injectable()
export class ReactionsService {
  private readonly logger = new Logger(ReactionsService.name);

  constructor(
    private readonly conversationWindowService: ConversationWindowService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  /**
   * Get message details needed for WhatsApp reaction sending
   * @param messageId - The message ID
   * @returns Message details or null if not found
   */
  private async getMessageDetails(
    messageId: string,
  ): Promise<MessageDetails | null> {
    const message = await db
      .select({
        messageId: messages.messageId,
        chatId: messages.chatId,
        direction: messages.direction,
      })
      .from(messages)
      .where(eq(messages.messageId, messageId))
      .limit(1);

    return message[0] ?? null;
  }

  /**
   * Get chat details needed for WhatsApp reaction sending
   * @param chatId - The chat ID
   * @returns Chat details or null if not found
   */
  private async getChatDetails(chatId: string): Promise<ChatDetails | null> {
    const chat = await db
      .select({
        senderId: chats.senderId,
        participantPhone: chats.participantPhone,
      })
      .from(chats)
      .where(eq(chats.chatId, chatId))
      .limit(1);

    return chat[0] ?? null;
  }

  /**
   * Get the chat ID for a message
   * @param messageId - The message ID
   * @returns The chat ID or null if not found
   */
  private async getChatIdForMessage(messageId: string): Promise<string | null> {
    const message = await db
      .select({ chatId: messages.chatId })
      .from(messages)
      .where(eq(messages.messageId, messageId))
      .limit(1);

    return message[0]?.chatId ?? null;
  }

  /**
   * Validate that a reaction can be added (within 24-hour window)
   * @param messageId - The message ID to react to
   * @throws BadRequestException if outside conversation window
   */
  private async validateConversationWindow(messageId: string): Promise<void> {
    const chatId = await this.getChatIdForMessage(messageId);

    if (!chatId) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    const windowStatus =
      await this.conversationWindowService.getWindowStatus(chatId);

    if (!windowStatus.canSendFreeFormMessage) {
      const reason = windowStatus.blockReason || 'window_expired';
      const errorMessage =
        reason === 'no_inbound_messages'
          ? 'Cannot add reaction: customer has not sent any messages yet'
          : 'Cannot add reaction: the 24-hour conversation window has expired. Use an approved template to re-engage the customer first.';

      this.logger.warn(
        `Reaction blocked for message ${messageId} (chat ${chatId}): ${reason}`,
      );

      throw new BadRequestException({
        message: errorMessage,
        error: 'CONVERSATION_WINDOW_VIOLATION',
        reason,
      });
    }
  }

  /**
   * Send a reaction to WhatsApp Cloud API
   *
   * Businesses can send reactions to any message in the conversation:
   * - Inbound messages (messages received from WhatsApp users)
   * - Outbound messages (messages sent by the business)
   *
   * The customer will see the reaction on their WhatsApp app.
   *
   * This method is non-blocking - if the WhatsApp API call fails, the local reaction
   * is still stored and the error is logged. This ensures a good UX while still
   * attempting to sync with WhatsApp.
   *
   * @param messageId - The message ID (WhatsApp wamid)
   * @param emoji - The emoji to react with (empty string to remove)
   */
  private async sendReactionToWhatsApp(
    messageId: string,
    emoji: string,
  ): Promise<void> {
    try {
      // Get message details
      const messageDetails = await this.getMessageDetails(messageId);

      if (!messageDetails) {
        this.logger.warn(
          `Cannot send reaction to WhatsApp: message ${messageId} not found`,
        );
        return;
      }

      // NOTE: At this point, we know the message is inbound because
      // addReaction() validates direction before calling this method.
      // This method should only be called for inbound messages.

      // Get chat details for senderId and recipientPhone
      const chatDetails = await this.getChatDetails(messageDetails.chatId);

      if (!chatDetails) {
        this.logger.warn(
          `Cannot send reaction to WhatsApp: chat ${messageDetails.chatId} not found`,
        );
        return;
      }

      const { senderId, participantPhone } = chatDetails;

      this.logger.log(
        `Sending reaction ${emoji || '(remove)'} to WhatsApp for inbound message ${messageId}`,
      );

      // Send reaction to WhatsApp Cloud API
      const result = await this.whatsAppService.sendReaction(
        senderId,
        participantPhone,
        messageId,
        emoji,
      );

      if (result.success) {
        this.logger.log(
          `WhatsApp reaction sent successfully for message ${messageId}`,
        );
      } else {
        this.logger.warn(
          `WhatsApp reaction failed for message ${messageId}: ${result.error}`,
        );
      }
    } catch (error) {
      // Log but don't throw - we don't want WhatsApp API failures to break local reactions
      this.logger.error(
        `Error sending reaction to WhatsApp for message ${messageId}: ${error.message}`,
        error,
      );
    }
  }

  /**
   * Add or update a reaction to a message
   * If the user already has a reaction on this message, it will be updated
   *
   * IMPORTANT: CRM user reactions are only allowed on INBOUND messages (messages
   * received from customers). This is because WhatsApp Cloud API only supports
   * sending reactions to messages received from users, not messages sent by the
   * business.
   *
   * @param userId - The user adding the reaction
   * @param dto - The reaction data
   * @returns The created or updated reaction
   * @throws BadRequestException if message is outbound or outside 24-hour window
   */
  async addReaction(
    userId: number,
    dto: CreateReactionDto,
  ): Promise<ReactionResponseDto> {
    const { messageId, emoji } = dto;

    this.logger.log(
      `User ${userId} reacting to message ${messageId} with ${emoji}`,
    );

    // Validate message direction - only inbound messages can receive CRM reactions
    const messageDetails = await this.getMessageDetails(messageId);
    if (!messageDetails) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    if (messageDetails.direction !== 'inbound') {
      throw new BadRequestException(
        'Reactions can only be added to customer messages. ' +
          'WhatsApp does not support sending reactions to messages sent by the business.',
      );
    }

    // CRITICAL: Enforce 24-hour conversation window rule
    await this.validateConversationWindow(messageId);

    // Check if user already has a reaction on this message
    const existingReaction = await db
      .select()
      .from(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, userId),
        ),
      )
      .limit(1);

    let reaction;

    if (existingReaction.length > 0) {
      // Update existing reaction
      const [updated] = await db
        .update(messageReactions)
        .set({
          emoji,
          updatedAt: new Date(),
        })
        .where(eq(messageReactions.id, existingReaction[0].id))
        .returning();
      reaction = updated;
      this.logger.log(
        `Updated reaction ${reaction.id} from ${existingReaction[0].emoji} to ${emoji}`,
      );
    } else {
      // Create new reaction
      const [created] = await db
        .insert(messageReactions)
        .values({
          messageId,
          userId,
          emoji,
        })
        .returning();
      reaction = created;
      this.logger.log(`Created new reaction ${reaction.id}`);
    }

    // Fetch user name for response
    const user = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const responseDto: ReactionResponseDto = {
      id: reaction.id,
      messageId: reaction.messageId,
      userId: reaction.userId,
      emoji: reaction.emoji,
      userName: user[0]?.name,
      createdAt: reaction.createdAt,
      updatedAt: reaction.updatedAt,
    };

    // Send reaction to WhatsApp Cloud API (non-blocking)
    // This is done after storing locally to ensure the reaction is persisted
    // even if the WhatsApp API call fails
    this.sendReactionToWhatsApp(messageId, emoji).catch((error) => {
      this.logger.error(
        `Failed to send reaction to WhatsApp: ${error.message}`,
      );
    });

    // Emit WebSocket event for real-time updates
    if (reactionsGatewayInstance) {
      reactionsGatewayInstance.emitReactionAdded(responseDto);
    }

    return responseDto;
  }

  /**
   * Remove a user's reaction from a message
   *
   * IMPORTANT: CRM user reactions are only allowed on INBOUND messages (messages
   * received from customers). Since reactions can only be added to inbound messages,
   * removals should also only apply to inbound messages.
   *
   * @param userId - The user removing their reaction
   * @param messageId - The message ID
   * @throws NotFoundException if no reaction exists
   * @throws BadRequestException if message is outbound
   */
  async removeReaction(userId: number, messageId: string): Promise<void> {
    this.logger.log(
      `User ${userId} removing reaction from message ${messageId}`,
    );

    // Validate message direction - only inbound messages should have CRM reactions
    const messageDetails = await this.getMessageDetails(messageId);
    if (!messageDetails) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    if (messageDetails.direction !== 'inbound') {
      throw new BadRequestException(
        'Reactions can only be removed from customer messages.',
      );
    }

    const result = await db
      .delete(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, userId),
        ),
      )
      .returning();

    if (result.length === 0) {
      throw new NotFoundException(
        `No reaction found for user ${userId} on message ${messageId}`,
      );
    }

    this.logger.log(`Removed reaction ${result[0].id}`);

    // Send reaction removal to WhatsApp Cloud API (empty emoji = remove)
    // This is done after deleting locally to ensure the reaction is removed
    // even if the WhatsApp API call fails
    this.sendReactionToWhatsApp(messageId, '').catch((error) => {
      this.logger.error(
        `Failed to remove reaction from WhatsApp: ${error.message}`,
      );
    });

    // Emit WebSocket event for real-time updates
    if (reactionsGatewayInstance) {
      reactionsGatewayInstance.emitReactionRemoved({ messageId, userId });
    }
  }

  /**
   * Get all reactions for a message
   *
   * @param messageId - The message ID
   * @returns Array of reactions with user information
   */
  async getReactionsForMessage(
    messageId: string,
  ): Promise<ReactionResponseDto[]> {
    const reactions = await db
      .select({
        id: messageReactions.id,
        messageId: messageReactions.messageId,
        userId: messageReactions.userId,
        emoji: messageReactions.emoji,
        createdAt: messageReactions.createdAt,
        updatedAt: messageReactions.updatedAt,
        userName: users.name,
      })
      .from(messageReactions)
      .leftJoin(users, eq(messageReactions.userId, users.id))
      .where(eq(messageReactions.messageId, messageId));

    return reactions.map((r) => ({
      id: r.id,
      messageId: r.messageId,
      userId: r.userId,
      emoji: r.emoji,
      userName: r.userName || undefined,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /**
   * Get reactions for multiple messages (batch query)
   * Used when loading a chat to efficiently fetch all reactions
   *
   * @param messageIds - Array of message IDs
   * @returns Map of message ID to reactions
   */
  async getReactionsForMessages(
    messageIds: string[],
  ): Promise<MessageReactionsDto[]> {
    if (messageIds.length === 0) {
      return [];
    }

    const reactions = await db
      .select({
        id: messageReactions.id,
        messageId: messageReactions.messageId,
        userId: messageReactions.userId,
        emoji: messageReactions.emoji,
        createdAt: messageReactions.createdAt,
        updatedAt: messageReactions.updatedAt,
        userName: users.name,
      })
      .from(messageReactions)
      .leftJoin(users, eq(messageReactions.userId, users.id))
      .where(inArray(messageReactions.messageId, messageIds));

    // Group reactions by message ID
    const reactionsMap = new Map<string, ReactionResponseDto[]>();

    for (const r of reactions) {
      const messageReactions = reactionsMap.get(r.messageId) || [];
      messageReactions.push({
        id: r.id,
        messageId: r.messageId,
        userId: r.userId,
        emoji: r.emoji,
        userName: r.userName || undefined,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      });
      reactionsMap.set(r.messageId, messageReactions);
    }

    // Convert to array format
    return Array.from(reactionsMap.entries()).map(([messageId, reactions]) => ({
      messageId,
      reactions,
    }));
  }

  /**
   * Get a user's reaction on a specific message
   *
   * @param userId - The user ID
   * @param messageId - The message ID
   * @returns The reaction or null if not found
   */
  async getUserReaction(
    userId: number,
    messageId: string,
  ): Promise<ReactionResponseDto | null> {
    const reactions = await db
      .select({
        id: messageReactions.id,
        messageId: messageReactions.messageId,
        userId: messageReactions.userId,
        emoji: messageReactions.emoji,
        createdAt: messageReactions.createdAt,
        updatedAt: messageReactions.updatedAt,
        userName: users.name,
      })
      .from(messageReactions)
      .leftJoin(users, eq(messageReactions.userId, users.id))
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, userId),
        ),
      )
      .limit(1);

    if (reactions.length === 0) {
      return null;
    }

    const r = reactions[0];
    return {
      id: r.id,
      messageId: r.messageId,
      userId: r.userId,
      emoji: r.emoji,
      userName: r.userName || undefined,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  /**
   * Get customer reactions for multiple messages (batch query)
   * Used when loading a chat to efficiently fetch all customer reactions
   *
   * @param messageIds - Array of message IDs
   * @returns Array of customer reactions
   */
  async getCustomerReactionsForMessages(
    messageIds: string[],
  ): Promise<CustomerReactionResponseDto[]> {
    if (messageIds.length === 0) {
      return [];
    }

    const reactions = await db
      .select({
        id: customerReactions.id,
        messageId: customerReactions.messageId,
        waMessageId: customerReactions.waMessageId,
        chatId: customerReactions.chatId,
        senderPhone: customerReactions.senderPhone,
        emoji: customerReactions.emoji,
        isActive: customerReactions.isActive,
        createdAt: customerReactions.createdAt,
        updatedAt: customerReactions.updatedAt,
      })
      .from(customerReactions)
      .where(
        and(
          inArray(customerReactions.messageId, messageIds),
          eq(customerReactions.isActive, true),
        ),
      );

    return reactions.map((r) => ({
      id: r.id,
      messageId: r.messageId,
      waMessageId: r.waMessageId || undefined,
      chatId: r.chatId,
      senderPhone: r.senderPhone,
      emoji: r.emoji || undefined,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /**
   * Get customer reactions for a chat
   * Used when loading a chat to efficiently fetch all customer reactions
   *
   * @param chatId - The chat ID
   * @returns Array of customer reactions
   */
  async getCustomerReactionsForChat(
    chatId: string,
  ): Promise<CustomerReactionResponseDto[]> {
    const reactions = await db
      .select({
        id: customerReactions.id,
        messageId: customerReactions.messageId,
        waMessageId: customerReactions.waMessageId,
        chatId: customerReactions.chatId,
        senderPhone: customerReactions.senderPhone,
        emoji: customerReactions.emoji,
        isActive: customerReactions.isActive,
        createdAt: customerReactions.createdAt,
        updatedAt: customerReactions.updatedAt,
      })
      .from(customerReactions)
      .where(
        and(
          eq(customerReactions.chatId, chatId),
          eq(customerReactions.isActive, true),
        ),
      );

    return reactions.map((r) => ({
      id: r.id,
      messageId: r.messageId,
      waMessageId: r.waMessageId || undefined,
      chatId: r.chatId,
      senderPhone: r.senderPhone,
      emoji: r.emoji || undefined,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }
}
