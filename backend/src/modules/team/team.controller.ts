import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CreateTeamDto } from './dto/create-team.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { TeamService } from './team.service';

@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamController {
  constructor(private teamService: TeamService) {}

  @Post()
  async create(@Body() createTeamDto: CreateTeamDto) {
    // TODO: Get userId from request context
    return this.teamService.create('userId', createTeamDto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.teamService.findOne(id);
  }

  @Get(':id/members')
  async getMembers(@Param('id') id: string) {
    return this.teamService.getMembers(id);
  }

  @Post(':id/invite')
  async inviteMember(
    @Param('id') teamId: string,
    @Body() inviteMemberDto: InviteMemberDto,
  ) {
    return this.teamService.inviteMember(teamId, inviteMemberDto);
  }

  @Delete(':teamId/members/:memberId')
  async removeMember(
    @Param('teamId') teamId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.teamService.removeMember(teamId, memberId);
  }
}
