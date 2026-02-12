import { TemplateLocale } from '@database/schema';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ComponentTransformerService } from '../services/component-transformer.service';
import { TemplateParserService } from '../services/template-parser.service';
import { TemplateCategory as InternalCategory } from '../types';
import {
  ConvertedTemplate,
  CreateFromLibraryRequest,
  EnhancedTemplateSubmissionRequest,
  IMessagingProvider,
  TemplateApprovalStatus,
  TemplateCategory,
  TemplateComponent,
  TemplateLibraryFilters,
  TemplateLibraryResult,
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
 *
 * Supports both legacy text-only templates and enhanced templates with:
 * - Media headers (image, video, document)
 * - Location headers
 * - Multiple button types (URL, phone, quick reply, copy code, OTP, flow)
 * - Carousel cards
 * - Limited time offers
 * - Authentication templates
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
    private componentTransformer: ComponentTransformerService,
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
   * Submit an enhanced template with full component support
   * Uses ComponentTransformerService to convert to Meta API format
   */
  async submitEnhancedTemplate(
    request: EnhancedTemplateSubmissionRequest,
  ): Promise<TemplateSubmissionResult> {
    try {
      // Map provider category to internal category for transformer
      const internalCategory = request.category as unknown as InternalCategory;

      // Transform components to Meta API format
      const transformed = this.componentTransformer.transform(
        request.templateName,
        request.locale,
        request.components,
        internalCategory,
      );

      const wabaId = this.getWabaId();
      const accessToken = this.getAccessToken();

      const url = `${this.baseUrl}/${this.apiVersion}/${wabaId}/message_templates`;

      this.logger.log(
        `Submitting enhanced template '${request.templateName}' to Meta Cloud API`,
      );
      this.logger.debug(
        `Payload: ${JSON.stringify(transformed.providerPayload)}`,
      );

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transformed.providerPayload),
      });

      const responseData = await response.json();

      if (!response.ok) {
        this.logger.error(`Meta API error: ${JSON.stringify(responseData)}`);

        // Parse Meta error for better user feedback
        const errorMessage = this.parseMetaError(responseData);

        return {
          success: false,
          status: TemplateApprovalStatus.DRAFT,
          error: errorMessage,
          providerResponse: responseData,
        };
      }

      this.logger.log(
        `Enhanced template submitted successfully. ID: ${responseData.id}`,
      );

      return {
        success: true,
        providerId: responseData.id,
        status: TemplateApprovalStatus.PENDING,
        message: 'Template submitted for review',
        providerResponse: responseData,
      };
    } catch (error) {
      this.logger.error(`Failed to submit enhanced template: ${error.message}`);
      return {
        success: false,
        status: TemplateApprovalStatus.DRAFT,
        error: error.message,
      };
    }
  }

  /**
   * Parse Meta API error response into user-friendly message
   */
  private parseMetaError(responseData: any): string {
    const error = responseData.error;
    if (!error) {
      return 'Failed to submit template';
    }

    // Common Meta error codes
    const errorCode = error.code;
    const errorSubcode = error.error_subcode;
    const errorMessage = error.message;

    // Provide specific guidance for common errors
    if (errorCode === 100) {
      if (errorMessage?.includes('name')) {
        return 'Template name is invalid. Use only lowercase letters, numbers, and underscores. Must start with a letter.';
      }
      if (errorMessage?.includes('category')) {
        return 'Invalid template category. Must be authentication, marketing, or utility.';
      }
    }

    if (errorCode === 190) {
      return 'Authentication failed. Please check your Meta API access token.';
    }

    if (errorCode === 368) {
      return 'Template with this name already exists. Use a different name or update the existing template.';
    }

    if (errorSubcode === 2388049) {
      return 'Template content violates WhatsApp commerce policy. Review the template content guidelines.';
    }

    return errorMessage || 'Failed to submit template';
  }

  /**
   * Get template status from Meta
   */
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
        // Handle specific Meta API errors
        const errorCode = responseData.error?.code;
        const errorMessage =
          responseData.error?.message || 'Failed to get template status';

        // Error code 100: Object doesn't exist or no permissions
        // This typically means the template was deleted from Meta's side
        if (errorCode === 100) {
          this.logger.warn(
            `Template ${templateId} not found in Meta. It may have been deleted or permissions revoked.`,
          );
          // Return a disabled status to indicate the template is no longer valid
          return {
            status: TemplateApprovalStatus.DISABLED,
            qualityRating: TemplateQualityRating.PENDING,
            rejectionReason:
              'Template not found in Meta. It may have been deleted.',
            providerResponse: responseData,
          };
        }

        this.logger.error(
          `Failed to get template status: ${JSON.stringify(responseData)}`,
        );
        throw new Error(errorMessage);
      }

      const rawStatus = responseData.status;
      let status = META_STATUS_MAP[rawStatus];

      if (!status) {
        this.logger.warn(
          `Unknown template status received from Meta: "${rawStatus}". Defaulting to DRAFT.`,
        );
        // Do NOT default to PENDING as that locks the UI.
        // If it's unknown, better to show as DRAFT so user can potentially resubmit,
        // or we need a new "UNKNOWN" status. For now, DRAFT is safer than PENDING.
        status = TemplateApprovalStatus.DRAFT;
      }

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

  // ==================== Template Library Methods ====================

  /**
   * Browse available templates from Meta's Template Library
   *
   * Calls: GET /message_template_library (root-level, not WABA-scoped)
   * Supports filtering by search, topic, usecase, industry, language
   *
   * @see https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-library
   */
  async getTemplateLibrary(
    filters?: TemplateLibraryFilters,
  ): Promise<TemplateLibraryResult> {
    try {
      const accessToken = this.getAccessToken();

      // Build query params from filters
      const params = new URLSearchParams();
      if (filters?.search) {
        params.append('search', filters.search);
      }
      if (filters?.topic) {
        params.append('topic', filters.topic);
      }
      if (filters?.usecase) {
        params.append('usecase', filters.usecase);
      }
      if (filters?.industry) {
        params.append('industry', filters.industry);
      }
      if (filters?.language) {
        params.append('language', filters.language);
      }
      // Request a large page to minimize round-trips (library is relatively small)
      params.append('limit', '100');

      const queryString = params.toString();
      // message_template_library is a root-level Graph API endpoint (not WABA-scoped).
      // It returns the global catalog of pre-approved templates available to all accounts.
      const url = `${this.baseUrl}/${this.apiVersion}/message_template_library${queryString ? `?${queryString}` : ''}`;

      this.logger.log(
        `Fetching Template Library from Meta Cloud API with filters: ${JSON.stringify(filters || {})}`,
      );

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const responseData = await response.json();

      if (!response.ok) {
        this.logger.error(
          `Meta Template Library API error: ${JSON.stringify(responseData)}`,
        );
        return {
          success: false,
          templates: [],
          error:
            responseData.error?.message || 'Failed to fetch Template Library',
        };
      }

      const templates = (responseData.data || []).map((t: any) => ({
        name: t.name,
        language: t.language,
        category: t.category,
        topic: t.topic || '',
        usecase: t.usecase || '',
        industry: t.industry || [],
        header: t.header || undefined,
        body: t.body || '',
        body_params: t.body_params || [],
        body_param_types: t.body_param_types || [],
        footer: t.footer || undefined,
        buttons: t.buttons || undefined,
      }));

      this.logger.log(
        `Fetched ${templates.length} templates from Meta Template Library`,
      );

      return {
        success: true,
        templates,
        paging: responseData.paging,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch Template Library: ${error.message}`);
      return {
        success: false,
        templates: [],
        error: error.message,
      };
    }
  }

  /**
   * Create a template from Meta's Template Library
   *
   * Calls: POST /{WABA_ID}/message_templates with library_template_name
   * Library templates are instantly APPROVED (no review needed)
   *
   * @see https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-library
   */
  async createFromLibrary(
    request: CreateFromLibraryRequest,
  ): Promise<TemplateSubmissionResult> {
    try {
      const wabaId = this.getWabaId();
      const accessToken = this.getAccessToken();
      const url = `${this.baseUrl}/${this.apiVersion}/${wabaId}/message_templates`;

      // Build the payload per Meta's Template Library API spec
      const payload: Record<string, any> = {
        name: request.name,
        language: request.language,
        category: 'UTILITY', // Template Library only supports UTILITY and AUTHENTICATION
        library_template_name: request.libraryTemplateName,
      };

      // Add button inputs if provided (required for templates with URL/phone buttons)
      if (request.buttonInputs && request.buttonInputs.length > 0) {
        payload.library_template_button_inputs = JSON.stringify(
          request.buttonInputs,
        );
      }

      // Add body inputs if provided (optional flags like add_contact_number, etc.)
      if (request.bodyInputs) {
        payload.library_template_body_inputs = JSON.stringify(
          request.bodyInputs,
        );
      }

      this.logger.log(
        `Creating template '${request.name}' from library template '${request.libraryTemplateName}'`,
      );
      this.logger.debug(`Payload: ${JSON.stringify(payload)}`);

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
          `Meta Template Library creation error: ${JSON.stringify(responseData)}`,
        );
        const errorMessage = this.parseMetaError(responseData);
        return {
          success: false,
          status: TemplateApprovalStatus.DRAFT,
          error: errorMessage,
          providerResponse: responseData,
        };
      }

      this.logger.log(
        `Library template created successfully. ID: ${responseData.id}, Status: ${responseData.status}`,
      );

      // Library templates are instantly approved
      const status =
        META_STATUS_MAP[responseData.status] || TemplateApprovalStatus.APPROVED;

      return {
        success: true,
        providerId: responseData.id,
        status,
        message: 'Template created from library — instantly approved',
        providerResponse: responseData,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create template from library: ${error.message}`,
      );
      return {
        success: false,
        status: TemplateApprovalStatus.DRAFT,
        error: error.message,
      };
    }
  }
}
