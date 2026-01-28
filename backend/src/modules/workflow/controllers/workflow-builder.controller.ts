/**
 * Workflow Builder Controller
 * REST API endpoints for the visual workflow builder
 */

import { JwtAuthGuard } from '@modules/auth/auth.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '@shared/types';
import {
  BulkDeleteWorkflowsDto,
  BulkUpdateNodePositionsDto,
  CancelExecutionDto,
  CreateConnectionDto,
  CreateNodeDto,
  CreateVariableDto,
  CreateWorkflowDto,
  CreateWorkflowTemplateCategoryDto,
  CreateWorkflowTemplateDto,
  DuplicateWorkflowDto,
  ImportWorkflowDto,
  ListExecutionsQueryDto,
  ListWorkflowsQueryDto,
  ListWorkflowTemplatesQueryDto,
  PublishWorkflowDto,
  SaveWorkflowCanvasDto,
  TriggerWorkflowDto,
  UpdateConnectionDto,
  UpdateNodeDto,
  UpdateVariableDto,
  UpdateWorkflowDto,
  UpdateWorkflowTemplateCategoryDto,
  UpdateWorkflowTemplateDto,
  UpdateTeamWorkflowSettingsDto,
  UseWorkflowTemplateDto,
  WorkflowAnalyticsQueryDto,
} from '../dto/workflow-builder.dto';
import { WorkflowBuilderService } from '../services/workflow-builder.service';
import { WorkflowAssignmentService } from '../services/workflow-assignment.service';
import { WorkflowExecutionEngine } from '../services/workflow-execution.engine';

@Controller('workflow-builder')
@UseGuards(JwtAuthGuard)
export class WorkflowBuilderController {
  constructor(
    private readonly workflowBuilderService: WorkflowBuilderService,
    private readonly workflowExecutionEngine: WorkflowExecutionEngine,
    private readonly workflowAssignmentService: WorkflowAssignmentService,
  ) {}

  // ============================================================================
  // Workflow CRUD
  // ============================================================================

  @Post('workflows')
  async createWorkflow(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateWorkflowDto,
  ) {
    const teamId = await this.workflowBuilderService['getUserTeamId'](
      req.user.userId,
    );
    return this.workflowBuilderService.createWorkflow(
      req.user.userId,
      teamId,
      dto,
    );
  }

  @Post('workflows/bulk-delete')
  async bulkDeleteWorkflows(
    @Req() req: AuthenticatedRequest,
    @Body() dto: BulkDeleteWorkflowsDto,
  ) {
    return this.workflowBuilderService.bulkDeleteWorkflows(
      req.user.userId,
      dto.workflowIds,
    );
  }

  @Get('workflows')
  async listWorkflows(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListWorkflowsQueryDto,
  ) {
    const teamId = await this.workflowBuilderService['getUserTeamId'](
      req.user.userId,
    );
    return this.workflowBuilderService.listWorkflows(
      req.user.userId,
      teamId,
      query,
    );
  }

  @Get('workflows/:id')
  async getWorkflow(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflowBuilderService.getWorkflow(req.user.userId, id, true);
  }

  @Patch('workflows/:id')
  async updateWorkflow(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflowBuilderService.updateWorkflow(req.user.userId, id, dto);
  }

  @Delete('workflows/:id')
  async deleteWorkflow(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflowBuilderService.deleteWorkflow(req.user.userId, id);
  }

  // ============================================================================
  // Team Workflow Settings
  // ============================================================================

  @Get('settings')
  async getTeamSettings(@Req() req: AuthenticatedRequest) {
    const teamId = await this.workflowBuilderService['getUserTeamId'](
      req.user.userId,
    );
    return this.workflowBuilderService.getTeamSettings(
      req.user.userId,
      teamId.toString(),
    );
  }

  @Patch('settings')
  async updateTeamSettings(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateTeamWorkflowSettingsDto,
  ) {
    const teamId = await this.workflowBuilderService['getUserTeamId'](
      req.user.userId,
    );
    return this.workflowBuilderService.updateTeamSettings(
      req.user.userId,
      teamId.toString(),
      dto.defaultWorkflowId,
    );
  }

