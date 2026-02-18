/**
 * Comprehensive type definitions for WhatsApp template components
 * Based on Meta Cloud API documentation
 * @see https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/components
 */

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Template categories as defined by Meta WhatsApp Business API
 */
export enum TemplateCategory {
  AUTHENTICATION = 'authentication',
  MARKETING = 'marketing',
  UTILITY = 'utility',
}

/**
 * Template approval status aligned with Meta Cloud API
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
 * Header format types supported by Meta
 */
export enum HeaderFormat {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
  LOCATION = 'LOCATION',
}

/**
 * Button types supported by Meta
 */
export enum ButtonType {
  QUICK_REPLY = 'QUICK_REPLY',
  URL = 'URL',
  PHONE_NUMBER = 'PHONE_NUMBER',
  COPY_CODE = 'COPY_CODE',
  OTP = 'OTP',
  FLOW = 'FLOW',
  CATALOG = 'CATALOG',
  MPM = 'MPM',
  SPM = 'SPM',
}

/**
 * OTP button types for authentication templates
 */
export enum OtpType {
  COPY_CODE = 'COPY_CODE',
  ONE_TAP = 'ONE_TAP',
  ZERO_TAP = 'ZERO_TAP',
}

// ============================================================================
// HEADER TYPES
// ============================================================================

interface BaseHeader {
  format: HeaderFormat;
}

/**
 * Text header - supports one variable
 */
export interface TextHeader extends BaseHeader {
  format: HeaderFormat.TEXT;
  text: string;
  example?: string;
}

/**
 * Image header - requires asset handle from Resumable Upload API
 */
export interface ImageHeader extends BaseHeader {
  format: HeaderFormat.IMAGE;
  assetHandle?: string;
  link?: string;
}

/**
 * Video header - requires asset handle from Resumable Upload API
 */
export interface VideoHeader extends BaseHeader {
  format: HeaderFormat.VIDEO;
  assetHandle?: string;
  link?: string;
}

/**
 * Document header - PDF only
 */
export interface DocumentHeader extends BaseHeader {
  format: HeaderFormat.DOCUMENT;
  assetHandle?: string;
  link?: string;
  filename?: string;
}

/**
 * Location header - coordinates set at template creation time
 * and used to pre-populate send fields.
 *
 * Per Meta docs, location values are provided when sending the template,
 * but we store defaults so the user doesn't have to re-enter them each time.
 */
export interface LocationHeader extends BaseHeader {
  format: HeaderFormat.LOCATION;
  /** Latitude in decimal degrees (e.g. 37.4421) */
  latitude?: number;
  /** Longitude in decimal degrees (e.g. -122.1616) */
  longitude?: number;
  /** Human-readable location name (e.g. "Philz Coffee") */
  name?: string;
  /** Street address (e.g. "101 Forest Ave, Palo Alto, CA 94301") */
  address?: string;
}

/**
 * Discriminated union of all header types
 */
export type TemplateHeader =
  | TextHeader
  | ImageHeader
  | VideoHeader
  | DocumentHeader
  | LocationHeader;

// ============================================================================
// BUTTON TYPES
// ============================================================================

interface BaseButton {
  type: ButtonType;
}

/**
 * Quick reply button - sends predefined text when tapped
 * Max 10 per template, text max 25 chars
 */
export interface QuickReplyButton extends BaseButton {
  type: ButtonType.QUICK_REPLY;
  text: string;
}

/**
 * URL button - opens a URL when tapped
 * Max 2 per template, supports one variable at end of URL
 */
export interface UrlButton extends BaseButton {
  type: ButtonType.URL;
  text: string;
  url: string;
  example?: string;
}

/**
 * Phone number button - initiates call when tapped
 * Max 1 per template
 */
export interface PhoneNumberButton extends BaseButton {
  type: ButtonType.PHONE_NUMBER;
  text: string;
  phoneNumber: string;
}

/**
 * Copy code button - copies code to clipboard
 * Max 1 per template, typically for coupons/promotions
 */
