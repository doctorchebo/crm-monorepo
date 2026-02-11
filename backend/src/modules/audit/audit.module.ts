// ============================================================================
// Audit Module
// ============================================================================
// Provides centralized audit write + query services for the entire application.
//
// - AuditWriteService: exported for injection by all feature modules
// - AuditQueryService: used by AuditController for REST API
// - AuditController: /audit/* REST endpoints
//
// Feature modules import AuditModule and inject AuditWriteService to log actions.
// ============================================================================

import { Module } from '@nestjs/common';
import { PermissionService } from '@shared/services/permission.service';
import { AuditQueryService } from './audit-query.service';
import { AuditWriteService } from './audit-write.service';
import { AuditController } from './audit.controller';

@Module({
  controllers: [AuditController],
  providers: [AuditWriteService, AuditQueryService, PermissionService],
  exports: [AuditWriteService],
})
export class AuditModule {}
