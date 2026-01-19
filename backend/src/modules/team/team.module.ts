import { Module } from '@nestjs/common';
import { TeamController } from './team.controller';
import { InvitationController } from './invitation.controller';
import { TeamService } from './team.service';
import { InvitationService } from './invitation.service';
import { AuditService } from '../../shared/services/audit.service';
import { PermissionService } from '../../shared/services/permission.service';

@Module({
  controllers: [TeamController, InvitationController],
  providers: [TeamService, InvitationService, AuditService, PermissionService],
  exports: [TeamService, InvitationService, PermissionService],
})
export class TeamModule {}
