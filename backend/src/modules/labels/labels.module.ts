import { Module } from '@nestjs/common';
import { AuditWriteService } from '../audit/audit-write.service';
import { TeamModule } from '../team/team.module';
import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';

@Module({
  imports: [TeamModule],
  controllers: [LabelsController],
  providers: [LabelsService, AuditWriteService],
  exports: [LabelsService],
})
export class LabelsModule {}
