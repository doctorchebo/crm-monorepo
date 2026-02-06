import { db } from '@database/db.connection';
import {
  templateLocales,
  templatePlatforms,
  templates,
  templateVariables,
  templateVersions,
} from '@database/schema';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  or,
} from 'drizzle-orm';
import {
  CreateTemplateDto,
  CreateTemplateLocaleDto,
  UpdateTemplateDto,
} from '../dto';
import { MetaCloudApiProvider } from '../providers/meta-cloud-api.provider';
import {
  toMetaTemplateName,
  validateMetaTemplateName,
} from '../utils/template-name.utils';
import { TemplateParserService } from './template-parser.service';
import { TemplateRenderService } from './template-render.service';
import { TemplateValidatorService } from './template-validator.service';
import { VersionStatus } from './template-version.service';

/**
 * Paginated response for templates list
 */
export interface PaginatedTemplatesResponse {
  data: any[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

/**
 * Templates service
 * Handles CRUD operations and business logic for template management
 */
@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    private parserService: TemplateParserService,
    private validatorService: TemplateValidatorService,
    private renderService: TemplateRenderService,
    private metaProvider: MetaCloudApiProvider,
  ) {}

  /**
   * Create a new template
   * Auto-generates Meta-compliant name from displayName if not provided
   */
  async createTemplate(userId: number, dto: CreateTemplateDto) {
    const templateId = crypto.randomUUID();

    // Generate Meta-compliant name from displayName if not provided
    const metaName = dto.name || toMetaTemplateName(dto.displayName);

    // Validate the name
    const validation = validateMetaTemplateName(metaName);
    if (!validation.isValid) {
      throw new BadRequestException(validation.error);
    }

    const result = await db.insert(templates).values({
      id: templateId,
      ownerId: userId,
      name: metaName,
      displayName: dto.displayName,
      description: dto.description,
      isVisible: true,
      isActive: true,
    });

    // Add platform support
    const platformsToAdd = dto.platforms || ['whatsapp'];
    for (const platform of platformsToAdd) {
      await db.insert(templatePlatforms).values({
        id: crypto.randomUUID(),
        templateId,
        platformName: platform,
        isEnabled: true,
      });
    }

    return this.getTemplate(templateId);
  }

  /**
   * Get template by ID with locales
   */
  async getTemplate(templateId: string) {
    const template = await db.query.templates.findFirst({
      where: eq(templates.id, templateId),
      with: {
        locales: true,
        platforms: true,
      },
    });

    if (!template) {
      throw new NotFoundException(`Template with ID ${templateId} not found`);
    }

    return template;
  }

  /**
   * List all templates for a user (non-paginated - kept for backward compatibility)
   */
  async listTemplates(userId: number, onlyVisible = false) {
    const where = onlyVisible
      ? and(
          eq(templates.ownerId, userId),
          eq(templates.isVisible, true),
          eq(templates.isActive, true),
        )
      : and(eq(templates.ownerId, userId), eq(templates.isActive, true));

    return await db.query.templates.findMany({
      where,
      with: {
        locales: true,
        platforms: true,
      },
      orderBy: (templates, { desc }) => [desc(templates.createdAt)],
    });
  }

