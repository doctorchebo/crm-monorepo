import { db } from '@database/db.connection';
import {
  templateLocales,
  templateMedia,
  templates,
  TemplateVersion,
  templateVersions,
} from '@database/schema';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { S3Service } from '@shared/services/s3.service';
import { and, desc, eq } from 'drizzle-orm';

/**
 * Version status enum - aligned with schema and WhatsApp requirements
 */
export enum VersionStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  DISABLED = 'disabled',
}

/**
 * Statuses that make a version immutable (cannot be edited)
 */
export const IMMUTABLE_STATUSES: VersionStatus[] = [
  VersionStatus.PENDING_APPROVAL,
  VersionStatus.APPROVED,
  VersionStatus.DISABLED,
];

/**
 * Statuses that allow editing
 */
export const EDITABLE_STATUSES: VersionStatus[] = [
  VersionStatus.DRAFT,
  VersionStatus.REJECTED,
];

/**
 * Version content structure - stores the template content at a point in time
 *
 * Supports two modes:
 * 1. Legacy mode: Using header/body/footer strings (backward compatible)
 * 2. Enhanced mode: Using components object (new full-featured mode)
 *
 * When components is present, it takes precedence but legacy fields are
 * maintained for backward compatibility and simpler queries.
 */
export interface VersionContent {
  /** Legacy text header (for backward compatibility) */
  header?: string | null;
  /** Body text (required) */
  body: string;
  /** Legacy footer text (for backward compatibility) */
  footer?: string | null;
  /** Example variable values */
  exampleVars?: Record<string, string>;
  /** Template category */
  category?: string;
  /**
   * Enhanced template components (full Meta API support)
   * When present, this is the source of truth for template structure
   */
  components?: Record<string, unknown>;
}

/**
 * Result of getting version info for a template
 */
export interface TemplateVersionInfo {
  templateId: string;
  localeId: string;
  locale: string;
  hasActiveVersion: boolean;
  hasDraftVersion: boolean;
  activeVersion: VersionDetails | null;
  draftVersion: VersionDetails | null;
  versionHistory: VersionDetails[];
  canCreateNewVersion: boolean;
  canEditDraft: boolean;
}

/**
 * Details of a single version
 */
export interface VersionDetails {
  id: string;
  templateId: string;
  localeId: string;
  versionNumber: number;
  status: VersionStatus;
  content: VersionContent;
  providerId?: string | null;
  providerName?: string | null;
  providerResponse?: Record<string, any> | null;
  platforms?: string[] | null;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canSubmit: boolean;
}

/**
 * Result of creating a new version
 */
export interface CreateVersionResult {
  success: boolean;
  version: VersionDetails;
  message: string;
}

/**
 * Template Version Service
 *
 * Handles all version-related operations with strict immutability enforcement:
 * - Creating new versions (copying from approved)
 * - Getting active (latest approved) version
 * - Getting draft version
 * - Listing all versions
 * - Submitting for approval
 * - Enforcing version immutability
 */
@Injectable()
export class TemplateVersionService {
  private readonly logger = new Logger(TemplateVersionService.name);

  constructor(private readonly s3Service: S3Service) {}

