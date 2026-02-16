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
 *
 * Meta template statuses from the API:
 * - APPROVED: Template is approved and can be sent
 * - PENDING: Template is under review (up to 24 hours)
 * - IN_REVIEW: Same as PENDING, used by some API versions
 * - REJECTED: Template was rejected during review
 * - PAUSED: Template paused due to quality issues
 * - DISABLED: Template disabled by Meta (permanent)
 * - FLAGGED: Template flagged for review (treated as paused)
 * - IN_APPEAL: Appeal has been submitted
 * - REINSTATED: Template reinstated after appeal (treated as approved)
 * - PENDING_DELETION: Template scheduled for deletion
 * - DELETED: Template has been deleted
 *
 * Note: "Active-Quality Pending" in Meta UI means the template is APPROVED
 * but quality rating hasn't been determined yet. The status is still APPROVED.
 */
const META_STATUS_MAP: Record<string, TemplateApprovalStatus> = {
  APPROVED: TemplateApprovalStatus.APPROVED,
  PENDING: TemplateApprovalStatus.PENDING,
  IN_REVIEW: TemplateApprovalStatus.PENDING, // Some API versions return this
  REJECTED: TemplateApprovalStatus.REJECTED,
  PAUSED: TemplateApprovalStatus.PAUSED,
  FLAGGED: TemplateApprovalStatus.PAUSED, // Flagged is similar to paused
  DISABLED: TemplateApprovalStatus.DISABLED,
  IN_APPEAL: TemplateApprovalStatus.APPEAL_REQUESTED,
  REINSTATED: TemplateApprovalStatus.APPROVED, // Reinstated = approved again
  PENDING_DELETION: TemplateApprovalStatus.DISABLED,
  DELETED: TemplateApprovalStatus.DISABLED,
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
    // phoneNumberId is resolved per-request from the sender record,
    // so it is NOT required at the global config level.
    return !!(accessToken && wabaId);
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
   *
   * Fetches the current status of a template from Meta's Graph API.
   * Note: The templateId should be the message template ID returned when
   * the template was created (stored in template_locales.meta_template_id).
   *
   * Returns status, quality rating, category, and full component structure.
   */
  async getTemplateStatus(templateId: string): Promise<TemplateStatusResult> {
    try {
      const accessToken = this.getAccessToken();
      // Request full template data including components for header format detection
      const url = `${this.baseUrl}/${this.apiVersion}/${templateId}?fields=id,name,status,quality_score,rejected_reason,category,language,components`;

      this.logger.log(
        `Fetching template status from Meta for template ID: ${templateId}`,
      );
      this.logger.debug(`API URL: ${url}`);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const responseData = await response.json();

      // Log the raw response for debugging
      this.logger.log(
        `Meta API response for template ${templateId}: ${JSON.stringify(responseData)}`,
      );

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
      this.logger.log(
        `Template ${templateId} raw status from Meta: "${rawStatus}"`,
      );

      let status = META_STATUS_MAP[rawStatus];

      if (!status) {
        this.logger.warn(
          `Unknown template status received from Meta: "${rawStatus}". ` +
            `Full response: ${JSON.stringify(responseData)}. Defaulting to DRAFT.`,
        );
        // Do NOT default to PENDING as that locks the UI.
        // If it's unknown, better to show as DRAFT so user can potentially resubmit,
        // or we need a new "UNKNOWN" status. For now, DRAFT is safer than PENDING.
        status = TemplateApprovalStatus.DRAFT;
      } else {
        this.logger.log(
          `Template ${templateId} status mapped: "${rawStatus}" -> "${status}"`,
        );
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

      // Extract components and detect header format
      const components = responseData.components as
        | Array<Record<string, any>>
        | undefined;
      let headerFormat: string | undefined;

      if (components && Array.isArray(components)) {
        const headerComponent = components.find(
          (c) => c.type?.toUpperCase() === 'HEADER',
        );
        if (headerComponent) {
          headerFormat = headerComponent.format?.toUpperCase();
          this.logger.debug(
            `Template ${templateId} header format detected: ${headerFormat}`,
          );
        }
      }

      return {
        status,
        qualityRating,
        rejectionReason: responseData.rejected_reason,
        category,
        components,
        headerFormat,
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
   *
   * Builds the Meta API send-payload using the **Meta-registered component
   * structure** (`locale.components`, synced from the API) as ground truth.
   * Falls back to re-deriving from raw text fields when the synced structure
   * is not available.
   *
   * For media headers (IMAGE, VIDEO, DOCUMENT), the URL/link should be
   * provided in `request.variables`:
   *   - header_image / header_media_url / headerImage  (IMAGE)
   *   - header_video / header_media_url / headerVideo  (VIDEO)
   *   - header_document_url / header_document / headerDocument  (DOCUMENT)
   *   - header_document_filename / headerDocumentFilename   (DOCUMENT)
   *
   * For LOCATION headers:
   *   - header_location_latitude / headerLocationLatitude / latitude
   *   - header_location_longitude / headerLocationLongitude / longitude
   *   - header_location_name / headerLocationName         (optional)
   *   - header_location_address / headerLocationAddress   (optional)
   */
  async sendTemplateMessage(
    request: TemplateSendRequest,
  ): Promise<TemplateSendResult> {
    try {
      if (!request.phoneNumberId) {
        throw new Error(
          'phoneNumberId is required. Ensure the sender record has a phoneNumberId.',
        );
      }
      const phoneNumberId = request.phoneNumberId;
      const accessToken = this.getAccessToken();
      const url = `${this.baseUrl}/${this.apiVersion}/${phoneNumberId}/messages`;

      // ── Ground truth: Meta-registered component structure ──────────
      const metaRegistered = request.locale.components as {
        header?: { format?: string; text?: string; example?: any };
        body?: { text?: string; example?: any };
        footer?: { text?: string };
        buttons?: Array<Record<string, any>>;
      } | null;

      // ── Build body parameters ──────────────────────────────────────
      const { bodyParameters, bodyDiag } = this.buildBodyParameters(
        request,
        metaRegistered,
      );

      // ── Assemble send-components ──────────────────────────────────
      const components: any[] = [];

      // Header
      const headerComponent = this.buildHeaderSendComponent(
        request,
        metaRegistered,
      );
      if (headerComponent) {
        components.push(headerComponent);
      }

      // Body
      if (bodyParameters.length > 0) {
        components.push({
          type: 'body',
          parameters: bodyParameters,
        });
      }

      // Buttons
      const buttonComponents = this.buildButtonComponents(request);
      if (buttonComponents.length > 0) {
        components.push(...buttonComponents);
      }

      // ── Build final payload ────────────────────────────────────────
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
          components: components.length > 0 ? components : undefined,
        },
      };

      // ── Diagnostic logging ─────────────────────────────────────────
      this.logger.log(
        `[SEND-TEMPLATE] Sending "${request.templateName}" ` +
          `(lang=${request.language}, to=${request.to})`,
      );
      this.logger.log(
        `[SEND-TEMPLATE] Body diagnostics: ${JSON.stringify(bodyDiag)}`,
      );
      this.logger.log(
        `[SEND-TEMPLATE] Components to send: ${JSON.stringify(components)}`,
      );
      this.logger.debug(
        `[SEND-TEMPLATE] Full payload:\n${JSON.stringify(payload, null, 2)}`,
      );

      // ── Send ──────────────────────────────────────────────────────
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
          `[SEND-TEMPLATE] Meta API ${response.status} error:\n` +
            JSON.stringify(responseData, null, 2),
        );

        // Surface the full error details for debugging
        const metaError = responseData.error || {};
        const details =
          metaError.error_data?.details ||
          metaError.error_user_msg ||
          metaError.message ||
          'Failed to send message';
        const code = metaError.code ? `#${metaError.code}` : '';
        const subcode = metaError.error_subcode
          ? ` (subcode ${metaError.error_subcode})`
          : '';

        return {
          success: false,
          status: 'failed',
          error: `${code}${subcode} ${details}`.trim(),
          providerResponse: responseData,
        };
      }

      this.logger.log(
        `[SEND-TEMPLATE] ✅ Message sent: ${responseData.messages?.[0]?.id}`,
      );

      return {
        success: true,
        messageId: responseData.messages?.[0]?.id,
        status: 'sent',
        providerResponse: responseData,
      };
    } catch (error) {
      this.logger.error(
        `[SEND-TEMPLATE] Exception: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        status: 'failed',
        error: error.message,
      };
    }
  }

  // ==================== Send-component Builders ====================

  /**
   * Count unique template parameters in a Meta component text string.
   *
   * Handles both parameter formats:
   *  - Positional: `{{1}}`, `{{2}}` (legacy / classic templates)
   *  - Named:      `{{customer.first_name}}` (named-parameter templates)
   *
   * Returns the count of unique parameters and the detected format.
   */
  private countMetaTemplateParams(text: string): {
    count: number;
    format: 'positional' | 'named' | 'none';
  } {
    const allMatches = text.match(/\{\{([^}]+)\}\}/g);
    if (!allMatches) return { count: 0, format: 'none' };

    const uniqueParams = new Set(
      allMatches.map((m) => m.replace(/^\{\{|\}\}$/g, '').trim()),
    );
    const allPositional = [...uniqueParams].every((p) => /^\d+$/.test(p));

    return {
      count: uniqueParams.size,
      format: allPositional ? 'positional' : 'named',
    };
  }

  /**
   * Build the body parameter array for a template-message send request.
   *
   * Priority:
   *   1. If `locale.components.body.text` (Meta-synced) is available, use its
   *      positional param count as the authoritative expected count.
   *   2. Otherwise, derive the count from `locale.body` via the parser.
   *
   * Returns the parameter array AND a diagnostics object for logging.
   */
  private buildBodyParameters(
    request: TemplateSendRequest,
    metaRegistered: {
      body?: { text?: string };
      [k: string]: any;
    } | null,
  ): {
    bodyParameters: Array<{ type: string; text: string }>;
    bodyDiag: Record<string, any>;
  } {
    // ── Tier 1: Derive variable mapping from locale.body ─────────────
    const { variableMapping } = this.parserService.convertToProviderFormat(
      request.locale.body || '',
    );

    const sortedMapping = [...variableMapping].sort(
      (a, b) => a.index - b.index,
    );

    // ── Tier 2: Meta-synced body as authoritative param count ────────
    let expectedCount = sortedMapping.length;
    let metaBodyText: string | null = null;
    let strategy: string = 'locale_body';

    if (metaRegistered?.body?.text) {
      metaBodyText = metaRegistered.body.text;
      const { count: metaCount, format: metaFormat } =
        this.countMetaTemplateParams(metaBodyText);

      if (metaCount !== sortedMapping.length) {
        this.logger.warn(
          `[SEND-TEMPLATE] Body param count MISMATCH: ` +
            `locale.body has ${sortedMapping.length} named var(s), ` +
            `Meta registered ${metaCount} ${metaFormat} param(s). ` +
            `Using Meta's count (${metaCount}). ` +
            `locale.body="${request.locale.body}" | ` +
            `Meta body="${metaBodyText}"`,
        );
        expectedCount = metaCount;
        strategy = 'meta_components';
      }
    }

    // ── Build the parameter array ────────────────────────────────────
    let bodyParameters: Array<{ type: string; text: string }>;

    if (sortedMapping.length > 0) {
      // We have a named→positional mapping — use it
      bodyParameters = sortedMapping
        .slice(0, expectedCount)
        .map(({ name }) => ({
          type: 'text',
          text: String(request.variables[name] ?? ''),
        }));
    } else if (expectedCount > 0) {
      // locale.body had no variables but Meta expects params.
      // Attempt to fill from request.variables using positional keys.
      strategy = 'positional_fallback';
      bodyParameters = [];
      for (let i = 1; i <= expectedCount; i++) {
        const value =
          request.variables[String(i)] ?? request.variables[`{{${i}}}`] ?? '';
        bodyParameters.push({ type: 'text', text: String(value) });
      }
    } else {
      // ── Tier 3: Neither locale.body nor Meta components have info.
      // Check if request.variables itself carries positional keys,
      // indicating the frontend already resolved the variables.
      const positionalKeys = Object.keys(request.variables)
        .filter((k) => /^\d+$/.test(k))
        .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

      if (positionalKeys.length > 0) {
        strategy = 'variables_positional';
        expectedCount = positionalKeys.length;
        bodyParameters = positionalKeys.map((key) => ({
          type: 'text',
          text: String(request.variables[key] ?? ''),
        }));
      } else {
        // No body params at all — this is valid for templates without body variables
        bodyParameters = [];
      }
    }

    // Pad if Meta expects more params than we managed to build
    while (bodyParameters.length < expectedCount) {
      this.logger.warn(
        `[SEND-TEMPLATE] Padding body param [${bodyParameters.length}] ` +
          `with empty string — no matching variable found`,
      );
      bodyParameters.push({ type: 'text', text: '' });
    }

    return {
      bodyParameters,
      bodyDiag: {
        strategy,
        derivedVars: sortedMapping.map((m) => m.name),
        expectedCount,
        actualCount: bodyParameters.length,
        metaBodyText,
        localeBody: request.locale.body,
        variableKeys: Object.keys(request.variables),
        variableValues: Object.entries(request.variables).reduce(
          (acc, [key, val]) => {
            acc[key] = val ?? '<MISSING>';
            return acc;
          },
          {} as Record<string, string>,
        ),
      },
    };
  }

  /**
   * Build the header send-component.
   *
   * Uses `metaRegistered.header` (the synced Meta structure) as ground truth
   * to decide whether a header component is needed and what format it should
   * use. Falls back to `locale.header` + `locale.headerFormat` when the
   * synced structure is not available.
   */
  private buildHeaderSendComponent(
    request: TemplateSendRequest,
    metaRegistered: {
      header?: { format?: string; text?: string };
      [k: string]: any;
    } | null,
  ): Record<string, any> | null {
    // Determine the authoritative header format
    const headerFormat = (
      metaRegistered?.header?.format ||
      request.locale.headerFormat ||
      ''
    ).toUpperCase();

    if (!headerFormat) {
      // No header registered — skip
      return null;
    }

    // For TEXT headers, check whether Meta's registered text has variables
    if (headerFormat === 'TEXT') {
      const metaHeaderText = metaRegistered?.header?.text;
      const localeHeader = request.locale.header;

      // If Meta synced a header text, check for template params there
      if (metaHeaderText) {
        const { count: expectedHeaderParams } =
          this.countMetaTemplateParams(metaHeaderText);
        if (expectedHeaderParams === 0) {
          // Static text header — no parameters needed
          return null;
        }
      }

      // If the locale header has dynamic variables, build params
      if (localeHeader && localeHeader.includes('{{')) {
        const { variableMapping } =
          this.parserService.convertToProviderFormat(localeHeader);
        if (variableMapping.length > 0) {
          const headerParams = variableMapping
            .sort((a, b) => a.index - b.index)
            .map(({ name }) => ({
              type: 'text',
              text: String(
                request.variables[`header_${name}`] ??
                  request.variables[name] ??
                  '',
              ),
            }));
          return { type: 'header', parameters: headerParams };
        }
      }
      return null;
    }

    // For media / location headers, delegate to the existing builder
    return this.buildMediaHeaderComponent(request, headerFormat);
  }

  /**
   * Build media / location header components (IMAGE, VIDEO, DOCUMENT, LOCATION).
   * Extracted from the original `buildHeaderComponent` to keep responsibilities
   * clear: `buildHeaderSendComponent` decides *if* a header is needed,
   * this method builds the media-specific parameter.
   */
  private buildMediaHeaderComponent(
    request: TemplateSendRequest,
    headerFormat: string,
  ): Record<string, any> | null {
    const { variables } = request;

    switch (headerFormat) {
      case 'IMAGE': {
        const imageUrl =
          variables.header_image ||
          variables.header_media_url ||
          variables.headerImage;
        if (imageUrl) {
          return {
            type: 'header',
            parameters: [{ type: 'image', image: { link: imageUrl } }],
          };
        }
        this.logger.warn(
          '[SEND-TEMPLATE] IMAGE header registered but no image URL provided in variables. ' +
            'Meta may reject. Expected one of: header_image, header_media_url, headerImage',
        );
        return null;
      }

      case 'VIDEO': {
        const videoUrl =
          variables.header_video ||
          variables.header_media_url ||
          variables.headerVideo;
        if (videoUrl) {
          return {
            type: 'header',
            parameters: [{ type: 'video', video: { link: videoUrl } }],
          };
        }
        this.logger.warn(
          '[SEND-TEMPLATE] VIDEO header registered but no video URL provided in variables.',
        );
        return null;
      }

      case 'DOCUMENT': {
        const documentUrl =
          variables.header_document_url ||
          variables.header_document ||
          variables.header_media_url ||
          variables.headerDocument;
        const filename =
          variables.header_document_filename ||
          variables.headerDocumentFilename ||
          'document.pdf';
        if (documentUrl) {
          return {
            type: 'header',
            parameters: [
              { type: 'document', document: { link: documentUrl, filename } },
            ],
          };
        }
        this.logger.warn(
          '[SEND-TEMPLATE] DOCUMENT header registered but no document URL provided in variables.',
        );
        return null;
      }

      case 'LOCATION': {
        const latitude =
          variables.header_location_latitude ||
          variables.headerLocationLatitude ||
          variables.latitude;
        const longitude =
          variables.header_location_longitude ||
          variables.headerLocationLongitude ||
          variables.longitude;
        if (latitude && longitude) {
          const locationParam: Record<string, any> = {
            // Meta Cloud API expects latitude/longitude as string values
            latitude: String(latitude),
            longitude: String(longitude),
          };
          const name =
            variables.header_location_name || variables.headerLocationName;
          const address =
            variables.header_location_address ||
            variables.headerLocationAddress;
          if (name) locationParam.name = String(name);
          if (address) locationParam.address = String(address);

          return {
            type: 'header',
            parameters: [
              {
                type: 'location',
                location: locationParam,
              },
            ],
          };
        }
        this.logger.warn(
          '[SEND-TEMPLATE] LOCATION header registered but lat/lng not provided. ' +
            `Available variable keys: ${Object.keys(variables).join(', ')}`,
        );
        return null;
      }

      default:
        this.logger.debug(
          `[SEND-TEMPLATE] Unknown header format: ${headerFormat}`,
        );
        return null;
    }
  }

  /**
   * Build button components for URL buttons with dynamic values
   */
  private buildButtonComponents(
    request: TemplateSendRequest,
  ): Array<Record<string, any>> {
    const { locale, variables } = request;
    const buttons = locale.buttons as Array<Record<string, any>> | null;
    const components: Array<Record<string, any>> = [];

    if (!buttons || !Array.isArray(buttons)) {
      return components;
    }

    buttons.forEach((button, index) => {
      if (button.type === 'URL' && button.url?.includes('{{')) {
        // URL button with dynamic suffix
        const dynamicSuffix =
          variables[`button_${index}_url`] ||
          variables[`button_url_${index}`] ||
          variables[`button${index}Url`] ||
          '';
        if (dynamicSuffix) {
          components.push({
            type: 'button',
            sub_type: 'url',
            index: index,
            parameters: [
              {
                type: 'text',
                text: dynamicSuffix,
              },
            ],
          });
        }
      }
    });

    return components;
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

      // Pagination parameters
      const limit = Math.min(Math.max(filters?.limit || 25, 1), 100);
      params.append('limit', String(limit));

      if (filters?.after) {
        params.append('after', filters.after);
      }
      if (filters?.before) {
        params.append('before', filters.before);
      }

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
   * Library templates are typically pre-approved, but may require review
   * for new accounts or certain template types.
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

      // Map the status from Meta's response - library templates are usually approved
      // but may be PENDING for new accounts
      const status =
        META_STATUS_MAP[responseData.status] || TemplateApprovalStatus.PENDING;

      return {
        success: true,
        providerId: responseData.id,
        status,
        message: 'Template created from library',
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
