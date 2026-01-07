/**
 * Knowledge Base Controller
 *
 * REST API endpoints for managing knowledge base templates, objects,
 * uploads, and retrieval.
 */

import { JwtAuthGuard } from '@modules/auth/auth.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  BulkUpdateStatusDto,
  CreateObjectDto,
  CreateTemplateDto,
  CreateTemplateFieldDto,
  ListObjectsQueryDto,
  ListTemplatesQueryDto,
  RetrieveDto,
  SaveTestQueryDto,
  TestQueryDto,
  UpdateObjectDto,
  UpdateTemplateDto,
} from './dto';
import { KnowledgeBaseRepository } from './repositories/knowledge-base.repository';
import { ObjectService, RetrievalService, TemplateService } from './services';

@Controller('knowledge-base')
@UseGuards(JwtAuthGuard)
export class KnowledgeBaseController {
  constructor(
    private readonly templateService: TemplateService,
    private readonly objectService: ObjectService,
    private readonly retrievalService: RetrievalService,
    private readonly repository: KnowledgeBaseRepository,
  ) {}

  // ============================================================================
  // TEMPLATES
  // ============================================================================

  @Get('templates')
  async getTemplates(
    @Request() req: any,
    @Query() query: ListTemplatesQueryDto,
  ) {
    return this.templateService.getTemplates(req.user.userId, {
      category: query.category,
      includeSystem: query.includeSystem ?? true,
      activeOnly: query.activeOnly ?? true,
    });
  }

  @Get('templates/:id')
  async getTemplate(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templateService.getTemplateById(req.user.userId, id);
  }

  @Post('templates')
  async createTemplate(@Request() req: any, @Body() dto: CreateTemplateDto) {
    return this.templateService.createTemplate(req.user.userId, dto);
  }

  @Patch('templates/:id')
  async updateTemplate(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templateService.updateTemplate(req.user.userId, id, dto);
  }

  @Delete('templates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTemplate(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.templateService.deleteTemplate(req.user.userId, id);
  }

  @Post('templates/:id/duplicate')
  async duplicateTemplate(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { slug: string; displayName: string },
  ) {
    return this.templateService.duplicateTemplate(
      req.user.userId,
      id,
      body.slug,
      body.displayName,
    );
  }

  // Template Fields
  @Post('templates/:id/fields')
  async addTemplateField(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTemplateFieldDto,
  ) {
    return this.templateService.addTemplateField(req.user.userId, id, dto);
  }

  @Patch('templates/:id/fields/:fieldId')
  async updateTemplateField(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @Body() dto: Partial<CreateTemplateFieldDto>,
  ) {
    return this.templateService.updateTemplateField(
      req.user.userId,
      id,
      fieldId,
      dto,
    );
  }

  @Delete('templates/:id/fields/:fieldId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTemplateField(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
  ) {
    await this.templateService.deleteTemplateField(req.user.userId, id, fieldId);
  }

  // ============================================================================
  // OBJECTS
  // ============================================================================

  @Get('objects')
  async getObjects(@Request() req: any, @Query() query: ListObjectsQueryDto) {
    return this.objectService.getObjects(req.user.userId, query);
  }

  @Get('objects/:id')
  async getObject(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.objectService.getObjectById(req.user.userId, id);
  }

  @Post('objects')
  async createObject(@Request() req: any, @Body() dto: CreateObjectDto) {
    return this.objectService.createObject(req.user.userId, dto);
  }

  @Patch('objects/:id')
  async updateObject(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateObjectDto,
  ) {
    return this.objectService.updateObject(req.user.userId, id, dto);
  }

  @Delete('objects/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteObject(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.objectService.deleteObject(req.user.userId, id);
  }

  @Post('objects/:id/publish')
  async publishObject(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.objectService.publishObject(req.user.userId, id);
  }

  @Post('objects/:id/archive')
  async archiveObject(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.objectService.archiveObject(req.user.userId, id);
  }

  @Post('objects/:id/restore')
  async restoreObject(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.objectService.restoreObject(req.user.userId, id);
  }

  @Post('objects/:id/reindex')
  @HttpCode(HttpStatus.ACCEPTED)
  async reindexObject(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.objectService.reindexObject(req.user.userId, id);
    return { message: 'Object queued for re-indexing' };
  }

  @Post('objects/bulk-status')
  async bulkUpdateStatus(
    @Request() req: any,
    @Body() dto: BulkUpdateStatusDto,
  ) {
    const count = await this.objectService.bulkUpdateStatus(
      req.user.userId,
      dto.objectIds,
      dto.status,
    );
    return { updated: count };
  }

