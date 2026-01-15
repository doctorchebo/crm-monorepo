/**
 * Knowledge Base Object Service
 *
 * Manages knowledge objects - the actual data instances created from templates.
 * Handles CRUD operations, field values, and triggers indexing.
 */

import {
  KbObject,
  KbObjectFieldValue,
  KbTemplateField,
} from '@database/knowledge-base.schema';
import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateObjectDto, ListObjectsQueryDto, UpdateObjectDto } from '../dto';
import { KnowledgeBaseRepository } from '../repositories/knowledge-base.repository';
import {
  FieldValue,
  ObjectDetail,
  ObjectSummary,
  PaginatedResponse,
} from '../types';
import { IndexingService } from './indexing.service';
import { KbMediaService } from './media.service';

@Injectable()
export class ObjectService {
  private readonly logger = new Logger(ObjectService.name);

  constructor(
    private readonly repository: KnowledgeBaseRepository,
    @Inject(forwardRef(() => IndexingService))
    private readonly indexingService: IndexingService,
    @Inject(forwardRef(() => KbMediaService))
    private readonly mediaService: KbMediaService,
  ) { }

  /**
   * Get objects for a user with pagination and filters
   */
  async getObjects(
    userId: number,
    query: ListObjectsQueryDto,
  ): Promise<PaginatedResponse<ObjectSummary>> {
    const {
      page = 1,
      pageSize = 20,
      templateId,
      status,
      search,
      sortBy,
      sortOrder,
    } = query;

    const { objects, total } = await this.repository.getObjectsByUser(userId, {
      templateId,
      status,
      search,
      page,
      pageSize,
      sortBy,
      sortOrder,
    });

    // Get template info for each object
    const summaries = await Promise.all(
      objects.map(async (obj) => {
        const template = await this.repository.getTemplateById(obj.templateId);
        return this.mapToObjectSummary(obj, template?.displayName || 'Unknown');
      }),
    );

    return {
      data: summaries,
      pagination: {
        page,
        pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / pageSize),
        hasMore: page * pageSize < total,
      },
    };
  }

  /**
   * Get object by ID with full details
   */
  async getObjectById(userId: number, objectId: string): Promise<ObjectDetail> {
    const object = await this.repository.getObjectById(objectId);

    if (!object) {
      throw new NotFoundException(`Object ${objectId} not found`);
    }

    if (object.userId !== userId) {
      throw new ForbiddenException('Access denied to this object');
    }

    const [template, fields, fieldValues, media] = await Promise.all([
      this.repository.getTemplateById(object.templateId),
      this.repository.getTemplateFields(object.templateId),
      this.repository.getFieldValuesByObject(objectId),
      this.repository.getMediaByObject(objectId),
    ]);

    return this.mapToObjectDetail(
      object,
      template?.displayName || 'Unknown',
      fields,
      fieldValues,
      media,
    );
  }

  /**
   * Create a new object
   */
  async createObject(
    userId: number,
    dto: CreateObjectDto,
  ): Promise<ObjectDetail> {
    // Verify template exists and is accessible
    const template = await this.repository.getTemplateById(dto.templateId);

    if (!template) {
      throw new NotFoundException(`Template ${dto.templateId} not found`);
    }

    if (!template.isSystem && template.userId !== userId) {
      throw new ForbiddenException('Access denied to this template');
    }

    // Get template fields for validation
    const templateFields = await this.repository.getTemplateFields(
      dto.templateId,
    );
    const fieldMap = new Map(templateFields.map((f) => [f.id, f]));

    // Validate required fields
    const requiredFields = templateFields.filter((f) => f.isRequired);
    const providedFieldIds = new Set(dto.fieldValues.map((fv) => fv.fieldId));

    for (const required of requiredFields) {
      if (!providedFieldIds.has(required.id)) {
        const fieldValue = dto.fieldValues.find(
          (fv) => fv.fieldId === required.id,
        );
        if (
          !fieldValue ||
          fieldValue.value === null ||
          fieldValue.value === undefined
        ) {
          throw new BadRequestException(
            `Required field "${required.displayName}" is missing`,
          );
        }
      }
    }

    // Create object
    const object = await this.repository.createObject({
      userId,
      templateId: dto.templateId,
      name: dto.name,
      externalId: dto.externalId,
      status: dto.publishImmediately ? 'pending' : 'draft',
      isTransient: dto.isTransient ?? false,
    });

    // Create field values
    const fieldValuesData = dto.fieldValues.map((fv) => {
      const field = fieldMap.get(fv.fieldId);
      return {
        objectId: object.id,
        fieldId: fv.fieldId,
        value: fv.value,
        textValue: this.extractTextValue(
          fv.value as FieldValue,
          field?.fieldType,
        ),
        numericValue: this.extractNumericValue(
          fv.value as FieldValue,
          field?.fieldType,
        ),
        dateValue: this.extractDateValue(
          fv.value as FieldValue,
          field?.fieldType,
        ),
        booleanValue: this.extractBooleanValue(
          fv.value as FieldValue,
          field?.fieldType,
        ),
      };
    });

    await this.repository.createFieldValuesBatch(fieldValuesData);

    // Get full object details
    const fieldValues = await this.repository.getFieldValuesByObject(object.id);
    const media = await this.repository.getMediaByObject(object.id);

    this.logger.log(
      `Created knowledge object ${object.id} from template ${dto.templateId}`,
    );

    // Trigger indexing immediately if publishImmediately is true
    if (dto.publishImmediately) {
      this.triggerIndexing(object.id);
    }

    return this.mapToObjectDetail(
      object,
      template.displayName,
      templateFields,
      fieldValues,
      media,
    );
  }

  /**
   * Update an object
   */
  async updateObject(
    userId: number,
    objectId: string,
    dto: UpdateObjectDto,
  ): Promise<ObjectDetail> {
    const object = await this.repository.getObjectById(objectId);

    if (!object) {
      throw new NotFoundException(`Object ${objectId} not found`);
    }

    if (object.userId !== userId) {
      throw new ForbiddenException('Access denied to this object');
    }

    // Update object metadata
    if (dto.name || dto.externalId !== undefined) {
      await this.repository.updateObject(objectId, {
        name: dto.name,
        externalId: dto.externalId,
        // Reset to pending if object was indexed (needs re-indexing)
        status: object.status === 'indexed' ? 'pending' : object.status,
        isTransient: dto.isTransient,
      });
    }

    // Update field values
    if (dto.fieldValues && dto.fieldValues.length > 0) {
      const templateFields = await this.repository.getTemplateFields(
        object.templateId,
      );
      const fieldMap = new Map(templateFields.map((f) => [f.id, f]));

      for (const fv of dto.fieldValues) {
        const field = fieldMap.get(fv.fieldId);
        await this.repository.upsertFieldValue({
          objectId,
          fieldId: fv.fieldId,
          value: fv.value,
          textValue: this.extractTextValue(
            fv.value as FieldValue,
            field?.fieldType,
          ),
          numericValue: this.extractNumericValue(
            fv.value as FieldValue,
            field?.fieldType,
          ),
          dateValue: this.extractDateValue(
            fv.value as FieldValue,
            field?.fieldType,
          ),
          booleanValue: this.extractBooleanValue(
            fv.value as FieldValue,
            field?.fieldType,
          ),
        });
      }

      // Mark for re-indexing if was indexed
      if (object.status === 'indexed') {
        await this.repository.updateObjectStatus(objectId, 'pending');
      }
    }

    return this.getObjectById(userId, objectId);
  }

  /**
   * Publish an object (mark as pending for indexing)
   */
  async publishObject(userId: number, objectId: string): Promise<ObjectDetail> {
    const object = await this.repository.getObjectById(objectId);

    if (!object) {
      throw new NotFoundException(`Object ${objectId} not found`);
    }

    if (object.userId !== userId) {
      throw new ForbiddenException('Access denied to this object');
    }

    if (object.status === 'archived') {
      throw new BadRequestException('Cannot publish archived object');
    }

    await this.repository.updateObjectStatus(objectId, 'pending');

    // Trigger indexing
    this.triggerIndexing(objectId);

    return this.getObjectById(userId, objectId);
  }

  /**
   * Archive an object
   */
  async archiveObject(userId: number, objectId: string): Promise<ObjectDetail> {
    const object = await this.repository.getObjectById(objectId);

    if (!object) {
      throw new NotFoundException(`Object ${objectId} not found`);
    }

    if (object.userId !== userId) {
      throw new ForbiddenException('Access denied to this object');
    }

    await this.repository.updateObject(objectId, {
      status: 'archived',
      archivedAt: new Date(),
    });

    return this.getObjectById(userId, objectId);
  }

  /**
   * Restore an archived object
   */
  async restoreObject(userId: number, objectId: string): Promise<ObjectDetail> {
    const object = await this.repository.getObjectById(objectId);

    if (!object) {
      throw new NotFoundException(`Object ${objectId} not found`);
    }

    if (object.userId !== userId) {
      throw new ForbiddenException('Access denied to this object');
    }

    if (object.status !== 'archived') {
      throw new BadRequestException('Object is not archived');
    }

    await this.repository.updateObject(objectId, {
      status: 'pending',
      archivedAt: null,
    });

    // Trigger re-indexing
    this.triggerIndexing(objectId);

    return this.getObjectById(userId, objectId);
  }

  /**
   * Delete an object and all its related data:
   * - Vector chunks (for semantic search)
   * - Field values
   * - Media files (S3 + database records)
   */
  async deleteObject(userId: number, objectId: string): Promise<void> {
    const object = await this.repository.getObjectById(objectId);

    if (!object) {
      throw new NotFoundException(`Object ${objectId} not found`);
    }

    if (object.userId !== userId) {
      throw new ForbiddenException('Access denied to this object');
    }

    // Delete media files from S3 and database (must happen before object deletion)
    const mediaCount = await this.mediaService.deleteAllMediaByObject(objectId);
    if (mediaCount > 0) {
      this.logger.log(
        `Deleted ${mediaCount} media files for object ${objectId}`,
      );
    }

    // Delete related data (cascades in DB, but explicit for clarity)
    await this.repository.deleteChunksByObject(objectId);
    await this.repository.deleteFieldValuesByObject(objectId);
    await this.repository.deleteObject(objectId);

    this.logger.log(`Deleted knowledge object ${objectId}`);
  }

  /**
   * Bulk update object status
   */
  async bulkUpdateStatus(
    userId: number,
    objectIds: string[],
    status: 'draft' | 'pending' | 'archived',
  ): Promise<number> {
    // Verify ownership of all objects
    for (const objectId of objectIds) {
      const object = await this.repository.getObjectById(objectId);
      if (!object || object.userId !== userId) {
        throw new ForbiddenException(`Access denied to object ${objectId}`);
      }
    }

    return this.repository.bulkUpdateObjectStatus(objectIds, status);
  }

  /**
   * Trigger re-indexing for an object
   */
  async reindexObject(userId: number, objectId: string): Promise<void> {
    const object = await this.repository.getObjectById(objectId);

    if (!object) {
      throw new NotFoundException(`Object ${objectId} not found`);
    }

    if (object.userId !== userId) {
      throw new ForbiddenException('Access denied to this object');
    }

    // Delete existing chunks
    await this.repository.deleteChunksByObject(objectId);

    // Mark for re-indexing
    await this.repository.updateObject(objectId, {
      status: 'pending',
      chunkCount: 0,
      lastIndexedAt: null,
      indexingError: null,
    });

    // Trigger actual indexing
    this.triggerIndexing(objectId);

    this.logger.log(`Queued object ${objectId} for re-indexing`);
  }

  /**
   * Trigger indexing in the background (fire and forget)
   * This allows the API to return quickly while indexing happens async
   */
  private triggerIndexing(objectId: string): void {
    // Fire and forget - don't await
    this.indexingService.indexObject(objectId).catch((error) => {
      this.logger.error(
        `Background indexing failed for object ${objectId}: ${error.message}`,
      );
    });
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private mapToObjectSummary(
    object: KbObject,
    templateName: string,
  ): ObjectSummary {
    return {
      id: object.id,
      name: object.name,
      templateId: object.templateId,
      templateName,
      status: object.status || 'draft',
      chunkCount: object.chunkCount || 0,
      mediaCount: object.mediaCount || 0,
      fileCount: object.fileCount || 0,
      createdAt: object.createdAt?.toISOString() || '',
      updatedAt: object.updatedAt?.toISOString() || '',
      lastIndexedAt: object.lastIndexedAt?.toISOString(),
    };
  }

  private mapToObjectDetail(
    object: KbObject,
    templateName: string,
    fields: KbTemplateField[],
    fieldValues: KbObjectFieldValue[],
    media: any[],
  ): ObjectDetail {
    const fieldMap = new Map(fields.map((f) => [f.id, f]));
    const valueMap = new Map(fieldValues.map((v) => [v.fieldId, v]));

    // Separate media and files
    const images = media.filter((m) => m.mediaType === 'image');
    const files = media.filter((m) => m.mediaType !== 'image');

    return {
      id: object.id,
      name: object.name,
      templateId: object.templateId,
      templateName,
      status: object.status || 'draft',
      chunkCount: object.chunkCount || 0,
      mediaCount: object.mediaCount || 0,
      fileCount: object.fileCount || 0,
      createdAt: object.createdAt?.toISOString() || '',
      updatedAt: object.updatedAt?.toISOString() || '',
      lastIndexedAt: object.lastIndexedAt?.toISOString(),
      fieldValues: fields.map((field) => {
        const value = valueMap.get(field.id);
        return {
          fieldId: field.id,
          fieldName: field.name,
          fieldSlug: field.slug,
          fieldType: field.fieldType,
          value: value?.value as FieldValue,
        };
      }),
      media: images.map((m) => ({
        id: m.id,
        fileName: m.fileName,
        url: m.s3Url || '',
        mimeType: m.mimeType,
        fileSize: m.fileSize,
        altText: m.altText,
        caption: m.caption,
        width: m.width,
        height: m.height,
        thumbnailUrl: m.thumbnailUrl,
      })),
      files: files.map((f) => ({
        id: f.id,
        fileName: f.fileName,
        url: f.s3Url || '',
        mimeType: f.mimeType,
        fileSize: f.fileSize,
      })),
      aiSummary: object.aiSummary || undefined,
      aiTags: (object.aiTags as string[]) || undefined,
      indexingError: object.indexingError || undefined,
    };
  }

  private extractTextValue(
    value: FieldValue,
    fieldType?: string,
  ): string | null {
    if (value === null || value === undefined) return null;

    if (typeof value === 'string') return value;

    if (fieldType === 'tags' && Array.isArray(value)) {
      return (value as string[]).join(', ');
    }

    if (fieldType === 'rich_text' || fieldType === 'long_text') {
      return typeof value === 'string' ? value : null;
    }

    return null;
  }

  private extractNumericValue(
    value: FieldValue,
    fieldType?: string,
  ): number | null {
    if (value === null || value === undefined) return null;

    if (typeof value === 'number') return value;

    if (
      fieldType === 'price' &&
      typeof value === 'object' &&
      'amount' in value
    ) {
      return (value as { amount: number }).amount;
    }

    return null;
  }

  private extractDateValue(value: FieldValue, fieldType?: string): Date | null {
    if (value === null || value === undefined) return null;

    if (fieldType === 'date' && typeof value === 'string') {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    }

    if (
      fieldType === 'date_range' &&
      typeof value === 'object' &&
      'start' in value
    ) {
      const start = (value as { start: string | null }).start;
      if (start) {
        const date = new Date(start);
        return isNaN(date.getTime()) ? null : date;
      }
    }

    return null;
  }

  private extractBooleanValue(
    value: FieldValue,
    fieldType?: string,
  ): boolean | null {
    if (value === null || value === undefined) return null;

    if (typeof value === 'boolean') return value;

    return null;
  }
}
