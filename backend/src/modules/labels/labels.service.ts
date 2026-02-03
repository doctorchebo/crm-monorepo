import { db } from '@database/db.connection';
import {
    chatLabels,
    chats,
    labels,
    NewChatLabel,
    NewLabel,
} from '@database/schema';
import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { and, count, eq, inArray, sql } from 'drizzle-orm';

import {
    CreateLabelDto,
    LabelResponseDto,
    UpdateLabelDto,
} from './dto/labels.dto';

/**
 * Labels Service
 * Handles CRUD operations for labels and chat-label associations
 * Supports workflow automation for automatic label application
 */
@Injectable()
export class LabelsService {
  private readonly logger = new Logger(LabelsService.name);

  // ========== Label CRUD Operations ==========

  /**
   * Get all labels for a team
   */
  async getTeamLabels(teamId: number): Promise<LabelResponseDto[]> {
    const result = await db
      .select({
        id: labels.id,
        teamId: labels.teamId,
        name: labels.name,
        color: labels.color,
        emoji: labels.emoji,
        description: labels.description,
        isSystem: labels.isSystem,
        sortOrder: labels.sortOrder,
        createdBy: labels.createdBy,
        createdAt: labels.createdAt,
        updatedAt: labels.updatedAt,
        // Count of chats with this label
        chatCount: sql<number>`(
          SELECT COUNT(*) FROM chat_labels 
          WHERE chat_labels.label_id = ${labels.id}
        )`.as('chat_count'),
      })
      .from(labels)
      .where(eq(labels.teamId, teamId))
      .orderBy(labels.sortOrder, labels.name);

    return result.map((label) => ({
      ...label,
      isSystem: label.isSystem ?? false,
      sortOrder: label.sortOrder ?? 0,
      chatCount: Number(label.chatCount) || 0,
      createdAt: label.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: label.updatedAt?.toISOString() || new Date().toISOString(),
    }));
  }

  /**
   * Get a single label by ID
   */
  async getLabelById(
    labelId: string,
    teamId: number,
  ): Promise<LabelResponseDto> {
    const result = await db
      .select({
        id: labels.id,
        teamId: labels.teamId,
        name: labels.name,
        color: labels.color,
        emoji: labels.emoji,
        description: labels.description,
        isSystem: labels.isSystem,
        sortOrder: labels.sortOrder,
        createdBy: labels.createdBy,
        createdAt: labels.createdAt,
        updatedAt: labels.updatedAt,
        chatCount: sql<number>`(
          SELECT COUNT(*) FROM chat_labels 
          WHERE chat_labels.label_id = ${labels.id}
        )`.as('chat_count'),
      })
      .from(labels)
      .where(and(eq(labels.id, labelId), eq(labels.teamId, teamId)))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundException('Label not found');
    }