  /**
   * Get comprehensive version info for a template locale
   * Also syncs version status with locale approvalStatus if they're out of sync
   */
  async getVersionInfo(
    templateId: string,
    locale: string,
  ): Promise<TemplateVersionInfo> {
    // Get template with locales
    const template = await db.query.templates.findFirst({
      where: eq(templates.id, templateId),
      with: {
        locales: true,
      },
    });

    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    const localeData = template.locales?.find((l) => l.locale === locale);
    if (!localeData) {
      throw new NotFoundException(
        `Locale ${locale} not found for template ${templateId}`,
      );
    }

    // Get all versions for this locale, ordered by version number descending
    let versions = await db.query.templateVersions.findMany({
      where: and(
        eq(templateVersions.templateId, templateId),
        eq(templateVersions.localeId, localeData.id),
      ),
      orderBy: [desc(templateVersions.versionNumber)],
    });

    // Sync version status with locale approvalStatus ONLY for the specific case
    // where a webhook updated the locale but the version wasn't updated.
    // This should ONLY sync versions that are in pending_approval state
    // and the locale status indicates a final resolution (approved/rejected/disabled).
    // We should NEVER sync draft versions to match the locale status.
    const localeApprovalStatus = localeData.approvalStatus as string;

    // Only sync if we have a pending version and locale has moved to a resolved state
    if (
      ['approved', 'rejected', 'disabled', 'paused'].includes(
        localeApprovalStatus,
      )
    ) {
      const pendingVersion = versions.find(
        (v) => v.status === 'pending_approval',
      );

      if (pendingVersion) {
        const expectedVersionStatus =
          this.mapApprovalStatusToVersionStatus(localeApprovalStatus);

        this.logger.log(
          `Syncing pending version ${pendingVersion.id} status from pending_approval to ${expectedVersionStatus}`,
        );

        await db
          .update(templateVersions)
          .set({
            status: expectedVersionStatus,
            updatedAt: new Date(),
          })
          .where(eq(templateVersions.id, pendingVersion.id));

        // Re-fetch versions after sync
        versions = await db.query.templateVersions.findMany({
          where: and(
            eq(templateVersions.templateId, templateId),
            eq(templateVersions.localeId, localeData.id),
          ),
          orderBy: [desc(templateVersions.versionNumber)],
        });
      }
    }

    // Get the active version number from locale data
    const activeVersionNumber = localeData.activeVersion;

    // Map to version details with active version context
    const allVersions: VersionDetails[] = versions.map((v) =>
      this.mapToVersionDetails(v, activeVersionNumber),
    );

    // Find active version - the one marked as active by the locale
    let activeVersion =
      allVersions.find(
        (v) => v.isActive && v.status === VersionStatus.APPROVED,
      ) || null;

    // Find draft version (latest draft or rejected)
    let draftVersion =
      allVersions.find(
        (v) =>
          v.status === VersionStatus.DRAFT ||
          v.status === VersionStatus.REJECTED,
      ) || null;

    // Find pending version
    let pendingVersion =
      allVersions.find((v) => v.status === VersionStatus.PENDING_APPROVAL) ||
      null;

    // Enrich the primary versions with media thumbnail URLs
    // We only enrich the versions that will be displayed (active, draft, pending)
    // to avoid excessive S3 calls for the full version history
    if (activeVersion) {
      activeVersion = await this.enrichVersionWithMediaUrls(activeVersion);
    }
    if (draftVersion) {
      draftVersion = await this.enrichVersionWithMediaUrls(draftVersion);
    }
    if (pendingVersion) {
      pendingVersion = await this.enrichVersionWithMediaUrls(pendingVersion);
    }

    // Determine if can create new version
    // Allow creation if there's no existing draft (pending versions don't block creation)
    const canCreateNewVersion = draftVersion === null;

    // Determine if can edit draft (draft exists and is editable)
    const canEditDraft =
      draftVersion !== null &&
      EDITABLE_STATUSES.includes(draftVersion.status as VersionStatus);

    return {
      templateId,
      localeId: localeData.id,
      locale,
      hasActiveVersion: activeVersion !== null,
      hasDraftVersion: draftVersion !== null || pendingVersion !== null,
      activeVersion,
      draftVersion: draftVersion || pendingVersion, // Return pending as "draft" for UI purposes
      versionHistory: allVersions,
      canCreateNewVersion,
      canEditDraft,
    };
  }

  /**
   * Map locale approval status to version status
   */
  private mapApprovalStatusToVersionStatus(
    approvalStatus: string,
  ): VersionStatus {
    switch (approvalStatus) {
      case 'pending':
        return VersionStatus.PENDING_APPROVAL;
      case 'approved':
        return VersionStatus.APPROVED;
      case 'rejected':
        return VersionStatus.REJECTED;
      case 'disabled':
      case 'paused':
        return VersionStatus.DISABLED;
      default:
        return VersionStatus.DRAFT;
    }
  }

