import { db } from '@database/db.connection';
import { chats, messages, pinnedMessages, users } from '@database/schema';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, gt, inArray, lt } from 'drizzle-orm';
import {
  CreatePinDto,
  PinCountResponseDto,
  PinnedMessageResponseDto,
} from './dto/pin.dto';
import { pinsGatewayInstance } from './pins.gateway';

const MAX_PINS_PER_CHAT = 3;

/**
 * Pins Service
 * Handles CRUD operations for pinned messages
 */
@Injectable()
export class PinsService {
  private readonly logger = new Logger(PinsService.name);

  /**
   * Get pinned messages for a chat (excluding expired)
   */
  async getPinnedMessages(chatId: string): Promise<PinnedMessageResponseDto[]> {
    const now = new Date();

    // First, clean up expired pins
    await this.cleanupExpiredPins(chatId);

    // Get active pins with message and user data
    const pins = await db
      .select({
        id: pinnedMessages.id,
        messageId: pinnedMessages.messageId,
        chatId: pinnedMessages.chatId,
        pinnedBy: pinnedMessages.pinnedBy,
        pinnedAt: pinnedMessages.pinnedAt,
        expiresAt: pinnedMessages.expiresAt,
        pinnedByName: users.name,
        // Message data
        msgText: messages.text,
        msgType: messages.type,
        msgDirection: messages.direction,
        msgTimestamp: messages.timestamp,
        msgSender: messages.sender,
        msgAttachments: messages.attachments,
      })
      .from(pinnedMessages)
      .leftJoin(users, eq(pinnedMessages.pinnedBy, users.id))
      .leftJoin(messages, eq(pinnedMessages.messageId, messages.messageId))
      .where(
        and(
          eq(pinnedMessages.chatId, chatId),
          gt(pinnedMessages.expiresAt, now),
        ),
      )
      .orderBy(asc(pinnedMessages.pinnedAt));

    // Get chat for participant name
    const chat = await db
      .select({ participantName: chats.participantName })
      .from(chats)
      .where(eq(chats.chatId, chatId))
      .limit(1);

    const participantName = chat[0]?.participantName || 'Unknown';

    return pins.map((p) => ({
      id: p.id,
      messageId: p.messageId,
      chatId: p.chatId,
      pinnedBy: p.pinnedBy,
      pinnedByName: p.pinnedByName || undefined,
      pinnedAt: p.pinnedAt,
      expiresAt: p.expiresAt,
      message: p.msgType
        ? {
            messageId: p.messageId,
            text: p.msgText,
            type: p.msgType,
            direction: p.msgDirection,
            timestamp: p.msgTimestamp?.toISOString() || '',
            sender: p.msgSender,
            attachments: p.msgAttachments as any[],
            senderName: p.msgDirection === 'inbound' ? participantName : 'You',
          }
        : undefined,
    }));
  }

  /**
   * Get pin count for a chat
   */
  async getPinCount(chatId: string): Promise<PinCountResponseDto> {
    const now = new Date();

    // Clean up expired pins first
    await this.cleanupExpiredPins(chatId);

    const pins = await db
      .select({
        id: pinnedMessages.id,
        messageId: pinnedMessages.messageId,
        chatId: pinnedMessages.chatId,
        pinnedBy: pinnedMessages.pinnedBy,
        pinnedAt: pinnedMessages.pinnedAt,
        expiresAt: pinnedMessages.expiresAt,
      })
      .from(pinnedMessages)
      .where(
        and(
          eq(pinnedMessages.chatId, chatId),
          gt(pinnedMessages.expiresAt, now),
        ),
      )
      .orderBy(asc(pinnedMessages.pinnedAt));

    const count = pins.length;
    const canPinMore = count < MAX_PINS_PER_CHAT;

    // Get oldest pin if we're at max
    let oldestPin: PinnedMessageResponseDto | undefined;
    if (!canPinMore && pins.length > 0) {
      const oldest = pins[0];
      oldestPin = {
        id: oldest.id,
        messageId: oldest.messageId,
        chatId: oldest.chatId,
        pinnedBy: oldest.pinnedBy,
        pinnedAt: oldest.pinnedAt,
        expiresAt: oldest.expiresAt,
      };
    }

    return {
      chatId,
      count,
      maxPins: MAX_PINS_PER_CHAT,
      canPinMore,
      oldestPin,
    };
  }

