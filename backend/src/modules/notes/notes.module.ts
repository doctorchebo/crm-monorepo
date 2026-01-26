import { Module } from '@nestjs/common';
import { ChatsModule } from '../chats/chats.module';
import { NotesController } from './notes.controller';
import { NotesGateway } from './notes.gateway';
import { NotesService } from './notes.service';

@Module({
  imports: [ChatsModule],
  controllers: [NotesController],
  providers: [NotesService, NotesGateway],
  exports: [NotesService, NotesGateway],
})
export class NotesModule {}
