import { Module } from '@nestjs/common';
import { ContactAttributesService } from './contact-attributes.service';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { TeamModule } from '../team/team.module';

@Module({
  imports: [TeamModule],
  controllers: [ContactsController],
  providers: [ContactsService, ContactAttributesService],
  exports: [ContactsService, ContactAttributesService],
})
export class ContactsModule {}
