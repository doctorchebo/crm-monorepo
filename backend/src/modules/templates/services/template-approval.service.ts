import { db } from '@database/db.connection';
import { templateLocales, templates } from '@database/schema';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
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
    const category = (localeData.category || 'utility') as TemplateCategory;

    this.logger.log(
      `Submitting template '${template.name}' (locale: ${locale}) to ${providerName}`,
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
      })
      .where(eq(templateLocales.id, localeData.id));

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

      // Update local status
      await db
        .update(templateLocales)
        .set({
          approvalStatus: statusResult.status,
          qualityRating: statusResult.qualityRating,
          rejectionReason: statusResult.rejectionReason,
          metaResponse: statusResult.providerResponse,
          reviewedAt:
            statusResult.status !== TemplateApprovalStatus.PENDING
              ? new Date()
              : localeData.reviewedAt,
          updatedAt: new Date(),
        })
        .where(eq(templateLocales.id, localeData.id));

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

    // Update local status
    await db
      .update(templateLocales)
      .set(updateData)
      .where(eq(templateLocales.id, localeData.id));

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
}
