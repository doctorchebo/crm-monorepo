import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CreateTeamDto } from './dto/create-team.dto';
import { TeamService } from './team.service';
import { InvitationService } from './invitation.service';
import { RolesService } from './services/roles.service';
import { PermissionService } from '../../shared/services/permission.service';

interface AuthenticatedRequest {
  user: { userId: number };
}

@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamController {
  constructor(
    private readonly teamService: TeamService,
    private readonly invitationService: InvitationService,
    private readonly permissionService: PermissionService,
    private readonly rolesService: RolesService,
  ) {}

  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() createTeamDto: CreateTeamDto,
  ) {
    return this.teamService.create(req.user.userId, createTeamDto);
  }

  @Get()
  async getUserTeams(@Req() req: AuthenticatedRequest) {
    return this.teamService.getUserTeams(req.user.userId);
  }

  @Get('config/permissions')
  async getPermissions() {
    return this.rolesService.getAllPermissions();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.teamService.findOne(id);
  }

  @Get(':id/members')
  async getMembers(@Param('id', ParseIntPipe) id: number) {
    return this.teamService.getMembers(id);
  }

  @Post(':id/invite')
  async inviteMember(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) teamId: number,
    @Body() inviteDto: { email: string; role: string },
  ) {
    // Check permission
    await this.permissionService.enforcePermission(
      req.user.userId,
      teamId,
      'invite_members',
    );

    return this.invitationService.sendInvitation(
      teamId,
      inviteDto.email,
      inviteDto.role,
      req.user.userId,
    );
  }

  @Get(':id/invitations')
  async getInvitations(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) teamId: number,
  ) {
    await this.permissionService.enforcePermission(
      req.user.userId,
      teamId,
      'invite_members',
    );
    return this.invitationService.getTeamInvitations(teamId);
  }

  @Delete(':teamId/members/:memberId')
  async removeMember(
    @Req() req: AuthenticatedRequest,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
  ) {
    await this.permissionService.enforcePermission(
      req.user.userId,
      teamId,
      'remove_members',
    );
    return this.teamService.removeMember(teamId, memberId);
  }

  @Post(':teamId/members/:memberId/role')
  async changeRole(
    @Req() req: AuthenticatedRequest,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() body: { role: string | number }, // Support roleId or legacy string
  ) {
    await this.permissionService.enforcePermission(
      req.user.userId,
      teamId,
      'change_roles',
    );
    return this.teamService.changeRole(teamId, memberId, body.role);
  }

  // ========== Role Management ==========

  @Get(':id/roles')
  async getRoles(@Param('id', ParseIntPipe) teamId: number) {
    return this.rolesService.getTeamRoles(teamId);
  }

  @Post(':id/roles')
  async createRole(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) teamId: number,
    @Body() body: any,
  ) {
    await this.permissionService.enforcePermission(
      req.user.userId,
      teamId,
      'team.manage',
    );
    return this.rolesService.createRole(teamId, body);
  }

  @Patch(':id/roles/:roleId')
  async updateRole(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) teamId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() body: any,
  ) {
    await this.permissionService.enforcePermission(
      req.user.userId,
      teamId,
      'team.manage',
    );
    return this.rolesService.updateRole(teamId, roleId, body);
  }

  @Delete(':id/roles/:roleId')
  async deleteRole(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) teamId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
  ) {
    await this.permissionService.enforcePermission(
      req.user.userId,
      teamId,
      'team.manage',
    );
    return this.rolesService.deleteRole(teamId, roleId);
  }
}
