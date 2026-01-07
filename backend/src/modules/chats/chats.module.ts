import { Module, forwardRef } from '@nestjs/common';
import { S3Service } from '@shared/services/s3.service';
import { AiMemoryModule } from '../ai-memory/ai-memory.module';
import { WhatsAppGateway } from '../whatsapp/whatsapp.gateway';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { ChatsController } from './chats.controller';
import { CHAT_UPDATE_GATEWAY, ChatsService } from './chats.service';

@Module({
  imports: [forwardRef(() => WhatsAppModule), AiMemoryModule],
  controllers: [ChatsController],
  providers: [
    ChatsService,
    S3Service,
    {
      provide: CHAT_UPDATE_GATEWAY,
      useExisting: WhatsAppGateway,
    },
  ],
  exports: [ChatsService],
})
export class ChatsModule {}
