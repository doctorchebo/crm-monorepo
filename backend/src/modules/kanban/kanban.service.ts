import { Injectable } from '@nestjs/common';
import { CreateStageDto } from './dto/create-stage.dto';
import { MoveCardDto } from './dto/move-card.dto';
import { UpdateStageDto } from './dto/update-stage.dto';

@Injectable()
export class KanbanService {
  async createStage(teamId: string, createStageDto: CreateStageDto) {
    // TODO: Create kanban stage in database
    return null;
  }

  async getStages(teamId: string) {
    // TODO: Fetch all stages for team with their cards
    return [];
  }

  async updateStage(id: string, updateStageDto: UpdateStageDto) {
    // TODO: Update stage in database
    return null;
  }

  async deleteStage(id: string) {
    // TODO: Delete stage and move cards
    return null;
  }

  async moveCard(moveCardDto: MoveCardDto) {
    // TODO: Move chat card between stages
    // Can trigger automation rules on stage change
    return null;
  }

  async getCards(stageId: string) {
    // TODO: Get all cards (chats) in stage
    return [];
  }

  async addCard(stageId: string, chatId: string) {
    // TODO: Add chat to stage
    return null;
  }
}
