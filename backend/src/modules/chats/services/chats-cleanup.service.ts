import { db } from '@database/db.connection';
import {
  Chat,
  chatAiOverrides,
  chats,
  messages,
  rateLimitTracking,
  senders,
  teamMembers,
} from '@database/schema';
import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { S3Service } from '@shared/services/s3.service';
import { and, count, desc, eq, ilike, or, sql, SQL } from 'drizzle-orm';
import { AiMemoryService } from '../../ai-memory/services/ai-memory.service';
import { AuditWriteService } from '../../audit/audit-write.service';
import {
  CHAT_EVENTS,
  ChatDeletedPayload,
} from '../constants/chat-events.constants';
import {
  SearchChatsDto,
  SearchChatsResponse,
  SearchChatsResult,
} from '../dto/search-chats.dto';
import { ChatAccessService } from './chat-access.service';
import { ChatVisibilityService } from './chat-visibility.service';
import type { IChatUpdateGateway } from './chat.types';
import { CHAT_UPDATE_GATEWAY } from './chat.types';
import { ChatsArchiveService } from './chats-archive.service';
import { ChatsCrudService } from './chats-crud.service';

/**
 * Chats Cleanup Service
 * Handles deletion, unread counts, and search operations
 */
@Injectable()
export class ChatsCleanupService {
  private readonly logger = new Logger(ChatsCleanupService.name);

