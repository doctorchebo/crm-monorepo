import { Module } from '@nestjs/common';
import { ContactAttributesService } from './contact-attributes.service';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';

@Module({
  controllers: [ContactsController],
  providers: [ContactsService, ContactAttributesService],
  exports: [ContactsService, ContactAttributesService],
})
export class ContactsModule {}
