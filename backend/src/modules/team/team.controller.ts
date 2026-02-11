import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtPayload } from '@shared/types';
import { PermissionService } from '../../shared/services/permission.service';
import { ProfilePictureUrlService } from '../../shared/services/profile-picture-url.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CreateTeamDto } from './dto/create-team.dto';
import { InvitationService } from './invitation.service';
import { RolesService } from './services/roles.service';
import { TeamService } from './team.service';

@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamController {
  constructor(
    private readonly teamService: TeamService,
    private readonly invitationService: InvitationService,
    private readonly permissionService: PermissionService,
    private readonly rolesService: RolesService,
    private readonly profilePictureUrlService: ProfilePictureUrlService,
  ) {}

  @Post()
  async create(@Req() req: any, @Body() createTeamDto: CreateTeamDto) {
    const user = req.user as JwtPayload;
    return this.teamService.create(user.userId, createTeamDto);
  }

  @Get()
  async getUserTeams(@Req() req: any) {
    const user = req.user as JwtPayload;
    return this.teamService.getUserTeams(user.userId);
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
    const members = await this.teamService.getMembers(id);
    return this.profilePictureUrlService.transformArrayWithUrls(
      members,
      'profilePictureThumbnailKey',
      'profilePictureUrl',
    );
  }

  @Get(':id/metrics')
  async getMetrics(@Param('id', ParseIntPipe) id: number) {
    return this.teamService.getTeamMetrics(id);
  }

  @Post(':id/invite')
  async inviteMember(
    @Req() req: any,
    @Param('id', ParseIntPipe) teamId: number,
    @Body() inviteDto: { email: string; role: string },
  ) {
    const user = req.user as JwtPayload;
    // Check permission
    await this.permissionService.enforcePermission(
      user.userId,
      teamId,
      'invite_members',
    );

    return this.invitationService.sendInvitation(
      teamId,
      inviteDto.email,
      inviteDto.role,
      user.userId,
    );
  }

  @Get(':id/invitations')
  async getInvitations(
    @Req() req: any,
    @Param('id', ParseIntPipe) teamId: number,
  ) {
    const user = req.user as JwtPayload;
    await this.permissionService.enforcePermission(
      user.userId,
      teamId,
      'invite_members',
    );
    return this.invitationService.getTeamInvitations(teamId);
  }

  @Delete(':teamId/members/:memberId')
  async removeMember(
    @Req() req: any,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
  ) {
    const user = req.user as JwtPayload;
    await this.permissionService.enforcePermission(
      user.userId,
      teamId,
      'remove_members',
    );
    return this.teamService.removeMember(teamId, memberId);
  }

  @Post(':teamId/members/:memberId/role')
  async changeRole(
    @Req() req: any,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() body: { role: string | number }, // Support roleId or legacy string
  ) {
    const user = req.user as JwtPayload;
    await this.permissionService.enforcePermission(
      user.userId,
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
    @Req() req: any,
    @Param('id', ParseIntPipe) teamId: number,
    @Body() body: any,
  ) {
    const user = req.user as JwtPayload;
    await this.permissionService.enforcePermission(
      user.userId,
      teamId,
      'team.manage',
    );
    return this.rolesService.createRole(teamId, body);
  }

  @Patch(':id/roles/:roleId')
  async updateRole(
    @Req() req: any,
    @Param('id', ParseIntPipe) teamId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() body: any,
  ) {
    const user = req.user as JwtPayload;
    await this.permissionService.enforcePermission(
      user.userId,
      teamId,
      'team.manage',
    );
    return this.rolesService.updateRole(teamId, roleId, body);
  }

  @Delete(':id/roles/:roleId')
  async deleteRole(
    @Req() req: any,
    @Param('id', ParseIntPipe) teamId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
  ) {
    const user = req.user as JwtPayload;
    await this.permissionService.enforcePermission(
      user.userId,
      teamId,
      'team.manage',
    );
    return this.rolesService.deleteRole(teamId, roleId);
  }
}