  // ============================================================================
  // Canvas Operations (Bulk Save)
  // ============================================================================

  @Post('workflows/:id/canvas')
  async saveCanvas(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveWorkflowCanvasDto,
  ) {
    return this.workflowBuilderService.saveCanvas(req.user.userId, id, dto);
  }

  // ============================================================================
  // Node CRUD
  // ============================================================================

  @Post('nodes')
  async createNode(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateNodeDto,
  ) {
    return this.workflowBuilderService.createNode(req.user.userId, dto);
  }

  @Patch('nodes/:id')
  async updateNode(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNodeDto,
  ) {
    return this.workflowBuilderService.updateNode(req.user.userId, id, dto);
  }

  @Delete('nodes/:id')
  async deleteNode(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflowBuilderService.deleteNode(req.user.userId, id);
  }

  @Patch('workflows/:id/nodes/positions')
  async bulkUpdateNodePositions(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) workflowId: string,
    @Body() dto: BulkUpdateNodePositionsDto,
  ) {
    return this.workflowBuilderService.bulkUpdateNodePositions(
      req.user.userId,
      workflowId,
      dto,
    );
  }

  // ============================================================================
  // Connection CRUD
  // ============================================================================

  @Post('connections')
  async createConnection(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateConnectionDto,
  ) {
    return this.workflowBuilderService.createConnection(req.user.userId, dto);
  }

  @Patch('connections/:id')
  async updateConnection(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConnectionDto,
  ) {
    return this.workflowBuilderService.updateConnection(
      req.user.userId,
      id,
      dto,
    );
  }

  @Delete('connections/:id')
  async deleteConnection(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflowBuilderService.deleteConnection(req.user.userId, id);
  }

  // ============================================================================
  // Variable CRUD
  // ============================================================================

  @Post('variables')
  async createVariable(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateVariableDto,
  ) {
    return this.workflowBuilderService.createVariable(req.user.userId, dto);
  }

  @Patch('variables/:id')
  async updateVariable(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVariableDto,
  ) {
    return this.workflowBuilderService.updateVariable(req.user.userId, id, dto);
  }

  @Delete('variables/:id')
  async deleteVariable(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflowBuilderService.deleteVariable(req.user.userId, id);
  }

  // ============================================================================
  // Publishing & Versioning
  // ============================================================================

  @Post('workflows/:id/publish')
  async publishWorkflow(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishWorkflowDto,
  ) {
    return this.workflowBuilderService.publishWorkflow(
      req.user.userId,
      id,
      dto,
    );
  }

  @Post('workflows/:id/duplicate')
  async duplicateWorkflow(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DuplicateWorkflowDto,
  ) {
    return this.workflowBuilderService.duplicateWorkflow(
      req.user.userId,
      id,
      dto,
    );
  }

  @Get('workflows/:id/versions')
  async getWorkflowVersions(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflowBuilderService.getWorkflowVersions(req.user.userId, id);
  }

  @Post('workflows/:id/restore/:version')
  async restoreWorkflowVersion(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version') version: number,
  ) {
    return this.workflowBuilderService.restoreWorkflowVersion(
      req.user.userId,
      id,
      version,
    );
  }

  // ============================================================================
  // Import/Export
  // ============================================================================

  @Get('workflows/:id/export')
  async exportWorkflow(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflowBuilderService.exportWorkflow(req.user.userId, id);
  }

  @Post('workflows/import')
  async importWorkflow(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ImportWorkflowDto,
  ) {
    const teamId = await this.workflowBuilderService['getUserTeamId'](
      req.user.userId,
    );
    return this.workflowBuilderService.importWorkflow(
      req.user.userId,
      teamId,
      dto.definition as any,
      dto.name,
    );
  }

  // ============================================================================
  // Execution Management
  // ============================================================================

  @Post('execute')
  async triggerWorkflow(
    @Req() req: AuthenticatedRequest,
    @Body() dto: TriggerWorkflowDto,
  ) {
    return this.workflowExecutionEngine.triggerManually(
      dto.workflowId,
      dto.chatId,
      req.user.userId,
      dto.variables,
    );
  }

  @Get('executions')
  async listExecutions(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListExecutionsQueryDto,
  ) {
    const teamId = await this.workflowBuilderService['getUserTeamId'](
      req.user.userId,
    );
    return this.workflowBuilderService.listExecutions(
      req.user.userId,
      teamId,
      query,
    );
  }

  @Get('executions/:id')
  async getExecution(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflowBuilderService.getExecution(req.user.userId, id);
  }

  @Post('executions/:id/cancel')
  async cancelExecution(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelExecutionDto,
  ) {
    return this.workflowExecutionEngine.cancelExecution(id, dto.reason);
  }

  @Get('executions/:id/logs')
  async getExecutionLogs(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflowBuilderService.getExecutionLogs(req.user.userId, id);
  }

  // ============================================================================
  // Analytics
  // ============================================================================

  @Get('workflows/:id/analytics')
  async getWorkflowAnalytics(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: WorkflowAnalyticsQueryDto,
  ) {
    return this.workflowBuilderService.getWorkflowAnalytics(
      req.user.userId,
      id,
      query,
    );
  }

  @Get('analytics/overview')
  async getOverviewAnalytics(
    @Req() req: AuthenticatedRequest,
    @Query() query: WorkflowAnalyticsQueryDto,
  ) {
    const teamId = await this.workflowBuilderService['getUserTeamId'](
      req.user.userId,
    );
    return this.workflowBuilderService.getOverviewAnalytics(
      req.user.userId,
      teamId,
      query,
    );
  }

  // ============================================================================
  // Chat Workflow State
  // ============================================================================

  @Get('chats/:chatId/workflow-state')
  async getChatWorkflowState(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: string,
  ) {
    return this.workflowBuilderService.getChatWorkflowState(
      req.user.userId,
      chatId,
    );
  }

  @Post('chats/:chatId/workflow-state/reset')
  async resetChatWorkflowState(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: string,
  ) {
    return this.workflowBuilderService.resetChatWorkflowState(
      req.user.userId,
      chatId,
    );
  }

  @Post('chats/:chatId/workflow')
  async assignWorkflow(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: string,
    @Body('workflowId') workflowId: string,
  ) {
    return this.workflowAssignmentService.assignWorkflow(
      chatId,
      workflowId,
      'manual',
      req.user.userId,
    );
  }

  @Delete('chats/:chatId/workflow')
  async unassignWorkflow(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: string,
  ) {
    return this.workflowAssignmentService.unassignWorkflow(chatId);
  }

  // ============================================================================
  // Template Categories
  // ============================================================================

  @Get('templates/categories')
  async listTemplateCategories() {
    return this.workflowBuilderService.listTemplateCategories();
  }

  @Post('templates/categories')
  async createTemplateCategory(@Body() dto: CreateWorkflowTemplateCategoryDto) {
    return this.workflowBuilderService.createTemplateCategory(dto);
  }

  @Patch('templates/categories/:id')
  async updateTemplateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkflowTemplateCategoryDto,
  ) {
    return this.workflowBuilderService.updateTemplateCategory(id, dto);
  }

  @Delete('templates/categories/:id')
  async deleteTemplateCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.workflowBuilderService.deleteTemplateCategory(id);
  }

  // ============================================================================
  // Workflow Templates
  // ============================================================================

  @Get('templates')
  async listTemplates(@Query() query: ListWorkflowTemplatesQueryDto) {
    return this.workflowBuilderService.listTemplates(query);
  }

  @Get('templates/:id')
  async getTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.workflowBuilderService.getTemplate(id);
  }

  @Post('templates')
  async createTemplate(@Body() dto: CreateWorkflowTemplateDto) {
    return this.workflowBuilderService.createTemplate(dto);
  }

  @Patch('templates/:id')
  async updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkflowTemplateDto,
  ) {
    return this.workflowBuilderService.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  async deleteTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.workflowBuilderService.deleteTemplate(id);
  }

  @Post('templates/:id/use')
  async useTemplate(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UseWorkflowTemplateDto,
  ) {
    return this.workflowBuilderService.createWorkflowFromTemplate(
      req.user.userId,
      id,
      dto,
    );
  }
}
