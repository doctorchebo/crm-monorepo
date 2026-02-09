/**
 * Enhanced Template Components Types
 *
 * These types mirror the backend DTO structure for template components.
 * They support all Meta Cloud API template features including:
 * - Text/Media headers (image, video, document, location)
 * - Interactive buttons (URL, phone, quick reply, copy code, flow, catalog)
 * - Carousel cards
 * - Limited time offers
 * - Authentication templates with OTP
 */

// ==================== Header Types ====================

/** Supported header formats */
export type HeaderFormat = "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";

/** Base header interface */
export interface TemplateHeaderBase {
  format: HeaderFormat;
}

/** Text header */
export interface TextHeader extends TemplateHeaderBase {
  format: "TEXT";
  text: string;
  example?: string;
}

/** Media header (image, video, document) */
export interface MediaHeader extends TemplateHeaderBase {
  format: "IMAGE" | "VIDEO" | "DOCUMENT";
  /** Media handle from upload API */
  handle?: string;
  /** Asset handle from Meta's resumable upload API */
  assetHandle?: string;
  /** Public URL for the media */
  url?: string;
  /** Filename for documents */
  filename?: string;
}

/** Location header */
export interface LocationHeader extends TemplateHeaderBase {
  format: "LOCATION";
  latitude?: number;
  longitude?: number;
  name?: string;
  address?: string;
}

/** Union of all header types */
export type TemplateHeader = TextHeader | MediaHeader | LocationHeader;

// ==================== Body Types ====================

/** Template body component */
export interface TemplateBody {
  text: string;
  examples?: string[];
}

// ==================== Footer Types ====================

/** Template footer component */
export interface TemplateFooter {
  text: string;
}

// ==================== Button Types ====================

/** Supported button types */
export type ButtonType =
  | "URL"
  | "PHONE_NUMBER"
  | "QUICK_REPLY"
  | "COPY_CODE"
  | "FLOW"
  | "CATALOG"
  | "MPM" // Multi-product message
  | "SPM" // Single product message
  | "OTP"; // One-time password

/** Base button interface */
export interface TemplateButtonBase {
  type: ButtonType;
  text: string;
}

/** URL button */
export interface UrlButton extends TemplateButtonBase {
  type: "URL";
  url: string;
  example?: string;
}

/** Phone number button */
export interface PhoneButton extends TemplateButtonBase {
  type: "PHONE_NUMBER";
  phoneNumber: string;
}

/** Quick reply button */
export interface QuickReplyButton extends TemplateButtonBase {
  type: "QUICK_REPLY";
}

/** Copy code button (for authentication) */
export interface CopyCodeButton extends TemplateButtonBase {
  type: "COPY_CODE";
  example?: string;
}

/** Flow button (for WhatsApp Flows) */
export interface FlowButton extends TemplateButtonBase {
  type: "FLOW";
  flowId: string;
  flowAction: "navigate" | "data_exchange";
  navigateScreen?: string;
}

/** Catalog button */
export interface CatalogButton extends TemplateButtonBase {
  type: "CATALOG";
}

/** Multi-product message button */
export interface MpmButton extends TemplateButtonBase {
  type: "MPM";
}

/** Single product message button */
export interface SpmButton extends TemplateButtonBase {
  type: "SPM";
}

/** OTP button */
export interface OtpButton extends TemplateButtonBase {
  type: "OTP";
  otpType: "COPY_CODE" | "ONE_TAP" | "ZERO_TAP";
  autofillText?: string;
  packageName?: string;
  signatureHash?: string;
}

/** Union of all button types */
export type TemplateButton =
  | UrlButton
  | PhoneButton
  | QuickReplyButton
  | CopyCodeButton
  | FlowButton
  | CatalogButton
  | MpmButton
  | SpmButton
  | OtpButton;

// ==================== Carousel Types ====================

/** Individual carousel card */
export interface CarouselCard {
  /** Card header (media only - IMAGE or VIDEO) */
  header: {
    format: "IMAGE" | "VIDEO";
    handle?: string;
    assetHandle?: string;
    url?: string;
  };
  /** Card body text (required) */
  body: {
    text: string;
    examples?: string[];
  };
  /** Buttons for this card (up to 2) */
  buttons?: TemplateButton[];
}