  /**
   * Get the active (latest approved) version for a template locale
   */
  async getActiveVersion(
    templateId: string,
    locale: string,
  ): Promise<VersionDetails | null> {
    const info = await this.getVersionInfo(templateId, locale);
    return info.activeVersion;
  }

  /**
   * Get the draft version for a template locale (if exists)
   */
  async getDraftVersion(
    templateId: string,
    locale: string,
  ): Promise<VersionDetails | null> {
    const info = await this.getVersionInfo(templateId, locale);
    return info.draftVersion;
  }

  /**
   * Get a specific version by ID
   */
  async getVersion(versionId: string): Promise<VersionDetails> {
    const version = await db.query.templateVersions.findFirst({
      where: eq(templateVersions.id, versionId),
    });

    if (!version) {
      throw new NotFoundException(`Version ${versionId} not found`);
    }

    // Get locale data to determine active version
    const localeData = await db.query.templateLocales.findFirst({
      where: eq(templateLocales.id, version.localeId),
    });

    return this.mapToVersionDetails(version, localeData?.activeVersion);
  }

  /**
   * Create a new draft version
   *
   * Rules:
   * - If no versions exist, creates v1 from current locale content
   * - If active version exists, always copies content from it (removes need for separate "duplicate" action)
   * - If draft already exists, throws error (must edit existing draft)
   */
  async createNewVersion(
    templateId: string,
    locale: string,
  ): Promise<CreateVersionResult> {
    const info = await this.getVersionInfo(templateId, locale);

    // Check if draft already exists
    if (info.draftVersion && info.draftVersion.status === VersionStatus.DRAFT) {
      throw new BadRequestException(
        'A draft version already exists. Please edit the existing draft or delete it first.',
      );
    }

    // Note: We allow creating a new draft even if a version is pending approval.
    // This enables users to start working on the next version while waiting for approval.
    // The pending version will continue through the approval process independently.

    // Get locale data
    const localeData = await this.getLocaleData(templateId, locale);

    // Determine new version number
    const latestVersionNumber =
      info.versionHistory.length > 0
        ? Math.max(...info.versionHistory.map((v) => v.versionNumber))
        : 0;
    const newVersionNumber = latestVersionNumber + 1;

    // Determine content source - always copy from active version when available
    let content: VersionContent;
    if (info.activeVersion) {
      // Copy from active version (latest approved version)
      // This ensures new drafts always start with the current published content
      content = { ...info.activeVersion.content };
    } else if (info.versionHistory.length === 0) {
      // First version - use current locale content (for v1 creation)
      content = {
        header: localeData.header,
        body: localeData.body,
        footer: localeData.footer,
        exampleVars: (localeData.exampleVars as Record<string, string>) || {},
        category: localeData.category || 'utility',
        // Include components if present in locale data
        components: localeData.components as
          | Record<string, unknown>
          | undefined,
      };
    } else {
      // Fallback: No active version but has history (e.g., all rejected)
      // Copy from the most recent version to preserve context
      const mostRecent = info.versionHistory[0]; // Already sorted by version number desc
      content = mostRecent?.content
        ? { ...mostRecent.content }
        : {
            header: null,
            body: '',
            footer: null,
            exampleVars: {},
            category: 'utility',
          };
    }

    // Create the new version
    const versionId = crypto.randomUUID();
    await db.insert(templateVersions).values({
      id: versionId,
      templateId,
      localeId: localeData.id,
      versionNumber: newVersionNumber,
      content,
      status: VersionStatus.DRAFT,
      providerName: 'meta',
      platforms: ['whatsapp'],
    });

    this.logger.log(
      `Created new draft version v${newVersionNumber} for template ${templateId}`,
    );

    const newVersion = await this.getVersion(versionId);

    return {
      success: true,
      version: newVersion,
      message: `Created draft version v${newVersionNumber}`,
    };
  }

