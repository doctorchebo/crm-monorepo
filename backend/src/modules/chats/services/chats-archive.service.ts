import { db } from '@database/db.connection';
import { Chat, chats, teamMembers } from '@database/schema';
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { and, desc, eq, sql, SQL } from 'drizzle-orm';
import type { IChatUpdateGateway } from './chat.types';
import { CHAT_UPDATE_GATEWAY } from './chat.types';
import { ChatsCrudService } from './chats-crud.service';

import { ChatVisibilityService } from './chat-visibility.service';

/**
 * Chats Archive Service
 * Handles archive/unarchive operations for chats
 */
@Injectable()
export class ChatsArchiveService {
  private readonly logger = new Logger(ChatsArchiveService.name);

  constructor(
    private readonly crudService: ChatsCrudService,
    @Inject(forwardRef(() => ChatVisibilityService))
    private readonly chatVisibilityService: ChatVisibilityService,
    @Optional()
    @Inject(CHAT_UPDATE_GATEWAY)
    private readonly chatUpdateGateway?: IChatUpdateGateway,
  ) {}

  /**
   * Archive a chat
   */
  async archiveChat(chatId: string): Promise<Chat> {
    try {
      await this.crudService.findOne(chatId);

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
   */
  async unarchiveChat(chatId: string): Promise<Chat> {
    try {
      await this.crudService.findOne(chatId);

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
   */
  async getArchivedChats(
    userId: number,
    skip: number = 0,
    take: number = 20,
    teamId?: number,
  ): Promise<{ chats: Chat[]; total: number }> {
    try {
      // Resolve teamId if not passed (though controller usually passes it)
      // Since archived chats are specific to user context usually, but if we want STRICT enforcement:
      let resolvedTeamId = teamId;
      let role = 'agent';

      // 1. Get User/Team Context
      const teamMembership = await db.query.teamMembers.findFirst({
        where: and(
          eq(teamMembers.userId, userId),
          eq(teamMembers.isActive, true),
        ),
      });

      if (teamMembership) {
        resolvedTeamId = teamMembership.teamId;
        role = teamMembership.role?.toLowerCase() || 'agent';
      }

      if (!resolvedTeamId) {
        return { chats: [], total: 0 };
      }

      // 2. Base Conditions
      const baseConditions: (SQL | undefined)[] = [
        eq(chats.teamId, resolvedTeamId),
        eq(chats.isArchived, true),
      ];

      // 3. Strict Visibility
      const visibilityConditions =
        this.chatVisibilityService.getVisibilityConditions(role, userId);

      if (visibilityConditions.length > 0) {
        baseConditions.push(and(...visibilityConditions));
      }

      this.logger.log(
        `Fetching archived chats for user ${userId} (Role: ${role}) in team ${resolvedTeamId}`,
      );

      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(chats)
        .where(and(...baseConditions));
      const total = countResult[0]?.count || 0;

      const result = await db.query.chats.findMany({
        where: and(...baseConditions),
        orderBy: [desc(chats.archivedAt)],
        limit: take,
        offset: skip,
      });

      const enrichedChats =
        await this.crudService.enrichChatsWithContactNames(result);
      return { chats: enrichedChats, total };
    } catch (error) {
      this.logger.error(
        `Error fetching archived chats for user ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Auto-unarchive a chat when a new message is sent or received
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
}
