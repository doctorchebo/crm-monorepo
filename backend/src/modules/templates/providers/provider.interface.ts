import { TemplateLocale } from '@database/schema';
import { TemplateComponentsDto } from '../dto';

/**
 * Template approval status values aligned with Meta Cloud API
 */
export enum TemplateApprovalStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PAUSED = 'paused',
  DISABLED = 'disabled',
  APPEAL_REQUESTED = 'appeal_requested',
}

/**
 * Template quality rating from Meta
 */
export enum TemplateQualityRating {
  PENDING = 'pending',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

/**
 * Template category required by Meta
 */
export enum TemplateCategory {
  AUTHENTICATION = 'authentication',
  MARKETING = 'marketing',
  UTILITY = 'utility',
}

/**
 * Result of template submission to a provider
 */
export interface TemplateSubmissionResult {
  success: boolean;
  providerId?: string;
  status: TemplateApprovalStatus;
  message?: string;
  error?: string;
  providerResponse?: Record<string, any>;
}

/**
 * Result of fetching template status from provider
 */
export interface TemplateStatusResult {
  status: TemplateApprovalStatus;
  qualityRating?: TemplateQualityRating;
  rejectionReason?: string;
  category?: TemplateCategory;
  providerResponse?: Record<string, any>;
}

/**
 * Converted template format for provider submission
 */
export interface ConvertedTemplate {
  name: string;
  language: string;
  category: TemplateCategory;
  components: TemplateComponent[];
  variableMapping: Array<{ name: string; index: number }>;
  providerPayload: Record<string, any>;
}

/**
 * Template component structure
 * Enhanced to support all Meta Cloud API component types
 */
export interface TemplateComponent {
  type:
    | 'HEADER'
    | 'BODY'
    | 'FOOTER'
    | 'BUTTONS'
    | 'CAROUSEL'
    | 'LIMITED_TIME_OFFER';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
  text?: string;
  example?: {
    header_text?: string[];
    body_text?: string[][];
    header_handle?: string[];
  };
  buttons?: TemplateButton[];
  cards?: TemplateCarouselCard[];
  limited_time_offer?: {
    has_expiration: boolean;
    expiration_time_ms?: number;
  };
}

/**
 * Template button structure
 * Enhanced to support all button types
 */
export interface TemplateButton {
  type:
    | 'QUICK_REPLY'
    | 'URL'
    | 'PHONE_NUMBER'
    | 'COPY_CODE'
    | 'OTP'
    | 'FLOW'
    | 'CATALOG'
    | 'MPM'
    | 'SPM';
  text?: string;
  url?: string;
  phone_number?: string;
  example?: string[];
  otp_type?: string;
  autofill_text?: string;
  package_name?: string;
  signature_hash?: string;
  flow_id?: string;
  flow_action?: string;
  navigate_screen?: string;
}

/**
 * Carousel card for marketing templates
 */
export interface TemplateCarouselCard {
  components: TemplateComponent[];
}

/**
 * Enhanced template submission request
 * Supports both legacy (locale-based) and new (components-based) submissions
 */
export interface EnhancedTemplateSubmissionRequest {
  templateName: string;
  locale: string;
  category: TemplateCategory;
  components: TemplateComponentsDto;
}

/**
 * Template send request payload
 */
export interface TemplateSendRequest {
  to: string;
  templateName: string;
  language: string;
  variables: Record<string, any>;
  locale: TemplateLocale;
}

/**
 * Result of sending a template message
 */
export interface TemplateSendResult {
  success: boolean;
  messageId?: string;
  status: string;
  error?: string;
  providerResponse?: Record<string, any>;
}

/**
 * Provider Interface
 * Abstracts messaging provider operations to allow easy switching between providers
 * (Meta Cloud API, Twilio, etc.)
 */
export interface IMessagingProvider {
  /**
   * Provider name identifier
   */
  readonly providerName: string;

  /**
   * Check if the provider is properly configured
   */
  isConfigured(): boolean;

  /**
   * Convert a template locale to provider-specific format
   */
  convertTemplate(
    templateName: string,
    locale: TemplateLocale,
    category: TemplateCategory,
  ): ConvertedTemplate;

  /**
   * Submit a template for approval
   * @deprecated Use submitEnhancedTemplate for new implementations
   */
  submitTemplate(
    templateName: string,
    locale: TemplateLocale,
    category: TemplateCategory,
  ): Promise<TemplateSubmissionResult>;

  /**
   * Submit an enhanced template with full component support
   */
  submitEnhancedTemplate(
    request: EnhancedTemplateSubmissionRequest,
  ): Promise<TemplateSubmissionResult>;

  /**
   * Get the current status of a template
   */
  getTemplateStatus(templateId: string): Promise<TemplateStatusResult>;

  /**
   * Delete a template from the provider
   */
  deleteTemplate(
    templateId: string,
    templateName: string,
  ): Promise<{ success: boolean; error?: string }>;

  /**
   * Send a template message
   */
  sendTemplateMessage(
    request: TemplateSendRequest,
  ): Promise<TemplateSendResult>;
}

/**
 * Provider Factory Interface
 * Creates instances of messaging providers
 */
export interface IMessagingProviderFactory {
  /**
   * Get a provider by name
   */
  getProvider(providerName: string): IMessagingProvider;

  /**
   * Get the default/primary provider
   */
  getDefaultProvider(): IMessagingProvider;

  /**
   * Get all available providers
   */
  getAvailableProviders(): string[];
}