  constructor(
    private readonly crudService: ChatsCrudService,
    private readonly archiveService: ChatsArchiveService,
    private readonly s3Service: S3Service,
    private readonly aiMemoryService: AiMemoryService,
    private readonly eventEmitter: EventEmitter2,
    private readonly chatAccessService: ChatAccessService,
    private readonly auditWriteService: AuditWriteService,
    @Inject(forwardRef(() => ChatVisibilityService))
    private readonly chatVisibilityService: ChatVisibilityService,
    @Optional()
    @Inject(CHAT_UPDATE_GATEWAY)
    private readonly chatUpdateGateway?: IChatUpdateGateway,
  ) {}

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
   * Delete a chat and all associated data
   */
  async deleteChat(chatId: string, userId: number): Promise<void> {
    try {
      const chat = await this.crudService.findOne(chatId);

      // Use ChatAccessService for role-aware authorization:
      // - Owner/Admin: can delete any chat in their team
      // - Agent: can only delete chats assigned to them
      const access = await this.chatAccessService.checkChatAccess(
        userId,
        chatId,
      );
      if (!access.hasAccess) {
        throw new ForbiddenException(
          access.reason || 'You do not have access to this chat',
        );
      }
      if (!access.isAdminOrOwner && chat.userId !== userId) {
        throw new ForbiddenException(
          'You can only delete chats that belong to you',
        );
      }

      this.logger.log(`Starting deletion of chat ${chatId}`);

      const sender = await db.query.senders.findFirst({
        where: eq(senders.id, chat.senderId),
      });

      const s3Prefixes: string[] = [];
      s3Prefixes.push(`inbound/${chatId}/`);
      if (sender?.phoneNumber) {
        s3Prefixes.push(`${sender.phoneNumber}/${chatId}/`);
      }

      this.logger.log(
        `Deleting S3 media with prefixes: ${s3Prefixes.join(', ')}`,
      );

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

      try {
        await this.aiMemoryService.deleteMemoriesForChat(userId, chatId);
        this.logger.log(`Deleted AI memory data for chat ${chatId}`);
      } catch (error) {
        this.logger.warn(
          `Failed to delete AI memory data for chat ${chatId}: ${error.message}`,
        );
      }

      try {
        const rateLimitResult = await db
          .delete(rateLimitTracking)
          .where(eq(rateLimitTracking.chatId, chatId))
          .returning();
        if (rateLimitResult.length > 0) {
          this.logger.log(
            `Deleted ${rateLimitResult.length} rate limit records for chat ${chatId}`,
          );
        }
      } catch (rateLimitError) {
        this.logger.warn(
          `Failed to delete rate limits for chat ${chatId}: ${rateLimitError.message}`,
        );
      }

      try {
        const aiConfigResult = await db
          .delete(chatAiOverrides)
          .where(eq(chatAiOverrides.chatId, chatId))
          .returning();
        if (aiConfigResult.length > 0) {
          this.logger.log(`Deleted AI config override for chat ${chatId}`);
        }
      } catch (aiConfigError) {
        this.logger.warn(
          `Failed to delete AI config for chat ${chatId}: ${aiConfigError.message}`,
        );
      }

      await db.delete(messages).where(eq(messages.chatId, chatId));
      this.logger.log(`Deleted messages for chat ${chatId}`);

      await db.delete(chats).where(eq(chats.chatId, chatId));
      this.logger.log(`Deleted chat ${chatId}`);

      // Audit the chat deletion
      await this.auditWriteService.logChatDeleted({
        userId,
        chatId,
        entityName: chat.participantName ?? undefined,
        metadata: {
          participantPhone: chat.participantPhone,
          isOwnerAction: access.isAdminOrOwner && chat.userId !== userId,
        },
      });

      // Emit WebSocket event for real-time UI updates
      if (this.chatUpdateGateway?.emitChatDeleted) {
        this.chatUpdateGateway.emitChatDeleted(chatId);
      }

      // Emit internal event for workflow and other module cleanup
      // Note: Database CASCADE rules handle most workflow data cleanup
      // This event allows modules to clean up data without FK constraints
      const eventPayload: ChatDeletedPayload = {
        chatId,
        userId,
        deletedAt: new Date().toISOString(),
      };
      this.eventEmitter.emit(CHAT_EVENTS.CHAT_DELETED, eventPayload);
      this.logger.log(
        `Emitted ${CHAT_EVENTS.CHAT_DELETED} event for chat ${chatId}`,
      );
    } catch (error) {
      this.logger.error(`Error deleting chat ${chatId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Increment unread count for a chat
   */
  async incrementUnreadCount(chatId: string): Promise<Chat> {
    try {
      await this.archiveService.autoUnarchiveOnMessage(chatId);

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
   */
  async searchChats(
    userId: number,
    searchDto: SearchChatsDto,
  ): Promise<SearchChatsResponse> {
    try {
      const { query, skip = 0, take = 50 } = searchDto;

      // Lookup user's role/team to apply visibility
      // NOTE: searchChats doesn't take teamId in DTO currently, which is a flaw.
      // We assume user's LAST team or PRIMARY team context.
      // Ideally, the frontend should pass teamId or we derive it from user's active context.
      // For now, let's look up the user's active team membership.

      const teamMembership = await db.query.teamMembers.findFirst({
        where: and(
          eq(teamMembers.userId, userId),
          eq(teamMembers.isActive, true),
        ),
      });

      if (!teamMembership) {
        // No team? Return empty.
        return { results: [], total: 0, hasMore: false, query };
      }

      const teamId = teamMembership.teamId;
      const role = teamMembership.role?.toLowerCase() || 'agent';

      // Use centralized visibility service for ALL conditions (base + role-based)
      // This ensures consistency with Chats page, Kanban page, and other chat displays
      const baseConditions: (SQL | undefined)[] = [
        // REMOVED: eq(chats.userId, userId) - Agents don't own the chats, strictly use teamId + visibility
        eq(chats.teamId, teamId),
        ...this.chatVisibilityService.getAllConditions(role, userId),
      ];

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

        const enrichedResults =
          await this.crudService.enrichChatsWithContactNames(results);

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

      const searchPattern = `%${query.trim()}%`;

      const searchConditions = [
        ...baseConditions,
        or(
          ilike(chats.participantName, searchPattern),
          ilike(chats.participantPhone, searchPattern),
        ),
      ];

      const [countResult] = await db
        .select({ count: count() })
        .from(chats)
        .where(and(...searchConditions));

      const total = Number(countResult?.count) || 0;

      const results = await db
        .select()
        .from(chats)
        .where(and(...searchConditions))
        .orderBy(
          desc(
            sql`CASE WHEN LOWER(${chats.participantName}) = LOWER(${query.trim()}) THEN 1 ELSE 0 END`,
          ),
          desc(
            sql`CASE WHEN LOWER(${chats.participantName}) LIKE LOWER(${query.trim() + '%'}) THEN 1 ELSE 0 END`,
          ),
          desc(
            sql`CASE WHEN ${chats.participantPhone} = ${query.trim()} THEN 1 ELSE 0 END`,
          ),
          desc(sql`${chats.lastMessageTime} IS NULL`),
          desc(chats.lastMessageTime),
        )
        .limit(take)
        .offset(skip);

      const enrichedResults =
        await this.crudService.enrichChatsWithContactNames(results);

      const searchResults: SearchChatsResult[] = enrichedResults.map((chat) => {
        const nameLower = (chat.participantName || '').toLowerCase();
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
}
