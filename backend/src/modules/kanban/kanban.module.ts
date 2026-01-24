import { Module } from '@nestjs/common';
import { KanbanController } from './kanban.controller';
import { KanbanService } from './kanban.service';

import { TeamModule } from '../team/team.module';
import { ChatsModule } from '../chats/chats.module';

@Module({
  imports: [TeamModule, ChatsModule],
  controllers: [KanbanController],
  providers: [KanbanService],
  exports: [KanbanService],
})
export class KanbanModule {}
