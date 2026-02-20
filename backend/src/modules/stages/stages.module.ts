/**
 * Stages Module
 * Standalone module for pipeline stage management (Kanban board)
 *
 * Decoupled from the workflow module. Provides:
 * - Stage CRUD operations
 * - Chat-to-stage assignments
 * - Stage transition history
 * - Kanban board queries
 */

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProfilePictureUrlService } from '@shared/services/profile-picture-url.service';
import { S3Service } from '@shared/services/s3.service';
import { AuditModule } from '../audit/audit.module';
import { ChatsModule } from '../chats/chats.module';
import { StageService } from './services/stage.service';
import { StagesController } from './stages.controller';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => ChatsModule), // For ChatVisibilityService
    AuditModule,
  ],
  controllers: [StagesController],
  providers: [StageService, ProfilePictureUrlService, S3Service],
  exports: [StageService],
})
export class StagesModule {}
