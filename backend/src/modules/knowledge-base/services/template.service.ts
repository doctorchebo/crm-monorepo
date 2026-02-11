/**
 * Knowledge Base Template Service
 *
 * Manages object templates including system templates and custom user templates.
 * Handles template CRUD operations and field management.
 */

import {
  KbObjectTemplate,
  KbTemplateField,
} from '@database/knowledge-base.schema';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditWriteService } from '../../audit/audit-write.service';
import {
  CreateTemplateDto,
  CreateTemplateFieldDto,
  UpdateTemplateDto,
} from '../dto';
import { KnowledgeBaseRepository } from '../repositories/knowledge-base.repository';
import { TemplateDetail, TemplateSummary } from '../types';

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  constructor(
    private readonly repository: KnowledgeBaseRepository,
    private readonly auditWriteService: AuditWriteService,
  ) {}

  /**
   * Get all templates available to a user (system + user-created)
   */
  async getTemplates(
    userId: number,
    options: {
      category?: string;
      includeSystem?: boolean;
      activeOnly?: boolean;
    } = {},
  ): Promise<TemplateSummary[]> {
    const templates = await this.repository.getTemplatesByUser(userId, options);

    // Get object counts for each template
    const summaries = await Promise.all(
      templates.map(async (template) => {
        const objectCount = await this.repository.getObjectsCountByTemplate(
          template.id,
        );
        const objectsWithMediaCount =
          await this.repository.getObjectsWithMediaCountByTemplate(template.id);
        const fields = await this.repository.getTemplateFields(template.id);

        return this.mapToTemplateSummary(
          template,
          objectCount,
          objectsWithMediaCount,
          fields.length,
        );
      }),
    );

    return summaries;
  }

  /**
   * Get template by ID with full details
   */
  async getTemplateById(
    userId: number,
    templateId: string,
  ): Promise<TemplateDetail> {
    const template = await this.repository.getTemplateById(templateId);

    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    // Check access
    if (!template.isSystem && template.userId !== userId) {
      throw new ForbiddenException('Access denied to this template');
    }

    const fields = await this.repository.getTemplateFields(templateId);
    const objectCount =
      await this.repository.getObjectsCountByTemplate(templateId);
    const objectsWithMediaCount =
      await this.repository.getObjectsWithMediaCountByTemplate(templateId);

    return this.mapToTemplateDetail(
      template,
      fields,
      objectCount,
      objectsWithMediaCount,
    );
  }

  /**
   * Get template by slug
   */
  async getTemplateBySlug(
    userId: number,
    slug: string,
  ): Promise<TemplateDetail | null> {
    const template = await this.repository.getTemplateBySlug(userId, slug);

    if (!template) {
      return null;
    }

    const fields = await this.repository.getTemplateFields(template.id);
    const objectCount = await this.repository.getObjectsCountByTemplate(
      template.id,
    );
    const objectsWithMediaCount =
      await this.repository.getObjectsWithMediaCountByTemplate(template.id);

    return this.mapToTemplateDetail(
      template,
      fields,
      objectCount,
      objectsWithMediaCount,
    );
  }

  /**
   * Create a new custom template
   */
  async createTemplate(
    userId: number,
    dto: CreateTemplateDto,
  ): Promise<TemplateDetail> {
    // Check for duplicate slug
    const existing = await this.repository.getTemplateBySlug(userId, dto.slug);
    if (existing) {
      throw new ConflictException(
        `Template with slug "${dto.slug}" already exists`,
      );
    }

    // Create template
    const template = await this.repository.createTemplate({
      userId,
      name: dto.name,
      slug: dto.slug,
      displayName: dto.displayName,
      description: dto.description,
      icon: dto.icon || 'file-text',
      color: dto.color || '#3b82f6',
      category: dto.category || 'custom',
      isSystem: false,
      hasMedia: dto.hasMedia ?? false,
      isActive: true,
      aiUsageHints: dto.aiUsageHints,
      aiRetrievalContext: dto.aiRetrievalContext,
      supportedIntents: dto.supportedIntents || [],
      fabricationWarnings: dto.fabricationWarnings || [],
      priorityScore: dto.priorityScore || 50,
    });

    // Create fields
    const fields = await this.repository.createTemplateFieldsBatch(
      dto.fields.map((field, index) => ({
        templateId: template.id,
        name: field.name,
        slug: field.slug,
        displayName: field.displayName,
        description: field.description,
        placeholder: field.placeholder,
        fieldType: field.fieldType,
        isRequired: field.isRequired || false,
        isUnique: field.isUnique || false,
        defaultValue:
          field.defaultValue !== undefined
            ? typeof field.defaultValue === 'string'
              ? field.defaultValue
              : JSON.stringify(field.defaultValue)
            : null,
        fieldConfig: field.fieldConfig || {},
        validation: field.validation || {},
        aiRelevance: field.aiRelevance || 'medium',
        aiIncludeInEmbedding: field.aiIncludeInEmbedding ?? true,
        aiFieldHints: field.aiFieldHints,
        sortOrder: field.sortOrder ?? index,
        groupName: field.groupName,
        isHidden: field.isHidden || false,
      })),
    );

    await this.auditWriteService.logKBTemplateCreated({
      userId,
      entityId: template.id,
      entityName: dto.displayName || dto.name,
    });

    return this.mapToTemplateDetail(template, fields, 0, 0);
  }

  /**
   * Update template metadata
   */
  async updateTemplate(
    userId: number,
    templateId: string,
    dto: UpdateTemplateDto,
  ): Promise<TemplateDetail> {
    const template = await this.repository.getTemplateById(templateId);

    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    // Check ownership (system templates can be modified by any authenticated user)
    if (!template.isSystem && template.userId !== userId) {
      throw new ForbiddenException('Access denied to this template');
    }

    const updated = await this.repository.updateTemplate(templateId, {
      displayName: dto.displayName,
      description: dto.description,
      icon: dto.icon,
      color: dto.color,
      hasMedia: dto.hasMedia,
      isActive: dto.isActive,
      aiUsageHints: dto.aiUsageHints,
      aiRetrievalContext: dto.aiRetrievalContext,
      supportedIntents: dto.supportedIntents,
      fabricationWarnings: dto.fabricationWarnings,
      priorityScore: dto.priorityScore,
    });

    const fields = await this.repository.getTemplateFields(templateId);
    const objectCount =
      await this.repository.getObjectsCountByTemplate(templateId);
    const objectsWithMediaCount =
      await this.repository.getObjectsWithMediaCountByTemplate(templateId);

    await this.auditWriteService.logKBTemplateUpdated({
      userId,
      entityId: templateId,
      entityName: updated!.displayName || updated!.name,
      changes: dto as unknown as Record<string, { from: unknown; to: unknown }>,
    });

    return this.mapToTemplateDetail(
      updated!,
      fields,
      objectCount,
      objectsWithMediaCount,
    );
  }

  /**
   * Add a field to a template
   */
  async addTemplateField(
    userId: number,
    templateId: string,
    dto: CreateTemplateFieldDto,
  ): Promise<KbTemplateField> {
    const template = await this.repository.getTemplateById(templateId);

    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    // Check ownership (system templates can be modified by any authenticated user)
    if (!template.isSystem && template.userId !== userId) {
      throw new ForbiddenException('Access denied to this template');
    }

    // Get existing fields to determine sort order
    const existingFields = await this.repository.getTemplateFields(templateId);
    const maxSortOrder = Math.max(
      ...existingFields.map((f) => f.sortOrder || 0),
      0,
    );

    return this.repository.createTemplateField({
      templateId,
      name: dto.name,
      slug: dto.slug,
      displayName: dto.displayName,
      description: dto.description,
      placeholder: dto.placeholder,
      fieldType: dto.fieldType,
      isRequired: dto.isRequired || false,
      isUnique: dto.isUnique || false,
      defaultValue:
        dto.defaultValue !== undefined
          ? typeof dto.defaultValue === 'string'
            ? dto.defaultValue
            : JSON.stringify(dto.defaultValue)
          : null,
      fieldConfig: dto.fieldConfig || {},
      validation: dto.validation || {},
      aiRelevance: dto.aiRelevance || 'medium',
      aiIncludeInEmbedding: dto.aiIncludeInEmbedding ?? true,
      aiFieldHints: dto.aiFieldHints,
      sortOrder: dto.sortOrder ?? maxSortOrder + 1,
      groupName: dto.groupName,
      isHidden: dto.isHidden || false,
    });
  }

  /**
   * Update a template field
   */
  async updateTemplateField(
    userId: number,
    templateId: string,
    fieldId: string,
    dto: Partial<CreateTemplateFieldDto>,
  ): Promise<KbTemplateField> {
    const template = await this.repository.getTemplateById(templateId);

    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    // Check ownership (system templates can be modified by any authenticated user)
    if (!template.isSystem && template.userId !== userId) {
      throw new ForbiddenException('Access denied to this template');
    }

    const updated = await this.repository.updateTemplateField(
      fieldId,
      dto as any,
    );

    if (!updated) {
      throw new NotFoundException(`Field ${fieldId} not found`);
    }

    return updated;
  }

  /**
   * Delete a template field
   */
  async deleteTemplateField(
    userId: number,
    templateId: string,
    fieldId: string,
  ): Promise<void> {
    const template = await this.repository.getTemplateById(templateId);

    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    // Check ownership (system templates can be modified by any authenticated user)
    if (!template.isSystem && template.userId !== userId) {
      throw new ForbiddenException('Access denied to this template');
    }

    // Protect fields that have data in existing objects
    const hasValues = await this.repository.hasFieldValues(fieldId);
    if (hasValues) {
      throw new ConflictException(
        'Cannot delete field that has data in existing objects. Remove or clear the data first.',
      );
    }

    const deleted = await this.repository.deleteTemplateField(fieldId);

    if (!deleted) {
      throw new NotFoundException(`Field ${fieldId} not found`);
    }
  }

  /**
   * Reorder template fields
   */
  async reorderTemplateFields(
    userId: number,
    templateId: string,
    fieldIds: string[],
  ): Promise<KbTemplateField[]> {
    const template = await this.repository.getTemplateById(templateId);

    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    // Check ownership (system templates can be modified by any authenticated user)
    if (!template.isSystem && template.userId !== userId) {
      throw new ForbiddenException('Access denied to this template');
    }

    // Verify all fields belong to the template
    const existingFields = await this.repository.getTemplateFields(templateId);
    const existingFieldIds = new Set(existingFields.map((f) => f.id));

    const invalidIds = fieldIds.filter((id) => !existingFieldIds.has(id));
    if (invalidIds.length > 0) {
      throw new ConflictException(
        `Fields not found in template: ${invalidIds.join(', ')}`,
      );
    }

    // Update sort orders
    await Promise.all(
      fieldIds.map((fieldId, index) =>
        this.repository.updateTemplateField(fieldId, { sortOrder: index }),
      ),
    );

    return this.repository.getTemplateFields(templateId);
  }

  /**
   * Delete a template
   */
  async deleteTemplate(userId: number, templateId: string): Promise<void> {
    const template = await this.repository.getTemplateById(templateId);

    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    if (template.isSystem) {
      throw new ForbiddenException('Cannot delete system templates');
    }

    if (template.userId !== userId) {
      throw new ForbiddenException('Access denied to this template');
    }

    // Check for objects using this template
    const objectCount =
      await this.repository.getObjectsCountByTemplate(templateId);
    if (objectCount > 0) {
      throw new ConflictException(
        `Cannot delete template with ${objectCount} existing objects. Archive or delete objects first.`,
      );
    }

    // Delete fields first
    await this.repository.deleteTemplateFieldsByTemplateId(templateId);

    // Delete template
    await this.repository.deleteTemplate(templateId);

    await this.auditWriteService.logKBTemplateDeleted({
      userId,
      entityId: templateId,
      entityName: template.displayName || template.name,
    });
  }

  /**
   * Duplicate a template (create a copy for the user)
   */
  async duplicateTemplate(
    userId: number,
    templateId: string,
    newSlug: string,
    newDisplayName: string,
  ): Promise<TemplateDetail> {
    const template = await this.repository.getTemplateById(templateId);

    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    // Check slug availability
    const existing = await this.repository.getTemplateBySlug(userId, newSlug);
    if (existing) {
      throw new ConflictException(
        `Template with slug "${newSlug}" already exists`,
      );
    }

    // Get fields
    const fields = await this.repository.getTemplateFields(templateId);

    // Create new template
    const newTemplate = await this.repository.createTemplate({
      userId,
      name: template.name + '_copy',
      slug: newSlug,
      displayName: newDisplayName,
      description: template.description,
      icon: template.icon,
      color: template.color,
      category: 'custom',
      isSystem: false,
      isActive: true,
      aiUsageHints: template.aiUsageHints,
      aiRetrievalContext: template.aiRetrievalContext,
      supportedIntents: template.supportedIntents as string[],
      fabricationWarnings: template.fabricationWarnings as string[],
      priorityScore: template.priorityScore,
    });

    // Copy fields
    const newFields = await this.repository.createTemplateFieldsBatch(
      fields.map((field) => ({
        templateId: newTemplate.id,
        name: field.name,
        slug: field.slug,
        displayName: field.displayName,
        description: field.description,
        placeholder: field.placeholder,
        fieldType: field.fieldType,
        isRequired: field.isRequired,
        isUnique: field.isUnique,
        defaultValue: field.defaultValue,
        fieldConfig: field.fieldConfig,
        validation: field.validation,
        aiRelevance: field.aiRelevance,
        aiIncludeInEmbedding: field.aiIncludeInEmbedding,
        aiFieldHints: field.aiFieldHints,
        sortOrder: field.sortOrder,
        groupName: field.groupName,
        isHidden: field.isHidden,
      })),
    );

    return this.mapToTemplateDetail(newTemplate, newFields, 0, 0);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private mapToTemplateSummary(
    template: KbObjectTemplate,
    objectCount: number,
    objectsWithMediaCount: number,
    fieldCount: number,
  ): TemplateSummary {
    return {
      id: template.id,
      name: template.name,
      slug: template.slug,
      displayName: template.displayName,
      description: template.description || undefined,
      icon: template.icon || 'file-text',
      color: template.color || '#3b82f6',
      category: template.category,
      isSystem: template.isSystem || false,
      isActive: template.isActive || true,
      hasMedia: template.hasMedia || false,
      objectCount,
      objectsWithMediaCount,
      fieldCount,
    };
  }

  private mapToTemplateDetail(
    template: KbObjectTemplate,
    fields: KbTemplateField[],
    objectCount: number,
    objectsWithMediaCount: number,
  ): TemplateDetail {
    return {
      id: template.id,
      name: template.name,
      slug: template.slug,
      displayName: template.displayName,
      description: template.description || undefined,
      icon: template.icon || 'file-text',
      color: template.color || '#3b82f6',
      category: template.category,
      isSystem: template.isSystem || false,
      isActive: template.isActive || true,
      hasMedia: template.hasMedia || false,
      objectCount,
      objectsWithMediaCount,
      fieldCount: fields.length,
      fields: fields.map((field) => ({
        id: field.id,
        name: field.name,
        slug: field.slug,
        displayName: field.displayName,
        description: field.description || undefined,
        placeholder: field.placeholder || undefined,
        fieldType: field.fieldType,
        isRequired: field.isRequired || false,
        isUnique: field.isUnique || false,
        defaultValue: field.defaultValue,
        fieldConfig: field.fieldConfig as any,
        validation: field.validation as Record<string, unknown>,
        aiRelevance: field.aiRelevance || 'medium',
        aiIncludeInEmbedding: field.aiIncludeInEmbedding ?? true,
        aiFieldHints: field.aiFieldHints || undefined,
        sortOrder: field.sortOrder || 0,
        groupName: field.groupName || undefined,
        isHidden: field.isHidden || false,
      })),
      aiUsageHints: template.aiUsageHints || undefined,
      aiRetrievalContext: template.aiRetrievalContext || undefined,
      supportedIntents: (template.supportedIntents as string[]) || undefined,
      fabricationWarnings:
        (template.fabricationWarnings as string[]) || undefined,
      priorityScore: template.priorityScore || 50,
    };
  }
}
