import { db } from '@database/db.connection';
import { templateLocales, templates, templateVersions } from '@database/schema';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { TemplateComponentsDto } from '../dto';
import {
  MessagingProviderFactory,
  TemplateApprovalStatus,
  TemplateCategory,
  TemplateQualityRating,
} from '../providers';
import {
  TemplateStatusUpdateEvent,
  templateWebhookGatewayInstance,
} from '../template.webhook.gateway';
import { ComponentsValidatorService } from '../validators';
import {
  TemplateValidatorService,
  ValidationError,
} from './template-validator.service';

/**
 * Result of requesting template approval
 */
export interface ApprovalRequestResult {
  success: boolean;
  status: TemplateApprovalStatus;
  metaTemplateId?: string;
  message: string;
  validationErrors?: ValidationError[];
  providerResponse?: Record<string, any>;
}

/**
 * Result of checking template approval status
 */
export interface ApprovalStatusResult {
  templateId: string;
  localeId: string;
  locale: string;
  status: TemplateApprovalStatus;
  qualityRating: TemplateQualityRating;
  metaTemplateId?: string | null;
  rejectionReason?: string | null;
  submittedAt?: Date | null;
  reviewedAt?: Date | null;
  canSubmit: boolean;
  canResubmit: boolean;
}

/**
 * Result of syncing a single template status
 */
export interface TemplateSyncResult {
  localeId: string;
  templateId: string;
  templateName: string;
  locale: string;
  previousStatus: string;
  newStatus: string;
  statusChanged: boolean;
  qualityRating?: string;
  error?: string;
}

/**
 * Result of bulk sync operation
 */
export interface BulkSyncResult {
  totalProcessed: number;
  successCount: number;
  errorCount: number;
  statusChangedCount: number;
  results: TemplateSyncResult[];
}

/**
 * Maps Meta/internal approval status to the template_versions table status.
 * This ensures consistent status mapping across all sync operations.
 *
 * @param approvalStatus - The approval status from template_locales
 * @returns The corresponding version status string for template_versions
 */
export function mapApprovalStatusToVersionStatus(
  approvalStatus: TemplateApprovalStatus,
): string {
  switch (approvalStatus) {
    case TemplateApprovalStatus.APPROVED:
      return 'approved';
    case TemplateApprovalStatus.REJECTED:
      return 'rejected';
    case TemplateApprovalStatus.PENDING:
      return 'pending_approval';
    case TemplateApprovalStatus.PAUSED:
    case TemplateApprovalStatus.DISABLED:
      return 'disabled';
    case TemplateApprovalStatus.APPEAL_REQUESTED:
      return 'appeal_requested';
    case TemplateApprovalStatus.DRAFT:
    default:
      return 'draft';
  }
}

/**
 * Template Approval Service
 * Handles the lifecycle of template approval:
 * - Pre-submission validation
 * - Submission to provider (Meta Cloud API)
 * - Status tracking and updates
 * - Webhook handling for status changes
 */
@Injectable()
export class TemplateApprovalService {
  private readonly logger = new Logger(TemplateApprovalService.name);

  constructor(
    private validatorService: TemplateValidatorService,
    private componentsValidator: ComponentsValidatorService,
    private providerFactory: MessagingProviderFactory,
  ) {}

  // ===========================================================================
  // CORE SYNC UTILITIES
  // ===========================================================================