  // ============================================================================
  // RETRIEVAL
  // ============================================================================

  @Post('retrieve')
  async retrieve(@Request() req: any, @Body() dto: RetrieveDto) {
    return this.retrievalService.retrieve(req.user.userId, dto.query, {
      topK: dto.topK,
      minSimilarity: dto.minSimilarity,
      templateIds: dto.templateIds,
      objectIds: dto.objectIds,
      excludeObjectIds: dto.excludeObjectIds,
      chunkTypes: dto.chunkTypes,
    });
  }

  @Post('retrieve/by-object')
  async retrieveByObject(@Request() req: any, @Body() dto: RetrieveDto) {
    return this.retrievalService.retrieveByObject(req.user.userId, dto.query, {
      topK: dto.topK,
      minSimilarity: dto.minSimilarity,
      templateIds: dto.templateIds,
      objectIds: dto.objectIds,
      excludeObjectIds: dto.excludeObjectIds,
      chunkTypes: dto.chunkTypes,
    });
  }

  @Get('retrieval/stats')
  async getRetrievalStats(@Request() req: any) {
    return this.retrievalService.getRetrievalStats(req.user.userId);
  }

  // ============================================================================
  // TEST INTERFACE
  // ============================================================================

  @Post('test')
  async testQuery(@Request() req: any, @Body() dto: TestQueryDto) {
    return this.retrievalService.testQuery(req.user.userId, dto.query, {
      topK: dto.topK,
      minSimilarity: dto.minSimilarity,
      templateIds: dto.templateIds,
    });
  }

  @Get('test/queries')
  async getSavedTestQueries(@Request() req: any) {
    return this.repository.getTestQueriesByUser(req.user.userId);
  }

  @Post('test/queries')
  async saveTestQuery(@Request() req: any, @Body() dto: SaveTestQueryDto) {
    return this.repository.createTestQuery({
      userId: req.user.userId,
      name: dto.name,
      query: dto.query,
      expectedObjectIds: dto.expectedObjectIds || [],
    });
  }

  @Delete('test/queries/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTestQuery(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.repository.deleteTestQuery(id);
  }

  // ============================================================================
  // DASHBOARD / STATS
  // ============================================================================

  @Get('stats')
  async getDashboardStats(@Request() req: any) {
    const userId = req.user.userId;

    // Get object counts by status
    const { objects: allObjects, total: totalObjects } =
      await this.repository.getObjectsByUser(userId, { pageSize: 10000 });

    const statusCounts = {
      draft: 0,
      pending: 0,
      indexing: 0,
      indexed: 0,
      error: 0,
      archived: 0,
    };

    for (const obj of allObjects) {
      const status = obj.status || 'draft';
      if (status in statusCounts) {
        statusCounts[status as keyof typeof statusCounts]++;
      }
    }

    // Get template counts
    const templates = await this.templateService.getTemplates(userId, {
      includeSystem: true,
    });

    // Count objects by template
    const objectsByTemplate: {
      templateId: string;
      templateName: string;
      count: number;
    }[] = [];
    const templateCounts = new Map<string, number>();

    for (const obj of allObjects) {
      const current = templateCounts.get(obj.templateId) || 0;
      templateCounts.set(obj.templateId, current + 1);
    }

    for (const [templateId, count] of templateCounts) {
      const template = templates.find((t) => t.id === templateId);
      objectsByTemplate.push({
        templateId,
        templateName: template?.displayName || 'Unknown',
        count,
      });
    }

    // Get total chunks
    const totalChunks = allObjects.reduce(
      (sum, obj) => sum + (obj.chunkCount || 0),
      0,
    );

    // Build recent activity from objects
    const recentActivity = allObjects
      .sort((a, b) => {
        const dateA = a.updatedAt || a.createdAt || new Date(0);
        const dateB = b.updatedAt || b.createdAt || new Date(0);
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      })
      .slice(0, 10)
      .map((obj) => ({
        objectId: obj.id,
        objectName: obj.name,
        action:
          obj.status === 'indexed'
            ? 'published'
            : obj.status === 'archived'
              ? 'archived'
              : obj.updatedAt !== obj.createdAt
                ? 'updated'
                : 'created',
        timestamp: (obj.updatedAt || obj.createdAt || new Date()).toISOString(),
      }));

    // Return in the format expected by the frontend
    return {
      totalTemplates: templates.length,
      totalObjects,
      totalChunks,
      objectsByStatus: {
        draft: statusCounts.draft + statusCounts.pending + statusCounts.error,
        published: statusCounts.indexed + statusCounts.indexing,
        archived: statusCounts.archived,
      },
      objectsByTemplate,
      recentActivity,
    };
  }
}

