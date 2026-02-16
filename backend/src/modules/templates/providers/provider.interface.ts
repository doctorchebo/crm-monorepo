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
  /** Full component structure returned from Meta API */
  components?: Array<Record<string, any>>;
  /** Detected header format from components (TEXT, IMAGE, VIDEO, DOCUMENT, LOCATION) */
  headerFormat?: string;
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

// ==================== Template Library Types ====================

/**
 * Meta Template Library topics for filtering
 */
export enum TemplateLibraryTopic {
  ACCOUNT_UPDATE = 'ACCOUNT_UPDATE',
  CUSTOMER_FEEDBACK = 'CUSTOMER_FEEDBACK',
  ORDER_MANAGEMENT = 'ORDER_MANAGEMENT',
  PAYMENTS = 'PAYMENTS',
}

/**
 * Meta Template Library use cases for filtering
 */
export enum TemplateLibraryUseCase {
  ACCOUNT_CREATION_CONFIRMATION = 'ACCOUNT_CREATION_CONFIRMATION',
  AUTO_PAY_REMINDER = 'AUTO_PAY_REMINDER',
  DELIVERY_CONFIRMATION = 'DELIVERY_CONFIRMATION',
  DELIVERY_FAILED = 'DELIVERY_FAILED',
  DELIVERY_UPDATE = 'DELIVERY_UPDATE',
  FEEDBACK_SURVEY = 'FEEDBACK_SURVEY',
  FRAUD_ALERT = 'FRAUD_ALERT',
  LOW_BALANCE_WARNING = 'LOW_BALANCE_WARNING',
  ORDER_ACTION_NEEDED = 'ORDER_ACTION_NEEDED',
  ORDER_CONFIRMATION = 'ORDER_CONFIRMATION',
  ORDER_DELAY = 'ORDER_DELAY',
  ORDER_OR_TRANSACTION_CANCEL = 'ORDER_OR_TRANSACTION_CANCEL',
  ORDER_PICK_UP = 'ORDER_PICK_UP',
  PAYMENT_ACTION_REQUIRED = 'PAYMENT_ACTION_REQUIRED',
  PAYMENT_CONFIRMATION = 'PAYMENT_CONFIRMATION',
  PAYMENT_DUE_REMINDER = 'PAYMENT_DUE_REMINDER',
  PAYMENT_OVERDUE = 'PAYMENT_OVERDUE',
  PAYMENT_REJECT_FAIL = 'PAYMENT_REJECT_FAIL',
  PAYMENT_SCHEDULED = 'PAYMENT_SCHEDULED',
  RECEIPT_ATTACHMENT = 'RECEIPT_ATTACHMENT',
  RETURN_CONFIRMATION = 'RETURN_CONFIRMATION',
  SHIPMENT_CONFIRMATION = 'SHIPMENT_CONFIRMATION',
  STATEMENT_ATTACHMENT = 'STATEMENT_ATTACHMENT',
  STATEMENT_AVAILABLE = 'STATEMENT_AVAILABLE',
  TRANSACTION_ALERT = 'TRANSACTION_ALERT',
}

/**
 * Meta Template Library industries for filtering
 */
export enum TemplateLibraryIndustry {
  E_COMMERCE = 'E_COMMERCE',
  FINANCIAL_SERVICES = 'FINANCIAL_SERVICES',
}

/**
 * Meta Template Library parameter types
 * Used for send-time validation of library template parameters
 */
export enum TemplateLibraryParamType {
  TEXT = 'TEXT',
  AMOUNT = 'AMOUNT',
  DATE = 'DATE',
  PHONE_NUMBER = 'PHONE_NUMBER',
  EMAIL = 'EMAIL',
  NUMBER = 'NUMBER',
  ADDRESS = 'ADDRESS',
}

/**
 * Filters for browsing the Meta Template Library
 */
export interface TemplateLibraryFilters {
  search?: string;
  topic?: TemplateLibraryTopic;
  usecase?: TemplateLibraryUseCase;
  industry?: TemplateLibraryIndustry;
  language?: string;
  /** Pagination: number of results per page (default: 25, max: 100) */
  limit?: number;
  /** Pagination: cursor for next page (from previous response) */
  after?: string;
  /** Pagination: cursor for previous page (from previous response) */
  before?: string;
}

/**
 * A single template from Meta's Template Library catalog
 */
export interface TemplateLibraryTemplate {
  name: string;
  language: string;
  category: string;
  topic: string;
  usecase: string;
  industry: string[];
  header?: string;
  body: string;
  body_params: string[];
  body_param_types: string[];
  footer?: string;
  buttons?: Array<{
    type: string;
    text?: string;
    url?: string;
    phone_number?: string;
    flow_id?: string;
    flow_action?: string;
    navigate_screen?: string;
  }>;
}

/**
 * Result of browsing the Template Library
 */
export interface TemplateLibraryResult {
  success: boolean;
  templates: TemplateLibraryTemplate[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
  };
  error?: string;
}

/**
 * Request to create a template from the Template Library
 */
export interface CreateFromLibraryRequest {
  /** User-chosen name for the template (Meta-compliant slug) */
  name: string;
  /** Language code (e.g., 'en_US') */
  language: string;
  /** Exact name of the library template to adopt (e.g., 'delivery_update_1') */
  libraryTemplateName: string;
  /** Button configuration — required if the library template has URL or phone buttons */
  buttonInputs?: Array<{
    type: string;
    url?: { base_url: string; url_suffix_example?: string };
    phone_number?: string;
    otp_type?: string;
    zero_tap_terms_accepted?: boolean;
    supported_apps?: Array<{
      package_name: string;
      signature_hash: string;
    }>;
  }>;
  /** Optional body configuration flags */
  bodyInputs?: {
    add_contact_number?: boolean;
    add_learn_more_link?: boolean;
    add_security_recommendation?: boolean;
    add_track_package_link?: boolean;
    code_expiration_minutes?: number;
  };
}

/**
 * Available filter options for the Template Library
 */
export interface TemplateLibraryFilterOptions {
  topics: Array<{ value: string; label: string }>;
  useCases: Array<{ value: string; label: string }>;
  industries: Array<{ value: string; label: string }>;
  paramTypes: Array<{ value: string; label: string }>;
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
  /** Meta Cloud API phone number ID from the sender record */
  phoneNumberId: string;
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