  /**
   * Core method for fetching template status from Meta and updating the database.
   * This is the single source of truth for all status sync operations.
   *
   * IMPORTANT: All sync operations (single, bulk, webhook) should use this method
   * to ensure consistent behavior across the codebase.
   *
   * @param localeId - The locale's database ID
   * @param metaTemplateId - The Meta template ID to query
   * @param templateName - For logging purposes
   * @param localeName - For logging purposes
   * @param previousStatus - Current status before sync (for change detection)
   * @returns TemplateSyncResult with sync details
   */
  private async syncLocaleStatusFromMeta(
    localeId: string,
    metaTemplateId: string,
    templateName: string,
    localeName: string,
    previousStatus: string,
  ): Promise<TemplateSyncResult> {
    const result: TemplateSyncResult = {
      localeId,
      templateId: '', // Will be filled by caller if needed
      templateName,
      locale: localeName,
      previousStatus,
      newStatus: previousStatus,
      statusChanged: false,
    };

    this.logger.log(
      `[SYNC] Fetching status from Meta for "${templateName}" (${localeName})`,
    );
    this.logger.log(`[SYNC]   Meta Template ID: ${metaTemplateId}`);
    this.logger.log(`[SYNC]   Current DB status: ${previousStatus}`);

    try {
      const provider = this.providerFactory.getDefaultProvider();
      const statusResult = await provider.getTemplateStatus(metaTemplateId);

      this.logger.log(
        `[SYNC]   Meta returned status: "${statusResult.status}"`,
      );
      this.logger.log(
        `[SYNC]   Full response: ${JSON.stringify(statusResult.providerResponse)}`,
      );
      if (statusResult.headerFormat) {
        this.logger.log(
          `[SYNC]   Header format detected: "${statusResult.headerFormat}"`,
        );
      }

      result.newStatus = statusResult.status;
      result.qualityRating = statusResult.qualityRating;
      result.statusChanged = previousStatus !== statusResult.status;

      // ALWAYS update the database with the latest status from Meta
      // This ensures we never miss an update, even if status hasn't changed
      // (category, quality rating, components, header format, etc. might have changed)
      const updatePayload: Record<string, any> = {
        approvalStatus: statusResult.status,
        qualityRating: statusResult.qualityRating,
        rejectionReason: statusResult.rejectionReason,
        ...(statusResult.category && { category: statusResult.category }),
        metaResponse: statusResult.providerResponse,
        reviewedAt:
          statusResult.status !== TemplateApprovalStatus.PENDING
            ? new Date()
            : undefined,
        updatedAt: new Date(),
      };

      // Sync components and header format from Meta
      // This ensures templates created before enhanced component support get updated
      if (statusResult.components) {
        // Fetch existing components so we can preserve locally-stored media fields
        const existingLocale = await db.query.templateLocales.findFirst({
          where: eq(templateLocales.id, localeId),
          columns: { components: true },
        });
        updatePayload.components = this.buildComponentsObject(
          statusResult.components,
          existingLocale?.components as Record<string, any> | undefined,
        );
      }
      if (statusResult.headerFormat) {
        updatePayload.headerFormat = statusResult.headerFormat;
      }

      this.logger.log(
        `[SYNC]   Updating template_locales: ${JSON.stringify(updatePayload)}`,
      );

      await db
        .update(templateLocales)
        .set(updatePayload)
        .where(eq(templateLocales.id, localeId));

      // Update template_versions for pending versions
      const versionStatus = mapApprovalStatusToVersionStatus(
        statusResult.status,
      );
      this.logger.log(
        `[SYNC]   Version status mapped: "${statusResult.status}" → "${versionStatus}"`,
      );

      await db
        .update(templateVersions)
        .set({
          status: versionStatus,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(templateVersions.localeId, localeId),
            eq(templateVersions.status, 'pending_approval'),
          ),
        );

      // If approved, ensure activeVersion is set correctly
      if (statusResult.status === TemplateApprovalStatus.APPROVED) {
        await this.updateActiveVersion(localeId);
      }

      if (result.statusChanged) {
        this.logger.log(
          `[SYNC] ✅ Status changed: ${previousStatus} → ${statusResult.status}`,
        );
        // Emit WebSocket event for real-time UI updates
        this.emitStatusUpdate({
          templateId: metaTemplateId,
          templateName,
          language: localeName,
          status: statusResult.status,
          reason: statusResult.rejectionReason,
          timestamp: new Date(),
          localeId,
        });
      } else {
        this.logger.log(`[SYNC] ✅ Status unchanged: ${statusResult.status}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      result.error = errorMessage;
      this.logger.error(
        `[SYNC] ❌ Failed to sync "${templateName}" (${localeName}): ${errorMessage}`,
      );
    }

    return result;
  }

  /**
   * Build a structured components object from Meta API components array
   * Converts Meta's flat array format to our nested object format.
   * Preserves locally-stored media fields (link, thumbnailUrl, filename,
   * assetHandle) that Meta does not return in its response.
   */
  private buildComponentsObject(
    metaComponents: Array<Record<string, any>>,
    existingComponents?: Record<string, any>,
  ): Record<string, any> {
    const components: Record<string, any> = {};

    for (const comp of metaComponents) {
      const type = comp.type?.toUpperCase();

      switch (type) {
        case 'HEADER':
          components.header = {
            format: comp.format?.toUpperCase(),
            text: comp.text,
            // For media headers, the example URL might be in the example array
            example: comp.example,
          };
          // Preserve locally-stored fields that Meta doesn't return:
          // - Media: link, thumbnailUrl, filename, assetHandle
          // - Location: latitude, longitude, name, address
          if (existingComponents?.header) {
            const existing = existingComponents.header;
            const preserveFields = [
              'link',
              'thumbnailUrl',
              'filename',
              'assetHandle',
              'latitude',
              'longitude',
              'name',
              'address',
            ];
            for (const field of preserveFields) {
              if (existing[field] != null && components.header[field] == null) {
                components.header[field] = existing[field];
              }
            }
          }
          break;

        case 'BODY':
          components.body = {
            text: comp.text,
            example: comp.example,
          };
          break;

        case 'FOOTER':
          components.footer = {
            text: comp.text,
          };
          break;

        case 'BUTTONS':
          components.buttons = comp.buttons?.map(
            (btn: Record<string, any>) => ({
              type: btn.type,
              text: btn.text,
              url: btn.url,
              phoneNumber: btn.phone_number,
              example: btn.example,
            }),
          );
          break;
      }
    }

    return components;
  }

  /**
   * Validate template for Meta approval without submitting
   * Use this to show validation errors/warnings before the confirmation modal
   *
   * IMPORTANT: This reads from the latest draft version's content, not the
   * locale's body field, since the locale is only updated when a version is approved.
   */
  async validateForApproval(
    templateId: string,
    locale: string,
  ): Promise<{
    isValid: boolean;
    canSubmit: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
    summary: {
      errorCount: number;
      warningCount: number;
    };
  }> {
    const template = await this.getTemplateWithLocale(templateId, locale);
    const localeData = template.locales?.find((l) => l.locale === locale);

    if (!localeData) {
      throw new NotFoundException(`Locale ${locale} not found for template`);
    }

    // Get the latest draft version for this locale to validate current content
    // The locale's body/header/footer fields are only updated when a version is approved,
    // so we need to read from the version's content for accurate validation
    const draftVersion = await db.query.templateVersions.findFirst({
      where: and(
        eq(templateVersions.templateId, templateId),
        eq(templateVersions.localeId, localeData.id),
        eq(templateVersions.status, 'draft'),
      ),
      orderBy: [desc(templateVersions.versionNumber)],
    });

    // Use version content if available, otherwise fall back to locale data
    const versionContent = draftVersion?.content as {
      header?: string | null;
      body: string;
      footer?: string | null;
      exampleVars?: Record<string, string>;
      category?: string;
      components?: TemplateComponentsDto;
    } | null;

    // Determine what content to validate
    const bodyText =
      versionContent?.components?.body?.text ||
      versionContent?.body ||
      localeData.body;
    const headerText =
      versionContent?.components?.header?.text ||
      versionContent?.header ||
      localeData.header;
    const footerText =
      versionContent?.components?.footer?.text ||
      versionContent?.footer ||
      localeData.footer;
    const category =
      versionContent?.category || localeData.category || 'utility';
    const exampleVars =
      versionContent?.exampleVars ||
      (localeData.exampleVars as Record<string, string>);
    const components = versionContent?.components;

    let validationErrors: ValidationError[];

    // Use components validator for enhanced templates, legacy validator for others
    if (components) {
      // Enhanced template: use ComponentsValidatorService
      const componentsResult = this.componentsValidator.validate(
        components,
        category as TemplateCategory,
      );

      // Convert to ValidationError format and add template name validation
      validationErrors = [
        ...this.validatorService.validateTemplateName(template.name),
        ...componentsResult.errors.map((e) => ({
          field: e.field,
          message: e.message,
          severity: e.severity,
          code: e.code,
        })),
        ...componentsResult.warnings.map((e) => ({
          field: e.field,
          message: e.message,
          severity: e.severity,
          code: e.code,
        })),
      ];
    } else {
      // Legacy template: use TemplateValidatorService
      validationErrors = this.validatorService.validateForMetaApproval(
        template.name,
        bodyText,
        category,
        exampleVars,
        headerText || undefined,
        footerText || undefined,
      );
    }

    const summary =
      this.validatorService.getValidationSummary(validationErrors);

    return {
      isValid: summary.isValid,
      canSubmit: summary.canSubmit,
      errors: summary.errors,
      warnings: summary.warnings,
      summary: {
        errorCount: summary.errorCount,
        warningCount: summary.warningCount,
      },
    };
  }

  /**
   * Request template approval from Meta
   * Validates template and submits to provider
   */
  async requestApproval(
    templateId: string,
    locale: string,
    providerName: string = 'meta',
  ): Promise<ApprovalRequestResult> {
    const template = await this.getTemplateWithLocale(templateId, locale);
    const localeData = template.locales?.find((l) => l.locale === locale);

    if (!localeData) {
      throw new NotFoundException(`Locale ${locale} not found for template`);
    }

    // Check if already submitted or approved
    const currentStatus = localeData.approvalStatus as TemplateApprovalStatus;
    if (currentStatus === TemplateApprovalStatus.PENDING) {
      throw new BadRequestException(
        'Template is already pending approval. Please wait for the current review to complete.',
      );
    }

    if (currentStatus === TemplateApprovalStatus.APPROVED) {
      throw new BadRequestException(
        'Template is already approved. Create a new version if you need to make changes.',
      );
    }

    // Validate for Meta approval
    const validation = await this.validateForApproval(templateId, locale);

    if (!validation.canSubmit) {
      return {
        success: false,
        status: TemplateApprovalStatus.DRAFT,
        message:
          'Template validation failed. Please fix errors before submitting.',
        validationErrors: validation.errors,
      };
    }

    // Get provider and submit
    const provider = this.providerFactory.getProvider(providerName);

    // Determine the category to use:
    // 1. Check if another locale of this template is already approved (use that category)
    // 2. Otherwise, use the locale's own category
    let category = (localeData.category || 'utility') as TemplateCategory;

    // Check for approved locales with potentially different category from Meta
    const approvedLocale = template.locales?.find(
      (l) =>
        l.locale !== locale &&
        l.approvalStatus === TemplateApprovalStatus.APPROVED &&
        l.metaTemplateId,
    );

    if (approvedLocale) {
      // Another locale is approved - fetch its current category from Meta
      // to ensure we use the category that Meta has on record
      try {
        const statusResult = await provider.getTemplateStatus(
          approvedLocale.metaTemplateId!,
        );
        if (statusResult.category) {
          category = statusResult.category;
          this.logger.log(
            `📝 Using category from approved locale ${approvedLocale.locale}: ${category}`,
          );

          // Also update our locale's category to match
          if (localeData.category !== category) {
            await db
              .update(templateLocales)
              .set({ category, updatedAt: new Date() })
              .where(eq(templateLocales.id, localeData.id));
            this.logger.log(
              `📝 Updated locale ${locale} category from ${localeData.category} to ${category}`,
            );
          }
        }
      } catch (error) {
        this.logger.warn(
          `Failed to fetch category from approved locale: ${error.message}. Using current category: ${category}`,
        );
      }
    }

    this.logger.log(
      `Submitting template '${template.name}' (locale: ${locale}) to ${providerName} with category: ${category}`,
    );

    // Determine if this is an enhanced template (has components) or legacy
    const components = localeData.components as TemplateComponentsDto | null;
    const isEnhancedTemplate = !!components;

    let result;

    if (isEnhancedTemplate) {
      // Enhanced template submission with full components support
      this.logger.log(
        `Using enhanced template submission for '${template.name}'`,
      );

      // Validate components before submission
      const componentValidation = this.componentsValidator.validate(components);
      if (!componentValidation.isValid) {
        return {
          success: false,
          status: TemplateApprovalStatus.DRAFT,
          message: 'Component validation failed',
          validationErrors: componentValidation.errors.map((err) => ({
            field: err.field,
            message: err.message,
            code: err.code,
            severity: err.severity,
          })),
        };
      }

      result = await provider.submitEnhancedTemplate({
        templateName: template.name,
        locale: localeData.locale,
        category,
        components,
      });
    } else {
      // Legacy template submission (backward compatible)
      this.logger.log(
        `Using legacy template submission for '${template.name}'`,
      );
      result = await provider.submitTemplate(
        template.name,
        localeData,
        category,
      );
    }

    // Update template locale with submission result
    await db
      .update(templateLocales)
      .set({
        approvalStatus: result.status,
        metaTemplateId: result.providerId,
        metaResponse: result.providerResponse,
        submittedAt: new Date(),
        updatedAt: new Date(),
        // Update category in case it was changed
        category,
      })
      .where(eq(templateLocales.id, localeData.id));

    // Also update the draft version status (the latest draft for this locale)
    // This ensures the version history shows the correct status
    const draftVersion = await db.query.templateVersions.findFirst({
      where: and(
        eq(templateVersions.templateId, templateId),
        eq(templateVersions.localeId, localeData.id),
        eq(templateVersions.status, 'draft'),
      ),
      orderBy: [desc(templateVersions.versionNumber)],
    });

    if (draftVersion) {
      const versionStatus =
        result.status === TemplateApprovalStatus.PENDING
          ? 'pending_approval'
          : result.status === TemplateApprovalStatus.APPROVED
            ? 'approved'
            : result.status === TemplateApprovalStatus.REJECTED
              ? 'rejected'
              : 'draft';

      await db
        .update(templateVersions)
        .set({
          status: versionStatus,
          providerId: result.providerId,
          providerName: providerName,
          providerResponse: result.providerResponse,
          updatedAt: new Date(),
        })
        .where(eq(templateVersions.id, draftVersion.id));

      this.logger.log(
        `Updated version ${draftVersion.id} status to ${versionStatus}`,
      );
    }

    if (result.success) {
      this.logger.log(
        `Template submitted successfully. Provider ID: ${result.providerId}`,
      );

      return {
        success: true,
        status: result.status,
        metaTemplateId: result.providerId,
        message:
          'Template submitted for approval. Review typically takes up to 24 hours.',
        providerResponse: result.providerResponse,
      };
    } else {
      this.logger.error(`Template submission failed: ${result.error}`);

      return {
        success: false,
        status: TemplateApprovalStatus.DRAFT,
        message: result.error || 'Failed to submit template for approval',
        providerResponse: result.providerResponse,
      };
    }
  }

  /**
   * Get the current approval status of a template locale
   */
  async getApprovalStatus(
    templateId: string,
    locale: string,
  ): Promise<ApprovalStatusResult> {
    const template = await this.getTemplateWithLocale(templateId, locale);
    const localeData = template.locales?.find((l) => l.locale === locale);

    if (!localeData) {
      throw new NotFoundException(`Locale ${locale} not found for template`);
    }

    const status = (localeData.approvalStatus ||
      'draft') as TemplateApprovalStatus;
    const qualityRating = (localeData.qualityRating ||
      'pending') as TemplateQualityRating;

    // Determine if template can be submitted or resubmitted
    const canSubmit =
      status === TemplateApprovalStatus.DRAFT ||
      status === TemplateApprovalStatus.REJECTED;
    const canResubmit =
      status === TemplateApprovalStatus.REJECTED ||
      status === TemplateApprovalStatus.DISABLED;

    return {
      templateId,
      localeId: localeData.id,
      locale: localeData.locale,
      status,
      qualityRating,
      metaTemplateId: localeData.metaTemplateId,
      rejectionReason: localeData.rejectionReason,
      submittedAt: localeData.submittedAt,
      reviewedAt: localeData.reviewedAt,
      canSubmit,
      canResubmit,
    };
  }

  /**
   * Sync template status with provider
   * Useful for manually refreshing status
   *
   * Fetches the current status from Meta's API and updates the local database.
   * This is useful when webhooks miss updates or for manual verification.
   *
   * Uses the core syncLocaleStatusFromMeta method for consistent behavior.
   *
   * @returns ApprovalStatusResult with the updated status
   */
  async syncStatus(
    templateId: string,
    locale: string,
  ): Promise<ApprovalStatusResult> {
    const template = await this.getTemplateWithLocale(templateId, locale);
    const localeData = template.locales?.find((l) => l.locale === locale);

    if (!localeData) {
      throw new NotFoundException(`Locale ${locale} not found for template`);
    }

    if (!localeData.metaTemplateId) {
      this.logger.warn(
        `Template "${template.name}" has no Meta template ID - cannot sync status. ` +
          `Template may not have been submitted yet.`,
      );
      // Not submitted yet, nothing to sync
      return this.getApprovalStatus(templateId, locale);
    }

    // Use the core sync method
    await this.syncLocaleStatusFromMeta(
      localeData.id,
      localeData.metaTemplateId,
      template.name,
      locale,
      localeData.approvalStatus || 'draft',
    );

    return this.getApprovalStatus(templateId, locale);
  }

  /**
   * Handle webhook callback from Meta for template status updates
   * This is called by the webhook controller when Meta sends a status update
   */
  async handleStatusWebhook(payload: {
    event: string;
    messageTemplateId: string;
    messageTemplateName: string;
    messageTemplateLanguage: string;
    reason?: string;
    disableInfo?: {
      disableDate: string;
    };
  }): Promise<{ updated: boolean; localeId?: string; status?: string }> {
    this.logger.log(
      `Received template status webhook: ${payload.event} for ${payload.messageTemplateId}`,
    );

    // Find template locale by Meta template ID
    const localeData = await db.query.templateLocales.findFirst({
      where: eq(templateLocales.metaTemplateId, payload.messageTemplateId),
      with: {
        template: true,
      },
    });

    if (!localeData) {
      this.logger.warn(
        `Received webhook for unknown template: ${payload.messageTemplateId}`,
      );
      return { updated: false };
    }

    // Map Meta event to our status
    let newStatus: TemplateApprovalStatus;
    let qualityRating: TemplateQualityRating | undefined;

    switch (payload.event) {
      case 'APPROVED':
        newStatus = TemplateApprovalStatus.APPROVED;
        // Default to high quality for newly approved templates
        qualityRating = TemplateQualityRating.HIGH;
        break;
      case 'REJECTED':
        newStatus = TemplateApprovalStatus.REJECTED;
        break;
      case 'PENDING':
        newStatus = TemplateApprovalStatus.PENDING;
        break;
      case 'PAUSED':
      case 'FLAGGED':
        newStatus = TemplateApprovalStatus.PAUSED;
        // Paused usually means quality dropped
        qualityRating = TemplateQualityRating.LOW;
        break;
      case 'DISABLED':
        newStatus = TemplateApprovalStatus.DISABLED;
        break;
      case 'IN_APPEAL':
        newStatus = TemplateApprovalStatus.APPEAL_REQUESTED;
        break;
      case 'REINSTATED':
        newStatus = TemplateApprovalStatus.APPROVED;
        qualityRating = TemplateQualityRating.MEDIUM;
        break;
      case 'PENDING_DELETION':
        newStatus = TemplateApprovalStatus.DISABLED;
        break;
      default:
        this.logger.warn(`Unknown webhook event: ${payload.event}`);
        return { updated: false };
    }

    // Build update object
    const updateData: Record<string, any> = {
      approvalStatus: newStatus,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    };

    if (payload.reason) {
      updateData.rejectionReason = payload.reason;
    }

    if (qualityRating) {
      updateData.qualityRating = qualityRating;
    }

    // If template was APPROVED, fetch full status from Meta to get the category
    // Meta may have changed the category during approval
    if (newStatus === TemplateApprovalStatus.APPROVED) {
      try {
        const provider = this.providerFactory.getDefaultProvider();
        const statusResult = await provider.getTemplateStatus(
          payload.messageTemplateId,
        );

        if (statusResult.category) {
          updateData.category = statusResult.category;
          this.logger.log(
            `📝 Category from Meta: ${statusResult.category} for template ${payload.messageTemplateName}`,
          );

          // Update ALL locales of this template to have the same category
          // This ensures consistency when submitting new locales
          const allLocales = await db.query.templateLocales.findMany({
            where: eq(templateLocales.templateId, localeData.templateId),
          });

          for (const loc of allLocales) {
            if (
              loc.id !== localeData.id &&
              loc.category !== statusResult.category
            ) {
              await db
                .update(templateLocales)
                .set({
                  category: statusResult.category,
                  updatedAt: new Date(),
                })
                .where(eq(templateLocales.id, loc.id));
              this.logger.log(
                `📝 Updated category for locale ${loc.locale} to ${statusResult.category}`,
              );
            }
          }
        }

        if (statusResult.qualityRating) {
          updateData.qualityRating = statusResult.qualityRating;
        }
      } catch (error) {
        this.logger.warn(
          `Failed to fetch full status for approved template: ${error.message}`,
        );
      }
    }

    // Update local status
    await db
      .update(templateLocales)
      .set(updateData)
      .where(eq(templateLocales.id, localeData.id));

    // Also update templateVersions status for consistency
    // Find the version(s) that are pending approval for this locale
    const versionStatus =
      newStatus === TemplateApprovalStatus.APPROVED
        ? 'approved'
        : newStatus === TemplateApprovalStatus.REJECTED
          ? 'rejected'
          : newStatus === TemplateApprovalStatus.PENDING
            ? 'pending_approval'
            : newStatus === TemplateApprovalStatus.PAUSED ||
                newStatus === TemplateApprovalStatus.DISABLED
              ? 'disabled'
              : 'draft';

    // Update all pending_approval versions for this locale
    const updatedVersions = await db
      .update(templateVersions)
      .set({
        status: versionStatus,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(templateVersions.localeId, localeData.id),
          eq(templateVersions.status, 'pending_approval'),
        ),
      )
      .returning({ id: templateVersions.id });

    if (updatedVersions.length > 0) {
      this.logger.log(
        `📝 Updated ${updatedVersions.length} version(s) status to ${versionStatus}`,
      );
    }

    // Update activeVersion if the template was approved
    await this.updateActiveVersion(localeData.id);

    // The final status is what Meta told us via the webhook - this is the source of truth
    const finalStatus = newStatus;

    this.logger.log(
      `✅ Updated template ${localeData.id} (${payload.messageTemplateName}) status to ${finalStatus}`,
    );

    // Emit WebSocket event for real-time UI updates
    this.emitStatusUpdate({
      templateId: payload.messageTemplateId,
      templateName: payload.messageTemplateName,
      language: payload.messageTemplateLanguage,
      status: finalStatus,
      reason: payload.reason,
      timestamp: new Date(),
      localeId: localeData.id,
    });

    return {
      updated: true,
      localeId: localeData.id,
      status: finalStatus,
    };
  }

  /**
   * Emit status update via WebSocket gateway
   */
  private emitStatusUpdate(update: TemplateStatusUpdateEvent): void {
    if (templateWebhookGatewayInstance) {
      templateWebhookGatewayInstance.emitTemplateStatusUpdate(update);
    } else {
      this.logger.warn('WebSocket gateway not initialized - skipping emit');
    }
  }

  /**
   * Get template with locales
   */
  private async getTemplateWithLocale(templateId: string, locale: string) {
    const template = await db.query.templates.findFirst({
      where: eq(templates.id, templateId),
      with: {
        locales: true,
      },
    });

    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    return template;
  }

  /**
   * Sync status for all templates that have been submitted to Meta but are still pending.
   * This is useful for catching up on status changes when webhooks may have been missed.
   *
   * Uses the core syncLocaleStatusFromMeta method for consistent behavior.
   *
   * @param statuses - Optional array of statuses to sync. Defaults to ['pending'].
   * @returns BulkSyncResult with details of each template's sync operation
   */
  async syncAllPendingTemplates(
    statuses: TemplateApprovalStatus[] = [TemplateApprovalStatus.PENDING],
  ): Promise<BulkSyncResult> {
    this.logger.log(
      `[BULK SYNC] Starting for templates with statuses: ${statuses.join(', ')}`,
    );

    // Find all template locales that:
    // 1. Have a metaTemplateId (were submitted to Meta)
    // 2. Have one of the specified statuses
    const pendingLocales = await db.query.templateLocales.findMany({
      where: and(
        isNotNull(templateLocales.metaTemplateId),
        inArray(templateLocales.approvalStatus, statuses),
      ),
      with: {
        template: true,
      },
    });

    this.logger.log(
      `[BULK SYNC] Found ${pendingLocales.length} templates to sync`,
    );

    if (pendingLocales.length === 0) {
      return {
        totalProcessed: 0,
        successCount: 0,
        errorCount: 0,
        statusChangedCount: 0,
        results: [],
      };
    }

    const results: TemplateSyncResult[] = [];
    let successCount = 0;
    let errorCount = 0;
    let statusChangedCount = 0;

    // Process each template sequentially to avoid rate limiting
    for (const localeData of pendingLocales) {
      if (!localeData.metaTemplateId) {
        const result: TemplateSyncResult = {
          localeId: localeData.id,
          templateId: localeData.templateId,
          templateName: localeData.template?.name || 'Unknown',
          locale: localeData.locale,
          previousStatus: localeData.approvalStatus || 'draft',
          newStatus: localeData.approvalStatus || 'draft',
          statusChanged: false,
          error: 'No Meta template ID found',
        };
        errorCount++;
        results.push(result);
        continue;
      }

      // Use the core sync method for consistent behavior
      const result = await this.syncLocaleStatusFromMeta(
        localeData.id,
        localeData.metaTemplateId,
        localeData.template?.name || 'Unknown',
        localeData.locale,
        localeData.approvalStatus || 'draft',
      );

      // Set the templateId (core method leaves it empty)
      result.templateId = localeData.templateId;

      if (result.error) {
        errorCount++;
      } else {
        successCount++;
        if (result.statusChanged) {
          statusChangedCount++;
        }
      }

      results.push(result);

      // Small delay to avoid rate limiting (Meta API has rate limits)
      await this.delay(100);
    }

    this.logger.log(
      `[BULK SYNC] Completed: ${successCount} success, ${errorCount} errors, ${statusChangedCount} status changes`,
    );

    return {
      totalProcessed: pendingLocales.length,
      successCount,
      errorCount,
      statusChangedCount,
      results,
    };
  }

  /**
   * Sync status for a single template by template ID and locale.
   * Returns detailed information about the sync operation.
   *
   * Uses the core syncLocaleStatusFromMeta method for consistent behavior.
   *
   * @param templateId - The internal template ID
   * @param locale - The locale code (e.g., 'en', 'es')
   * @returns TemplateSyncResult with sync details
   */
  async syncSingleTemplateStatus(
    templateId: string,
    locale: string,
  ): Promise<TemplateSyncResult> {
    const template = await this.getTemplateWithLocale(templateId, locale);
    const localeData = template.locales?.find((l) => l.locale === locale);

    if (!localeData) {
      throw new NotFoundException(`Locale ${locale} not found for template`);
    }

    if (!localeData.metaTemplateId) {
      return {
        localeId: localeData.id,
        templateId: templateId,
        templateName: template.name,
        locale: locale,
        previousStatus: localeData.approvalStatus || 'draft',
        newStatus: localeData.approvalStatus || 'draft',
        statusChanged: false,
        error: 'Template has not been submitted to Meta yet',
      };
    }

    // Use the core sync method for consistent behavior
    const result = await this.syncLocaleStatusFromMeta(
      localeData.id,
      localeData.metaTemplateId,
      template.name,
      locale,
      localeData.approvalStatus || 'draft',
    );

    // Add the templateId to the result (the core method sets it to empty)
    result.templateId = templateId;

    return result;
  }

  /**
   * Get all templates with their current approval status.
   * Useful for displaying a list of pending templates.
   */
  async getTemplatesWithPendingStatus(): Promise<
    Array<{
      templateId: string;
      templateName: string;
      localeId: string;
      locale: string;
      approvalStatus: string;
      metaTemplateId: string | null;
      submittedAt: Date | null;
    }>
  > {
    const pendingLocales = await db.query.templateLocales.findMany({
      where: and(
        isNotNull(templateLocales.metaTemplateId),
        eq(templateLocales.approvalStatus, TemplateApprovalStatus.PENDING),
      ),
      with: {
        template: true,
      },
    });

    return pendingLocales.map((locale) => ({
      templateId: locale.templateId,
      templateName: locale.template?.name || 'Unknown',
      localeId: locale.id,
      locale: locale.locale,
      approvalStatus: locale.approvalStatus || 'draft',
      metaTemplateId: locale.metaTemplateId,
      submittedAt: locale.submittedAt,
    }));
  }

  /**
   * Helper method to add a delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Update the active version for a locale based on its approved versions.
   *
   * IMPORTANT: This method only updates `activeVersion`, NOT `approvalStatus`.
   * The `approvalStatus` should ONLY be set from Meta's API response to maintain
   * Meta as the single source of truth for approval status.
   *
   * When to call this:
   * - After a version status changes to 'approved'
   * - During sync when Meta confirms approval
   */
  async updateActiveVersion(localeId: string): Promise<void> {
    // Fetch all versions for this locale to find the latest approved one
    const versions = await db.query.templateVersions.findMany({
      where: eq(templateVersions.localeId, localeId),
      orderBy: [desc(templateVersions.versionNumber)],
    });

    // Find the latest approved version
    const approvedVersion = versions.find((v) => v.status === 'approved');

    // Only update activeVersion, never approvalStatus
    // approvalStatus is managed by Meta API sync only
    const newActiveVersion = approvedVersion?.versionNumber ?? null;

    await db
      .update(templateLocales)
      .set({
        activeVersion: newActiveVersion,
        updatedAt: new Date(),
      })
      .where(eq(templateLocales.id, localeId));

    this.logger.log(
      `Updated locale ${localeId} activeVersion to ${newActiveVersion}`,
    );
  }

  /**
   * @deprecated Use updateActiveVersion instead.
   * This method incorrectly overwrote approvalStatus from version-derived state,
   * conflicting with Meta API as the source of truth.
   *
   * Kept for backward compatibility but should be removed in future versions.
   */
  async reconcileLocaleStatus(localeId: string): Promise<void> {
    // Now just delegates to updateActiveVersion
    await this.updateActiveVersion(localeId);
  }
}
