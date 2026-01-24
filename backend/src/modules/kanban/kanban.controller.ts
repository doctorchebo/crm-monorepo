import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtPayload } from '@shared/types';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TeamService } from '../team/team.service';
import { CreateStageDto } from './dto/create-stage.dto';
import { MoveCardDto } from './dto/move-card.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { KanbanService } from './kanban.service';

@Controller('kanban')
@UseGuards(JwtAuthGuard)
export class KanbanController {
  constructor(
    private kanbanService: KanbanService,
    private teamService: TeamService,
  ) {}

  private async resolveTeamId(user: JwtPayload): Promise<number> {
    if (user.teamId) {
      return user.teamId;
    }
    const teams = await this.teamService.getUserTeams(user.userId);
    return teams[0]?.id || user.userId;
  }

  @Post('stages')
  async createStage(@Body() createStageDto: CreateStageDto, @Req() req: any) {
    const user = req.user as JwtPayload;
    const teamId = await this.resolveTeamId(user);
    return this.kanbanService.createStage(teamId, createStageDto);
  }

  @Get('stages')
  async getStages(@Req() req: any) {
    const user = req.user as JwtPayload;
    const teamId = await this.resolveTeamId(user);
    return this.kanbanService.getStages(teamId, user.userId);
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
  async getCards(@Req() req: any, @Param('stageId') stageId: string) {
    const user = req.user as JwtPayload;
    return this.kanbanService.getCards(stageId, user.userId);
  }
}