export interface CopyCodeButton extends BaseButton {
  type: ButtonType.COPY_CODE;
  example: string;
}

/**
 * OTP button for authentication templates
 */
export interface OtpButton extends BaseButton {
  type: ButtonType.OTP;
  otpType: OtpType;
  text?: string;
  autofillText?: string;
  packageName?: string;
  signatureHash?: string;
}

/**
 * Flow button - links to WhatsApp Flow
 */
export interface FlowButton extends BaseButton {
  type: ButtonType.FLOW;
  text: string;
  flowId: string;
  flowAction?: 'navigate' | 'data_exchange';
  navigateScreen?: string;
}

/**
 * Catalog button - shows product catalog
 */
export interface CatalogButton extends BaseButton {
  type: ButtonType.CATALOG;
  text: string;
}

/**
 * Multi-product message button
 */
export interface MpmButton extends BaseButton {
  type: ButtonType.MPM;
  text: string;
}

/**
 * Single-product message button
 */
export interface SpmButton extends BaseButton {
  type: ButtonType.SPM;
  text: string;
}

/**
 * Discriminated union of all button types
 */
export type TemplateButton =
  | QuickReplyButton
  | UrlButton
  | PhoneNumberButton
  | CopyCodeButton
  | OtpButton
  | FlowButton
  | CatalogButton
  | MpmButton
  | SpmButton;

// ============================================================================
// BODY & FOOTER TYPES
// ============================================================================

/**
 * Template body - required component
 */
export interface TemplateBody {
  text: string;
  examples?: Record<string, string>;
}

/**
 * Template footer - optional, no variables allowed
 */
export interface TemplateFooter {
  text: string;
}

// ============================================================================
// LIMITED TIME OFFER
// ============================================================================

/**
 * Limited time offer component for marketing templates
 */
export interface LimitedTimeOffer {
  hasExpiration: boolean;
  expirationTimeMs?: number;
}

// ============================================================================
// AUTHENTICATION TEMPLATE SPECIFIC
// ============================================================================

/**
 * Authentication template configuration
 */
export interface AuthenticationConfig {
  addSecurityRecommendation?: boolean;
  codeExpirationMinutes?: number;
}

// ============================================================================
// CAROUSEL CARDS
// ============================================================================

/**
 * Carousel card - up to 10 cards per template
 */
export interface CarouselCard {
  header: ImageHeader | VideoHeader;
  body: TemplateBody;
  buttons?: TemplateButton[];
}

// ============================================================================
// COMPLETE TEMPLATE COMPONENTS
// ============================================================================

/**
 * Complete template components structure
 */
export interface TemplateComponents {
  header?: TemplateHeader;
  body: TemplateBody;
  footer?: TemplateFooter;
  buttons?: TemplateButton[];
  limitedTimeOffer?: LimitedTimeOffer;
  carousel?: CarouselCard[];
  authentication?: AuthenticationConfig;
}

// ============================================================================
// CHARACTER LIMITS & VALIDATION CONSTANTS
// ============================================================================

