import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProfilePictureUrlService } from '@shared/services/profile-picture-url.service';
import { S3Service } from '@shared/services/s3.service';
import { AuditService } from '../../shared/services/audit.service';
import { PermissionService } from '../../shared/services/permission.service';
import { AiMemoryModule } from '../ai-memory/ai-memory.module';
import { TeamModule } from '../team/team.module';
import { WhatsAppGateway } from '../whatsapp/whatsapp.gateway';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';
import { ChatAssignmentController } from './controllers/chat-assignment.controller';
import { ChatLockController } from './controllers/chat-lock.controller';
import {
  CHAT_UPDATE_GATEWAY,
  ChatAssignmentService,
  ChatLockService,
  ChatVisibilityService,
  ChatsArchiveService,
  ChatsCleanupService,
  ChatsCrudService,
  ChatsMessagesService,
} from './services';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => WhatsAppModule),
    AiMemoryModule,
    TeamModule,
  ],
  controllers: [ChatAssignmentController, ChatLockController, ChatsController],
  providers: [
    // Sub-services (order matters for dependency injection)
    ChatsCrudService,
    ChatsArchiveService,
    ChatsMessagesService,
    ChatsCleanupService,
    // Team collaboration services
    ChatLockService,
    ChatAssignmentService,
    PermissionService,
    AuditService,
    // Main facade service
    ChatsService,
    // Shared services
    S3Service,
    ProfilePictureUrlService,
    {
      provide: CHAT_UPDATE_GATEWAY,
      useExisting: WhatsAppGateway,
    },
    ChatVisibilityService,
  ],
  exports: [
    ChatsService,
    ChatsCrudService,
    ChatsArchiveService,
    ChatsMessagesService,
    ChatsCleanupService,
    ChatLockService,
    ChatAssignmentService,
    ChatVisibilityService,
  ],
})
export class ChatsModule {}