// ==================== Limited Time Offer Types ====================

/** Limited time offer configuration */
export interface LimitedTimeOffer {
  /** Expiration timestamp (ISO 8601) */
  expirationTime: string;
  /** Display text for the offer */
  text?: string;
}

// ==================== Authentication Types ====================

/** Authentication template configuration */
export interface AuthenticationConfig {
  /** Type of authentication (currently only OTP) */
  type: "OTP";
  /** OTP delivery method */
  otpType: "COPY_CODE" | "ONE_TAP" | "ZERO_TAP";
  /** Security recommendation text */
  securityRecommendation?: boolean;
  /** Code expiration in minutes */
  codeExpirationMinutes?: number;
  /** For ONE_TAP: autofill button text */
  autofillText?: string;
  /** For ONE_TAP/ZERO_TAP: Android package name */
  packageName?: string;
  /** For ONE_TAP/ZERO_TAP: app signature hash */
  signatureHash?: string;
}

// ==================== Main Components Interface ====================

/**
 * Complete template components structure
 * This is the main interface used by the template editor
 */
export interface TemplateComponents {
  /** Header component (optional) */
  header?: TemplateHeader;
  /** Body component (required) */
  body: TemplateBody;
  /** Footer component (optional) */
  footer?: TemplateFooter;
  /** Interactive buttons (up to 10 quick replies or 2 other types) */
  buttons?: TemplateButton[];
  /** Carousel cards (for carousel templates) */
  carousel?: CarouselCard[];
  /** Limited time offer config */
  limitedTimeOffer?: LimitedTimeOffer;
  /** Authentication config (for OTP templates) */
  authentication?: AuthenticationConfig;
}

// ==================== Template Category ====================

export type TemplateCategory = "utility" | "marketing" | "authentication";

// ==================== Helper Types ====================

/** Media file info for uploads */
export interface MediaFileInfo {
  file: File;
  preview?: string;
  uploading?: boolean;
  error?: string;
  assetHandle?: string;
  mediaId?: string;
}

/** Validation error for components */
export interface ComponentValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
  code?: string;
}

/** Result of component validation */
export interface ComponentValidationResult {
  isValid: boolean;
  errors: ComponentValidationError[];
  warnings: ComponentValidationError[];
}

// ==================== Editor State Types ====================

/** Mode for the template editor */
export type EditorMode = "simple" | "advanced";

/** State for the enhanced template editor */
export interface EnhancedEditorState {
  /** Current editor mode */
  mode: EditorMode;
  /** Components being edited */
  components: TemplateComponents;
  /** Media files pending upload */
  pendingMedia: Map<string, MediaFileInfo>;
  /** Validation state */
  validation: ComponentValidationResult;
  /** Whether form has unsaved changes */
  isDirty: boolean;
}

// ==================== API Request/Response Types ====================

/** Request to upload media */
export interface MediaUploadRequest {
  componentType: "HEADER" | "CAROUSEL_CARD";
  filename: string;
  mimeType: string;
  base64Data: string;
  cardIndex?: number;
}

/** Response from media upload */
export interface MediaUploadResponse {
  success: boolean;
  assetHandle?: string;
  mediaId?: string;
  error?: string;
}

/** Template locale with enhanced components */
export interface EnhancedTemplateLocale {
  id: string;
  locale: string;
  body: string;
  header?: string;
  footer?: string;
  category?: TemplateCategory;
  exampleVars?: Record<string, string>;
  /** Enhanced components (new) */
  components?: TemplateComponents;
  /** Header format for quick access */
  headerFormat?: HeaderFormat;
  /** Buttons for quick access */
  buttons?: TemplateButton[];
  /** Carousel cards */
  carouselCards?: CarouselCard[];
  /** Limited time offer */
  limitedTimeOffer?: LimitedTimeOffer;
  /** Authentication config */
  authenticationConfig?: AuthenticationConfig;
}

// ==================== Utility Functions ====================

/**
 * Check if header is a text header
 */
export function isTextHeader(
  header: TemplateHeader | undefined,
): header is TextHeader {
  return header?.format === "TEXT";
}

/**
 * Check if header is a media header
 */
