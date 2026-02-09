import { db } from '@database/db.connection';
import {
  templateTests,
  templateVersions,
  variableDefinitions,
} from '@database/schema';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TeamService } from '../team/team.service';
import {
  CreateTemplateDto,
  CreateTemplateLocaleDto,
  SubmitTemplateDto,
  TestTemplateDto,
  UpdateTemplateDto,
} from './dto';
import { MessagingProviderFactory, TemplateApprovalStatus } from './providers';
import { MediaUploadService } from './services/media-upload.service';
import { TemplateApprovalService } from './services/template-approval.service';
import {
  TemplateVersionService,
  VersionContent,
} from './services/template-version.service';
import { TemplatesService } from './services/templates.service';
import { VariableResolutionService } from './services/variable-resolution.service';

@Controller('templates')
@UseGuards(JwtAuthGuard)
export class TemplatesController {
  constructor(
    private templatesService: TemplatesService,
    private variableResolutionService: VariableResolutionService,
    private approvalService: TemplateApprovalService,
    private mediaUploadService: MediaUploadService,
    private versionService: TemplateVersionService,
    private providerFactory: MessagingProviderFactory,
    private teamService: TeamService,
  ) {}

  // ==================== Variable Definitions (must be before :id routes) ====================

  /**
   * GET /templates/variables/definitions - Get all available variable definitions
   * Returns the registry of allowed template variables grouped by category
   */
  @Get('variables/definitions')
  async getVariableDefinitions() {
    const definitions = await db.query.variableDefinitions.findMany({
      where: eq(variableDefinitions.isActive, true),
      orderBy: [
        asc(variableDefinitions.category),
        asc(variableDefinitions.sortOrder),
      ],
    });

    // Group by category
    const grouped: Record<string, typeof definitions> = {};
    for (const def of definitions) {
      if (!grouped[def.category]) {
        grouped[def.category] = [];
      }
      grouped[def.category].push(def);
    }

    return {
      definitions,
      grouped,
      categories: Object.keys(grouped),
    };
  }

  /**
   * POST /templates/validate-variables - Validate variable names
   * Checks if variable names follow the structured naming convention
   */
  @Post('validate-variables')
  async validateVariables(@Body() body: { variables: string[] }) {
    const results = body.variables.map((varName) => ({
      variable: varName,
      ...this.variableResolutionService.validateVariableName(varName),
    }));

    return {
      valid: results.every((r) => r.isValid),
      results,
    };
  }

  // ==================== Template CRUD ====================

  /**
   * POST /templates - Create new template
   */
  @Post()
  async createTemplate(@Request() req: any, @Body() dto: CreateTemplateDto) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    const teams = await this.teamService.getUserTeams(userId);
    const targetId = teams[0]?.ownerId || userId;

