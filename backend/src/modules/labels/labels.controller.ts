import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TeamService } from '../team/team.service';
import {
  ApplyLabelsDto,
  CreateLabelDto,
  RemoveLabelsDto,
  UpdateLabelDto,
} from './dto/labels.dto';
import { LabelsService } from './labels.service';

/**
 * Labels Controller
 * REST API endpoints for managing labels and chat-label associations
 */
@Controller('labels')
@UseGuards(JwtAuthGuard)
export class LabelsController {
  constructor(
    private readonly labelsService: LabelsService,
    private readonly teamService: TeamService,
  ) {}

  /**
   * Helper to get the user's team ID
   */
  private async getTeamId(req: any): Promise<number> {
    const userId = req.user.userId;
    const teams = await this.teamService.getUserTeams(userId);
    if (!teams.length) {
      throw new Error('User does not belong to any team');
    }
    return teams[0].id;
  }

  // ========== Label CRUD Endpoints ==========

  /**
   * Get all labels for the current team
   */
  @Get()
  async getTeamLabels(@Req() req: any) {
    const teamId = await this.getTeamId(req);
    return this.labelsService.getTeamLabels(teamId);
  }

  /**
   * Get a specific label by ID
   */
  @Get(':labelId')
  async getLabelById(@Param('labelId') labelId: string, @Req() req: any) {
    const teamId = await this.getTeamId(req);
    return this.labelsService.getLabelById(labelId, teamId);
  }

  /**
   * Create a new label
   */
  @Post()
  async createLabel(@Req() req: any, @Body() dto: CreateLabelDto) {
    const teamId = await this.getTeamId(req);
    const userId = req.user.userId;
    return this.labelsService.createLabel(teamId, userId, dto);
  }

  /**
   * Update a label
   */
  @Patch(':labelId')
  async updateLabel(
    @Param('labelId') labelId: string,
    @Req() req: any,
    @Body() dto: UpdateLabelDto,
  ) {
    const teamId = await this.getTeamId(req);
    const userId = req.user.userId;
    return this.labelsService.updateLabel(labelId, teamId, dto, userId);
  }

  /**
   * Delete a label
   */
  @Delete(':labelId')
  async deleteLabel(@Param('labelId') labelId: string, @Req() req: any) {
    const teamId = await this.getTeamId(req);
    const userId = req.user.userId;
    await this.labelsService.deleteLabel(labelId, teamId, userId);
    return { success: true, message: 'Label deleted successfully' };
  }

  // ========== Chat Label Endpoints ==========

  /**
   * Get all labels for a specific chat
   */
  @Get('chat/:chatId')
  async getChatLabels(@Param('chatId') chatId: string) {
    return this.labelsService.getChatLabels(chatId);
  }

  /**
   * Apply labels to multiple chats
   */
  @Post('apply')
  async applyLabels(@Req() req: any, @Body() dto: ApplyLabelsDto) {
    const teamId = await this.getTeamId(req);
    const userId = req.user.userId;
    return this.labelsService.applyLabelsToChats(
      dto.chatIds,
      dto.labelIds,
      teamId,
      userId,
    );
  }

  /**
   * Remove labels from multiple chats
   */
  @Post('remove')
  async removeLabels(@Req() req: any, @Body() dto: RemoveLabelsDto) {
    const teamId = await this.getTeamId(req);
    const userId = req.user.userId;
    return this.labelsService.removeLabelsFromChats(
      dto.chatIds,
      dto.labelIds,
      teamId,
      userId,
    );
  }

  /**
   * Get all chats with a specific label
   */
  @Get(':labelId/chats')
  async getChatsWithLabel(
    @Param('labelId') labelId: string,
    @Req() req: any,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const teamId = await this.getTeamId(req);
    return this.labelsService.getChatsWithLabel(
      labelId,
      teamId,
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 50,
    );
  }
}
