import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PermissionService } from '../../shared/services/permission.service';
import { AuditQueryService } from '../audit/audit-query.service';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [ConfigModule],
  controllers: [UserController],
  providers: [UserService, AuditQueryService, PermissionService],
  exports: [UserService],
})
export class UserModule {}
