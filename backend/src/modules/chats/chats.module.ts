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
} from './services';

@Module({
  imports: [forwardRef(() => WhatsAppModule), AiMemoryModule],
  controllers: [ChatsController],
  providers: [
    // Sub-services (order matters for dependency injection)
    ChatsCrudService,
    ChatsArchiveService,
    ChatsMessagesService,
    ChatsCleanupService,
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
  ],
})
export class ChatsModule {}
