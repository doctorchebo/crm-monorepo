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
import {
  CreateTemplateDto,
  CreateTemplateLocaleDto,
  SubmitTemplateDto,
  TestTemplateDto,
  UpdateTemplateDto,
} from './dto';
import { MessagingProviderFactory } from './providers';
import { TemplateApprovalService } from './services/template-approval.service';
import { TemplatesService } from './services/templates.service';
import { VariableResolutionService } from './services/variable-resolution.service';

@Controller('templates')
@UseGuards(JwtAuthGuard)
export class TemplatesController {
  constructor(
    private templatesService: TemplatesService,
    private variableResolutionService: VariableResolutionService,
    private approvalService: TemplateApprovalService,
    private providerFactory: MessagingProviderFactory,
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
    return await this.templatesService.createTemplate(userId, dto);
  }

  /**
   * GET /templates - List all templates for user
   */
  @Get()
  async listTemplates(@Request() req: any, @Query('visible') visible?: string) {
    const userId = req.user?.userId;
    const onlyVisible = visible === 'true';
    return await this.templatesService.listTemplates(userId, onlyVisible);
  }

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
   */
  @Post(':id/sync-status')
  async syncStatus(
    @Param('id') templateId: string,
    @Body() body: { locale: string },
  ) {
    return await this.approvalService.syncStatus(templateId, body.locale);
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
}
