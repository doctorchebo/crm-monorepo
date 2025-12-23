import { db } from '@database/db.connection';
import { templateLocales, templates, templateVersions } from '@database/schema';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
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
    private providerFactory: MessagingProviderFactory,
  ) {}

  /**
   * Validate template for Meta approval without submitting
   * Use this to show validation errors/warnings before the confirmation modal
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

    // Run full Meta validation
    const validationErrors = this.validatorService.validateForMetaApproval(
      template.name,
      localeData.body,
      localeData.category || 'utility',
      localeData.exampleVars as Record<string, string>,
      localeData.header || undefined,
      localeData.footer || undefined,
    );

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

    const result = await provider.submitTemplate(
      template.name,
      localeData,
      category,
    );

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
      // Not submitted yet, nothing to sync
      return this.getApprovalStatus(templateId, locale);
    }

    try {
      const provider = this.providerFactory.getDefaultProvider();
      const statusResult = await provider.getTemplateStatus(
        localeData.metaTemplateId,
      );

      // Map Meta status to version status
      const versionStatus =
        statusResult.status === TemplateApprovalStatus.APPROVED
          ? 'approved'
          : statusResult.status === TemplateApprovalStatus.REJECTED
            ? 'rejected'
            : statusResult.status === TemplateApprovalStatus.PENDING
              ? 'pending_approval'
              : statusResult.status === TemplateApprovalStatus.PAUSED ||
                  statusResult.status === TemplateApprovalStatus.DISABLED
                ? 'disabled'
                : 'draft';

      // Update local status (including category if Meta changed it)
      await db
        .update(templateLocales)
        .set({
          approvalStatus: statusResult.status,
          qualityRating: statusResult.qualityRating,
          rejectionReason: statusResult.rejectionReason,
          // Update category if Meta returned a different one
          ...(statusResult.category && { category: statusResult.category }),
          metaResponse: statusResult.providerResponse,
          reviewedAt:
            statusResult.status !== TemplateApprovalStatus.PENDING
              ? new Date()
              : localeData.reviewedAt,
          updatedAt: new Date(),
        })
        .where(eq(templateLocales.id, localeData.id));

      // Also update templateVersions for pending versions
      await db
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
        );

      // If approved, set the version as active
      if (statusResult.status === TemplateApprovalStatus.APPROVED) {
        const approvedVersion = await db.query.templateVersions.findFirst({
          where: and(
            eq(templateVersions.localeId, localeData.id),
            eq(templateVersions.status, 'approved'),
          ),
          orderBy: [desc(templateVersions.versionNumber)],
        });

        if (approvedVersion) {
          await db
            .update(templateLocales)
            .set({
              activeVersion: approvedVersion.versionNumber,
              updatedAt: new Date(),
            })
            .where(eq(templateLocales.id, localeData.id));
        }
      }

      this.logger.log(
        `Synced template status: ${statusResult.status} (quality: ${statusResult.qualityRating})`,
      );
    } catch (error) {
      this.logger.error(`Failed to sync template status: ${error.message}`);
    }

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

      // If approved, set the version as active
      if (newStatus === TemplateApprovalStatus.APPROVED) {
        const approvedVersion = await db.query.templateVersions.findFirst({
          where: and(
            eq(templateVersions.localeId, localeData.id),
            eq(templateVersions.status, 'approved'),
          ),
          orderBy: [desc(templateVersions.versionNumber)],
        });

        if (approvedVersion) {
          await db
            .update(templateLocales)
            .set({
              activeVersion: approvedVersion.versionNumber,
              updatedAt: new Date(),
            })
            .where(eq(templateLocales.id, localeData.id));
          this.logger.log(
            `📝 Set active version to v${approvedVersion.versionNumber}`,
          );
        }
      }
    }

    this.logger.log(
      `✅ Updated template ${localeData.id} (${payload.messageTemplateName}) status to ${newStatus}`,
    );

    // Emit WebSocket event for real-time UI updates
    this.emitStatusUpdate({
      templateId: payload.messageTemplateId,
      templateName: payload.messageTemplateName,
      language: payload.messageTemplateLanguage,
      status: newStatus,
      reason: payload.reason,
      timestamp: new Date(),
      localeId: localeData.id,
    });

    return {
      updated: true,
      localeId: localeData.id,
      status: newStatus,
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
   * @param statuses - Optional array of statuses to sync. Defaults to ['pending'].
   * @returns BulkSyncResult with details of each template's sync operation
   */
  async syncAllPendingTemplates(
    statuses: TemplateApprovalStatus[] = [TemplateApprovalStatus.PENDING],
  ): Promise<BulkSyncResult> {
    this.logger.log(
      `Starting bulk sync for templates with statuses: ${statuses.join(', ')}`,
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

    this.logger.log(`Found ${pendingLocales.length} templates to sync`);

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

    const provider = this.providerFactory.getDefaultProvider();

    // Process each template sequentially to avoid rate limiting
    for (const localeData of pendingLocales) {
      const result: TemplateSyncResult = {
        localeId: localeData.id,
        templateId: localeData.templateId,
        templateName: localeData.template?.name || 'Unknown',
        locale: localeData.locale,
        previousStatus: localeData.approvalStatus || 'draft',
        newStatus: localeData.approvalStatus || 'draft',
        statusChanged: false,
      };

      try {
        if (!localeData.metaTemplateId) {
          result.error = 'No Meta template ID found';
          errorCount++;
          results.push(result);
          continue;
        }

        // Fetch status from Meta API
        const statusResult = await provider.getTemplateStatus(
          localeData.metaTemplateId,
        );

        result.newStatus = statusResult.status;
        result.qualityRating = statusResult.qualityRating;
        result.statusChanged = result.previousStatus !== statusResult.status;

        // Update local status if changed (including category if Meta changed it)
        if (result.statusChanged || statusResult.qualityRating) {
          await db
            .update(templateLocales)
            .set({
              approvalStatus: statusResult.status,
              qualityRating: statusResult.qualityRating,
              rejectionReason: statusResult.rejectionReason,
              // Update category if Meta returned a different one
              ...(statusResult.category && { category: statusResult.category }),
              metaResponse: statusResult.providerResponse,
              reviewedAt:
                statusResult.status !== TemplateApprovalStatus.PENDING
                  ? new Date()
                  : localeData.reviewedAt,
              updatedAt: new Date(),
            })
            .where(eq(templateLocales.id, localeData.id));

          this.logger.log(
            `✅ Synced ${localeData.template?.name} (${localeData.locale}): ${result.previousStatus} → ${statusResult.status}`,
          );

          // Emit WebSocket event for real-time UI updates if status changed
          if (result.statusChanged) {
            statusChangedCount++;
            this.emitStatusUpdate({
              templateId: localeData.metaTemplateId,
              templateName: localeData.template?.name || 'Unknown',
              language: localeData.locale,
              status: statusResult.status,
              reason: statusResult.rejectionReason,
              timestamp: new Date(),
              localeId: localeData.id,
            });
          }
        }

        successCount++;
      } catch (error) {
        result.error = error.message || 'Unknown error';
        errorCount++;
        this.logger.error(
          `Failed to sync template ${localeData.template?.name} (${localeData.locale}): ${error.message}`,
        );
      }

      results.push(result);

      // Small delay to avoid rate limiting (Meta API has rate limits)
      await this.delay(100);
    }

    this.logger.log(
      `Bulk sync completed: ${successCount} success, ${errorCount} errors, ${statusChangedCount} status changes`,
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

    const result: TemplateSyncResult = {
      localeId: localeData.id,
      templateId: templateId,
      templateName: template.name,
      locale: locale,
      previousStatus: localeData.approvalStatus || 'draft',
      newStatus: localeData.approvalStatus || 'draft',
      statusChanged: false,
    };

    if (!localeData.metaTemplateId) {
      result.error = 'Template has not been submitted to Meta yet';
      return result;
    }

    try {
      const provider = this.providerFactory.getDefaultProvider();
      const statusResult = await provider.getTemplateStatus(
        localeData.metaTemplateId,
      );

      result.newStatus = statusResult.status;
      result.qualityRating = statusResult.qualityRating;
      result.statusChanged = result.previousStatus !== statusResult.status;

      // Update local status (including category if Meta changed it)
      await db
        .update(templateLocales)
        .set({
          approvalStatus: statusResult.status,
          qualityRating: statusResult.qualityRating,
          rejectionReason: statusResult.rejectionReason,
          // Update category if Meta returned a different one
          ...(statusResult.category && { category: statusResult.category }),
          metaResponse: statusResult.providerResponse,
          reviewedAt:
            statusResult.status !== TemplateApprovalStatus.PENDING
              ? new Date()
              : localeData.reviewedAt,
          updatedAt: new Date(),
        })
        .where(eq(templateLocales.id, localeData.id));

      this.logger.log(
        `✅ Synced ${template.name} (${locale}): ${result.previousStatus} → ${statusResult.status}`,
      );

      // Emit WebSocket event for real-time UI updates if status changed
      if (result.statusChanged) {
        this.emitStatusUpdate({
          templateId: localeData.metaTemplateId,
          templateName: template.name,
          language: locale,
          status: statusResult.status,
          reason: statusResult.rejectionReason,
          timestamp: new Date(),
          localeId: localeData.id,
        });
      }
    } catch (error) {
      result.error = error.message || 'Failed to fetch status from Meta';
      this.logger.error(
        `Failed to sync template ${template.name} (${locale}): ${error.message}`,
      );
    }

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
}
