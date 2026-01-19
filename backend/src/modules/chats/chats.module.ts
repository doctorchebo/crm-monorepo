import { Module, forwardRef } from '@nestjs/common';
import { S3Service } from '@shared/services/s3.service';
import { AiMemoryModule } from '../ai-memory/ai-memory.module';
import { WhatsAppGateway } from '../whatsapp/whatsapp.gateway';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';
import {
  CHAT_UPDATE_GATEWAY,
  ChatsArchiveService,
  ChatsCleanupService,
  ChatsCrudService,
  ChatsMessagesService,
  ChatLockService,
  ChatAssignmentService,
} from './services';
import { ChatLockController } from './controllers/chat-lock.controller';
import { ChatAssignmentController } from './controllers/chat-assignment.controller';
import { PermissionService } from '../../shared/services/permission.service';
import { AuditService } from '../../shared/services/audit.service';

@Module({
  imports: [forwardRef(() => WhatsAppModule), AiMemoryModule],
  controllers: [ChatsController, ChatLockController, ChatAssignmentController],
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
    {
      provide: CHAT_UPDATE_GATEWAY,
      useExisting: WhatsAppGateway,
    },
  ],
  exports: [
    ChatsService,
    ChatsCrudService,
    ChatsArchiveService,
    ChatsMessagesService,
    ChatsCleanupService,
    ChatLockService,
    ChatAssignmentService,
  ],
})
export class ChatsModule {}