export function isMediaHeader(
  header: TemplateHeader | undefined,
): header is MediaHeader {
  return (
    header?.format === "IMAGE" ||
    header?.format === "VIDEO" ||
    header?.format === "DOCUMENT"
  );
}

/**
 * Check if header is a location header
 */
export function isLocationHeader(
  header: TemplateHeader | undefined,
): header is LocationHeader {
  return header?.format === "LOCATION";
}

/**
 * Check if button is a URL button
 */
export function isUrlButton(button: TemplateButton): button is UrlButton {
  return button.type === "URL";
}

/**
 * Check if button is a phone button
 */
export function isPhoneButton(button: TemplateButton): button is PhoneButton {
  return button.type === "PHONE_NUMBER";
}

/**
 * Check if button is a quick reply button
 */
export function isQuickReplyButton(
  button: TemplateButton,
): button is QuickReplyButton {
  return button.type === "QUICK_REPLY";
}

/**
 * Create an empty components structure
 */
export function createEmptyComponents(): TemplateComponents {
  return {
    body: { text: "" },
  };
}

/**
 * Create components from legacy template data
 */
export function componentsFromLegacy(
  header?: string,
  body: string = "",
  footer?: string,
): TemplateComponents {
  const components: TemplateComponents = {
    body: { text: body },
  };

  if (header) {
    components.header = { format: "TEXT", text: header };
  }

  if (footer) {
    components.footer = { text: footer };
  }

  return components;
}

/**
 * Extract legacy format from components
 */
export function componentsToLegacy(components: TemplateComponents): {
  body: string;
  header?: string;
  footer?: string;
} {
  return {
    body: components.body.text,
    header: isTextHeader(components.header)
      ? components.header.text
      : undefined,
    footer: components.footer?.text,
  };
}

/**
 * Check if components have advanced features (buttons, carousel, media header)
 * Used to determine if we're in simple or advanced mode
 */
export function hasAdvancedFeatures(components: TemplateComponents): boolean {
  // Has buttons
  if (components.buttons && components.buttons.length > 0) {
    return true;
  }

  // Has carousel
  if (components.carousel && components.carousel.length > 0) {
    return true;
  }

  // Has media header
  if (
    components.header &&
    (components.header.format === "IMAGE" ||
      components.header.format === "VIDEO" ||
      components.header.format === "DOCUMENT" ||
      components.header.format === "LOCATION")
  ) {
    return true;
  }

  // Has limited time offer
  if (components.limitedTimeOffer) {
    return true;
  }

  // Has authentication config
  if (components.authentication) {
    return true;
  }

  return false;
}

/**
 * Convert backend DTO format to TemplateComponents
 *
 * This is the inverse of componentsToDto. It converts the backend
 * TemplateComponentsDto structure (stored in version content) back to
 * the frontend TemplateComponents format for editing.
 *
 * Key differences between DTO and frontend formats:
 * - DTO uses `link` for media URL, frontend uses `url`
 * - DTO uses `urlExample` for URL button examples, frontend uses `example`
 * - DTO uses `copyCodeExample` for copy code examples, frontend uses `example`
 * - DTO body examples are an object, frontend uses array
 */