    return await this.templatesService.createTemplate(targetId, dto);
  }

  /**
   * GET /templates - List all templates for user with optional pagination
   * Supports both paginated and non-paginated modes for backward compatibility.
   *
   * @param page - Page number (1-indexed). If provided, returns paginated response.
   * @param limit - Items per page (default: 12)
   * @param search - Optional search query
   * @param visible - Filter by visibility
   */
  @Get()
  async listTemplates(
    @Request() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('visible') visible?: string,
  ) {
    const userId = req.user?.userId;
    const teams = await this.teamService.getUserTeams(userId);
    const targetId = teams[0]?.ownerId || userId;
    const onlyVisible = visible === 'true';

    // If page is provided, use paginated method
    if (page !== undefined) {
      return await this.templatesService.listTemplatesPaginated(
        targetId,
        Number(page) || 1,
        Number(limit) || 12,
        search,
        onlyVisible,
      );
    }

    // Backward compatible: return all templates without pagination
    return await this.templatesService.listTemplates(targetId, onlyVisible);
  }

  /**
   * POST /templates/bulk-delete - Bulk delete multiple templates
   * Body: { templateIds: string[] }
   */
  @Post('bulk-delete')
  async bulkDelete(@Body() body: { templateIds: string[] }) {
    const { templateIds } = body;
    const deletedCount = await this.templatesService.bulkDelete(templateIds);
    return { success: true, deletedCount };
  }

  // ==================== Bulk Sync Endpoints (must be before :id routes) ====================

  /**
   * POST /templates/sync-all-pending - Sync all pending template statuses from Meta
   * Fetches the current status from Meta API for all templates that are pending review.
   * This is useful when webhooks may have been missed or to force a refresh.
   */
  @Post('sync-all-pending')
  async syncAllPending(
    @Body()
    body?: {
      /**
       * Optional list of statuses to sync. Defaults to ['pending'].
       * You can include other statuses like 'paused' to sync those as well.
       */
      statuses?: string[];
    },
  ) {
    // Convert string statuses to enum values
    const statuses = body?.statuses?.length
      ? body.statuses.filter((s) =>
          Object.values(TemplateApprovalStatus).includes(
            s as TemplateApprovalStatus,
          ),
        )
      : ['pending'];

    return await this.approvalService.syncAllPendingTemplates(
      statuses as TemplateApprovalStatus[],
    );
  }

  /**
   * GET /templates/pending - Get all templates with pending status
   * Returns a list of templates that are awaiting approval from Meta
   */
  @Get('pending')
  async getPendingTemplates() {
    return await this.approvalService.getTemplatesWithPendingStatus();
  }

  // ==================== Version Management Endpoints ====================

  /**
   * GET /templates/:id/versions - Get all versions for a template locale
   * Returns version info including active and draft versions
   */
  @Get(':id/versions')
  async getVersionInfo(
    @Param('id') templateId: string,
    @Query('locale') locale: string,
  ) {
    if (!locale) {
      throw new BadRequestException('Locale query parameter is required');
    }
    return await this.versionService.getVersionInfo(templateId, locale);
  }

  /**
   * GET /templates/:id/versions/active - Get the active (approved) version
   */
  @Get(':id/versions/active')
  async getActiveVersion(
    @Param('id') templateId: string,
    @Query('locale') locale: string,
  ) {
    if (!locale) {
      throw new BadRequestException('Locale query parameter is required');
    }
    return await this.versionService.getActiveVersion(templateId, locale);
  }

  /**
   * GET /templates/:id/versions/draft - Get the draft version if exists
   */
  @Get(':id/versions/draft')
  async getDraftVersion(
    @Param('id') templateId: string,
    @Query('locale') locale: string,
  ) {
    if (!locale) {
      throw new BadRequestException('Locale query parameter is required');
    }
    return await this.versionService.getDraftVersion(templateId, locale);
  }

  /**
   * POST /templates/:id/versions - Create a new draft version
   * Always copies content from the active version if one exists.
   */
  @Post(':id/versions')
  async createVersion(
    @Param('id') templateId: string,
    @Body() body: { locale: string },
  ) {
    if (!body.locale) {
      throw new BadRequestException('Locale is required');
    }
    return await this.versionService.createNewVersion(templateId, body.locale);
  }

  /**
   * GET /templates/:id/versions/:versionId - Get a specific version
   */
  @Get(':id/versions/:versionId')
  async getVersion(@Param('versionId') versionId: string) {
    return await this.versionService.getVersion(versionId);
  }

  /**
   * PATCH /templates/:id/versions/:versionId - Update version content
   * Only draft or rejected versions can be edited
   */
  @Patch(':id/versions/:versionId')
  async updateVersionContent(
    @Param('versionId') versionId: string,
    @Body() body: Partial<VersionContent>,
  ) {
    return await this.versionService.updateVersionContent(versionId, body);
  }

  /**
   * DELETE /templates/:id/versions/:versionId - Delete a draft version
   * Only draft or rejected versions can be deleted
   */
  @Delete(':id/versions/:versionId')
  async deleteVersion(@Param('versionId') versionId: string) {
    return await this.versionService.deleteVersion(versionId);
  }

  /**
   * POST /templates/:id/versions/:versionId/submit - Submit version for approval
   * Changes status from draft to pending_approval
   */
  @Post(':id/versions/:versionId/submit')
  async submitVersionForApproval(@Param('versionId') versionId: string) {
    return await this.versionService.submitForApproval(versionId);
  }

  /**
   * POST /templates/:id/versions/:versionId/duplicate - Duplicate as new draft
   * Creates a new draft version from an existing version (approved/rejected)
   */
  @Post(':id/versions/:versionId/duplicate')
  async duplicateVersion(
    @Param('id') templateId: string,
    @Param('versionId') versionId: string,
    @Body() body: { locale: string },
  ) {
    if (!body.locale) {
      throw new BadRequestException('Locale is required');
    }
    return await this.versionService.duplicateAsDraft(
      versionId,
      templateId,
      body.locale,
    );
  }

  /**
   * POST /templates/:id/versions/:versionId/set-active - Set version as active
   * Manually set an approved version as the active version for its locale
   * By default, the latest approved version becomes active automatically,
   * but this endpoint allows users to choose a different approved version
   */
  @Post(':id/versions/:versionId/set-active')
  async setActiveVersion(@Param('versionId') versionId: string) {
    return await this.versionService.setActiveVersion(versionId);
  }

  // ==================== Template By ID Routes ====================

  /**
   * GET /templates/:id - Get template by ID
   */
  @Get(':id')
  async getTemplate(@Param('id') templateId: string) {
    return await this.templatesService.getTemplate(templateId);
  }

  /**
   * PATCH /templates/:id - Update template metadata
   */
  @Patch(':id')
  async updateTemplate(
    @Param('id') templateId: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return await this.templatesService.updateTemplate(templateId, dto);
  }

  /**
   * DELETE /templates/:id - Delete template (soft delete)
   */
  @Delete(':id')
  async deleteTemplate(@Param('id') templateId: string) {
    return await this.templatesService.deleteTemplate(templateId);
  }

  /**
   * POST /templates/:id/locales - Add/update locale content
   */
  @Post(':id/locales')
  async addLocale(
    @Param('id') templateId: string,
    @Body() dto: CreateTemplateLocaleDto,
  ) {
    return await this.templatesService.addLocale(templateId, dto);
  }

  /**
   * GET /templates/:id/locales/:locale - Get locale variables
   */
  @Get(':id/locales/:locale/variables')
  async getLocaleVariables(
    @Param('id') templateId: string,
    @Param('locale') locale: string,
  ) {
    const template = await this.templatesService.getTemplate(templateId);
    const localeData = template.locales?.find((l) => l.locale === locale);
    if (!localeData) {
      throw new BadRequestException(`Locale ${locale} not found`);
    }
    return await this.templatesService.getLocaleVariables(localeData.id);
  }

  /**
   * POST /templates/:id/preview - Preview template with variables
   */
  @Post(':id/preview')
  async previewTemplate(
    @Param('id') templateId: string,
    @Body() body: { locale: string; variables?: Record<string, any> },
  ) {
    return await this.templatesService.renderPreview(
      templateId,
      body.locale,
      body.variables,
    );
  }

  /**
   * POST /templates/:id/validate - Validate template
   */
  @Post(':id/validate')
  async validateTemplate(
    @Param('id') templateId: string,
    @Body() body: { locale: string },
  ) {
    return await this.templatesService.validateTemplate(
      templateId,
      body.locale,
    );
  }

  // ==================== Template Approval Endpoints ====================

  /**
   * POST /templates/:id/validate-for-approval - Validate template for Meta approval
   * Returns validation errors and warnings before showing confirmation modal
   */
  @Post(':id/validate-for-approval')
  async validateForApproval(
    @Param('id') templateId: string,
    @Body() body: { locale: string },
  ) {
    return await this.approvalService.validateForApproval(
      templateId,
      body.locale,
    );
  }

  /**
   * POST /templates/:id/request-approval - Request template approval from Meta
   * Validates template and submits to Meta Cloud API for review
   */
  @Post(':id/request-approval')
  async requestApproval(
    @Param('id') templateId: string,
    @Body() body: { locale: string; provider?: string },
  ) {
    return await this.approvalService.requestApproval(
      templateId,
      body.locale,
      body.provider || 'meta',
    );
  }

  /**
   * GET /templates/:id/approval-status - Get template approval status
   */
  @Get(':id/approval-status')
  async getApprovalStatus(
    @Param('id') templateId: string,
    @Query('locale') locale: string,
  ) {
    if (!locale) {
      throw new BadRequestException('Locale query parameter is required');
    }
    return await this.approvalService.getApprovalStatus(templateId, locale);
  }

  /**
   * POST /templates/:id/sync-status - Sync template status with provider
   * Returns detailed sync result including previous and new status
   */
  @Post(':id/sync-status')
  async syncStatus(
    @Param('id') templateId: string,
    @Body() body: { locale: string },
  ) {
    return await this.approvalService.syncSingleTemplateStatus(
      templateId,
      body.locale,
    );
  }

  /**
   * POST /templates/:id/submit - Submit template to provider (legacy)
   * @deprecated Use POST /templates/:id/request-approval instead
   */
  @Post(':id/submit')
  async submitTemplate(
    @Param('id') templateId: string,
    @Body() dto: SubmitTemplateDto,
    @Query('provider') provider: string = 'meta',
  ) {
    // Redirect to the new approval flow
    return await this.approvalService.requestApproval(
      templateId,
      dto.locale,
      provider,
    );
  }

  /**
   * POST /templates/:id/test - Send test message
   */
  @Post(':id/test')
  async testTemplate(
    @Param('id') templateId: string,
    @Body() dto: TestTemplateDto,
    @Request() req: any,
  ) {
    // Get template version
    const version = await db.query.templateVersions.findFirst({
      where: eq(templateVersions.id, dto.templateVersionId),
      with: {
        locale: true,
      },
    });

    if (!version) {
      throw new BadRequestException(
        `Template version ${dto.templateVersionId} not found`,
      );
    }

    // Get provider and send test
    const provider = this.providerFactory.getDefaultProvider();
    const template = await this.templatesService.getTemplate(templateId);

    const testResult = await provider.sendTemplateMessage({
      to: dto.to,
      templateName: template.name,
      language: version.locale.locale,
      variables: dto.vars,
      locale: version.locale,
    });

    // Record test
    await db.insert(templateTests).values({
      id: crypto.randomUUID(),
      templateVersionId: dto.templateVersionId,
      testerUserId: req.user?.userId || req.user?.id,
      testPhoneNumber: this.maskPhoneNumber(dto.to),
      testPayload: dto.vars,
      testResult: testResult.providerResponse,
      deliveryStatus: testResult.status,
    });

    return {
      success: true,
      message: 'Test message sent successfully',
      testResult,
    };
  }

  /**
   * GET /templates/:id/versions - Get template versions and status
   */
  @Get(':id/versions')
  async getTemplateVersions(@Param('id') templateId: string) {
    return await db.query.templateVersions.findMany({
      where: eq(templateVersions.templateId, templateId),
      orderBy: (tv, { desc }) => [desc(tv.createdAt)],
    });
  }

  /**
   * Mask phone number for privacy
   */
  private maskPhoneNumber(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    const lastFour = cleaned.slice(-4);
    return `+***${lastFour}`;
  }

  // ==================== Variable Resolution Endpoints ====================

  /**
   * POST /templates/:id/resolve - Resolve template variables for a contact
   * Auto-fills variables from customer profile
   */
  @Post(':id/resolve')
  async resolveVariables(
    @Param('id') templateId: string,
    @Body()
    body: {
      locale: string;
      contactId: string;
      senderId?: number;
      chatId?: string;
      overrides?: Record<string, string>;
    },
  ) {
    const template = await this.templatesService.getTemplate(templateId);
    const localeData = template.locales?.find((l) => l.locale === body.locale);

    if (!localeData) {
      throw new BadRequestException(`Locale ${body.locale} not found`);
    }

    return await this.variableResolutionService.resolveAndRenderTemplate(
      localeData.id,
      body.contactId,
      {
        senderId: body.senderId,
        chatId: body.chatId,
        overrides: body.overrides,
      },
    );
  }

  /**
   * POST /templates/:id/autofill - Get auto-fill suggestions for template variables
   * Returns which variables can be automatically filled from contact profile
   */
  @Post(':id/autofill')
  async getAutoFillSuggestions(
    @Param('id') templateId: string,
    @Body()
    body: {
      locale: string;
      contactId: string;
      senderId?: number;
      chatId?: string;
    },
  ) {
    const template = await this.templatesService.getTemplate(templateId);
    const localeData = template.locales?.find((l) => l.locale === body.locale);

    if (!localeData) {
      throw new BadRequestException(`Locale ${body.locale} not found`);
    }

    return await this.variableResolutionService.getAutoFillSuggestions(
      localeData.id,
      body.contactId,
      {
        senderId: body.senderId,
        chatId: body.chatId,
      },
    );
  }

  // ==================== Media Upload Endpoints ====================

  /**
   * POST /templates/media/upload-temporary
   * Upload media file directly to Meta without requiring an existing template/locale
   * Used when creating new templates - the asset handle is returned and can be
   * included in the template data when saving
   *
   * Returns the asset handle that can be used in template components
   */
  @Post('media/upload-temporary')
  async uploadTemporaryMedia(
    @Body()
    body: {
      filename: string;
      mimeType: string;
      base64Data: string;
    },
  ) {
    // Decode base64 data
    const buffer = Buffer.from(body.base64Data, 'base64');

    // Upload to Meta using the MediaUploadService (no DB record)
    const result = await this.mediaUploadService.uploadMediaTemporary({
      buffer,
      filename: body.filename,
      mimeType: body.mimeType,
      fileSize: buffer.length,
    });

    if (!result.success) {
      throw new BadRequestException(result.error || 'Failed to upload media');
    }

    return {
      success: true,
      assetHandle: result.assetHandle,
      url: result.url, // Public URL for display
      filename: body.filename,
      mimeType: body.mimeType,
      fileSize: buffer.length,
    };
  }

  /**
   * POST /templates/:id/locales/:localeId/media/upload
   * Upload media file for template header (image, video, or document)
   *
   * The file should be sent as base64 in the request body
   * Returns the asset handle that can be used in template components
   */
  @Post(':id/locales/:localeId/media/upload')
  async uploadTemplateMedia(
    @Param('id') templateId: string,
    @Param('localeId') localeId: string,
    @Body()
    body: {
      componentType: 'HEADER' | 'CAROUSEL_CARD';
      filename: string;
      mimeType: string;
      base64Data: string;
      cardIndex?: number; // For carousel cards
    },
  ) {
    // Verify template and locale exist
    const template = await this.templatesService.getTemplate(templateId);
    const locale = template.locales?.find((l) => l.id === localeId);

    if (!locale) {
      throw new BadRequestException(`Locale ${localeId} not found`);
    }

    // Decode base64 data
    const buffer = Buffer.from(body.base64Data, 'base64');

    // Upload to Meta using the MediaUploadService
    const result = await this.mediaUploadService.uploadMedia(
      localeId,
      body.componentType,
      {
        buffer,
        filename: body.filename,
        mimeType: body.mimeType,
        fileSize: buffer.length,
      },
    );

    if (!result.success) {
      throw new BadRequestException(result.error || 'Failed to upload media');
    }

    return {
      success: true,
      assetHandle: result.assetHandle,
      mediaId: result.mediaId,
      url: result.url, // Public URL for display in edit mode
      componentType: body.componentType,
      filename: body.filename,
      mimeType: body.mimeType,
      fileSize: buffer.length,
    };
  }

  /**
   * GET /templates/:id/locales/:localeId/media
   * Get all media files associated with a template locale
   */
  @Get(':id/locales/:localeId/media')
  async getTemplateMedia(
    @Param('id') templateId: string,
    @Param('localeId') localeId: string,
  ) {
    // Verify template and locale exist
    const template = await this.templatesService.getTemplate(templateId);
    const locale = template.locales?.find((l) => l.id === localeId);

    if (!locale) {
      throw new BadRequestException(`Locale ${localeId} not found`);
    }

    const media = await this.mediaUploadService.getMediaForLocale(localeId);

    return {
      media,
      count: media.length,
    };
  }

  /**
   * DELETE /templates/:id/locales/:localeId/media/:mediaId
   * Delete a media file from a template locale
   */
  @Delete(':id/locales/:localeId/media/:mediaId')
  async deleteTemplateMedia(
    @Param('id') templateId: string,
    @Param('localeId') localeId: string,
    @Param('mediaId') mediaId: string,
  ) {
    // Verify template and locale exist
    const template = await this.templatesService.getTemplate(templateId);
    const locale = template.locales?.find((l) => l.id === localeId);

    if (!locale) {
      throw new BadRequestException(`Locale ${localeId} not found`);
    }

    await this.mediaUploadService.deleteMedia(mediaId);

    return {
      success: true,
      message: 'Media deleted successfully',
    };
  }
}
