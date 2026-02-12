import { Module } from '@nestjs/common';
import { AuditWriteService } from '../audit/audit-write.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService, AuditWriteService],
  exports: [SettingsService],
})
export class SettingsModule {}
