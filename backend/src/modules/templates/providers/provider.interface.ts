import { TemplateLocale } from '@database/schema';

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
 */
export interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  example?: {
    header_text?: string[];
    body_text?: string[][];
    header_handle?: string[];
  };
  buttons?: TemplateButton[];
}

/**
 * Template button structure
 */
export interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE' | 'OTP';
  text: string;
  url?: string;
  phone_number?: string;
  example?: string[];
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
   */
  submitTemplate(
    templateName: string,
    locale: TemplateLocale,
    category: TemplateCategory,
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
