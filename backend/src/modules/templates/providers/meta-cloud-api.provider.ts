import { TemplateLocale } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TemplateParserService } from '../services/template-parser.service';
import {
  ConvertedTemplate,
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
 * Meta Cloud API Language codes mapping
 */
const META_LANGUAGE_CODES: Record<string, string> = {
  en: 'en_US',
  'en-US': 'en_US',
  'en-GB': 'en_GB',
  es: 'es',
  'es-ES': 'es_ES',
  'es-MX': 'es_MX',
  'es-AR': 'es_AR',
  pt: 'pt_BR',
  'pt-BR': 'pt_BR',
  'pt-PT': 'pt_PT',
  fr: 'fr',
  de: 'de',
  it: 'it',
  ja: 'ja',
  zh: 'zh_CN',
  'zh-CN': 'zh_CN',
  'zh-TW': 'zh_TW',
  ko: 'ko',
  ar: 'ar',
  ru: 'ru',
  hi: 'hi',
  id: 'id',
  nl: 'nl',
  pl: 'pl',
  tr: 'tr',
  vi: 'vi',
  th: 'th',
};

/**
 * Meta Cloud API status mapping
 */
const META_STATUS_MAP: Record<string, TemplateApprovalStatus> = {
  APPROVED: TemplateApprovalStatus.APPROVED,
  PENDING: TemplateApprovalStatus.PENDING,
  REJECTED: TemplateApprovalStatus.REJECTED,
  PAUSED: TemplateApprovalStatus.PAUSED,
  DISABLED: TemplateApprovalStatus.DISABLED,
  IN_APPEAL: TemplateApprovalStatus.APPEAL_REQUESTED,
  PENDING_DELETION: TemplateApprovalStatus.DISABLED,
};

/**
 * Meta Cloud API quality rating mapping
 */
const META_QUALITY_MAP: Record<string, TemplateQualityRating> = {
  GREEN: TemplateQualityRating.HIGH,
  YELLOW: TemplateQualityRating.MEDIUM,
  RED: TemplateQualityRating.LOW,
  UNKNOWN: TemplateQualityRating.PENDING,
};

/**
 * Meta Cloud API Provider
 * Implements WhatsApp Business Cloud API for template management and messaging
 */
@Injectable()
export class MetaCloudApiProvider implements IMessagingProvider {
  readonly providerName = 'meta';
  private readonly logger = new Logger(MetaCloudApiProvider.name);
  private readonly apiVersion = 'v21.0';
  private readonly baseUrl = 'https://graph.facebook.com';

  constructor(
    private configService: ConfigService,
    private parserService: TemplateParserService,
  ) {}

  /**
   * Check if Meta Cloud API is properly configured
   */
  isConfigured(): boolean {
    const accessToken = this.configService.get('META_ACCESS_TOKEN');
    const wabaId = this.configService.get('META_WABA_ID');
    const phoneNumberId = this.configService.get('META_PHONE_NUMBER_ID');

    return !!(accessToken && wabaId && phoneNumberId);
  }

  /**
   * Get the Meta API access token
   */
  private getAccessToken(): string {
    const token = this.configService.get('META_ACCESS_TOKEN');
    if (!token) {
      throw new Error('META_ACCESS_TOKEN is not configured');
    }
    return token;
  }

  /**
   * Get the WhatsApp Business Account ID
   */
  private getWabaId(): string {
    const wabaId = this.configService.get('META_WABA_ID');
    if (!wabaId) {
      throw new Error('META_WABA_ID is not configured');
    }
    return wabaId;
  }

  /**
   * Get the Phone Number ID
   */
  private getPhoneNumberId(): string {
    const phoneNumberId = this.configService.get('META_PHONE_NUMBER_ID');
    if (!phoneNumberId) {
      throw new Error('META_PHONE_NUMBER_ID is not configured');
    }
    return phoneNumberId;
  }

  /**
   * Convert locale to Meta language code
   */
  private mapLocaleToMetaLanguage(locale: string): string {
    return (
      META_LANGUAGE_CODES[locale] ||
      META_LANGUAGE_CODES[locale.split('-')[0]] ||
      'en_US'
    );
  }

  /**
   * Detect header format from content
   */
  private detectHeaderFormat(
    header: string,
  ): 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' {
    if (/^https?:\/\/.*\.(jpg|jpeg|png|gif|webp)$/i.test(header)) {
      return 'IMAGE';
    } else if (/^https?:\/\/.*\.pdf$/i.test(header)) {
      return 'DOCUMENT';
    } else if (/^https?:\/\/.*\.(mp4|mov|avi|3gp)$/i.test(header)) {
      return 'VIDEO';
    }
    return 'TEXT';
  }

  /**
   * Convert template to Meta Cloud API format
   */
  convertTemplate(
    templateName: string,
    locale: TemplateLocale,
    category: TemplateCategory,
  ): ConvertedTemplate {
    const { providerBody, variableMapping } =
      this.parserService.convertToProviderFormat(locale.body);

    const components: TemplateComponent[] = [];

    // Header component
    if (locale.header) {
      const headerFormat = this.detectHeaderFormat(locale.header);
      const headerComponent: TemplateComponent = {
        type: 'HEADER',
        format: headerFormat,
      };

      if (headerFormat === 'TEXT') {
        headerComponent.text = locale.header;
      } else {
        // For media headers, we'd need to handle file uploads separately
        headerComponent.example = {
          header_handle: [locale.header], // This would be a handle from Resumable Upload API
        };
      }

      components.push(headerComponent);
    }

    // Body component (required)
    const bodyComponent: TemplateComponent = {
      type: 'BODY',
      text: providerBody,
    };

    // Add example values if variables exist
    if (variableMapping.length > 0 && locale.exampleVars) {
      const exampleValues: string[] = [];
      const sortedMapping = [...variableMapping].sort(
        (a, b) => a.index - b.index,
      );

      for (const { name } of sortedMapping) {
        const exampleVars = locale.exampleVars as Record<string, string>;
        exampleValues.push(exampleVars[name] || `Example ${name}`);
      }

      if (exampleValues.length > 0) {
        bodyComponent.example = {
          body_text: [exampleValues],
        };
      }
    }

    components.push(bodyComponent);

    // Footer component
    if (locale.footer) {
      components.push({
        type: 'FOOTER',
        text: locale.footer,
      });
    }

    // Build the provider payload
    const providerPayload = {
      name: templateName,
      language: this.mapLocaleToMetaLanguage(locale.locale),
      category: category.toUpperCase(),
      components: components.map((comp) => {
        const metaComponent: Record<string, any> = { type: comp.type };
        if (comp.format) metaComponent.format = comp.format;
        if (comp.text) metaComponent.text = comp.text;
        if (comp.example) metaComponent.example = comp.example;
        if (comp.buttons) metaComponent.buttons = comp.buttons;
        return metaComponent;
      }),
    };

    return {
      name: templateName,
      language: this.mapLocaleToMetaLanguage(locale.locale),
      category,
      components,
      variableMapping,
      providerPayload,
    };
  }

  /**
   * Submit template to Meta for approval
   */
  async submitTemplate(
    templateName: string,
    locale: TemplateLocale,
    category: TemplateCategory,
  ): Promise<TemplateSubmissionResult> {
    try {
      const converted = this.convertTemplate(templateName, locale, category);
      const wabaId = this.getWabaId();
      const accessToken = this.getAccessToken();

      const url = `${this.baseUrl}/${this.apiVersion}/${wabaId}/message_templates`;

      this.logger.log(
        `Submitting template '${templateName}' to Meta Cloud API`,
      );
      this.logger.debug(
        `Payload: ${JSON.stringify(converted.providerPayload)}`,
      );

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(converted.providerPayload),
      });

      const responseData = await response.json();

      if (!response.ok) {
        this.logger.error(`Meta API error: ${JSON.stringify(responseData)}`);
        return {
          success: false,
          status: TemplateApprovalStatus.DRAFT,
          error: responseData.error?.message || 'Failed to submit template',
          providerResponse: responseData,
        };
      }

      this.logger.log(
        `Template submitted successfully. ID: ${responseData.id}`,
      );

      return {
        success: true,
        providerId: responseData.id,
        status: TemplateApprovalStatus.PENDING,
        message: 'Template submitted for review',
        providerResponse: responseData,
      };
    } catch (error) {
      this.logger.error(`Failed to submit template: ${error.message}`);
      return {
        success: false,
        status: TemplateApprovalStatus.DRAFT,
        error: error.message,
      };
    }
  }

  /**
   * Get template status from Meta
   */
  async getTemplateStatus(templateId: string): Promise<TemplateStatusResult> {
    try {
      const accessToken = this.getAccessToken();
      const url = `${this.baseUrl}/${this.apiVersion}/${templateId}?fields=status,quality_score,rejected_reason,category`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const responseData = await response.json();

      if (!response.ok) {
        this.logger.error(
          `Failed to get template status: ${JSON.stringify(responseData)}`,
        );
        throw new Error(
          responseData.error?.message || 'Failed to get template status',
        );
      }

      const status =
        META_STATUS_MAP[responseData.status] || TemplateApprovalStatus.PENDING;
      const qualityRating = responseData.quality_score
        ? META_QUALITY_MAP[responseData.quality_score.score] ||
          TemplateQualityRating.PENDING
        : TemplateQualityRating.PENDING;

      // Map Meta category to our category enum (Meta returns uppercase)
      let category: TemplateCategory | undefined;
      if (responseData.category) {
        const categoryLower = responseData.category.toLowerCase();
        if (
          Object.values(TemplateCategory).includes(
            categoryLower as TemplateCategory,
          )
        ) {
          category = categoryLower as TemplateCategory;
        }
      }

      return {
        status,
        qualityRating,
        rejectionReason: responseData.rejected_reason,
        category,
        providerResponse: responseData,
      };
    } catch (error) {
      this.logger.error(`Failed to get template status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete template from Meta
   */
  async deleteTemplate(
    templateId: string,
    templateName: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const wabaId = this.getWabaId();
      const accessToken = this.getAccessToken();
      const url = `${this.baseUrl}/${this.apiVersion}/${wabaId}/message_templates?name=${templateName}`;

      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const responseData = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: responseData.error?.message || 'Failed to delete template',
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send a template message
   */
  async sendTemplateMessage(
    request: TemplateSendRequest,
  ): Promise<TemplateSendResult> {
    try {
      const phoneNumberId = this.getPhoneNumberId();
      const accessToken = this.getAccessToken();
      const url = `${this.baseUrl}/${this.apiVersion}/${phoneNumberId}/messages`;

      const { providerBody, variableMapping } =
        this.parserService.convertToProviderFormat(request.locale.body);

      // Build parameters array from variables
      const parameters = variableMapping
        .sort((a, b) => a.index - b.index)
        .map(({ name }) => ({
          type: 'text',
          text: request.variables[name] || '',
        }));

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: request.to.replace(/[^0-9]/g, ''),
        type: 'template',
        template: {
          name: request.templateName,
          language: {
            code: this.mapLocaleToMetaLanguage(request.language),
          },
          components:
            parameters.length > 0
              ? [
                  {
                    type: 'body',
                    parameters,
                  },
                ]
              : undefined,
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();

      if (!response.ok) {
        this.logger.error(
          `Failed to send template message: ${JSON.stringify(responseData)}`,
        );
        return {
          success: false,
          status: 'failed',
          error: responseData.error?.message || 'Failed to send message',
          providerResponse: responseData,
        };
      }

      return {
        success: true,
        messageId: responseData.messages?.[0]?.id,
        status: 'sent',
        providerResponse: responseData,
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
}