    return {
      ...result[0],
      isSystem: result[0].isSystem ?? false,
      sortOrder: result[0].sortOrder ?? 0,
      chatCount: Number(result[0].chatCount) || 0,
      createdAt: result[0].createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: result[0].updatedAt?.toISOString() || new Date().toISOString(),
    };
  }

  /**
   * Create a new label
   */
  async createLabel(
    teamId: number,
    userId: number,
    dto: CreateLabelDto,
  ): Promise<LabelResponseDto> {
    // Check if label with same name exists
    const existing = await db
      .select()
      .from(labels)
      .where(and(eq(labels.teamId, teamId), eq(labels.name, dto.name)))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException(`Label "${dto.name}" already exists`);
    }

    // Get max sort order for the team
    const maxSortOrderResult = await db
      .select({ maxOrder: sql<number>`MAX(sort_order)` })
      .from(labels)
      .where(eq(labels.teamId, teamId));

    const nextSortOrder = (maxSortOrderResult[0]?.maxOrder ?? 0) + 1;

    const newLabel: NewLabel = {
      teamId,
      name: dto.name,
      color: dto.color || '#6366f1',
      emoji: dto.emoji || null,
      description: dto.description || null,
      isSystem: false,
      sortOrder: nextSortOrder,
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.insert(labels).values(newLabel).returning();

    this.logger.log(
      `Created label "${dto.name}" for team ${teamId} by user ${userId}`,
    );

    return {
      ...result[0],
      isSystem: result[0].isSystem ?? false,
      sortOrder: result[0].sortOrder ?? 0,
      chatCount: 0,
      createdAt: result[0].createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: result[0].updatedAt?.toISOString() || new Date().toISOString(),
    };
  }

  /**
   * Update a label
   */
  async updateLabel(
    labelId: string,
    teamId: number,
    dto: UpdateLabelDto,
  ): Promise<LabelResponseDto> {
    // Check if label exists and belongs to the team
    const existing = await db
      .select()
      .from(labels)
      .where(and(eq(labels.id, labelId), eq(labels.teamId, teamId)))
      .limit(1);

    if (existing.length === 0) {
      throw new NotFoundException('Label not found');
    }

    // If name is being updated, check for duplicates
    if (dto.name && dto.name !== existing[0].name) {
      const duplicate = await db
        .select()
        .from(labels)
        .where(and(eq(labels.teamId, teamId), eq(labels.name, dto.name)))
        .limit(1);

      if (duplicate.length > 0) {
        throw new ConflictException(`Label "${dto.name}" already exists`);
      }
    }

    const updateData: Partial<NewLabel> = {
      ...dto,
      updatedAt: new Date(),
    };

    const result = await db
      .update(labels)
      .set(updateData)
      .where(eq(labels.id, labelId))
      .returning();

    this.logger.log(`Updated label ${labelId} for team ${teamId}`);

    return {
      ...result[0],
      isSystem: result[0].isSystem ?? false,
      sortOrder: result[0].sortOrder ?? 0,
      chatCount: Number((result[0] as any).chatCount) || 0,
      createdAt: result[0].createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: result[0].updatedAt?.toISOString() || new Date().toISOString(),
    };
  }

  /**
   * Delete a label
   */
  async deleteLabel(labelId: string, teamId: number): Promise<void> {
    // Check if label exists and belongs to the team
    const existing = await db
      .select()
      .from(labels)
      .where(and(eq(labels.id, labelId), eq(labels.teamId, teamId)))
      .limit(1);

    if (existing.length === 0) {
      throw new NotFoundException('Label not found');
    }

    // System labels cannot be deleted
    if (existing[0].isSystem) {
      throw new BadRequestException('System labels cannot be deleted');
    }

    // Delete the label (cascade will remove chat_labels associations)
    await db.delete(labels).where(eq(labels.id, labelId));

    this.logger.log(`Deleted label ${labelId} from team ${teamId}`);
  }

  // ========== Chat Label Operations ==========

  /**
   * Get all labels for a specific chat
   */
  async getChatLabels(chatId: string): Promise<LabelResponseDto[]> {
    const result = await db
      .select({
        id: labels.id,
        teamId: labels.teamId,
        name: labels.name,
        color: labels.color,
        emoji: labels.emoji,
        description: labels.description,
        isSystem: labels.isSystem,
        sortOrder: labels.sortOrder,
        createdBy: labels.createdBy,
        createdAt: labels.createdAt,
        updatedAt: labels.updatedAt,
      })
      .from(chatLabels)
      .innerJoin(labels, eq(chatLabels.labelId, labels.id))
      .where(eq(chatLabels.chatId, chatId))
      .orderBy(labels.sortOrder, labels.name);

    return result.map((label) => ({
      ...label,
      isSystem: label.isSystem ?? false,
      sortOrder: label.sortOrder ?? 0,
      createdAt: label.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: label.updatedAt?.toISOString() || new Date().toISOString(),
    }));
  }

  /**
   * Apply labels to multiple chats
   */
  async applyLabelsToChats(
    chatIds: string[],
    labelIds: string[],
    teamId: number,
    userId?: number,
    workflowId?: string,
  ): Promise<{ applied: number; skipped: number }> {
    // Verify all labels belong to the team
    const validLabels = await db
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.teamId, teamId), inArray(labels.id, labelIds)));

    if (validLabels.length !== labelIds.length) {
      throw new BadRequestException('One or more labels not found');
    }

    let applied = 0;
    let skipped = 0;

    for (const chatId of chatIds) {
      for (const labelId of labelIds) {
        try {
          const newChatLabel: NewChatLabel = {
            chatId,
            labelId,
            appliedBy: userId || null,
            appliedByWorkflowId: workflowId || null,
            createdAt: new Date(),
          };

          await db
            .insert(chatLabels)
            .values(newChatLabel)
            .onConflictDoNothing();

          applied++;
        } catch (error) {
          // Already exists or other error
          skipped++;
        }
      }
    }

    this.logger.log(
      `Applied ${applied} labels to chats (${skipped} skipped as duplicates)`,
    );

    return { applied, skipped };
  }

  /**
   * Remove labels from multiple chats
   */
  async removeLabelsFromChats(
    chatIds: string[],
    labelIds: string[],
    teamId: number,
  ): Promise<{ removed: number }> {
    // Verify all labels belong to the team
    const validLabels = await db
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.teamId, teamId), inArray(labels.id, labelIds)));

    if (validLabels.length !== labelIds.length) {
      throw new BadRequestException('One or more labels not found');
    }

    const result = await db
      .delete(chatLabels)
      .where(
        and(
          inArray(chatLabels.chatId, chatIds),
          inArray(chatLabels.labelId, labelIds),
        ),
      );

    const removed = (result as any).rowCount || 0;

    this.logger.log(`Removed ${removed} labels from chats`);

    return { removed };
  }

  /**
   * Get all chats with a specific label
   */
  async getChatsWithLabel(
    labelId: string,
    teamId: number,
    skip: number = 0,
    take: number = 50,
  ) {
    // Verify label belongs to team
    const label = await this.getLabelById(labelId, teamId);

    const result = await db
      .select({
        chatId: chats.chatId,
        participantName: chats.participantName,
        participantPhone: chats.participantPhone,
        lastMessage: chats.lastMessage,
        lastMessageTime: chats.lastMessageTime,
        unreadCount: chats.unreadCount,
      })
      .from(chatLabels)
      .innerJoin(chats, eq(chatLabels.chatId, chats.chatId))
      .where(eq(chatLabels.labelId, labelId))
      .orderBy(chats.lastMessageTime)
      .limit(take)
      .offset(skip);

    // Get total count
    const countResult = await db
      .select({ count: count() })
      .from(chatLabels)
      .where(eq(chatLabels.labelId, labelId));

    return {
      label,
      chats: result.map((chat) => ({
        ...chat,
        lastMessageTime: chat.lastMessageTime?.toISOString() || null,
      })),
      total: countResult[0]?.count || 0,
    };
  }

  // ========== Workflow Integration ==========

  /**
   * Apply a label by name (used by workflow engine)
   * Creates the label if it doesn't exist
   */
  async applyLabelByName(
    chatId: string,
    labelName: string,
    teamId: number,
    workflowId?: string,
  ): Promise<void> {
    // Find or create the label
    let label = await db
      .select()
      .from(labels)
      .where(and(eq(labels.teamId, teamId), eq(labels.name, labelName)))
      .limit(1);

    if (label.length === 0) {
      // Create the label as a system label
      const newLabel: NewLabel = {
        teamId,
        name: labelName,
        color: this.generateColorForLabel(labelName),
        isSystem: true,
        sortOrder: 999, // Put auto-created labels at the end
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await db.insert(labels).values(newLabel).returning();
      label = created;

      this.logger.log(
        `Auto-created label "${labelName}" for team ${teamId} via workflow`,
      );
    }

    // Apply the label to the chat
    const newChatLabel: NewChatLabel = {
      chatId,
      labelId: label[0].id,
      appliedBy: null,
      appliedByWorkflowId: workflowId || null,
      createdAt: new Date(),
    };

    await db.insert(chatLabels).values(newChatLabel).onConflictDoNothing();

    this.logger.log(`Applied label "${labelName}" to chat ${chatId}`);
  }

  /**
   * Remove a label by name (used by workflow engine)
   */
  async removeLabelByName(
    chatId: string,
    labelName: string,
    teamId: number,
  ): Promise<void> {
    const label = await db
      .select()
      .from(labels)
      .where(and(eq(labels.teamId, teamId), eq(labels.name, labelName)))
      .limit(1);

    if (label.length === 0) {
      // Label doesn't exist, nothing to remove
      return;
    }

    await db
      .delete(chatLabels)
      .where(
        and(eq(chatLabels.chatId, chatId), eq(chatLabels.labelId, label[0].id)),
      );

    this.logger.log(`Removed label "${labelName}" from chat ${chatId}`);
  }

  /**
   * Generate a color for auto-created labels based on the label name
   */
  private generateColorForLabel(labelName: string): string {
    const colors = [
      '#ef4444', // red
      '#f97316', // orange
      '#eab308', // yellow
      '#22c55e', // green
      '#3b82f6', // blue
      '#8b5cf6', // violet
      '#ec4899', // pink
      '#06b6d4', // cyan
      '#14b8a6', // teal
      '#84cc16', // lime
    ];

    // Use a hash of the label name to pick a consistent color
    let hash = 0;
    for (let i = 0; i < labelName.length; i++) {
      hash = (hash << 5) - hash + labelName.charCodeAt(i);
      hash = hash & hash;
    }

    return colors[Math.abs(hash) % colors.length];
  }
}
