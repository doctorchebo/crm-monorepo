import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CreateStageDto } from './dto/create-stage.dto';
import { MoveCardDto } from './dto/move-card.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { KanbanService } from './kanban.service';

@Controller('kanban')
@UseGuards(JwtAuthGuard)
export class KanbanController {
  constructor(private kanbanService: KanbanService) {}

  @Post('stages')
  async createStage(@Body() createStageDto: CreateStageDto) {
    // TODO: Get teamId from request context
    return this.kanbanService.createStage('teamId', createStageDto);
  }

  @Get('stages')
  async getStages() {
    // TODO: Get teamId from request context
    return this.kanbanService.getStages('teamId');
  }

  @Patch('stages/:id')
  async updateStage(
    @Param('id') id: string,
    @Body() updateStageDto: UpdateStageDto,
  ) {
    return this.kanbanService.updateStage(id, updateStageDto);
  }

  @Delete('stages/:id')
  async deleteStage(@Param('id') id: string) {
    return this.kanbanService.deleteStage(id);
  }

  @Post('cards/move')
  async moveCard(@Body() moveCardDto: MoveCardDto) {
    return this.kanbanService.moveCard(moveCardDto);
  }

  @Get('stages/:stageId/cards')
  async getCards(@Param('stageId') stageId: string) {
    return this.kanbanService.getCards(stageId);
  }
}
