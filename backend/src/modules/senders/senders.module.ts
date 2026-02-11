import { Module } from '@nestjs/common';
import { AuditWriteService } from '../audit/audit-write.service';
import { TeamModule } from '../team/team.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { SendersController } from './senders.controller';
import { SendersService } from './senders.service';

@Module({
  imports: [WhatsAppModule, TeamModule],
  controllers: [SendersController],
  providers: [SendersService, AuditWriteService],
  exports: [SendersService],
})
export class SendersModule {}
