import { Module } from '@nestjs/common';
import { AuditService } from '../../shared/services/audit.service';
import { PermissionService } from '../../shared/services/permission.service';
import { ProfilePictureUrlService } from '../../shared/services/profile-picture-url.service';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';
import { RolesService } from './services/roles.service';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  controllers: [TeamController, InvitationController],
  providers: [
    TeamService,
    InvitationService,
    AuditService,
    PermissionService,
    ProfilePictureUrlService,
    RolesService,
  ],
  exports: [TeamService, InvitationService, PermissionService, RolesService],
})
export class TeamModule {}