export function dtoToComponents(
  dto: Record<string, unknown>,
): TemplateComponents {
  const body = dto.body as { text: string; examples?: Record<string, string> };

  const components: TemplateComponents = {
    body: {
      text: body?.text || "",
      examples: body?.examples ? Object.values(body.examples) : undefined,
    },
  };

  // Convert header
  if (dto.header) {
    const headerDto = dto.header as Record<string, unknown>;
    const format = headerDto.format as HeaderFormat;

    if (format === "TEXT") {
      components.header = {
        format: "TEXT",
        text: (headerDto.text as string) || "",
        example: headerDto.example as string | undefined,
      };
    } else if (
      format === "IMAGE" ||
      format === "VIDEO" ||
      format === "DOCUMENT"
    ) {
      components.header = {
        format,
        assetHandle: headerDto.assetHandle as string | undefined,
        handle: headerDto.handle as string | undefined,
        // DTO stores URL as `link`, convert to `url` for frontend
        url:
          (headerDto.link as string) || (headerDto.url as string) || undefined,
        filename: headerDto.filename as string | undefined,
      };
    } else if (format === "LOCATION") {
      components.header = {
        format: "LOCATION",
        latitude: headerDto.latitude as number | undefined,
        longitude: headerDto.longitude as number | undefined,
        name: headerDto.name as string | undefined,
        address: headerDto.address as string | undefined,
      };
    }
  }

  // Convert footer
  if (dto.footer) {
    const footerDto = dto.footer as { text?: string };
    if (footerDto.text) {
      components.footer = { text: footerDto.text };
    }
  }

  // Convert buttons
  if (dto.buttons && Array.isArray(dto.buttons)) {
    components.buttons = (dto.buttons as Record<string, unknown>[]).map(
      (buttonDto): TemplateButton => {
        const type = buttonDto.type as ButtonType;
        const text = (buttonDto.text as string) || "";

        switch (type) {
          case "URL":
            return {
              type: "URL",
              text,
              url: (buttonDto.url as string) || "",
              example: buttonDto.urlExample as string | undefined,
            } as UrlButton;
          case "PHONE_NUMBER":
            return {
              type: "PHONE_NUMBER",
              text,
              phoneNumber: (buttonDto.phoneNumber as string) || "",
            } as PhoneButton;
          case "QUICK_REPLY":
            return { type: "QUICK_REPLY", text } as QuickReplyButton;
          case "COPY_CODE":
            return {
              type: "COPY_CODE",
              text,
              example: buttonDto.copyCodeExample as string | undefined,
            } as CopyCodeButton;
          case "FLOW":
            return {
              type: "FLOW",
              text,
              flowId: buttonDto.flowId as string | undefined,
              flowAction: buttonDto.flowAction as
                | "navigate"
                | "data_exchange"
                | undefined,
              navigateScreen: buttonDto.navigateScreen as string | undefined,
            } as FlowButton;
          case "OTP":
            return {
              type: "OTP",
              text,
              otpType: buttonDto.otpType as
                | "COPY_CODE"
                | "ONE_TAP"
                | "ZERO_TAP"
                | undefined,
              autofillText: buttonDto.otpText as string | undefined,
              packageName: buttonDto.packageName as string | undefined,
              signatureHash: buttonDto.signatureHash as string | undefined,
            } as OtpButton;
          default:
            return { type, text } as TemplateButton;
        }
      },
    );
  }

  // Convert carousel
  if (dto.carousel && Array.isArray(dto.carousel)) {
    components.carousel = (dto.carousel as Record<string, unknown>[]).map(
      (cardDto): CarouselCard => {
        const headerDto = cardDto.header as Record<string, unknown>;
        const bodyDto = cardDto.body as {
          text: string;
          examples?: Record<string, string>;
        };
        const buttonsDto = cardDto.buttons as
          | Record<string, unknown>[]
          | undefined;

        return {
          header: {
            format: (headerDto.format as "IMAGE" | "VIDEO") || "IMAGE",
            assetHandle: headerDto.assetHandle as string | undefined,
            handle: headerDto.handle as string | undefined,
            // DTO stores URL as `link`, convert to `url` for frontend
            url:
              (headerDto.link as string) ||
              (headerDto.url as string) ||
              undefined,
          },
          body: {
            text: bodyDto?.text || "",
            examples: bodyDto?.examples
              ? Object.values(bodyDto.examples)
              : undefined,
          },
          buttons: buttonsDto?.map((btn) => ({
            type: btn.type as ButtonType,
            text: (btn.text as string) || "",
            ...(btn.type === "URL" && { url: btn.url as string }),
            ...(btn.type === "PHONE_NUMBER" && {
              phoneNumber: btn.phoneNumber as string,
            }),
          })) as TemplateButton[] | undefined,
        };
      },
    );
  }

  // Convert limited time offer
  if (dto.limitedTimeOffer) {
    const ltoDto = dto.limitedTimeOffer as Record<string, unknown>;
    // Only include if we have valid expiration data
    if (ltoDto.expirationTimeMs) {
      components.limitedTimeOffer = {
        expirationTime: new Date(
          ltoDto.expirationTimeMs as number,
        ).toISOString(),
        text: ltoDto.text as string | undefined,
      };
    }
  }

  // Convert authentication config
  if (dto.authentication) {
    const authDto = dto.authentication as Record<string, unknown>;
    // Only include if we have the required type and otpType
    if (authDto.type && authDto.otpType) {
      components.authentication = {
        type: authDto.type as "OTP",
        otpType: authDto.otpType as "COPY_CODE" | "ONE_TAP" | "ZERO_TAP",
        securityRecommendation: authDto.addSecurityRecommendation as
          | boolean
          | undefined,
        codeExpirationMinutes: authDto.codeExpirationMinutes as
          | number
          | undefined,
        autofillText: authDto.autofillText as string | undefined,
        packageName: authDto.packageName as string | undefined,
        signatureHash: authDto.signatureHash as string | undefined,
      };
    }
  }

  return components;
}

