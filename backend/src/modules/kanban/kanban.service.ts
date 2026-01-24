import { db } from '@database/db.connection';
import {
  chats,
  kanbanCards,
  kanbanStages,
  teamMembers,
} from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, inArray, SQL } from 'drizzle-orm';
import { ChatVisibilityService } from '../chats/services/chat-visibility.service';
import { CreateStageDto } from './dto/create-stage.dto';
import { MoveCardDto } from './dto/move-card.dto';
import { UpdateStageDto } from './dto/update-stage.dto';

@Injectable()
export class KanbanService {
  private readonly logger = new Logger(KanbanService.name);

  constructor(private readonly chatVisibilityService: ChatVisibilityService) {}

  async createStage(teamId: number, createStageDto: CreateStageDto) {
    const [stage] = await db
      .insert(kanbanStages)
      .values({
        teamId,
        name: createStageDto.name,
        order: createStageDto.position,
        color: createStageDto.color,
      })
      .returning();
    return stage;
  }

  async getStages(teamId: number, userId: number) {
    // 1. Lookup user's role in the team
    const membership = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.isActive, true),
      ),
    });

    const role = membership?.role?.toLowerCase() || 'agent';

    this.logger.debug(
      `[Kanban] getStages - TeamId: ${teamId}, UserId: ${userId}, Role: ${role}`,
    );

    // 2. Get visibility conditions for filtering chats
    const visibilityConditions =
      this.chatVisibilityService.getVisibilityConditions(role, userId);

    // 3. Build chat query conditions: team + active + not archived + visibility
    const chatConditions: (SQL | undefined)[] = [
      eq(chats.teamId, teamId),
      eq(chats.isActive, true),
      eq(chats.isArchived, false),
    ];

    if (visibilityConditions.length > 0) {
      chatConditions.push(...visibilityConditions);
    }

    // 4. First, get the chat IDs that are visible to this user
    const visibleChats = await db
      .select({ chatId: chats.chatId })
      .from(chats)
      .where(and(...chatConditions));

    const visibleChatIds = visibleChats.map((c) => c.chatId);

    this.logger.debug(
      `[Kanban] Visible chats for user ${userId}: ${visibleChatIds.length}`,
    );

    // 5. Get all stages for the team
    const stages = await db.query.kanbanStages.findMany({
      where: eq(kanbanStages.teamId, teamId),
      orderBy: [asc(kanbanStages.order)],
    });

    // 6. If no visible chats, return stages with empty cards
    if (visibleChatIds.length === 0) {
      return stages.map((stage) => ({ ...stage, cards: [] }));
    }

    // 7. Get cards that reference visible chats only
    const visibleCards = await db.query.kanbanCards.findMany({
      where: inArray(kanbanCards.chatId, visibleChatIds),
      orderBy: [asc(kanbanCards.order)],
      with: {
        chat: {
          with: {
            assignee: true,
          },
        },
      },
    });

    // 8. Group cards by stage
    const cardsByStage = new Map<number, typeof visibleCards>();
    for (const card of visibleCards) {
      const stageCards = cardsByStage.get(card.stageId) || [];
      stageCards.push(card);
      cardsByStage.set(card.stageId, stageCards);
    }

    // 9. Combine stages with their filtered cards
    return stages.map((stage) => ({
      ...stage,
      cards: cardsByStage.get(stage.id) || [],
    }));
  }

  async updateStage(id: string, updateStageDto: UpdateStageDto) {
    const stageId = parseInt(id, 10);
    const [updated] = await db
      .update(kanbanStages)
      .set({
        name: updateStageDto.name,
        order: updateStageDto.position,
        color: updateStageDto.color,
      })
      .where(eq(kanbanStages.id, stageId))
      .returning();
    return updated;
  }

  async deleteStage(id: string) {
    const stageId = parseInt(id, 10);
    await db.delete(kanbanStages).where(eq(kanbanStages.id, stageId));
    return { success: true };
  }

  async moveCard(moveCardDto: MoveCardDto) {
    const cardId = parseInt(moveCardDto.cardId, 10);
    const targetStageId = parseInt(moveCardDto.targetStageId, 10);

    // Update the card's stage and position
    await db
      .update(kanbanCards)
      .set({
        stageId: targetStageId,
        order: moveCardDto.position,
      })
      .where(eq(kanbanCards.id, cardId));

    return { success: true };
  }

  async getCards(stageId: string, userId: number) {
    const id = parseInt(stageId, 10);

    const stage = await db.query.kanbanStages.findFirst({
      where: eq(kanbanStages.id, id),
    });

    if (!stage) return [];

    // 1. Fetch user role
    const membership = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.teamId, stage.teamId),
        eq(teamMembers.isActive, true),
      ),
    });

    const role = membership?.role?.toLowerCase() || 'agent';

    // 2. Get visibility conditions
    const visibilityConditions =
      this.chatVisibilityService.getVisibilityConditions(role, userId);

    // 3. Build chat query conditions: team + active + not archived + visibility
    const chatConditions: (SQL | undefined)[] = [
      eq(chats.teamId, stage.teamId),
      eq(chats.isActive, true),
      eq(chats.isArchived, false),
    ];

    if (visibilityConditions.length > 0) {
      chatConditions.push(...visibilityConditions);
    }

    // 4. Get visible chat IDs for this user
    const visibleChats = await db
      .select({ chatId: chats.chatId })
      .from(chats)
      .where(and(...chatConditions));

    const visibleChatIds = visibleChats.map((c) => c.chatId);

    if (visibleChatIds.length === 0) {
      return [];
    }

    // 5. Get cards for this stage that reference visible chats
    const cards = await db.query.kanbanCards.findMany({
      where: and(
        eq(kanbanCards.stageId, id),
        inArray(kanbanCards.chatId, visibleChatIds),
      ),
      orderBy: [asc(kanbanCards.order)],
      with: {
        chat: {
          with: {
            assignee: true,
          },
        },
      },
    });

    return cards;
  }

  async addCard(stageId: string, chatId: string) {
    const sId = parseInt(stageId, 10);

    // Create the card linking the chat to the stage
    const [card] = await db
      .insert(kanbanCards)
      .values({
        stageId: sId,
        chatId: chatId,
        order: 0, // Default to top or bottom? 0 is fine.
      })
      .returning();

    // Return the full card with chat details
    const fullCard = await db.query.kanbanCards.findFirst({
      where: eq(kanbanCards.id, card.id),
      with: {
        chat: {
          with: {
            assignee: true,
          },
        },
      },
    });
    return fullCard;
  }
}
