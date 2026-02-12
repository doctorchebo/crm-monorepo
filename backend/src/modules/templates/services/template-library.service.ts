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
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { AuditWriteService } from '../../audit/audit-write.service';
import { MetaCloudApiProvider } from '../providers/meta-cloud-api.provider';
import {
  CreateFromLibraryRequest,
  TemplateApprovalStatus,
  TemplateLibraryFilters,
  TemplateLibraryIndustry,
  TemplateLibraryParamType,
  TemplateLibraryTemplate,
  TemplateLibraryTopic,
  TemplateLibraryUseCase,
} from '../providers/provider.interface';
import {
  toMetaTemplateName,
  validateMetaTemplateName,
} from '../utils/template-name.utils';
import { VersionStatus } from './template-version.service';

// ==================== Constants ====================

/**
 * Cache TTL for the Template Library catalog (1 hour in ms)
 * The Meta catalog changes infrequently, so caching avoids unnecessary API calls
 */
const LIBRARY_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Maps Meta Template Library parameter types to internal variable types
 * used in the template_variables table
 */
const META_PARAM_TYPE_TO_VAR_TYPE: Record<string, string> = {
  [TemplateLibraryParamType.TEXT]: 'string',
  [TemplateLibraryParamType.AMOUNT]: 'currency',
  [TemplateLibraryParamType.DATE]: 'date',
  [TemplateLibraryParamType.PHONE_NUMBER]: 'phone',
  [TemplateLibraryParamType.EMAIL]: 'string', // email is a string subtype
  [TemplateLibraryParamType.NUMBER]: 'string', // stored as string, validated separately
  [TemplateLibraryParamType.ADDRESS]: 'string',
};

// ==================== Types ====================

interface CacheEntry {
  data: TemplateLibraryTemplate[];
  timestamp: number;
}

/**
 * Response returned by browseLibrary() — augments Meta's catalog
 * with adoption metadata for the current user
 */
export interface TemplateLibraryBrowseResult {
  templates: TemplateLibraryTemplateWithStatus[];
  totalCount: number;
}

/**
 * A library template enriched with user-specific adoption status
 */
export interface TemplateLibraryTemplateWithStatus extends TemplateLibraryTemplate {
  /** Whether this user has already adopted this library template */
  adopted: boolean;
  /** ID of the adopted template (if adopted) */
  adoptedTemplateId?: string;
}

/**
 * Input interface for the adoption flow (service layer).
 * Named distinctly from the controller DTO class to avoid import ambiguity.
 */
export interface AdoptLibraryTemplateInput {
  /** User-chosen display name for the template */
  displayName: string;
  /** Language code (Meta format, e.g., 'en_US') */
  language: string;
  /** Exact name of the library template to adopt */
  libraryTemplateName: string;
  /** Button configuration — required if the library template has URL or phone buttons */
  buttonInputs?: CreateFromLibraryRequest['buttonInputs'];
  /** Optional body configuration flags */
  bodyInputs?: CreateFromLibraryRequest['bodyInputs'];
}

/**
 * Result of a successful adoption
 */
export interface AdoptTemplateResult {
  templateId: string;
  localeId: string;
  name: string;
  displayName: string;
  approvalStatus: string;
  metaTemplateId?: string;
}

// ==================== Service ====================

/**
 * Template Library Service
 *
 * Handles browsing Meta's Template Library catalog and adopting
 * pre-approved templates. Adopted templates are stored as regular
 * templates with `source: 'library'` and are instantly approved.
 *
 * Key design decisions:
 * - In-memory cache (1h TTL) for the library catalog to avoid rate limits
 * - Adopted templates reuse the existing templates/locales/versions schema
 * - `source: 'library'` column distinguishes library vs custom templates
 * - `libraryTemplateName` on locale prevents duplicate adoption
 * - `bodyParamTypes` on locale enables send-time parameter validation
 */
@Injectable()
export class TemplateLibraryService {
  private readonly logger = new Logger(TemplateLibraryService.name);

