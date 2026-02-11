import { Module } from '@nestjs/common';
import { AuditWriteService } from '../audit/audit-write.service';
import { TeamModule } from '../team/team.module';
import { ContactAttributesService } from './contact-attributes.service';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';

@Module({
  imports: [TeamModule],
  controllers: [ContactsController],
  providers: [ContactsService, ContactAttributesService, AuditWriteService],
  exports: [ContactsService, ContactAttributesService],
})
export class ContactsModule {}
