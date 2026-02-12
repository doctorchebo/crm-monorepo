import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PermissionService } from '../../shared/services/permission.service';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [ConfigModule],
  controllers: [UserController],
  providers: [UserService, PermissionService],
  exports: [UserService],
})
export class UserModule {}