  /** In-memory cache keyed by serialized filter params */
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly metaProvider: MetaCloudApiProvider,
    private readonly auditWriteService: AuditWriteService,
  ) {}

  // ==================== Browse ====================

  /**
   * Browse Meta's Template Library with optional filters.
   *
   * Returns templates augmented with adoption status for the given user.
   * Results are cached in-memory (1h TTL) to reduce Meta API calls.
   */
  async browseLibrary(
    filters: TemplateLibraryFilters | undefined,
    ownerId: number,
  ): Promise<TemplateLibraryBrowseResult> {
    // 1. Fetch library templates (cached)
    const libraryTemplates = await this.fetchLibraryTemplates(filters);

    // 2. Get the set of library template names already adopted by this user
    const adoptedMap = await this.getAdoptedTemplateMap(ownerId);

    // 3. Enrich with adoption status
    const enriched: TemplateLibraryTemplateWithStatus[] = libraryTemplates.map(
      (t) => {
        const adoptionKey = this.buildAdoptionKey(t.name, t.language);
        const adopted = adoptedMap.get(adoptionKey);
        return {
          ...t,
          adopted: !!adopted,
          adoptedTemplateId: adopted?.templateId,
        };
      },
    );

    return {
      templates: enriched,
      totalCount: enriched.length,
    };
  }

  /**
   * Fetch library templates from Meta API or cache
   */
  private async fetchLibraryTemplates(
    filters?: TemplateLibraryFilters,
  ): Promise<TemplateLibraryTemplate[]> {
    const cacheKey = this.buildCacheKey(filters);
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < LIBRARY_CACHE_TTL_MS) {
      this.logger.debug(`Template Library cache hit for key: ${cacheKey}`);
      return cached.data;
    }

    // Cache miss or expired — fetch from Meta
    const result = await this.metaProvider.getTemplateLibrary(filters);

    if (!result.success) {
      this.logger.error(`Failed to fetch Template Library: ${result.error}`);
      // Return stale cache if available, else throw
      if (cached) {
        this.logger.warn('Returning stale cache due to API error');
        return cached.data;
      }
      throw new BadRequestException(
        result.error || 'Failed to fetch Template Library from Meta',
      );
    }

    // Update cache
    this.cache.set(cacheKey, {
      data: result.templates,
      timestamp: Date.now(),
    });

    return result.templates;
  }

  /**
   * Build a cache key from filters
   */
  private buildCacheKey(filters?: TemplateLibraryFilters): string {
    if (!filters) return '__all__';
    return JSON.stringify(filters, Object.keys(filters).sort());
  }

  /**
   * Get a map of library templates already adopted by this user.
   * Key: `{libraryTemplateName}:{locale}` → Value: `{ templateId }`
   */
  private async getAdoptedTemplateMap(
    ownerId: number,
  ): Promise<Map<string, { templateId: string }>> {
    const adopted = await db
      .select({
        templateId: templateLocales.templateId,
        libraryTemplateName: templateLocales.libraryTemplateName,
        locale: templateLocales.locale,
      })
      .from(templateLocales)
      .innerJoin(templates, eq(templates.id, templateLocales.templateId))
      .where(and(eq(templates.ownerId, ownerId), eq(templates.isActive, true)));

    const map = new Map<string, { templateId: string }>();
    for (const row of adopted) {
      if (row.libraryTemplateName) {
        const key = this.buildAdoptionKey(row.libraryTemplateName, row.locale);
        map.set(key, { templateId: row.templateId });
      }
    }
    return map;
  }

  /**
   * Build a unique key for adoption dedup: `{libraryTemplateName}:{language}`
   */
  private buildAdoptionKey(
    libraryTemplateName: string,
    language: string,
  ): string {
    return `${libraryTemplateName}:${language}`;
  }

  // ==================== Adopt ====================

  /**
   * Adopt a template from Meta's Template Library.
   *
   * This creates a real template in the system that is instantly APPROVED:
   * 1. Validates the template isn't already adopted
   * 2. Calls Meta API to create the template (instantly approved)
   * 3. Creates template, locale, version, and variable records
   *
   * The adopted template then appears alongside custom templates in all views.
   */
  async adoptTemplate(
    dto: AdoptLibraryTemplateInput,
    ownerId: number,
  ): Promise<AdoptTemplateResult> {
    // 1. Generate Meta-compliant name
    const metaName = toMetaTemplateName(dto.displayName);
    const nameValidation = validateMetaTemplateName(metaName);
    if (!nameValidation.isValid) {
      throw new BadRequestException(
        `Invalid template name: ${nameValidation.error}`,
      );
    }

    // 2. Map language code to locale for internal storage
    // Meta uses 'en_US' format; we store the same format for library templates
    const internalLocale = dto.language;

    // 3. Check for duplicate adoption
    await this.checkDuplicateAdoption(
      ownerId,
      dto.libraryTemplateName,
      internalLocale,
    );

    // 4. Fetch the library template details (from cache) to get body/header/footer/params
    const libraryTemplate = await this.findLibraryTemplate(
      dto.libraryTemplateName,
      dto.language,
    );

    // 5. Call Meta API to create the template
    const createResult = await this.metaProvider.createFromLibrary({
      name: metaName,
      language: dto.language,
      libraryTemplateName: dto.libraryTemplateName,
      buttonInputs: dto.buttonInputs,
      bodyInputs: dto.bodyInputs,
    });

    if (!createResult.success) {
      this.logger.error(
        `Meta API rejected library template adoption: ${createResult.error}`,
      );
      throw new BadRequestException(
        createResult.error ||
          'Failed to create template from library. Please try again.',
      );
    }

    // 6. Create records in our database
    const templateId = crypto.randomUUID();
    const localeId = crypto.randomUUID();
    const versionId = crypto.randomUUID();

    // 6a. Create template record with source='library'
    await db.insert(templates).values({
      id: templateId,
      ownerId,
      name: metaName,
      displayName: dto.displayName,
      description: this.buildLibraryDescription(libraryTemplate),
      source: 'library',
      isVisible: true,
      isActive: true,
    });

    // 6b. Create platform record
    await db.insert(templatePlatforms).values({
      id: crypto.randomUUID(),
      templateId,
      platformName: 'whatsapp',
      isEnabled: true,
    });

    // 6c. Create locale record — instantly approved
    const bodyParamTypes = libraryTemplate.body_param_types?.length
      ? libraryTemplate.body_param_types
      : null;

    await db.insert(templateLocales).values({
      id: localeId,
      templateId,
      locale: internalLocale,
      type: libraryTemplate.header ? 'media' : 'text',
      header: libraryTemplate.header || null,
      body: libraryTemplate.body,
      footer: libraryTemplate.footer || null,
      exampleVars: this.buildExampleVars(libraryTemplate),
      activeVersion: 1,
      category: (libraryTemplate.category || 'utility').toLowerCase(),
      approvalStatus: TemplateApprovalStatus.APPROVED,
      metaTemplateId: createResult.providerId || null,
      qualityRating: 'pending',
      submittedAt: new Date(),
      reviewedAt: new Date(),
      metaResponse: createResult.providerResponse || null,
      buttons: libraryTemplate.buttons || [],
      parameterFormat: 'positional', // Library templates use positional params ({{1}}, {{2}}, etc.)
      libraryTemplateName: dto.libraryTemplateName,
      bodyParamTypes: bodyParamTypes,
    } as any);

    // 6d. Create version record — approved from the start
    const versionContent = {
      header: libraryTemplate.header || null,
      body: libraryTemplate.body,
      footer: libraryTemplate.footer || null,
      exampleVars: this.buildExampleVars(libraryTemplate),
      category: (libraryTemplate.category || 'utility').toLowerCase(),
    };

    await db.insert(templateVersions).values({
      id: versionId,
      templateId,
      localeId,
      versionNumber: 1,
      content: versionContent,
      status: VersionStatus.APPROVED,
      providerName: 'meta',
      providerResponse: createResult.providerResponse || null,
      platforms: ['whatsapp'],
    } as any);

    // 6e. Create variable records from parameter types
    await this.createLibraryVariables(localeId, libraryTemplate);

    // 7. Audit log
    await this.auditWriteService.logTemplateCreated({
      userId: ownerId,
      entityId: templateId,
      entityName: dto.displayName,
      metadata: {
        source: 'library',
        libraryTemplateName: dto.libraryTemplateName,
      },
    });

    this.logger.log(
      `Template '${dto.displayName}' adopted from library template '${dto.libraryTemplateName}' — instantly approved`,
    );

    return {
      templateId,
      localeId,
      name: metaName,
      displayName: dto.displayName,
      approvalStatus: TemplateApprovalStatus.APPROVED,
      metaTemplateId: createResult.providerId,
    };
  }

  // ==================== Helpers ====================

  /**
   * Check if a library template has already been adopted by this user
   */
  private async checkDuplicateAdoption(
    ownerId: number,
    libraryTemplateName: string,
    locale: string,
  ): Promise<void> {
    const existing = await db
      .select({ id: templateLocales.id })
      .from(templateLocales)
      .innerJoin(templates, eq(templates.id, templateLocales.templateId))
      .where(
        and(
          eq(templates.ownerId, ownerId),
          eq(templates.isActive, true),
          eq(templateLocales.libraryTemplateName, libraryTemplateName),
          eq(templateLocales.locale, locale),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException(
        `You have already adopted the library template '${libraryTemplateName}' for language '${locale}'. ` +
          `Each library template can only be adopted once per language.`,
      );
    }
  }

  /**
   * Find a specific library template from the cached catalog.
   * Falls back to a fresh API call if not found in cache.
   */
  private async findLibraryTemplate(
    libraryTemplateName: string,
    language: string,
  ): Promise<TemplateLibraryTemplate> {
    // Try cache first
    const cached = await this.fetchLibraryTemplates({ language });
    const found = cached.find(
      (t) => t.name === libraryTemplateName && t.language === language,
    );

    if (found) return found;

    // Try without language filter (maybe cached under different key)
    const allCached = await this.fetchLibraryTemplates(undefined);
    const foundInAll = allCached.find(
      (t) => t.name === libraryTemplateName && t.language === language,
    );

    if (foundInAll) return foundInAll;

    // Not found — search Meta API directly
    const result = await this.metaProvider.getTemplateLibrary({
      search: libraryTemplateName,
      language,
    });

    if (result.success) {
      const matched = result.templates.find(
        (t) => t.name === libraryTemplateName && t.language === language,
      );
      if (matched) return matched;
    }

    // Construct a minimal template from what we know
    // This allows adoption to proceed even if we can't fetch full details
    this.logger.warn(
      `Library template '${libraryTemplateName}' (${language}) not found in catalog. ` +
        `Proceeding with minimal metadata — Meta API will validate.`,
    );

    return {
      name: libraryTemplateName,
      language,
      category: 'UTILITY',
      topic: '',
      usecase: '',
      industry: [],
      body: '', // Will be populated from Meta's response after creation
      body_params: [],
      body_param_types: [],
    };
  }

  /**
   * Build example variable values from the library template's sample params
   */
  private buildExampleVars(
    template: TemplateLibraryTemplate,
  ): Record<string, string> {
    const vars: Record<string, string> = {};
    if (template.body_params?.length) {
      template.body_params.forEach((value, index) => {
        vars[`${index + 1}`] = value;
      });
    }
    return vars;
  }

  /**
   * Build a description for the adopted template from library metadata
   */
  private buildLibraryDescription(template: TemplateLibraryTemplate): string {
    const parts: string[] = [];

    if (template.topic) {
      parts.push(`Topic: ${template.topic.replace(/_/g, ' ').toLowerCase()}`);
    }
    if (template.usecase) {
      parts.push(
        `Use case: ${template.usecase.replace(/_/g, ' ').toLowerCase()}`,
      );
    }
    if (template.industry?.length) {
      parts.push(
        `Industry: ${template.industry.map((i) => i.replace(/_/g, ' ').toLowerCase()).join(', ')}`,
      );
    }

    const prefix = 'Adopted from Meta Template Library.';
    return parts.length > 0 ? `${prefix} ${parts.join(' | ')}` : prefix;
  }

  /**
   * Create template variable records from the library template's parameter types.
   * Library templates use positional parameters ({{1}}, {{2}}, etc.)
   */
  private async createLibraryVariables(
    localeId: string,
    template: TemplateLibraryTemplate,
  ): Promise<void> {
    if (!template.body_param_types?.length) return;

    for (let i = 0; i < template.body_param_types.length; i++) {
      const paramType = template.body_param_types[i];
      const varType = META_PARAM_TYPE_TO_VAR_TYPE[paramType] || 'string';

      await db.insert(templateVariables).values({
        id: crypto.randomUUID(),
        localeId,
        varName: `${i + 1}`, // Positional: "1", "2", "3", etc.
        varType,
        isRequired: true,
      });
    }
  }

  // ==================== Cache Management ====================

  /**
   * Clear the in-memory Template Library cache.
   * Useful after configuration changes or for manual refresh.
   */
  clearCache(): void {
    const count = this.cache.size;
    this.cache.clear();
    this.logger.log(`Template Library cache cleared (${count} entries)`);
  }

  // ==================== Filter Options ====================

  /**
   * Get the available filter options for the Template Library browser.
   * These are static enums from Meta's documentation.
   */
  getFilterOptions() {
    const toOptions = (enumObj: Record<string, string>) =>
      Object.values(enumObj).map((value) => ({
        value,
        label: value
          .split('_')
          .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
          .join(' '),
      }));

    return {
      topics: toOptions(TemplateLibraryTopic),
      useCases: toOptions(TemplateLibraryUseCase),
      industries: toOptions(TemplateLibraryIndustry),
      paramTypes: toOptions(TemplateLibraryParamType),
    };
  }
}