export const TEMPLATE_LIMITS = {
  // Name
  NAME_MAX_LENGTH: 512,
  NAME_PATTERN: /^[a-z][a-z0-9_]*$/,

  // Header
  HEADER_TEXT_MAX_LENGTH: 60,
  HEADER_TEXT_MAX_VARIABLES: 1,

  // Body
  BODY_MAX_LENGTH: 1024,
  BODY_MIN_LENGTH: 1,
  BODY_MAX_VARIABLES: 10,

  // Footer
  FOOTER_MAX_LENGTH: 60,

  // Buttons
  MAX_BUTTONS_TOTAL: 10,
  MAX_QUICK_REPLY_BUTTONS: 10,
  MAX_URL_BUTTONS: 2,
  MAX_PHONE_BUTTONS: 1,
  MAX_COPY_CODE_BUTTONS: 1,
  MAX_OTP_BUTTONS: 1,
  BUTTON_TEXT_MAX_LENGTH: 25,
  BUTTON_URL_MAX_LENGTH: 2000,
  PHONE_NUMBER_MAX_LENGTH: 20,
  COPY_CODE_MAX_LENGTH: 15,

  // Authentication
  AUTH_CODE_MAX_LENGTH: 15,
  AUTH_EXPIRATION_MIN_MINUTES: 1,
  AUTH_EXPIRATION_MAX_MINUTES: 90,

  // Carousel
  MAX_CAROUSEL_CARDS: 10,
  MAX_BUTTONS_PER_CARD: 2,

  // Media
  IMAGE_MAX_SIZE_MB: 5,
  VIDEO_MAX_SIZE_MB: 16,
  DOCUMENT_MAX_SIZE_MB: 10,
  SUPPORTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'] as const,
  SUPPORTED_VIDEO_TYPES: ['video/mp4', 'video/3gpp'] as const,
  SUPPORTED_DOCUMENT_TYPES: ['application/pdf'] as const,

  // URL shorteners blocked by Meta
  BLOCKED_URL_SHORTENERS: [
    'bit.ly',
    'tinyurl.com',
    't.co',
    'goo.gl',
    'ow.ly',
    'is.gd',
    'buff.ly',
    'adf.ly',
    'cutt.ly',
    'rb.gy',
  ] as const,
} as const;

/**
 * Supported languages for WhatsApp templates
 */
export const SUPPORTED_LANGUAGES = {
  af: 'Afrikaans',
  sq: 'Albanian',
  ar: 'Arabic',
  az: 'Azerbaijani',
  bn: 'Bengali',
  bg: 'Bulgarian',
  ca: 'Catalan',
  zh_CN: 'Chinese (Simplified)',
  zh_HK: 'Chinese (Hong Kong)',
  zh_TW: 'Chinese (Traditional)',
  hr: 'Croatian',
  cs: 'Czech',
  da: 'Danish',
  nl: 'Dutch',
  en: 'English',
  en_GB: 'English (UK)',
  en_US: 'English (US)',
  et: 'Estonian',
  fil: 'Filipino',
  fi: 'Finnish',
  fr: 'French',
  ka: 'Georgian',
  de: 'German',
  el: 'Greek',
  gu: 'Gujarati',
  ha: 'Hausa',
  he: 'Hebrew',
  hi: 'Hindi',
  hu: 'Hungarian',
  id: 'Indonesian',
  ga: 'Irish',
  it: 'Italian',
  ja: 'Japanese',
  kn: 'Kannada',
  kk: 'Kazakh',
  rw_RW: 'Kinyarwanda',
  ko: 'Korean',
  ky_KG: 'Kyrgyz',
  lo: 'Lao',
  lv: 'Latvian',
  lt: 'Lithuanian',
  mk: 'Macedonian',
  ms: 'Malay',
  ml: 'Malayalam',
  mr: 'Marathi',
  nb: 'Norwegian',
  fa: 'Persian',
  pl: 'Polish',
  pt_BR: 'Portuguese (Brazil)',
  pt_PT: 'Portuguese (Portugal)',
  pa: 'Punjabi',
  ro: 'Romanian',
  ru: 'Russian',
  sr: 'Serbian',
  sk: 'Slovak',
  sl: 'Slovenian',
  es: 'Spanish',
  es_AR: 'Spanish (Argentina)',
  es_ES: 'Spanish (Spain)',
  es_MX: 'Spanish (Mexico)',
  sw: 'Swahili',
  sv: 'Swedish',
  ta: 'Tamil',
  te: 'Telugu',
  th: 'Thai',
  tr: 'Turkish',
  uk: 'Ukrainian',
  ur: 'Urdu',
  uz: 'Uzbek',
  vi: 'Vietnamese',
  zu: 'Zulu',
} as const;

export type SupportedLanguageCode = keyof typeof SUPPORTED_LANGUAGES;

// ============================================================================
// META API LANGUAGE CODE MAPPING
// ============================================================================

/**
 * Maps locale codes to Meta API language codes
 */
export const META_LANGUAGE_CODES: Record<string, string> = {
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