/**
 * Convert TemplateComponents to backend DTO format
 *
 * This converts the frontend type structure to match the backend
 * TemplateComponentsDto structure expected by the API.
 */
export function componentsToDto(
  components: TemplateComponents,
): Record<string, unknown> {
  const dto: Record<string, unknown> = {
    body: {
      text: components.body.text,
      examples: components.body.examples
        ? Object.fromEntries(
            components.body.examples.map((ex, i) => [`{{${i + 1}}}`, ex]),
          )
        : undefined,
    },
  };

  // Convert header
  if (components.header) {
    if (isTextHeader(components.header)) {
      dto.header = {
        format: "TEXT",
        text: components.header.text,
        example: components.header.example,
      };
    } else if (isMediaHeader(components.header)) {
      dto.header = {
        format: components.header.format,
        assetHandle: components.header.assetHandle || components.header.handle,
        link: components.header.url,
        filename: components.header.filename,
      };
    } else if (isLocationHeader(components.header)) {
      dto.header = {
        format: "LOCATION",
      };
    }
  }

  // Convert footer
  if (components.footer?.text) {
    dto.footer = {
      text: components.footer.text,
    };
  }

  // Convert buttons
  if (components.buttons && components.buttons.length > 0) {
    dto.buttons = components.buttons.map((button) => {
      const baseButton: Record<string, unknown> = {
        type: button.type,
        text: button.text,
      };

      if (isUrlButton(button)) {
        baseButton.url = button.url;
        baseButton.urlExample = button.example;
      } else if (isPhoneButton(button)) {
        baseButton.phoneNumber = button.phoneNumber;
      } else if (button.type === "COPY_CODE") {
        baseButton.copyCodeExample = (button as CopyCodeButton).example;
      } else if (button.type === "FLOW") {
        const flowBtn = button as FlowButton;
        baseButton.flowId = flowBtn.flowId;
        baseButton.flowAction = flowBtn.flowAction;
        baseButton.navigateScreen = flowBtn.navigateScreen;
      } else if (button.type === "OTP") {
        const otpBtn = button as OtpButton;
        baseButton.otpType = otpBtn.otpType;
        baseButton.otpText = otpBtn.autofillText;
        baseButton.packageName = otpBtn.packageName;
        baseButton.signatureHash = otpBtn.signatureHash;
      }

      return baseButton;
    });
  }

  // Convert carousel
  if (components.carousel && components.carousel.length > 0) {
    dto.carousel = components.carousel.map((card) => ({
      header: {
        format: card.header.format,
        assetHandle: card.header.assetHandle || card.header.handle,
        link: card.header.url,
      },
      body: {
        text: card.body.text,
        examples: card.body.examples
          ? Object.fromEntries(
              card.body.examples.map((ex, i) => [`{{${i + 1}}}`, ex]),
            )
          : undefined,
      },
      buttons: card.buttons?.map((button) => ({
        type: button.type,
        text: button.text,
        ...(isUrlButton(button) && { url: button.url }),
        ...(isPhoneButton(button) && { phoneNumber: button.phoneNumber }),
      })),
    }));
  }

  // Convert limited time offer
  if (components.limitedTimeOffer) {
    dto.limitedTimeOffer = {
      hasExpiration: true,
      expirationTimeMs: new Date(
        components.limitedTimeOffer.expirationTime,
      ).getTime(),
    };
  }

  // Convert authentication config
  if (components.authentication) {
    dto.authentication = {
      addSecurityRecommendation:
        components.authentication.securityRecommendation,
      codeExpirationMinutes: components.authentication.codeExpirationMinutes,
    };
  }

  return dto;
}
