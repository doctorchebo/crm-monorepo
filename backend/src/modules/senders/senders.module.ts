import { Module } from '@nestjs/common';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { SendersController } from './senders.controller';
import { SendersService } from './senders.service';

@Module({
  imports: [WhatsAppModule],
  controllers: [SendersController],
  providers: [SendersService],
  exports: [SendersService],
})
export class SendersModule {}