  /**
   * List all templates for a user with pagination and optional search
   *
   * @param userId - User ID to filter templates
   * @param page - Page number (1-indexed)
   * @param limit - Items per page
   * @param search - Optional search query for name, displayName, or description
   * @param onlyVisible - Whether to only include visible templates
   */
  async listTemplatesPaginated(
    userId: number,
    page: number = 1,
    limit: number = 12,
    search?: string,
    onlyVisible = false,
  ): Promise<PaginatedTemplatesResponse> {
    try {
      // Build base conditions
      const conditions: any[] = [
        eq(templates.ownerId, userId),
        eq(templates.isActive, true),
      ];

      if (onlyVisible) {
        conditions.push(eq(templates.isVisible, true));
      }

      // Add search filter if provided
      if (search && search.trim()) {
        const searchTerm = `%${search.trim()}%`;
        conditions.push(
          or(
            ilike(templates.name, searchTerm),
            ilike(templates.displayName, searchTerm),
            ilike(templates.description, searchTerm),
          )!,
        );
      }

      // Get total count for pagination
      const [countResult] = await db
        .select({ count: count() })
        .from(templates)
        .where(and(...conditions));

      const totalItems = countResult?.count || 0;
      const totalPages = Math.ceil(totalItems / limit);
      const offset = (page - 1) * limit;

      // Fetch paginated results with relations
      const result = await db.query.templates.findMany({
        where: and(...conditions),
        with: {
          locales: true,
          platforms: true,
        },
        orderBy: [desc(templates.updatedAt), desc(templates.createdAt)],
        limit,
        offset,
      });

      return {
        data: result,
        pagination: {
          page,
          limit,
          totalItems,
          totalPages,
        },
      };
    } catch (error) {
      this.logger.error(`Error fetching templates: ${error.message}`);
      throw error;
    }
  }