  /**
   * Pin a message
   */
  async pinMessage(
    userId: number,
    dto: CreatePinDto,
  ): Promise<PinnedMessageResponseDto> {
    const { messageId, chatId, duration } = dto;

    this.logger.log(
      `User ${userId} pinning message ${messageId} in chat ${chatId} for ${duration} hours`,
    );

    // Check if message is already pinned
    const existingPin = await db
      .select()
      .from(pinnedMessages)
      .where(
        and(
          eq(pinnedMessages.messageId, messageId),
          eq(pinnedMessages.chatId, chatId),
        ),
      )
      .limit(1);

    if (existingPin.length > 0) {
      throw new BadRequestException('This message is already pinned');
    }

    // Check pin count
    const pinCount = await this.getPinCount(chatId);

    // If at max pins, remove the oldest one
    if (!pinCount.canPinMore && pinCount.oldestPin) {
      this.logger.log(
        `Replacing oldest pin ${pinCount.oldestPin.messageId} with new pin`,
      );
      await this.unpinMessage(userId, {
        messageId: pinCount.oldestPin.messageId,
        chatId,
      });

      // Emit replaced event
      if (pinsGatewayInstance) {
        pinsGatewayInstance.emitPinRemoved({
          messageId: pinCount.oldestPin.messageId,
          chatId,
          reason: 'replaced',
        });
      }
    }

    // Calculate expiration
    const now = new Date();
    const expiresAt = new Date(now.getTime() + duration * 60 * 60 * 1000);

    // Create pin
    const [created] = await db
      .insert(pinnedMessages)
      .values({
        messageId,
        chatId,
        pinnedBy: userId,
        pinnedAt: now,
        expiresAt,
      })
      .returning();

    this.logger.log(`Created pin ${created.id} expiring at ${expiresAt}`);

    // Fetch full response with message data
    const [fullPin] = await this.getPinnedMessages(chatId);
    const responseDto =
      fullPin?.messageId === messageId
        ? fullPin
        : {
            id: created.id,
            messageId: created.messageId,
            chatId: created.chatId,
            pinnedBy: created.pinnedBy,
            pinnedAt: created.pinnedAt,
            expiresAt: created.expiresAt,
          };

    // Get full pin data for response
    const pins = await this.getPinnedMessages(chatId);
    const newPin = pins.find((p) => p.messageId === messageId) || responseDto;

    // Emit WebSocket event
    if (pinsGatewayInstance) {
      pinsGatewayInstance.emitPinAdded(newPin);
    }

    return newPin;
  }

  /**
   * Unpin a message
   */
  async unpinMessage(
    userId: number,
    data: { messageId: string; chatId: string },
  ): Promise<void> {
    const { messageId, chatId } = data;

    this.logger.log(
      `User ${userId} unpinning message ${messageId} in chat ${chatId}`,
    );

    const result = await db
      .delete(pinnedMessages)
      .where(
        and(
          eq(pinnedMessages.messageId, messageId),
          eq(pinnedMessages.chatId, chatId),
        ),
      )
      .returning();

    if (result.length === 0) {
      throw new NotFoundException(`Pin not found for message ${messageId}`);
    }

    this.logger.log(`Removed pin ${result[0].id}`);

    // Emit WebSocket event
    if (pinsGatewayInstance) {
      pinsGatewayInstance.emitPinRemoved({
        messageId,
        chatId,
        reason: 'unpinned',
      });
    }
  }

