// ============================================================================
// Audit Controller
// ============================================================================
// REST API endpoints for querying the unified audit history.
//
// Endpoints:
//   GET /audit/history         — Paginated audit log with filters
//   GET /audit/entity/:type/:id — History for a specific entity
//   GET /audit/team-members    — Team members for filter dropdown (admin only)
// ============================================================================

import { JwtAuthGuard } from '@modules/auth/auth.guard';
import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuditQueryService } from './audit-query.service';
import { AuditAction, AuditCategory, AuditQueryFilters } from './audit.types';

@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly auditQueryService: AuditQueryService) {}

  /**
   * GET /audit/history
   * Main paginated audit log endpoint with comprehensive filtering.
   */
  @Get('history')
  async getHistory(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('category') category?: string,
    @Query('categories') categories?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('actions') actions?: string,
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('chatId') chatId?: string,
    @Query('search') search?: string,
  ) {
    const filters: AuditQueryFilters = {};

    if (category) filters.category = category as AuditCategory;
    if (categories) {
      filters.categories = categories.split(',') as AuditCategory[];
    }
    if (entityType) filters.entityType = entityType as any;
    if (entityId) filters.entityId = entityId;
    if (action) filters.action = action as AuditAction;
    if (actions) filters.actions = actions.split(',') as AuditAction[];
    if (userId) filters.userId = parseInt(userId, 10);
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    if (chatId) filters.chatId = chatId;
    if (search) filters.search = search;

    return this.auditQueryService.getAuditLogs(
      req.user.userId,
      parseInt(page || '1', 10),
      Math.min(parseInt(pageSize || '25', 10), 100), // Cap at 100
      filters,
    );
  }

  /**
   * GET /audit/entity/:entityType/:entityId
   * History for a specific entity (e.g., a specific contact, template, etc.)
   */
  @Get('entity/:entityType/:entityId')
  async getEntityHistory(
    @Req() req: any,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.auditQueryService.getEntityHistory(
      req.user.userId,
      entityType,
      entityId,
    );
  }

  /**
   * GET /audit/team-members
   * List team members for the filter dropdown. Admin/owner only.
   */
  @Get('team-members')
  async getTeamMembers(@Req() req: any) {
    const members = await this.auditQueryService.getTeamMembers(
      req.user.userId,
    );

    if (members === null) {
      throw new ForbiddenException(
        'Only admins and owners can view team members for filtering',
      );
    }

    return members;
  }

  /**
   * GET /audit/export
   * Export audit logs as CSV with the same filters as /audit/history.
   * Returns up to 5000 rows to prevent excessively large exports.
   */
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @Req() req: any,
    @Res() res: Response,
    @Query('category') category?: string,
    @Query('categories') categories?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('actions') actions?: string,
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('chatId') chatId?: string,
    @Query('search') search?: string,
  ) {
    const filters: AuditQueryFilters = {};

    if (category) filters.category = category as AuditCategory;
    if (categories) {
      filters.categories = categories.split(',') as AuditCategory[];
    }
    if (entityType) filters.entityType = entityType as any;
    if (entityId) filters.entityId = entityId;
    if (action) filters.action = action as AuditAction;
    if (actions) filters.actions = actions.split(',') as AuditAction[];
    if (userId) filters.userId = parseInt(userId, 10);
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    if (chatId) filters.chatId = chatId;
    if (search) filters.search = search;

    const csv = await this.auditQueryService.exportAsCsv(
      req.user.userId,
      filters,
    );

    const timestamp = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="audit-history-${timestamp}.csv"`,
    );
    res.send(csv);
  }
}
