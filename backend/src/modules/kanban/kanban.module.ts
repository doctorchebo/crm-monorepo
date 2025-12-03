import { Module } from '@nestjs/common';
import { KanbanController } from './kanban.controller';
import { KanbanService } from './kanban.service';

@Module({
  controllers: [KanbanController],
  providers: [KanbanService],
  exports: [KanbanService],
})
export class KanbanModule {}
