import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../../database/db.connection';
import { chats, users } from '../../../database/schema';
import { AuditService } from '../../../shared/services/audit.service';

export interface ChatAssignment {
  chatId: string;
  assignedTo: number | null;
  assignedToName?: string;
  assignedAt: Date | null;
  assignedBy: number | null;
  assignedByName?: string;
  teamId: number | null;
  participantName?: string | null;
  participantPhone?: string | null;
}

/**
 * ChatAssignmentService - Manages chat assignment to team members
 *
 * Key concepts:
 * - Assignment ≠ Lock (assignment is long-lived responsibility, lock is short-term control)
 * - Agents can only work on chats assigned to them
 * - Admins/Owners can assign any chat
 */
@Injectable()
export class ChatAssignmentService {
  private readonly logger = new Logger(ChatAssignmentService.name);

  constructor(private auditService: AuditService) {}

  /**
   * Assign a chat to a user
   */
  async assignChat(
    chatId: string,
    assigneeId: number,
    assignedBy: number,
  ): Promise<ChatAssignment> {
    // Verify chat exists
    const [chat] = await db
      .select()
      .from(chats)
      .where(eq(chats.chatId, chatId))
      .limit(1);

    if (!chat) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    // Verify assignee exists
    const [assignee] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.id, assigneeId))
      .limit(1);

    if (!assignee) {
      throw new NotFoundException(`User ${assigneeId} not found`);
    }

    // Update assignment
    const [updated] = await db
      .update(chats)
      .set({
        assignedTo: assigneeId,
        assignedAt: new Date(),
        assignedBy: assignedBy,
        updatedAt: new Date(),
      })
      .where(eq(chats.chatId, chatId))
      .returning();

    // Log the action
    if (chat.teamId) {
      await this.auditService.logChatAssigned(
        assignedBy,
        chat.teamId,
        chatId,
        assigneeId,
        assignedBy,
      );
    }

    this.logger.log(
      `Chat ${chatId} assigned to user ${assigneeId} by user ${assignedBy}`,
    );

    return {
      chatId: updated.chatId,
      assignedTo: updated.assignedTo,
      assignedToName: assignee.name,
      assignedAt: updated.assignedAt,
      assignedBy: updated.assignedBy,
      teamId: updated.teamId,
    };
  }

  /**
   * Reassign a chat to a different user
   */
  async reassignChat(
    chatId: string,
    newAssigneeId: number,
    reassignedBy: number,
  ): Promise<ChatAssignment> {
    // This is essentially the same as assignChat but with different logging
    const result = await this.assignChat(chatId, newAssigneeId, reassignedBy);

    this.logger.log(
      `Chat ${chatId} reassigned to user ${newAssigneeId} by user ${reassignedBy}`,
    );

    return result;
  }

  /**
   * Remove assignment from a chat
   */
  async unassignChat(
    chatId: string,
    unassignedBy: number,
  ): Promise<ChatAssignment> {
    const [updated] = await db
      .update(chats)
      .set({
        assignedTo: null,
        assignedAt: null,
        assignedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(chats.chatId, chatId))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Chat ${chatId} not found`);
    }

    this.logger.log(`Chat ${chatId} unassigned by user ${unassignedBy}`);

    return {
      chatId: updated.chatId,
      assignedTo: null,
      assignedAt: null,
      assignedBy: null,
      teamId: updated.teamId,
    };
  }

  /**
   * Get assignment info for a chat
   */
  async getChatAssignment(chatId: string): Promise<ChatAssignment | null> {
    const [chat] = await db
      .select({
        chatId: chats.chatId,
        assignedTo: chats.assignedTo,
        assignedAt: chats.assignedAt,
        assignedBy: chats.assignedBy,
        teamId: chats.teamId,
      })
      .from(chats)
      .where(eq(chats.chatId, chatId))
      .limit(1);

    if (!chat) {
      return null;
    }

    let assignedToName: string | undefined;
    let assignedByName: string | undefined;

    if (chat.assignedTo) {
      const [assignee] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, chat.assignedTo))
        .limit(1);
      assignedToName = assignee?.name;
    }

    if (chat.assignedBy) {
      const [assigner] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, chat.assignedBy))
        .limit(1);
      assignedByName = assigner?.name;
    }

    return {
      ...chat,
      assignedToName,
      assignedByName,
    };
  }

  /**
   * Get all chats assigned to a user
   */
  async getAssignedChats(userId: number): Promise<ChatAssignment[]> {
    const chatsList = await db
      .select({
        chatId: chats.chatId,
        assignedTo: chats.assignedTo,
        assignedAt: chats.assignedAt,
        assignedBy: chats.assignedBy,
        teamId: chats.teamId,
      })
      .from(chats)
      .where(eq(chats.assignedTo, userId));

    return chatsList;
  }

  /**
   * Get unassigned chats for a team
   * Only returns active, non-archived chats that haven't been deleted
   */
  async getUnassignedChats(teamId: number): Promise<ChatAssignment[]> {
    const chatsList = await db
      .select({
        chatId: chats.chatId,
        assignedTo: chats.assignedTo,
        assignedAt: chats.assignedAt,
        assignedBy: chats.assignedBy,
        teamId: chats.teamId,
        participantName: chats.participantName,
        participantPhone: chats.participantPhone,
      })
      .from(chats)
      .where(
        and(
          eq(chats.teamId, teamId),
          eq(chats.isActive, true),
          eq(chats.isArchived, false),
          isNull(chats.assignedTo),
        ),
      );

    return chatsList;
  }

  /**
   * Get all chats for a team (both assigned and unassigned)
   * Only returns active, non-archived chats (filters out deleted chats)
   * Includes assignee name for display purposes
   */
  async getAllTeamChats(teamId: number): Promise<ChatAssignment[]> {
    const chatsList = await db
      .select({
        chatId: chats.chatId,
        assignedTo: chats.assignedTo,
        assignedAt: chats.assignedAt,
        assignedBy: chats.assignedBy,
        teamId: chats.teamId,
        participantName: chats.participantName,
        participantPhone: chats.participantPhone,
      })
      .from(chats)
      .where(
        and(
          eq(chats.teamId, teamId),
          eq(chats.isActive, true),
          eq(chats.isArchived, false),
        ),
      );

    // Enrich with assignee names
    const enriched: ChatAssignment[] = [];
    for (const chat of chatsList) {
      let assignedToName: string | undefined;
      if (chat.assignedTo) {
        const [assignee] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, chat.assignedTo))
          .limit(1);
        assignedToName = assignee?.name ?? undefined;
      }
      enriched.push({
        ...chat,
        assignedToName,
      });
    }

    return enriched;
  }
}
