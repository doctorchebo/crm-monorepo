import { Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebhookController } from './whatsapp.webhook.controller';

@Module({
  controllers: [WhatsAppController, WhatsAppWebhookController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
