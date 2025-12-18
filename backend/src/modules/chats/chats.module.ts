import { Module, forwardRef } from '@nestjs/common';
import { WhatsAppGateway } from '../whatsapp/whatsapp.gateway';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { ChatsController } from './chats.controller';
import { CHAT_UPDATE_GATEWAY, ChatsService } from './chats.service';

@Module({
  imports: [forwardRef(() => WhatsAppModule)],
  controllers: [ChatsController],
  providers: [
    ChatsService,
    {
      provide: CHAT_UPDATE_GATEWAY,
      useExisting: WhatsAppGateway,
    },
  ],
  exports: [ChatsService],
})
export class ChatsModule {}
