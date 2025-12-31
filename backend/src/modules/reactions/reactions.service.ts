import { db } from '@database/db.connection';
import { messageReactions, users } from '@database/schema';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import {
  CreateReactionDto,
  MessageReactionsDto,
  ReactionResponseDto,
} from './dto/reaction.dto';
import { reactionsGatewayInstance } from './reactions.gateway';

/**
 * Reactions Service
 * Handles CRUD operations for message reactions
 */
@Injectable()
export class ReactionsService {
  private readonly logger = new Logger(ReactionsService.name);

  /**
   * Add or update a reaction to a message
   * If the user already has a reaction on this message, it will be updated
   *
   * @param userId - The user adding the reaction
   * @param dto - The reaction data
   * @returns The created or updated reaction
   */
  async addReaction(
    userId: number,
    dto: CreateReactionDto,
  ): Promise<ReactionResponseDto> {
    const { messageId, emoji } = dto;

    this.logger.log(
      `User ${userId} reacting to message ${messageId} with ${emoji}`,
    );

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

    // Emit WebSocket event for real-time updates
    if (reactionsGatewayInstance) {
      reactionsGatewayInstance.emitReactionAdded(responseDto);
    }

    return responseDto;
  }

  /**
   * Remove a user's reaction from a message
   *
   * @param userId - The user removing their reaction
   * @param messageId - The message ID
   */
  async removeReaction(userId: number, messageId: string): Promise<void> {
    this.logger.log(
      `User ${userId} removing reaction from message ${messageId}`,
    );

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
}