  /**
   * Update a draft version's content
   *
   * Enforces immutability - only draft or rejected versions can be edited.
   * Also syncs content to templateLocales to keep the locale data in sync
   * with the current working version.
   */
  async updateVersionContent(
    versionId: string,
    content: Partial<VersionContent>,
  ): Promise<VersionDetails> {
    const version = await this.getVersion(versionId);

    // Check if version is editable
    this.enforceEditable(version);

    this.logger.log(
      `Updating version ${versionId} - incoming body: ${(content.body as string)?.substring(0, 50)}...`,
    );
    this.logger.log(
      `Existing body: ${(version.content.body as string)?.substring(0, 50)}...`,
    );

    // Merge with existing content
    const updatedContent: VersionContent = {
      ...version.content,
      ...content,
    };

    this.logger.log(
      `Merged body: ${(updatedContent.body as string)?.substring(0, 50)}...`,
    );

    await db
      .update(templateVersions)
      .set({
        content: updatedContent,
        updatedAt: new Date(),
      })
      .where(eq(templateVersions.id, versionId));

    this.logger.log(`Updated draft version ${versionId}`);

    // Sync content to templateLocales to keep locale data up-to-date
    // This ensures that services reading from templateLocales get the latest content
    await this.syncContentToLocale(version.localeId, updatedContent);

    // Verify the save worked
    const savedVersion = await this.getVersion(versionId);
    this.logger.log(
      `After save - body: ${(savedVersion.content.body as string)?.substring(0, 50)}...`,
    );

    return savedVersion;
  }

