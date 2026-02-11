import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditWriteService } from '../audit/audit-write.service';
import { ImportJobsController } from './import-jobs.controller';
import { ImportJobsService } from './import-jobs.service';

@Module({
  imports: [ConfigModule],
  controllers: [ImportJobsController],
  providers: [ImportJobsService, AuditWriteService],
  exports: [ImportJobsService],
})
export class ImportJobsModule {}
