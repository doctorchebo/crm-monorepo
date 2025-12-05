import { db } from '@database/db.connection';
import { templateTests, templateVersions } from '@database/schema';
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
import { eq } from 'drizzle-orm';
import { JwtAuthGuard } from '../auth/auth.guard';
import {
  CreateTemplateDto,
  CreateTemplateLocaleDto,
  SubmitTemplateDto,
  TestTemplateDto,
  UpdateTemplateDto,
} from './dto';
import { TwilioProviderAdapter } from './providers/twilio.provider';
import { TemplatesService } from './services/templates.service';

@Controller('templates')
@UseGuards(JwtAuthGuard)
export class TemplatesController {
  constructor(
    private templatesService: TemplatesService,
    private twilioProvider: TwilioProviderAdapter,
  ) {}

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

  /**
   * POST /templates/:id/submit - Submit template to provider
   */
  @Post(':id/submit')
  async submitTemplate(
    @Param('id') templateId: string,
    @Body() dto: SubmitTemplateDto,
    @Query('provider') provider: string = 'twilio',
  ) {
    const template = await this.templatesService.getTemplate(templateId);
    const locale = template.locales?.find((l) => l.locale === dto.locale);

    if (!locale) {
      throw new BadRequestException(`Locale ${dto.locale} not found`);
    }

    let submitResult;

    if (provider === 'twilio') {
      submitResult = await this.twilioProvider.submitTemplate(
        template.name,
        locale,
        '+14155238886', // Placeholder business phone
      );
    } else {
      throw new BadRequestException(`Provider ${provider} not supported`);
    }

    // Create template version record
    const versionNumber = (locale.activeVersion || 0) + 1;

    const version = await db.insert(templateVersions).values({
      id: crypto.randomUUID(),
      templateId,
      localeId: locale.id,
      versionNumber,
      content: JSON.stringify(submitResult),
      status: submitResult.status,
      providerId: submitResult.providerId,
      providerName: provider,
      platforms: dto.platforms || ['whatsapp'],
    });

    return {
      success: true,
      templateVersion: submitResult,
      message: `Template submitted to ${provider} for approval`,
    };
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

    // Send test
    const testResult = await this.twilioProvider.sendTestMessage(
      dto.to,
      '', // Template name - would get from template
      dto.vars,
      version.locale,
    );

    // Record test
    await db.insert(templateTests).values({
      id: crypto.randomUUID(),
      templateVersionId: dto.templateVersionId,
      testerUserId: req.user?.userId || req.user?.id,
      testPhoneNumber: this.maskPhoneNumber(dto.to),
      testPayload: dto.vars,
      testResult: testResult.response,
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
}