  /**
   * Bulk delete multiple templates (soft delete)
   * Also notifies Meta API for templates that have been submitted
   * @param templateIds - Array of template IDs to delete
   * @returns Number of templates deleted
   */
  async bulkDelete(templateIds: string[]): Promise<number> {
    if (!templateIds || templateIds.length === 0) {
      return 0;
    }

    try {
      // Step 1: Fetch templates with their locales to get metaTemplateId and template name
      const templatesToDelete = await db.query.templates.findMany({
        where: and(
          inArray(templates.id, templateIds),
          eq(templates.isActive, true),
        ),
        with: {
          locales: {
            where: isNotNull(templateLocales.metaTemplateId),
          },
        },
      });

      // Step 2: Delete from Meta API for each template that has been submitted
      // Meta deletes by template name, which removes all locales/languages of that template
      const metaDeletionPromises: Promise<void>[] = [];
      const processedTemplateNames = new Set<string>();

      for (const template of templatesToDelete) {
        // Only delete from Meta if template has any locale with metaTemplateId
        const hasMetaLocales = template.locales?.some((l) => l.metaTemplateId);
        if (hasMetaLocales && !processedTemplateNames.has(template.name)) {
          processedTemplateNames.add(template.name);

          // Get any metaTemplateId for the delete call
          const metaTemplateId = template.locales?.find(
            (l) => l.metaTemplateId,
          )?.metaTemplateId;

          if (metaTemplateId) {
            metaDeletionPromises.push(
              this.metaProvider
                .deleteTemplate(metaTemplateId, template.name)
                .then((result) => {
                  if (result.success) {
                    this.logger.log(
                      `Deleted template "${template.name}" from Meta API`,
                    );
                  } else {
                    // Log but don't fail - template might already be deleted from Meta
                    this.logger.warn(
                      `Failed to delete template "${template.name}" from Meta: ${result.error}`,
                    );
                  }
                })
                .catch((error) => {
                  this.logger.warn(
                    `Error deleting template "${template.name}" from Meta: ${error.message}`,
                  );
                }),
            );
          }
        }
      }

      // Wait for all Meta deletions to complete (don't fail on Meta errors)
      await Promise.allSettled(metaDeletionPromises);

      // Step 3: Soft delete in database
      const result = await db
        .update(templates)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(
          and(inArray(templates.id, templateIds), eq(templates.isActive, true)),
        )
        .returning();

      const deletedCount = result.length;
      this.logger.log(
        `Bulk deleted ${deletedCount} templates (${processedTemplateNames.size} notified to Meta)`,
      );
      return deletedCount;
    } catch (error) {
      this.logger.error(`Error bulk deleting templates: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update template metadata
   * If displayName is updated and name is not provided, auto-regenerates the name
   */
  async updateTemplate(templateId: string, dto: UpdateTemplateDto) {
    const template = await this.getTemplate(templateId);

    // Build update object
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    // Handle displayName and name updates
    if (dto.displayName !== undefined) {
      updateData.displayName = dto.displayName;
      // If displayName is updated but name is not provided, regenerate name
      if (dto.name === undefined) {
        updateData.name = toMetaTemplateName(dto.displayName);
      }
    }

    if (dto.name !== undefined) {
      const validation = validateMetaTemplateName(dto.name);
      if (!validation.isValid) {
        throw new BadRequestException(validation.error);
      }
      updateData.name = dto.name;
    }

    // Copy other optional fields
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.isVisible !== undefined) updateData.isVisible = dto.isVisible;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    await db
      .update(templates)
      .set(updateData)
      .where(eq(templates.id, templateId));

    return this.getTemplate(templateId);
  }

  /**
   * Delete template (soft delete via isActive flag)
   * Also notifies Meta API for templates that have been submitted
   */
  async deleteTemplate(templateId: string) {
    const template = await this.getTemplate(templateId); // Verify exists

    // Check if template has any locale submitted to Meta
    const localesWithMeta = template.locales?.filter((l) => l.metaTemplateId);

    // Delete from Meta API if any locale was submitted
    if (localesWithMeta && localesWithMeta.length > 0) {
      const metaTemplateId = localesWithMeta[0].metaTemplateId;
      if (metaTemplateId) {
        const result = await this.metaProvider.deleteTemplate(
          metaTemplateId,
          template.name,
        );
        if (result.success) {
          this.logger.log(`Deleted template "${template.name}" from Meta API`);
        } else {
          // Log but don't fail - template might already be deleted from Meta
          this.logger.warn(
            `Failed to delete template "${template.name}" from Meta: ${result.error}`,
          );
        }
      }
    }

    await db
      .update(templates)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(templates.id, templateId));

    return { success: true };
  }

  /**
   * Add locale content to template
   * IMPORTANT: This method now auto-creates version 1 when adding a new locale
   */
  async addLocale(templateId: string, dto: CreateTemplateLocaleDto) {
    await this.getTemplate(templateId); // Verify template exists

    // Validate template content
    const validationErrors = this.validatorService.validate(
      dto.body,
      dto.header,
      dto.footer,
    );

    if (this.validatorService.hasCriticalErrors(validationErrors)) {
      throw new BadRequestException({
        message: 'Template validation failed',
        errors: validationErrors,
      });
    }

    const localeId = crypto.randomUUID();

    // Check if locale already exists
    const existing = await db.query.templateLocales.findFirst({
      where: and(
        eq(templateLocales.templateId, templateId),
        eq(templateLocales.locale, dto.locale),
      ),
    });

    if (existing) {
      // For existing locales, we need to check if there's an editable version
      // If there's a draft, update the draft version content
      // If approved/pending, this should fail (user must create new version)
      const versions = await db.query.templateVersions.findMany({
        where: and(
          eq(templateVersions.templateId, templateId),
          eq(templateVersions.localeId, existing.id),
        ),
        orderBy: (templateVersions, { desc }) => [
          desc(templateVersions.versionNumber),
        ],
      });

      if (versions.length > 0) {
        const latestVersion = versions[0];
        const status = latestVersion.status as VersionStatus;

        // Only allow editing draft or rejected versions
        if (
          status === VersionStatus.DRAFT ||
          status === VersionStatus.REJECTED
        ) {
          // Update the version content
          await db
            .update(templateVersions)
            .set({
              content: {
                header: dto.header,
                body: dto.body,
                footer: dto.footer,
                exampleVars: dto.exampleVars || {},
                category: dto.category || 'utility',
              },
              updatedAt: new Date(),
            })
            .where(eq(templateVersions.id, latestVersion.id));

          // Also update locale for legacy compatibility / caching
          await db
            .update(templateLocales)
            .set({
              type: dto.type || 'text',
              header: dto.header,
              body: dto.body,
              footer: dto.footer,
              exampleVars: dto.exampleVars || {},
              updatedAt: new Date(),
            })
            .where(eq(templateLocales.id, existing.id));

          return this.getLocale(existing.id);
        } else {
          // Version is immutable - cannot edit directly
          throw new BadRequestException({
            message: `Cannot edit locale directly. The current version (v${latestVersion.versionNumber}) has status "${status}". Create a new draft version to make changes.`,
            code: 'VERSION_IMMUTABLE',
            currentVersion: latestVersion.versionNumber,
            currentStatus: status,
          });
        }
      }

      // No versions exist for this locale - this shouldn't happen but handle gracefully
      // Create v1
      await this.createInitialVersion(templateId, existing.id, {
        header: dto.header,
        body: dto.body,
        footer: dto.footer,
        exampleVars: dto.exampleVars || {},
        category: dto.category || 'utility',
      });

      return this.getLocale(existing.id);
    }

    // Create new locale with initial version v1
    await db.insert(templateLocales).values({
      id: localeId,
      templateId,
      locale: dto.locale,
      type: dto.type || 'text',
      header: dto.header,
      body: dto.body,
      footer: dto.footer,
      exampleVars: dto.exampleVars || {},
      activeVersion: 1,
      approvalStatus: 'draft',
    });

    // Extract and create variables
    const variables = this.parserService.extractVariables(dto.body);
    for (const varName of variables) {
      await db.insert(templateVariables).values({
        id: crypto.randomUUID(),
        localeId,
        varName,
        varType: 'string',
        isRequired: true,
      });
    }

    // Create initial version v1 for this locale
    await this.createInitialVersion(templateId, localeId, {
      header: dto.header,
      body: dto.body,
      footer: dto.footer,
      exampleVars: dto.exampleVars || {},
      category: dto.category || 'utility',
    });

    return this.getLocale(localeId);
  }

  /**
   * Create initial version (v1) for a locale
   * This is called automatically when adding a new locale
   */
  private async createInitialVersion(
    templateId: string,
    localeId: string,
    content: {
      header?: string;
      body: string;
      footer?: string;
      exampleVars?: Record<string, any>;
      category?: string;
    },
  ) {
    const versionId = crypto.randomUUID();

    await db.insert(templateVersions).values({
      id: versionId,
      templateId,
      localeId,
      versionNumber: 1,
      content: {
        header: content.header || null,
        body: content.body,
        footer: content.footer || null,
        exampleVars: content.exampleVars || {},
        category: content.category || 'utility',
      },
      status: VersionStatus.DRAFT,
      providerName: 'meta',
      platforms: ['whatsapp'],
    });

    return versionId;
  }

  /**
   * Get locale by ID
   */
  async getLocale(localeId: string) {
    const locale = await db.query.templateLocales.findFirst({
      where: eq(templateLocales.id, localeId),
      with: {
        variables: true,
      },
    });

    if (!locale) {
      throw new NotFoundException(`Locale with ID ${localeId} not found`);
    }

    return locale;
  }

  /**
   * Render template preview
   */
  async renderPreview(
    templateId: string,
    locale: string,
    variables?: Record<string, any>,
  ) {
    const template = await this.getTemplate(templateId);

    const localeData = template.locales?.find((l) => l.locale === locale);
    if (!localeData) {
      throw new NotFoundException(`Locale ${locale} not found for template`);
    }

    const vars = variables || localeData.exampleVars || {};

    const rendered = this.renderService.render(
      {
        header: localeData.header ?? undefined,
        body: localeData.body,
        footer: localeData.footer ?? undefined,
      },
      vars,
    );

    return {
      rendered,
      formatted: this.renderService.getFormattedPreview(rendered),
    };
  }

  /**
   * Get template variables for a locale
   */
  async getLocaleVariables(localeId: string) {
    const locale = await this.getLocale(localeId);
    return locale.variables || [];
  }

  /**
   * Validate template before submission
   */
  async validateTemplate(templateId: string, locale: string) {
    const template = await this.getTemplate(templateId);
    const localeData = template.locales?.find((l) => l.locale === locale);

    if (!localeData) {
      throw new NotFoundException(`Locale ${locale} not found`);
    }

    const errors = this.validatorService.validate(
      localeData.body,
      localeData.header ?? undefined,
      localeData.footer ?? undefined,
    );

    return {
      isValid: !this.validatorService.hasCriticalErrors(errors),
      errors,
      criticalErrors: this.validatorService.getErrorsOnly(errors),
      warnings: this.validatorService.getWarningsOnly(errors),
    };
  }
}