  /**
   * Check if a message is pinned
   */
  async isMessagePinned(messageId: string, chatId: string): Promise<boolean> {
    const now = new Date();

    const pin = await db
      .select({ id: pinnedMessages.id })
      .from(pinnedMessages)
      .where(
        and(
          eq(pinnedMessages.messageId, messageId),
          eq(pinnedMessages.chatId, chatId),
          gt(pinnedMessages.expiresAt, now),
        ),
      )
      .limit(1);

    return pin.length > 0;
  }

  /**
   * Get pinned message IDs for multiple messages (batch)
   */
  async getPinnedMessageIds(
    chatId: string,
    messageIds: string[],
  ): Promise<string[]> {
    if (messageIds.length === 0) return [];

    const now = new Date();

    const pins = await db
      .select({ messageId: pinnedMessages.messageId })
      .from(pinnedMessages)
      .where(
        and(
          eq(pinnedMessages.chatId, chatId),
          inArray(pinnedMessages.messageId, messageIds),
          gt(pinnedMessages.expiresAt, now),
        ),
      );

    return pins.map((p) => p.messageId);
  }

  /**
   * Clean up expired pins for a chat
   */
  private async cleanupExpiredPins(chatId: string): Promise<void> {
    const now = new Date();

    const expired = await db
      .delete(pinnedMessages)
      .where(
        and(
          eq(pinnedMessages.chatId, chatId),
          lt(pinnedMessages.expiresAt, now),
        ),
      )
      .returning();

    if (expired.length > 0) {
      this.logger.log(
        `Cleaned up ${expired.length} expired pins in chat ${chatId}`,
      );

      // Emit expired events for each
      for (const pin of expired) {
        if (pinsGatewayInstance) {
          pinsGatewayInstance.emitPinRemoved({
            messageId: pin.messageId,
            chatId: pin.chatId,
            reason: 'expired',
          });
        }
      }
    }
  }

  /**
   * Get message with surrounding context for scrolling to a pinned message
   * This is crucial for performance - don't load all messages, just the relevant window
   */
  async getMessageContext(
    chatId: string,
    messageId: string,
    windowSize: number = 25,
  ): Promise<{
    found: boolean;
    message?: any;
    surroundingMessages: any[];
    hasMoreBefore: boolean;
    hasMoreAfter: boolean;
    position: number;
    total: number;
  }> {
    // Get the target message
    const [targetMessage] = await db
      .select()
      .from(messages)
      .where(
        and(eq(messages.chatId, chatId), eq(messages.messageId, messageId)),
      )
      .limit(1);

    if (!targetMessage) {
      return {
        found: false,
        surroundingMessages: [],
        hasMoreBefore: false,
        hasMoreAfter: false,
        position: 0,
        total: 0,
      };
    }

    // Get count of messages before this one
    const beforeCount = await db
      .select()
      .from(messages)
      .where(and(eq(messages.chatId, chatId), eq(messages.isDeleted, false)))
      .then(
        (msgs) =>
          msgs.filter(
            (m) => new Date(m.timestamp) < new Date(targetMessage.timestamp),
          ).length,
      );

    // Get total count
    const totalCount = await db
      .select()
      .from(messages)
      .where(and(eq(messages.chatId, chatId), eq(messages.isDeleted, false)))
      .then((msgs) => msgs.length);

    // Get surrounding messages (windowSize before and after)
    const allMessages = await db
      .select()
      .from(messages)
      .where(and(eq(messages.chatId, chatId), eq(messages.isDeleted, false)))
      .orderBy(asc(messages.timestamp));

    const targetIndex = allMessages.findIndex((m) => m.messageId === messageId);
    const startIndex = Math.max(0, targetIndex - windowSize);
    const endIndex = Math.min(allMessages.length, targetIndex + windowSize + 1);

    const surroundingMessages = allMessages.slice(startIndex, endIndex);

    return {
      found: true,
      message: targetMessage,
      surroundingMessages,
      hasMoreBefore: startIndex > 0,
      hasMoreAfter: endIndex < allMessages.length,
      position: beforeCount + 1,
      total: totalCount,
    };
  }
}
