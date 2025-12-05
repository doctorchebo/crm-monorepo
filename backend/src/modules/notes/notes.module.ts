import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller';
import { NotesGateway } from './notes.gateway';
import { NotesService } from './notes.service';

@Module({
  controllers: [NotesController],
  providers: [NotesService, NotesGateway],
  exports: [NotesService, NotesGateway],
})
export class NotesModule {}