  /**
   * Submit a draft version for approval
   *
   * Changes status from draft to pending_approval
   * Also updates the locale's approvalStatus to 'pending'
   */
  async submitForApproval(versionId: string): Promise<VersionDetails> {
    const version = await this.getVersion(versionId);

    if (version.status !== VersionStatus.DRAFT) {
      throw new BadRequestException(
        `Only draft versions can be submitted for approval. Current status: ${version.status}`,
      );
    }

    // Update version status
    await db
      .update(templateVersions)
      .set({
        status: VersionStatus.PENDING_APPROVAL,
        updatedAt: new Date(),
      })
      .where(eq(templateVersions.id, versionId));

    // Update locale's approvalStatus to pending
    const versionData = await db.query.templateVersions.findFirst({
      where: eq(templateVersions.id, versionId),
    });
    if (versionData) {
      await db
        .update(templateLocales)
        .set({
          approvalStatus: 'pending',
          submittedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(templateLocales.id, versionData.localeId));
    }

    this.logger.log(`Submitted version ${versionId} for approval`);

    return this.getVersion(versionId);
  }

  /**
   * Update version status (used by approval webhook handlers)
   *
   * Only allows certain transitions:
   * - pending_approval -> approved/rejected
   * - approved -> disabled
   *
   * Also updates locale's approvalStatus accordingly
   */
  async updateVersionStatus(
    versionId: string,
    newStatus: VersionStatus,
    providerId?: string,
    providerResponse?: Record<string, any>,
  ): Promise<VersionDetails> {
    const version = await this.getVersion(versionId);

    // Validate status transition
    this.validateStatusTransition(version.status, newStatus);

    const updateData: Record<string, any> = {
      status: newStatus,
      updatedAt: new Date(),
    };

    if (providerId) {
      updateData.providerId = providerId;
    }
    if (providerResponse) {
      updateData.providerResponse = providerResponse;
    }

    await db
      .update(templateVersions)
      .set(updateData)
      .where(eq(templateVersions.id, versionId));

    // Get version data to update locale
    const versionData = await db.query.templateVersions.findFirst({
      where: eq(templateVersions.id, versionId),
    });

    if (versionData) {
      // Update locale status based on new version status
      if (newStatus === VersionStatus.APPROVED) {
        // Approved: set activeVersion, approvalStatus, and sync content to locale
        const versionContent = versionData.content as VersionContent;

        // Sync content to locale
        await this.syncContentToLocale(versionData.localeId, versionContent);

        // Update approval-specific fields separately
        await db
          .update(templateLocales)
          .set({
            activeVersion: version.versionNumber,
            approvalStatus: 'approved',
            reviewedAt: new Date(),
          })
          .where(eq(templateLocales.id, versionData.localeId));
      } else if (newStatus === VersionStatus.REJECTED) {
        // Rejected: update locale status and store rejection reason
        // If there was a previously approved version, keep that as active
        const localeData = await db.query.templateLocales.findFirst({
          where: eq(templateLocales.id, versionData.localeId),
        });

        const rejectionReason =
          providerResponse?.error?.message ||
          providerResponse?.rejection_reason ||
          'Template was rejected by Meta';

        await db
          .update(templateLocales)
          .set({
            // Only update approvalStatus if there's no approved version
            approvalStatus:
              localeData?.activeVersion && localeData.activeVersion > 0
                ? 'approved' // Keep approved if there's an active version
                : 'rejected',
            rejectionReason,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(templateLocales.id, versionData.localeId));
      } else if (newStatus === VersionStatus.DISABLED) {
        // Disabled: update locale status
        await db
          .update(templateLocales)
          .set({
            approvalStatus: 'disabled',
            updatedAt: new Date(),
          })
          .where(eq(templateLocales.id, versionData.localeId));
      }
    }

    this.logger.log(`Updated version ${versionId} status to ${newStatus}`);

    return this.getVersion(versionId);
  }

  /**
   * Delete a draft version
   *
   * Only draft or rejected versions can be deleted
   */
  async deleteVersion(versionId: string): Promise<{ success: boolean }> {
    const version = await this.getVersion(versionId);

    if (!EDITABLE_STATUSES.includes(version.status)) {
      throw new ForbiddenException(
        `Cannot delete a version with status ${version.status}. Only draft or rejected versions can be deleted.`,
      );
    }

    await db.delete(templateVersions).where(eq(templateVersions.id, versionId));

    this.logger.log(`Deleted version ${versionId}`);

    return { success: true };
  }

  /**
   * Duplicate a version as a new draft
   *
   * Used to create a new draft from an approved or rejected version
   */
  async duplicateAsDraft(
    versionId: string,
    templateId: string,
    locale: string,
  ): Promise<CreateVersionResult> {
    const sourceVersion = await this.getVersion(versionId);
    const info = await this.getVersionInfo(templateId, locale);

    // Check if draft already exists - can't have two drafts
    if (info.draftVersion && info.draftVersion.status === VersionStatus.DRAFT) {
      throw new BadRequestException(
        'A draft version already exists. Delete it first before duplicating.',
      );
    }

    // Note: We allow duplicating even when a version is pending approval.
    // This enables users to start working on the next version while waiting.

    const localeData = await this.getLocaleData(templateId, locale);

    // Determine new version number
    const latestVersionNumber = Math.max(
      ...info.versionHistory.map((v) => v.versionNumber),
    );
    const newVersionNumber = latestVersionNumber + 1;

    // Create new draft with copied content
    const versionId2 = crypto.randomUUID();
    await db.insert(templateVersions).values({
      id: versionId2,
      templateId,
      localeId: localeData.id,
      versionNumber: newVersionNumber,
      content: { ...sourceVersion.content },
      status: VersionStatus.DRAFT,
      providerName: 'meta',
      platforms: ['whatsapp'],
    });

    this.logger.log(
      `Duplicated version ${versionId} as new draft v${newVersionNumber}`,
    );

    const newVersion = await this.getVersion(versionId2);

    return {
      success: true,
      version: newVersion,
      message: `Created draft version v${newVersionNumber} from v${sourceVersion.versionNumber}`,
    };
  }

  /**
   * Manually set an approved version as the active version for a locale
   * This allows users to choose a specific approved version instead of always using the latest
   */
  async setActiveVersion(versionId: string): Promise<VersionDetails> {
    // Get the version
    const version = await db.query.templateVersions.findFirst({
      where: eq(templateVersions.id, versionId),
    });

    if (!version) {
      throw new NotFoundException(`Version ${versionId} not found`);
    }

    // Only approved versions can be set as active
    if (version.status !== VersionStatus.APPROVED) {
      throw new BadRequestException(
        `Only approved versions can be set as active. Current status: ${version.status}`,
      );
    }

    // Get the locale to check current state
    const locale = await db.query.templateLocales.findFirst({
      where: eq(templateLocales.id, version.localeId),
    });

    if (!locale) {
      throw new NotFoundException(`Locale not found for version ${versionId}`);
    }

    // Check if this version is already active
    if (locale.activeVersion === version.versionNumber) {
      this.logger.log(
        `Version v${version.versionNumber} is already the active version`,
      );
      return this.getVersion(versionId);
    }

    // Update the locale's activeVersion
    await db
      .update(templateLocales)
      .set({
        activeVersion: version.versionNumber,
        approvalStatus: 'approved',
        updatedAt: new Date(),
      })
      .where(eq(templateLocales.id, version.localeId));

    this.logger.log(
      `Set version v${version.versionNumber} as active for locale ${locale.locale}`,
    );

    return this.getVersion(versionId);
  }

  /**
   * Check if a version is editable
   */
  isEditable(version: VersionDetails): boolean {
    return EDITABLE_STATUSES.includes(version.status);
  }

  /**
   * Check if a version is immutable
   */
  isImmutable(version: VersionDetails): boolean {
    return IMMUTABLE_STATUSES.includes(version.status);
  }

  // ==================== Private Helper Methods ====================

  /**
   * Enforce that a version is editable, throw if not
   */
  private enforceEditable(version: VersionDetails): void {
    if (!this.isEditable(version)) {
      throw new ForbiddenException(
        `Version v${version.versionNumber} with status "${version.status}" cannot be edited. ` +
          `Only draft or rejected versions can be modified.`,
      );
    }
  }

  /**
   * Sync version content to templateLocales table.
   *
   * This ensures that services reading from templateLocales (like message sending,
   * variable resolution, AI recommendations) always have access to the latest
   * template content. The version system tracks history and approval state,
   * while the locale table provides the current working content.
   *
   * @param localeId - The locale ID to update
   * @param content - The version content to sync
   */
  private async syncContentToLocale(
    localeId: string,
    content: VersionContent,
  ): Promise<void> {
    await db
      .update(templateLocales)
      .set({
        header: content.header ?? null,
        body: content.body,
        footer: content.footer ?? null,
        exampleVars: content.exampleVars || {},
        category: content.category || 'utility',
        components: content.components || null,
        updatedAt: new Date(),
      })
      .where(eq(templateLocales.id, localeId));

    this.logger.log(
      `Synced content to locale ${localeId} - body: ${content.body?.substring(0, 50)}...`,
    );
  }

  /**
   * Validate that a status transition is allowed
   */
  private validateStatusTransition(
    currentStatus: VersionStatus,
    newStatus: VersionStatus,
  ): void {
    const allowedTransitions: Record<VersionStatus, VersionStatus[]> = {
      [VersionStatus.DRAFT]: [VersionStatus.PENDING_APPROVAL],
      [VersionStatus.PENDING_APPROVAL]: [
        VersionStatus.APPROVED,
        VersionStatus.REJECTED,
      ],
      [VersionStatus.APPROVED]: [VersionStatus.DISABLED],
      [VersionStatus.REJECTED]: [VersionStatus.DRAFT], // Allow re-editing
      [VersionStatus.DISABLED]: [],
    };

    const allowed = allowedTransitions[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
      );
    }
  }

  /**
   * Get locale data for a template
   */
  private async getLocaleData(templateId: string, locale: string) {
    const localeData = await db.query.templateLocales.findFirst({
      where: and(
        eq(templateLocales.templateId, templateId),
        eq(templateLocales.locale, locale),
      ),
    });

    if (!localeData) {
      throw new NotFoundException(
        `Locale ${locale} not found for template ${templateId}`,
      );
    }

    return localeData;
  }

  /**
   * Update the locale's activeVersion and approvalStatus fields when a version is approved
   */
  private async setLocaleActiveVersion(
    versionId: string,
    versionNumber: number,
  ): Promise<void> {
    const version = await db.query.templateVersions.findFirst({
      where: eq(templateVersions.id, versionId),
    });

    if (version) {
      await db
        .update(templateLocales)
        .set({
          activeVersion: versionNumber,
          approvalStatus: 'approved',
          updatedAt: new Date(),
        })
        .where(eq(templateLocales.id, version.localeId));
    }
  }

  /**
   * Map database version to VersionDetails
   */
  private mapToVersionDetails(
    version: TemplateVersion,
    activeVersionNumber?: number | null,
  ): VersionDetails {
    const status = version.status as VersionStatus;

    // Editable statuses: draft and rejected
    const isEditable =
      status === VersionStatus.DRAFT || status === VersionStatus.REJECTED;

    // Can delete only if editable (draft or rejected)
    const canDelete = isEditable;

    // Can submit only if draft (not rejected - rejected needs to be edited first)
    const canSubmit = status === VersionStatus.DRAFT;

    return {
      id: version.id,
      templateId: version.templateId,
      localeId: version.localeId,
      versionNumber: version.versionNumber,
      status,
      content: version.content as VersionContent,
      providerId: version.providerId,
      providerName: version.providerName,
      providerResponse: version.providerResponse as Record<string, any> | null,
      platforms: version.platforms as string[] | null,
      createdAt: version.createdAt!,
      updatedAt: version.updatedAt!,
      isActive:
        activeVersionNumber !== undefined &&
        version.versionNumber === activeVersionNumber,
      canEdit: isEditable,
      canDelete,
      canSubmit,
    };
  }

  /**
   * Enrich version content with media thumbnail URLs from templateMedia table
   *
   * When a video/document header is uploaded, the thumbnail is generated asynchronously
   * and stored in S3. The s3Key in templateMedia is updated to point to the thumbnail.
   * This method looks up the media record and generates a presigned URL for display.
   */
  private async enrichContentWithMediaUrls(
    localeId: string,
    content: VersionContent,
  ): Promise<VersionContent> {
    // Check if we have a media header that might need thumbnail enrichment
    const components = content.components as
      | Record<string, unknown>
      | undefined;
    if (!components?.header) {
      return content;
    }

    const header = components.header as Record<string, unknown>;
    const format = header.format as string;

    // Only enrich for media types that have thumbnails
    if (!['VIDEO', 'DOCUMENT'].includes(format)) {
      return content;
    }

    try {
      // Look up the header media record for this locale
      // Note: This query may fail if s3_key column doesn't exist (migration not run)
      const headerMedia = await db.query.templateMedia.findFirst({
        where: and(
          eq(templateMedia.localeId, localeId),
          eq(templateMedia.componentType, 'header'),
          eq(templateMedia.uploadStatus, 'completed'),
        ),
      });

      if (!headerMedia?.s3Key) {
        return content;
      }

      // Generate presigned URL for the thumbnail
      const { url: thumbnailUrl } =
        await this.s3Service.generatePresignedDownloadUrl(headerMedia.s3Key, {
          expiresIn: 3600, // 1 hour
        });

      // Deep clone the content to avoid mutating the original
      const enrichedContent: VersionContent = {
        ...content,
        components: {
          ...components,
          header: {
            ...header,
            thumbnailUrl,
          },
        },
      };

      this.logger.debug(
        `Enriched header with thumbnail URL for locale ${localeId}`,
      );

      return enrichedContent;
    } catch (error) {
      // Handle case where s3_key column doesn't exist (migration not run)
      // or any other database/S3 error - just return content without enrichment
      this.logger.warn(
        `Failed to enrich content with media URLs for locale ${localeId}: ${error.message}`,
      );
      return content;
    }
  }

  /**
   * Enrich version details with media URLs
   */
  async enrichVersionWithMediaUrls(
    version: VersionDetails,
  ): Promise<VersionDetails> {
    const enrichedContent = await this.enrichContentWithMediaUrls(
      version.localeId,
      version.content,
    );
    return {
      ...version,
      content: enrichedContent,
    };
  }
}
