import { TemplateLocale } from '@database/schema';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';
import { TemplateParserService } from '../services/template-parser.service';
import {
  ConvertedTemplate,
  EnhancedTemplateSubmissionRequest,
  IMessagingProvider,
  TemplateApprovalStatus,
  TemplateCategory,
  TemplateComponent,
  TemplateQualityRating,
  TemplateSendRequest,
  TemplateSendResult,
  TemplateStatusResult,
  TemplateSubmissionResult,
} from './provider.interface';

/**
 * Twilio WhatsApp provider adapter
 * Converts business templates to provider format and handles submission/testing
 * Implements IMessagingProvider for provider abstraction
 */
@Injectable()
export class TwilioProviderAdapter implements IMessagingProvider {
  readonly providerName = 'twilio';
  private readonly logger = new Logger(TwilioProviderAdapter.name);
  private twilioClient: Twilio | null = null;

  constructor(
    private configService: ConfigService,
    private parserService: TemplateParserService,
  ) {
    this.initializeClient();
  }

  private initializeClient(): void {
    const accountSid = this.configService.get('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get('TWILIO_AUTH_TOKEN');
    if (accountSid && authToken) {
      this.twilioClient = new Twilio(accountSid, authToken);
    }
  }

  /**
   * Check if Twilio is properly configured
   */
  isConfigured(): boolean {
    const accountSid = this.configService.get('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get('TWILIO_AUTH_TOKEN');
    return !!(accountSid && authToken);
  }

  /**
   * Convert business template to Twilio provider format
   * Replaces friendly placeholders with numbered ones
   */
  convertTemplate(
    templateName: string,
    locale: TemplateLocale,
    category: TemplateCategory,
  ): ConvertedTemplate {
    const { providerBody, variableMapping } =
      this.parserService.convertToProviderFormat(locale.body);

    const components: TemplateComponent[] = [];

    // Body component
    components.push({
      type: 'BODY',
      text: providerBody,
    });

    // Header component if present
    if (locale.header) {
      components.push({
        type: 'HEADER',
        format: this.detectHeaderFormat(locale.header),
        text: locale.header,
      });
    }

    // Footer component if present
    if (locale.footer) {
      components.push({
        type: 'FOOTER',
        text: locale.footer,
      });
    }

    // Build Twilio-specific payload
    const providerPayload: Record<string, any> = {
      friendly_name: templateName,
      language: this.mapLocaleToTwilioLanguage(locale.locale),
      category: category.toUpperCase(),
      variables: variableMapping,
      components,
    };

    return {
      name: templateName,
      language: this.mapLocaleToTwilioLanguage(locale.locale),
      category,
      components,
      variableMapping,
      providerPayload,
    };
  }

  /**
   * Submit template to Twilio for approval
   */
  async submitTemplate(
    templateName: string,
    locale: TemplateLocale,
    category: TemplateCategory,
  ): Promise<TemplateSubmissionResult> {
    try {
      const converted = this.convertTemplate(templateName, locale, category);

      // Placeholder implementation - actual Twilio Content API call would go here
      // Twilio's WhatsApp template submission happens through their Content API

      this.logger.log(`Submitting template '${templateName}' to Twilio`);

      const submitResponse = {
        template_id: `TWILIO_TEMPLATE_${Date.now()}`,
        status: 'submitted',
        locale: locale.locale,
      };

      return {
        success: true,
        providerId: submitResponse.template_id,
        status: TemplateApprovalStatus.PENDING,
        message: 'Template submitted to Twilio for approval',
        providerResponse: submitResponse,
      };
    } catch (error) {
      this.logger.error(
        `Failed to submit template to Twilio: ${error.message}`,
      );
      return {
        success: false,
        status: TemplateApprovalStatus.DRAFT,
        error: error.message,
      };
    }
  }

  /**
   * Submit enhanced template to Twilio for approval
   *
   * Note: Twilio's Content API has different capabilities than Meta's.
   * This is a stub implementation - would need proper mapping to Twilio's API.
   */
  async submitEnhancedTemplate(
    request: EnhancedTemplateSubmissionRequest,
  ): Promise<TemplateSubmissionResult> {
    this.logger.warn(
      `Enhanced templates not fully supported by Twilio provider. Using legacy submission for template '${request.templateName}'`,
    );

    // For now, fall back to a basic submission
    // Twilio's Content API works differently and would need its own transformer
    const mockLocale = {
      id: 'enhanced-temp',
      templateId: 'enhanced-temp',
      locale: request.locale,
      body: request.components.body.text,
      header:
        request.components.header?.format === 'TEXT'
          ? request.components.header.text
          : null,
      footer: request.components.footer?.text || null,
    } as any;

    return this.submitTemplate(
      request.templateName,
      mockLocale,
      request.category,
    );
  }

  /**
   * Get template status from Twilio
   */
  async getTemplateStatus(templateId: string): Promise<TemplateStatusResult> {
    // Placeholder - would query Twilio's Content API
    return {
      status: TemplateApprovalStatus.PENDING,
      qualityRating: TemplateQualityRating.PENDING,
      providerResponse: { templateId },
    };
  }

  /**
   * Delete template from Twilio
   */
  async deleteTemplate(
    templateId: string,
    templateName: string,
  ): Promise<{ success: boolean; error?: string }> {
    // Placeholder - would call Twilio's API to delete
    this.logger.log(`Deleting template ${templateId} from Twilio`);
    return { success: true };
  }

  /**
   * Send a template message via Twilio
   */
  async sendTemplateMessage(
    request: TemplateSendRequest,
  ): Promise<TemplateSendResult> {
    if (!this.twilioClient) {
      return {
        success: false,
        status: 'failed',
        error: 'Twilio client not configured',
      };
    }

    try {
      // Render template with variables
      const rendered = this.parserService.renderTemplate(
        request.locale.body,
        request.variables,
      );

      // Send via Twilio WhatsApp
      const message = await this.twilioClient.messages.create({
        from:
          this.configService.get('TWILIO_WHATSAPP_SANDBOX_NUMBER') ||
          'whatsapp:+14155238886',
        to: `whatsapp:${request.to}`,
        body: rendered,
      });

      return {
        success: true,
        messageId: message.sid,
        status: message.status,
        providerResponse: {
          sid: message.sid,
          status: message.status,
          dateCreated: message.dateCreated,
          dateSent: message.dateSent,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to send template message: ${error.message}`);
      return {
        success: false,
        status: 'failed',
        error: error.message,
      };
    }
  }

  /**
   * Legacy method: Send test message via Twilio sandbox
   * @deprecated Use sendTemplateMessage instead
   */
  async sendTestMessage(
    to: string,
    templateName: string,
    variables: Record<string, any>,
    locale: TemplateLocale,
  ): Promise<{
    messageSid: string;
    status: string;
    response: Record<string, any>;
  }> {
    const result = await this.sendTemplateMessage({
      to,
      templateName,
      language: locale.locale,
      variables,
      locale,
    });

    if (!result.success) {
      throw new InternalServerErrorException(
        result.error || 'Failed to send test message',
      );
    }

    return {
      messageSid: result.messageId || '',
      status: result.status,
      response: result.providerResponse || {},
    };
  }

  /**
   * Map locale code to Twilio language code
   */
  private mapLocaleToTwilioLanguage(locale: string): string {
    const localeMap: Record<string, string> = {
      en: 'en_US',
      es: 'es_ES',
      'es-MX': 'es_MX',
      pt: 'pt_BR',
      fr: 'fr_FR',
      de: 'de_DE',
      it: 'it_IT',
      ja: 'ja_JP',
      zh: 'zh_CN',
    };

    return localeMap[locale] || 'en_US';
  }

  /**
   * Detect header format from content
   */
  private detectHeaderFormat(
    header: string,
  ): 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO' {
    if (/^https?:\/\/.*\.(jpg|jpeg|png)$/i.test(header)) {
      return 'IMAGE';
    } else if (/^https?:\/\/.*\.pdf$/i.test(header)) {
      return 'DOCUMENT';
    } else if (/^https?:\/\/.*\.(mp4|mov|avi)$/i.test(header)) {
      return 'VIDEO';
    }
    return 'TEXT';
  }

  /**
   * Parse variable placeholders for Twilio submission
   * Converts {{var_name}} ordering to indexed array
   */
  buildParameterArray(
    variables: Record<string, any>,
    variableMapping: Array<{ name: string; index: number }>,
  ): any[] {
    const params: any[] = [];

    // Sort by index and fill array
    const sorted = [...variableMapping].sort((a, b) => a.index - b.index);
    sorted.forEach(({ name, index }) => {
      params[index - 1] = variables[name] || '';
    });

    return params.filter((p) => p !== undefined);
  }
}
